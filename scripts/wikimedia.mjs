/**
 * Minimal Wikidata Query Service and Wikipedia API clients shared by the fleet
 * scripts. No dependencies: Node 20+ global fetch.
 *
 * Both services ask automated clients for a descriptive User-Agent, serial
 * requests, and backing off on 429/5xx; Wikipedia additionally honours
 * `maxlag` so bulk reads yield to replication lag.
 */

export const SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
export const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
export const USER_AGENT =
  'cruise-ship-maps-fleet-tools/1.0 (https://github.com/doomstar288/cruise-ship-maps)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs `request`, retrying transient failures with exponential backoff. */
async function withRetry(label, request, { attempts = 4 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (error.fatal) throw error;
      lastError = error;
      if (attempt < attempts) {
        const delay = error.retryAfterMs ?? 2 ** attempt * 1000;
        console.warn(`  attempt ${attempt} failed (${error.message}); retrying in ${delay}ms`);
        await sleep(delay);
      }
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastError?.message}`);
}

async function checkResponse(response, service) {
  if (response.status === 429 || response.status >= 500) {
    const retryAfter = Number(response.headers.get('retry-after'));
    throw Object.assign(
      new Error(`${service} responded ${response.status} ${response.statusText}`),
      {
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      }
    );
  }
  if (!response.ok) {
    // 4xx other than rate limiting means a bad request — retrying won't help.
    const body = await response.text();
    throw Object.assign(
      new Error(`${service} rejected (${response.status}): ${body.slice(0, 400)}`),
      {
        fatal: true,
      }
    );
  }
}

/** POSTs a SPARQL query to the Wikidata Query Service. */
export function runSparql(query) {
  return withRetry('Wikidata query', async () => {
    const response = await fetch(SPARQL_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/sparql-results+json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({ query }),
      signal: AbortSignal.timeout(180_000),
    });
    await checkResponse(response, 'Wikidata');
    return response.json();
  });
}

/**
 * Calls the Wikipedia Action API, following `continue` until exhausted, and
 * returns every response page. Callers merge results, because a continued
 * query can repeat a page with more of its properties filled in.
 */
export async function wikipediaQuery(params) {
  const responses = [];
  let cont = {};
  do {
    const search = new URLSearchParams({
      format: 'json',
      formatversion: '2',
      maxlag: '5',
      ...params,
      ...cont,
    });
    const body = await withRetry('Wikipedia API', async () => {
      const response = await fetch(`${WIKIPEDIA_API}?${search}`, {
        headers: { 'User-Agent': USER_AGENT, 'Api-User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(60_000),
      });
      await checkResponse(response, 'Wikipedia');
      const json = await response.json();
      if (json.error?.code === 'maxlag') {
        throw Object.assign(new Error('Wikipedia replication lag'), { retryAfterMs: 5000 });
      }
      if (json.error) {
        throw Object.assign(new Error(`Wikipedia API error: ${json.error.info}`), { fatal: true });
      }
      return json;
    });
    responses.push(body);
    cont = body.continue ?? null;
  } while (cont);
  return responses;
}

/** Splits a list into chunks, e.g. the Action API's 50-titles-per-request limit. */
export function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
