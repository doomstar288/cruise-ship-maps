#!/usr/bin/env node
/**
 * Fleet gap check: finds cruise ships, ship classes and ship categories that
 * English Wikipedia knows about but the registry lacks. See
 * scripts/fleet-gaps-build.mjs for the rules and docs/research/fleet_registry_seeding.md
 * for the workflow.
 *
 * Usage:
 *   node scripts/check-fleet-gaps.mjs [--report PATH] [--quickstatements PATH]
 *     [--json PATH] [--write-overrides]
 *
 * --write-overrides adds `include`, class and category proposals to
 * scripts/fleet-overrides.json; run `npm run seed:fleet` afterwards to apply.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CRUISE_CATEGORY_ROOTS,
  CRUISE_LINE_CATEGORY_PARENT,
  EXCLUDED_CATEGORIES,
  CATEGORY_TARGETS,
  FIELD_MARKER,
  LIST_PAGES,
  extractClassField,
  findIgnoredOverrides,
  findMissingShips,
  guessClassTitle,
  linksByField,
  mergeProposalsIntoOverrides,
  pickClassLink,
  proposeClasses,
  proposeCategories,
  renderGapReport,
  toQuickStatements,
} from './fleet-gaps-build.mjs';
import { validateOverrides } from './fleet-registry-build.mjs';
import { chunk, runSparql, wikipediaQuery } from './wikimedia.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = resolve(REPO_ROOT, 'public/data/fleet-registry.json');
const OVERRIDES = resolve(REPO_ROOT, 'scripts/fleet-overrides.json');
const IGNORE = resolve(REPO_ROOT, 'scripts/fleet-gap-ignore.json');

/** The Action API accepts at most 50 titles per request for anonymous clients. */
const TITLE_BATCH = 50;

function parseArgs(argv) {
  const args = { report: null, quickstatements: null, json: null, writeOverrides: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--report') args.report = resolve(process.cwd(), argv[++i]);
    else if (arg === '--quickstatements') args.quickstatements = resolve(process.cwd(), argv[++i]);
    else if (arg === '--json') args.json = resolve(process.cwd(), argv[++i]);
    else if (arg === '--write-overrides') args.writeOverrides = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/check-fleet-gaps.mjs [--report PATH] [--quickstatements PATH]\n' +
          '  [--json PATH] [--write-overrides]'
      );
      process.exit(0);
    }
  }
  return args;
}

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const pagesOf = (responses) => responses.flatMap((r) => r.query?.pages ?? []);
const qidOf = (uri) => uri.replace(/^.*\/entity\//, '');

async function write(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf8');
  console.log(`Wrote ${path}`);
}

/** Every article in the cruise categories, with the categories it was found in. */
async function collectCategorisedArticles() {
  const lineCategories = pagesOf(
    await wikipediaQuery({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: CRUISE_LINE_CATEGORY_PARENT,
      gcmtype: 'subcat',
      gcmlimit: 'max',
    })
  )
    .map((p) => p.title)
    .filter((title) => !EXCLUDED_CATEGORIES.includes(title));
  const categories = [...CRUISE_CATEGORY_ROOTS, ...lineCategories];

  const articles = new Map();
  for (const category of categories) {
    const pages = pagesOf(
      await wikipediaQuery({
        action: 'query',
        generator: 'categorymembers',
        gcmtitle: category,
        gcmnamespace: '0',
        gcmlimit: 'max',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
      })
    );
    for (const page of pages) {
      const entry = articles.get(page.title) ?? { title: page.title, qid: null, sources: [] };
      entry.qid ??= page.pageprops?.wikibase_item ?? null;
      if (!entry.sources.includes(category)) entry.sources.push(category);
      articles.set(page.title, entry);
    }
  }
  return { articles, categories };
}

/** Articles linked from the cruise ship list pages; non-ship links are filtered later. */
async function addListLinks(articles) {
  for (const list of LIST_PAGES) {
    const pages = pagesOf(
      await wikipediaQuery({
        action: 'query',
        generator: 'links',
        titles: list,
        gplnamespace: '0',
        gpllimit: 'max',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
      })
    );
    for (const page of pages) {
      if (page.missing) continue;
      const entry = articles.get(page.title) ?? { title: page.title, qid: null, sources: [] };
      entry.qid ??= page.pageprops?.wikibase_item ?? null;
      if (!entry.sources.includes(list)) entry.sources.push(list);
      articles.set(page.title, entry);
    }
  }
}

async function fetchWikitext(titles) {
  const text = new Map();
  for (const batch of chunk(titles, TITLE_BATCH)) {
    const pages = pagesOf(
      await wikipediaQuery({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        titles: batch.join('|'),
      })
    );
    for (const page of pages) {
      const content = page.revisions?.[0]?.slots?.main?.content;
      if (content) text.set(page.title, content);
    }
  }
  return text;
}

/** IMO and label for Wikidata items, by QID. */
async function fetchItemFacts(qids) {
  const facts = new Map();
  for (const batch of chunk(qids, 300)) {
    const raw = await runSparql(`
      SELECT ?item ?itemLabel (MIN(?imo) AS ?imoV) WHERE {
        VALUES ?item { ${batch.map((q) => `wd:${q}`).join(' ')} }
        OPTIONAL { ?item wdt:P458 ?imo }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
      } GROUP BY ?item ?itemLabel`);
    for (const b of raw.results.bindings) {
      facts.set(qidOf(b.item.value), {
        imo: b.imoV?.value ?? null,
        label: b.itemLabel?.value ?? null,
      });
    }
  }
  return facts;
}

/** English Wikipedia article titles for registry ships, by QID. */
async function fetchSitelinks(qids) {
  const titles = new Map();
  for (const batch of chunk(qids, 300)) {
    const raw = await runSparql(`
      SELECT ?item ?title WHERE {
        VALUES ?item { ${batch.map((q) => `wd:${q}`).join(' ')} }
        ?article schema:about ?item ;
                 schema:isPartOf <https://en.wikipedia.org/> ;
                 schema:name ?title .
      }`);
    for (const b of raw.results.bindings) titles.set(qidOf(b.item.value), b.title.value);
  }
  return titles;
}

/** Lets MediaWiki expand the class fields ({{sclass}} etc.) and returns each field's links. */
async function expandClassFields(fields) {
  const links = [];
  for (const batch of chunk(fields, TITLE_BATCH)) {
    const text = batch.map((field, i) => `${FIELD_MARKER(i)}\n\n${field}`).join('\n\n');
    const [response] = await wikipediaQuery({
      action: 'parse',
      text,
      prop: 'text',
      contentmodel: 'wikitext',
      disablelimitreport: '1',
      disableeditsection: '1',
    });
    links.push(...linksByField(response.parse.text, batch.length));
  }
  return links;
}

/**
 * Wikidata QIDs for article titles, following redirects. A redirect into a
 * section ("R-class cruise ship" → "Renaissance Cruises#R class") lands on a
 * broader article, so it resolves to nothing rather than the wrong item.
 */
async function resolveTitles(titles) {
  const qids = new Map();
  for (const batch of chunk([...new Set(titles)], TITLE_BATCH)) {
    const [response] = await wikipediaQuery({
      action: 'query',
      titles: batch.join('|'),
      redirects: '1',
      prop: 'pageprops',
      ppprop: 'wikibase_item|disambiguation',
    });
    const target = new Map(batch.map((t) => [t, t]));
    for (const { from, to } of response.query?.normalized ?? []) target.set(from, to);
    for (const { from, to, tofragment } of response.query?.redirects ?? []) {
      for (const [original, current] of target) {
        if (current === from) target.set(original, tofragment ? null : to);
      }
    }
    const byTitle = new Map(
      (response.query?.pages ?? [])
        .filter((p) => p.pageprops && !('disambiguation' in p.pageprops))
        .map((p) => [p.title, p.pageprops.wikibase_item])
    );
    for (const [original, current] of target) qids.set(original, byTitle.get(current) ?? null);
  }
  return qids;
}

/**
 * Ship-class items whose English or multilingual (`mul`) label or alias is
 * exactly one of `titles`, for classes without a usable article. Many class
 * names, like ship names, now live only under `mul`.
 */
async function lookupByLabel(titles) {
  const qids = new Map();
  const ambiguous = new Set();
  for (const batch of chunk([...new Set(titles)], 100)) {
    const values = batch.flatMap((t) => [`${JSON.stringify(t)}@en`, `${JSON.stringify(t)}@mul`]);
    const raw = await runSparql(`
      SELECT ?title (MIN(STR(?item)) AS ?itemV) (COUNT(DISTINCT ?item) AS ?n) WHERE {
        VALUES ?name { ${values.join(' ')} }
        ?item rdfs:label|skos:altLabel ?name .
        { ?item wdt:P31/wdt:P279* wd:Q559026 } UNION { ?item wdt:P279/wdt:P279* wd:Q11446 }
        BIND(STR(?name) AS ?title)
      } GROUP BY ?title`);
    for (const b of raw.results.bindings) {
      // Two ship-class items sharing a label (usually duplicates) is ambiguous; don't pick one.
      if (b.n.value === '1') qids.set(b.title.value, qidOf(b.itemV.value));
      else ambiguous.add(b.title.value);
    }
  }
  return { qids, ambiguous };
}

/**
 * Label and whether each item is a ship class. Wikidata models classes two
 * ways: as an instance of "ship class" (Q559026), or — like R-class — as a
 * subclass of "ship" (Q11446). The second also matches plain ship *types*
 * ("river cruise ship"), so it only counts when the label names a class.
 */
async function fetchClassFacts(qids) {
  const facts = new Map();
  if (!qids.length) return facts;
  const raw = await runSparql(`
    SELECT ?cls ?clsLabel
           (COUNT(DISTINCT ?type) > 0 AS ?instanceOfClass)
           (COUNT(DISTINCT ?super) > 0 AS ?subclassOfShip) WHERE {
      VALUES ?cls { ${qids.map((q) => `wd:${q}`).join(' ')} }
      OPTIONAL { ?cls wdt:P31 ?type . ?type wdt:P279* wd:Q559026 . }
      OPTIONAL { ?cls wdt:P279 ?super . ?super wdt:P279* wd:Q11446 . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul". }
    } GROUP BY ?cls ?clsLabel`);
  for (const b of raw.results.bindings) {
    const label = b.clsLabel?.value ?? null;
    facts.set(qidOf(b.cls.value), {
      label,
      isShipClass:
        b.instanceOfClass?.value === 'true' ||
        (b.subclassOfShip?.value === 'true' && /\bclass\b/i.test(label ?? '')),
    });
  }
  return facts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const registry = await readJson(REGISTRY);
  const overrides = await readJson(OVERRIDES);
  const ignoreFile = await readJson(IGNORE);
  const ignored = new Set(ignoreFile.ignore.flatMap((e) => [e.title, e.qid].filter(Boolean)));
  const registryQids = new Set(registry.ships.map((s) => s.wikidataId).filter(Boolean));

  const contradictions = findIgnoredOverrides(overrides.overrides, ignoreFile.ignore);
  for (const c of contradictions) {
    console.warn(
      `  warning: IMO ${c.imo} is ignored as "${c.title}" but an include override still ` +
        'keeps it in the registry — remove one of the two'
    );
  }

  console.log('Collecting cruise ship articles from Wikipedia categories...');
  const { articles, categories } = await collectCategorisedArticles();
  await addListLinks(articles);
  const candidates = [...articles.values()].filter((a) => !registryQids.has(a.qid));
  console.log(`  ${articles.size} articles, ${candidates.length} not in the registry`);

  const candidateText = await fetchWikitext(candidates.map((a) => a.title));
  for (const article of candidates) article.wikitext = candidateText.get(article.title) ?? '';
  const itemFacts = await fetchItemFacts(candidates.map((a) => a.qid).filter(Boolean));
  const gaps = findMissingShips({ articles: candidates, registry, wikidata: itemFacts, ignored });
  console.log(
    `  ${gaps.include.length} to include, ${gaps.addImo.length} missing IMO, ` +
      `${gaps.duplicateItem.length} duplicate items, ${gaps.historic.length} historic to review`
  );

  console.log('Reading ship classes from registry ship infoboxes...');
  const sitelinks = await fetchSitelinks([...registryQids]);
  const shipText = await fetchWikitext([...sitelinks.values()]);
  const imoByQid = new Map(registry.ships.map((s) => [s.wikidataId, s.imo]));
  const withClass = [...sitelinks]
    .map(([qid, title]) => ({
      imo: imoByQid.get(qid),
      title,
      field: extractClassField(shipText.get(title)),
    }))
    .filter((a) => a.field);
  const expanded = await expandClassFields(withClass.map((a) => a.field));
  withClass.forEach((a, i) => {
    a.classLink = pickClassLink(expanded[i]);
    const guess = a.classLink.unresolved === 'no class link' ? guessClassTitle(a.field) : null;
    if (guess) a.classLink = { title: guess, guessed: true };
  });
  const classTitles = withClass.map((a) => a.classLink.title).filter(Boolean);
  const classQidByTitle = await resolveTitles(classTitles);
  const unmatched = [...classQidByTitle].filter(([, qid]) => !qid).map(([title]) => title);
  const byLabel = await lookupByLabel(unmatched);
  for (const [title, qid] of byLabel.qids) classQidByTitle.set(title, qid);
  for (const a of withClass) {
    a.classQid = a.classLink.title ? classQidByTitle.get(a.classLink.title) : null;
    a.classAmbiguous = byLabel.ambiguous.has(a.classLink.title);
  }
  const classFacts = await fetchClassFacts([
    ...new Set([...classQidByTitle.values()].filter(Boolean)),
  ]);
  const classes = proposeClasses({ registry, articles: withClass, classes: classFacts });
  console.log(
    `  ${withClass.length} infobox classes: ${classes.proposals.length} proposals, ` +
      `${classes.conflicts.length} conflicts, ${classes.unresolved.length} unresolved`
  );

  const categoryQids = new Map(
    CATEGORY_TARGETS.map(([wpCategory]) => [
      wpCategory,
      new Set(
        [...articles.values()].filter((a) => a.sources.includes(wpCategory)).map((a) => a.qid)
      ),
    ])
  );
  const categoryFixes = proposeCategories({ registry, categoryQids });

  const report = renderGapReport({
    gaps,
    classes,
    categories: categoryFixes,
    stats: { articles: articles.size, categories: categories.length },
    generatedAt: new Date().toISOString().slice(0, 10),
  });
  if (args.report) await write(args.report, report);
  else console.log(`\n${report}`);
  if (args.quickstatements) await write(args.quickstatements, toQuickStatements({ gaps, classes }));
  if (args.json) {
    const data = { gaps, classes, categories: categoryFixes };
    await write(args.json, `${JSON.stringify(data, null, 2)}\n`);
  }

  if (args.writeOverrides) {
    const { file, added, skipped } = mergeProposalsIntoOverrides(overrides, {
      include: gaps.include,
      classes: classes.proposals,
      categories: categoryFixes,
    });
    const errors = validateOverrides(file);
    if (errors.length)
      throw new Error(`Refusing to write invalid overrides:\n  ${errors.join('\n  ')}`);
    await write(OVERRIDES, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`  ${added} proposals added, ${skipped} skipped (IMO already overridden)`);
    console.log('  Next: npm run seed:fleet, then review the registry diff.');
  }
}

main().catch((error) => {
  console.error(`Fleet gap check failed: ${error.message}`);
  process.exit(1);
});
