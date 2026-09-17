/**
 * Pure logic for the fleet gap check (scripts/check-fleet-gaps.mjs): compares
 * English Wikipedia's view of the cruise fleet with the registry and turns the
 * differences into reviewable proposals.
 *
 * Wikipedia is used only to *detect* gaps. Nothing is copied from article text
 * (CC BY-SA); proposals carry facts — an IMO number, a class, a category — plus
 * a link back to the article, and land either as overrides we review or as
 * Wikidata edits (CC0) made upstream.
 *
 * Three kinds of gap:
 *   1. Missing ships: a ship article in a cruise category whose Wikidata item
 *      the registry query does not reach (usually typed only as "ship" and
 *      with no operator).
 *   2. Missing classes: the article infobox names a ship class that Wikidata
 *      does not record for the ship.
 *   3. Categories: Wikipedia's expedition and river cruise ship categories,
 *      since Wikidata types many of those ships only as "ship".
 */

import { isValidImo } from '../src/utils/imo.js';

/** Cruise-specific categories: membership is an editor's judgement that the article is a cruise ship. */
export const CRUISE_CATEGORY_ROOTS = Object.freeze([
  'Category:Cruise ships',
  'Category:Expedition cruise ships',
  'Category:River cruise ships',
]);
/** Parent of the per-line "Ships of <cruise line>" categories. */
export const CRUISE_LINE_CATEGORY_PARENT = 'Category:Ships by cruise line';
export const EXPEDITION_CATEGORY = 'Category:Expedition cruise ships';
export const RIVER_CATEGORY = 'Category:River cruise ships';
/** Wikipedia category → registry category, first match wins. */
export const CATEGORY_TARGETS = Object.freeze([
  [RIVER_CATEGORY, 'river'],
  [EXPEDITION_CATEGORY, 'expedition'],
]);
/**
 * "Ships by cruise line" subcategories that aren't cruise lines: this one is a
 * cargo-passenger line whose category is mostly freighters and troopships.
 */
export const EXCLUDED_CATEGORIES = Object.freeze([
  'Category:Ships of American Export-Isbrandtsen Lines',
]);
/** Ship articles linked from these lists count like category members. */
export const LIST_PAGES = Object.freeze(['List of cruise ships']);

/**
 * IMO numbers below this were assigned to ships built before ~1970. Those are
 * mostly liners and wartime ships whose cruise career is debatable, so they
 * are listed for review instead of being proposed for inclusion.
 */
export const HISTORIC_IMO_BELOW = 7_000_000;

export const WIKIPEDIA_ITEM = 'Q328'; // "English Wikipedia", for QuickStatements S143 provenance
export const CRUISE_SHIP_ITEM = 'Q39804';

/** Marker placed between class fields so one parse call can expand many. */
export const FIELD_MARKER = (i) => `@@CSMFIELD${i}@@`;

/**
 * Removes comments and <ref> citations from wikitext. Applied until the text
 * stops changing: a single pass leaves markup behind when constructs nest
 * ("<!--<!-- -->") and an unterminated comment would otherwise survive whole.
 * Both HTML comment terminators are recognised, "-->" and "--!>".
 */
const stripMarkup = (text) => {
  let out = text;
  let previous;
  do {
    previous = out;
    out = out
      // HTML ends a comment at "-->" or "--!>"; both appear in the wild.
      .replace(/<!--[\s\S]*?(?:--!?>|$)/g, '')
      // A nested comment leaves a dangling terminator behind; it is not content.
      .replace(/--!?>/g, '')
      .replace(/<ref[^>/]*\/>/gi, '')
      .replace(/<ref[^>]*>[\s\S]*?(?:<\/ref>|$)/gi, '');
  } while (out !== previous);
  return out;
};

/** True for an individual ship article; class overview articles are excluded. */
export function isShipArticle(wikitext) {
  if (!wikitext) return false;
  if (/\{\{\s*infobox ship class overview/i.test(wikitext)) return false;
  return /\{\{\s*infobox ship/i.test(wikitext);
}

/**
 * The IMO number from a ship infobox. Only structured forms count — the
 * {{IMO Number}} template or an "IMO number" label — and the check digit must
 * pass: a bare 7-digit number in prose is too often something else.
 */
export function extractImo(wikitext) {
  const text = stripMarkup(wikitext ?? '');
  const candidates = [
    ...text.matchAll(/\{\{\s*IMO[ _]Number\s*\|\s*(?:IMO\s*)?(\d{7})/gi),
    ...text.matchAll(/IMO[ _]number\]?\]?\s*[:=]?\s*(?:IMO\s*)?(\d{7})\b/gi),
  ].map((m) => m[1]);
  return candidates.find((imo) => isValidImo(imo)) ?? null;
}

/** Raw value of the infobox `Ship class` / `class` field, without refs or comments. */
export function extractClassField(wikitext) {
  const text = stripMarkup(wikitext ?? '');
  const match = text.match(/^\s*\|\s*(?:Ship[ _])?class\s*=(.*)$/im);
  const value = match?.[1].trim();
  return value ? value : null;
}

/**
 * Splits the HTML of a batch of expanded class fields back into per-field
 * link lists. Each link records whether it points at a disambiguation page or
 * a page that doesn't exist, since neither identifies a class.
 */
export function linksByField(html, count) {
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const start = html.indexOf(FIELD_MARKER(i));
    const end = i + 1 < count ? html.indexOf(FIELD_MARKER(i + 1)) : html.length;
    const segment = start === -1 ? '' : html.slice(start, end === -1 ? html.length : end);
    const links = [...segment.matchAll(/<a\s[^>]*>/g)].map(([tag]) => {
      const attr = (name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? '';
      const title = decodeEntities(attr('title').replace(/ \(page does not exist\)$/, ''));
      return {
        title,
        disambiguation: /\bmw-disambig\b/.test(attr('class')),
        missing: /\bnew\b/.test(attr('class')),
      };
    });
    result.push(links);
  }
  return result;
}

const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  nbsp: ' ',
});

/**
 * Decodes the HTML entities in a link title. One pass over the string, never
 * chained replacements: decoding `&amp;` first would turn `&amp;lt;` — a title
 * containing the literal text "&lt;" — into "<".
 */
export function decodeEntities(text) {
  return text.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (entity, reference) => {
    if (reference.startsWith('#')) {
      const isHex = reference[1] === 'x' || reference[1] === 'X';
      const codePoint = Number.parseInt(reference.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    }
    return NAMED_ENTITIES[reference.toLowerCase()] ?? entity;
  });
}

/**
 * Picks the class link from an expanded field: the first link whose title
 * names a class ("Edge-class cruise ship", "Sphinx class"). A red link still
 * yields its title, because the class may exist on Wikidata without an
 * article; only a disambiguation page is genuinely unresolvable.
 */
export function pickClassLink(links) {
  const classLinks = links.filter(
    (l) => /\bclass\b/i.test(l.title) && !/^ship class$/i.test(l.title)
  );
  const usable = classLinks.find((l) => !l.disambiguation);
  if (usable) return { title: usable.title };
  if (classLinks.length) return { unresolved: 'ambiguous class link' };
  return { unresolved: 'no class link' };
}

/**
 * A class article title guessed from a plain-text field such as
 * "''Magic''-class [[cruise ship]]" → "Magic-class cruise ship". Only used
 * when the field has no class link; the guess must still resolve to an
 * article whose Wikidata item is a ship class, so a wrong guess is dropped.
 */
export function guessClassTitle(field) {
  const plain = field
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = plain.match(
    /^(?:the )?([A-Z0-9][\w.'’ ]*?)[- ]class\b\s*(cruise ship|cruiseferry|ocean liner|passenger ship|river cruise ship)?/i
  );
  if (!match) return null;
  return `${match[1].trim()}-class ${(match[2] ?? 'cruise ship').toLowerCase()}`;
}

const byImoDesc = (a, b) => String(b.imo ?? '').localeCompare(String(a.imo ?? ''));

/**
 * Ship articles Wikipedia files under cruise categories or lists that the
 * registry lacks, grouped by the fix they need. The ship-infobox check is what
 * filters out the operators, ports and people those pages also link to.
 *
 * @param {object} args
 * @param {object[]} args.articles  { title, qid, sources: string[] (categories/lists), wikitext }
 * @param {object} args.registry    the fleet registry
 * @param {Map<string, {imo: string|null, label: string|null}>} args.wikidata  facts by QID
 * @param {Set<string>} [args.ignored]  article titles or QIDs to skip (fleet-gap-ignore.json)
 */
export function findMissingShips({ articles, registry, wikidata, ignored = new Set() }) {
  const registryQids = new Set(registry.ships.map((s) => s.wikidataId).filter(Boolean));
  const registryByImo = new Map(registry.ships.map((s) => [s.imo, s]));
  const gaps = { include: [], addImo: [], duplicateItem: [], noWikidataItem: [], historic: [] };

  for (const article of articles) {
    if (registryQids.has(article.qid) || ignored.has(article.title) || ignored.has(article.qid)) {
      continue;
    }
    if (!isShipArticle(article.wikitext)) continue;

    const wikipediaImo = extractImo(article.wikitext);
    const facts = article.qid ? wikidata.get(article.qid) : null;
    const wikidataImo = facts?.imo && isValidImo(facts.imo) ? facts.imo : null;
    const imo = wikidataImo ?? wikipediaImo;
    // Pre-1966 liners never had IMO numbers; the registry is keyed by IMO.
    if (!imo) continue;

    const entry = {
      title: article.title,
      qid: article.qid ?? null,
      imo,
      name: facts?.label && !/^(Q\d+|IMO \d{7})$/.test(facts.label) ? facts.label : article.title,
      sources: article.sources,
    };

    const existing = registryByImo.get(imo);
    if (existing) {
      gaps.duplicateItem.push({
        ...entry,
        registryQid: existing.wikidataId,
        registryName: existing.name,
      });
    } else if (!entry.sources.length) {
      continue;
    } else if (Number(imo) < HISTORIC_IMO_BELOW) {
      gaps.historic.push(entry);
    } else if (!article.qid) {
      gaps.noWikidataItem.push(entry);
    } else if (wikidataImo) {
      gaps.include.push(entry);
    } else {
      gaps.addImo.push(entry);
    }
  }
  for (const list of Object.values(gaps)) list.sort(byImoDesc);
  return gaps;
}

/**
 * Class proposals for registry ships from their Wikipedia infobox.
 *
 * @param {object} args
 * @param {object} args.registry
 * @param {object[]} args.articles  { imo, title, classLink: {title}|{unresolved}, classQid }
 * @param {Map<string, {label: string, isShipClass: boolean}>} args.classes  facts by class QID;
 *   `isShipClass` should also be true for "X-class" items modelled as a subclass
 *   of cruise ship (e.g. R-class), which is how Wikidata records many classes.
 */
export function proposeClasses({ registry, articles, classes }) {
  const byImo = new Map(registry.ships.map((s) => [s.imo, s]));
  const knownClassIds = new Set(registry.classes.map((c) => c.id));
  const membersByClass = new Map();
  for (const s of registry.ships) {
    if (!s.shipClassId) continue;
    if (!membersByClass.has(s.shipClassId)) membersByClass.set(s.shipClassId, []);
    membersByClass.get(s.shipClassId).push(s);
  }
  const result = { proposals: [], suspect: [], conflicts: [], unresolved: [] };

  for (const article of articles) {
    const ship = byImo.get(article.imo);
    if (!ship || !article.classLink) continue;
    const base = { imo: ship.imo, name: ship.name, title: article.title };

    if (article.classLink.unresolved) {
      if (!ship.shipClassId) {
        result.unresolved.push({ ...base, classTitle: null, reason: article.classLink.unresolved });
      }
      continue;
    }
    const facts = article.classQid ? classes.get(article.classQid) : null;
    if (!facts?.isShipClass) {
      if (!ship.shipClassId) {
        let reason = 'no ship class item on Wikidata — create one';
        if (article.classAmbiguous)
          reason = 'several Wikidata items share this label — merge duplicates';
        else if (article.classQid) reason = 'linked article is not a ship class on Wikidata';
        result.unresolved.push({ ...base, classTitle: article.classLink.title, reason });
      }
      continue;
    }

    const proposal = {
      ...base,
      shipClassId: article.classQid,
      shipClass: facts.label,
      shipWikidataId: ship.wikidataId,
      knownClass: knownClassIds.has(article.classQid),
    };
    if (!ship.shipClassId) {
      const members = membersByClass.get(article.classQid) ?? [];
      if (sharesLineage(ship, members)) result.proposals.push(proposal);
      else result.suspect.push(proposal);
    } else if (ship.shipClassId !== article.classQid) {
      result.conflicts.push({
        ...proposal,
        currentClass: ship.shipClass,
        currentClassId: ship.shipClassId,
      });
    }
  }
  // Classes the registry already indexes first: they add sisters to an existing group.
  result.proposals.sort(
    (a, b) => Number(b.knownClass) - Number(a.knownClass) || a.shipClass.localeCompare(b.shipClass)
  );
  return result;
}

const builderKey = (builder) => builder?.toLowerCase().match(/[a-zà-ÿ]{3,}/)?.[0] ?? null;

/**
 * Whether a ship plausibly belongs with a class's existing members: it shares
 * an operator (current or former) or a shipbuilder with at least one of them.
 * Class names collide across lines — Disney's and Carnival's "Dream class" —
 * and Wikipedia sometimes links the wrong one; sisters almost always share a
 * yard or a fleet. An empty class has nothing to contradict.
 */
export function sharesLineage(ship, members) {
  if (!members.length) return true;
  const operators = new Set([ship.operator, ...(ship.formerOperators ?? [])].filter(Boolean));
  const yard = builderKey(ship.builder);
  return members.some(
    (m) =>
      [m.operator, ...(m.formerOperators ?? [])].some((op) => op && operators.has(op)) ||
      (yard && builderKey(m.builder) === yard)
  );
}

/**
 * Registry ships whose category Wikipedia's expedition or river cruise ship
 * categories correct. `categoryQids` maps each Wikipedia category to the
 * Wikidata items of its member articles.
 */
export function proposeCategories({ registry, categoryQids }) {
  const proposals = [];
  for (const ship of registry.ships) {
    const match = CATEGORY_TARGETS.find(([wpCategory]) =>
      categoryQids.get(wpCategory)?.has(ship.wikidataId)
    );
    if (match && ship.category !== match[1]) {
      proposals.push({
        imo: ship.imo,
        name: ship.name,
        from: ship.category,
        to: match[1],
        wpCategory: match[0],
      });
    }
  }
  return proposals.sort(byImoDesc);
}

/**
 * Overrides that contradict the ignore list: ignoring a ship stops it being
 * *proposed*, but an `include` override already in place keeps it in the
 * registry, so the two files would disagree silently.
 */
export function findIgnoredOverrides(overrides, ignoreEntries) {
  const ignoredQids = new Map(ignoreEntries.filter((e) => e.qid).map((e) => [e.qid, e]));
  return (overrides ?? [])
    .filter((o) => o.include && ignoredQids.has(o.include))
    .map((o) => ({
      imo: o.imo,
      qid: o.include,
      title: ignoredQids.get(o.include).title ?? o.include,
    }));
}

const articleUrl = (title) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/**
 * Adds proposals to an overrides file without disturbing hand-written entries:
 * an IMO that already has an override is merged only when it's a `set` that
 * doesn't already decide the same field, otherwise left alone.
 * @returns {{ file: object, added: number, skipped: number }}
 */
export function mergeProposalsIntoOverrides(file, { include = [], classes = [], categories = [] }) {
  const overrides = structuredClone(file?.overrides ?? []);
  const byImo = new Map(overrides.map((o) => [o.imo, o]));
  let added = 0;
  let skipped = 0;

  const upsertSet = (imo, fields, reason, source) => {
    const existing = byImo.get(imo);
    if (!existing) {
      const entry = { imo, reason, source, set: fields };
      overrides.push(entry);
      byImo.set(imo, entry);
      added += 1;
    } else if (
      (existing.set || existing.include) &&
      Object.keys(fields).every((k) => !(k in (existing.set ?? {})))
    ) {
      existing.set = { ...existing.set, ...fields };
      existing.reason = `${existing.reason} ${reason}`;
      added += 1;
    } else {
      skipped += 1;
    }
  };

  for (const gap of include) {
    if (byImo.has(gap.imo)) {
      skipped += 1;
      continue;
    }
    const entry = {
      imo: gap.imo,
      reason:
        `Wikipedia lists "${gap.title}" in ${gap.sources.join(', ')}, but its Wikidata item ` +
        'is not typed as a cruise ship and has no cruise-line operator, so the registry query misses it.',
      source: articleUrl(gap.title),
      include: gap.qid,
    };
    overrides.push(entry);
    byImo.set(gap.imo, entry);
    added += 1;
  }
  for (const p of classes) {
    upsertSet(
      p.imo,
      { shipClass: p.shipClass, shipClassId: p.shipClassId },
      `Wikipedia infobox for "${p.title}" gives the ship class; Wikidata has no vessel-class statement.`,
      articleUrl(p.title)
    );
  }
  for (const p of categories) {
    upsertSet(
      p.imo,
      { category: p.to },
      `Wikipedia files this ship under ${p.wpCategory}.`,
      articleUrl(p.wpCategory)
    );
  }

  overrides.sort((a, b) => a.imo.localeCompare(b.imo));
  return { file: { ...file, overrides }, added, skipped };
}

/**
 * QuickStatements (v1, tab-free pipe syntax) that make the same fixes on
 * Wikidata, each referenced to English Wikipedia. Once these land, the
 * matching overrides become redundant and the refresh PR reports them stale.
 */
export function toQuickStatements({ gaps, classes }) {
  const ref = `|S143|${WIKIPEDIA_ITEM}`;
  const lines = [];
  for (const g of gaps.include) lines.push(`${g.qid}|P31|${CRUISE_SHIP_ITEM}${ref}`);
  for (const g of gaps.addImo) {
    lines.push(`${g.qid}|P458|"${g.imo}"${ref}`);
    lines.push(`${g.qid}|P31|${CRUISE_SHIP_ITEM}${ref}`);
  }
  for (const p of classes.proposals) {
    if (p.shipWikidataId) lines.push(`${p.shipWikidataId}|P289|${p.shipClassId}${ref}`);
  }
  return lines.length ? `${lines.join('\n')}\n` : '';
}

const link = (title) => `[${title}](${articleUrl(title)})`;
const wd = (qid) => (qid ? `[${qid}](https://www.wikidata.org/wiki/${qid})` : '—');

function table(title, intro, rows, columns, limit = 40) {
  if (!rows.length) return [];
  const lines = [`### ${title} (${rows.length})`, '', intro, ''];
  lines.push(
    `| ${columns.map((c) => c[0]).join(' | ')} |`,
    `|${columns.map(() => '---').join('|')}|`
  );
  for (const row of rows.slice(0, limit))
    lines.push(`| ${columns.map((c) => c[1](row)).join(' | ')} |`);
  if (rows.length > limit)
    lines.push('', `…and ${rows.length - limit} more (see the workflow artifact).`);
  lines.push('');
  return lines;
}

/** Unresolved class rows merged per class, largest first, so one Wikidata fix reads as one row. */
export function groupUnresolved(unresolved) {
  const groups = new Map();
  for (const entry of unresolved) {
    const key = `${entry.classTitle ?? ''}\u0000${entry.reason}`;
    if (!groups.has(key))
      groups.set(key, { classTitle: entry.classTitle, reason: entry.reason, ships: [] });
    groups.get(key).ships.push(entry);
  }
  return [...groups.values()].sort(
    (a, b) =>
      Number(a.classTitle === null) - Number(b.classTitle === null) ||
      b.ships.length - a.ships.length ||
      String(a.classTitle).localeCompare(String(b.classTitle))
  );
}

/** Markdown for the tracking issue. Kept under GitHub's 65,536-character body limit by row caps. */
export function renderGapReport({ gaps, classes, categories, stats, generatedAt }) {
  const lines = [
    '## Fleet gap report',
    '',
    `_Generated ${generatedAt} by \`scripts/check-fleet-gaps.mjs\` from English Wikipedia ` +
      `(${stats.articles} ship articles checked across ${stats.categories} categories)._`,
    '',
    '**Summary:** ' +
      [
        `${gaps.include.length} ships to include`,
        `${gaps.addImo.length} missing an IMO on Wikidata`,
        `${classes.proposals.length} class proposals`,
        `${categories.length} category fixes`,
        `${classes.suspect.length} class proposals to review`,
        `${gaps.duplicateItem.length} duplicate items`,
        `${classes.conflicts.length} class conflicts`,
      ].join(' · '),
    '',
    '**To apply:** `node scripts/check-fleet-gaps.mjs --write-overrides` then `npm run seed:fleet`, ' +
      'review the diff, and open a PR. To fix Wikidata too, paste the QuickStatements file from the ' +
      'workflow artifact into https://quickstatements.toolforge.org (needs a Wikidata account).',
    '',
  ];

  lines.push(
    ...table(
      'Ships to include',
      'Ship articles in Wikipedia’s cruise categories or cruise ship list with a valid IMO on Wikidata, but not typed as cruise ships there. Fix: `include` override, or add P31 cruise ship on Wikidata.',
      gaps.include,
      [
        ['Ship', (g) => link(g.title)],
        ['IMO', (g) => g.imo],
        ['Wikidata', (g) => wd(g.qid)],
        ['Found in', (g) => g.sources.map((c) => c.replace('Category:', '')).join(', ')],
      ]
    ),
    ...table(
      'Missing IMO on Wikidata',
      'The Wikipedia infobox has a checksum-valid IMO that Wikidata lacks, so the registry (keyed by IMO) cannot include the ship. Fix on Wikidata.',
      gaps.addImo,
      [
        ['Ship', (g) => link(g.title)],
        ['IMO (Wikipedia)', (g) => g.imo],
        ['Wikidata', (g) => wd(g.qid)],
      ]
    ),
    ...table(
      'Class proposals',
      'From the article infobox; the class is a ship class on Wikidata. "Known" classes already group sister ships in the registry.',
      classes.proposals,
      [
        ['Ship', (p) => `${p.name} (${p.imo})`],
        ['Class', (p) => `${p.shipClass} ${wd(p.shipClassId)}`],
        ['Known', (p) => (p.knownClass ? 'yes' : 'new')],
        ['Source', (p) => link(p.title)],
      ],
      60
    ),
    ...table(
      'Class proposals to review',
      'The class already groups ships in the registry, but this ship shares no operator or shipbuilder with any of them — often a same-named class of another line (Disney vs Carnival "Dream class"). Not applied; fix the Wikipedia link or add an override by hand.',
      classes.suspect,
      [
        ['Ship', (p) => `${p.name} (${p.imo})`],
        ['Proposed class', (p) => `${p.shipClass} ${wd(p.shipClassId)}`],
        ['Source', (p) => link(p.title)],
      ]
    ),
    ...table(
      'Category fixes',
      'From Wikipedia’s expedition and river cruise ship categories; Wikidata has no usable type for most of these ships.',
      categories,
      [
        ['Ship', (p) => `${p.name} (${p.imo})`],
        ['Change', (p) => `${p.from} → ${p.to}`],
      ]
    ),
    ...table(
      'Duplicate Wikidata items',
      'The article’s Wikidata item differs from the one the registry uses for the same IMO — usually two items for one ship that should be merged on Wikidata.',
      gaps.duplicateItem,
      [
        ['Article', (g) => `${link(g.title)} ${wd(g.qid)}`],
        ['Registry', (g) => `${g.registryName} ${wd(g.registryQid)}`],
        ['IMO', (g) => g.imo],
      ]
    ),
    ...table(
      'Class conflicts',
      'Wikipedia and Wikidata disagree. Not applied automatically.',
      classes.conflicts,
      [
        ['Ship', (p) => `${p.name} (${p.imo})`],
        ['Registry', (p) => `${p.currentClass} ${wd(p.currentClassId)}`],
        ['Wikipedia', (p) => `${p.shipClass} ${wd(p.shipClassId)}`],
      ]
    ),
    ...table(
      'No Wikidata item',
      'The article has no Wikidata item at all. Create one (with IMO and P31 cruise ship), or add an `add` override.',
      gaps.noWikidataItem,
      [
        ['Article', (g) => link(g.title)],
        ['IMO (Wikipedia)', (g) => g.imo],
      ]
    ),
    ...table(
      'Historic ships (review)',
      'Built before ~1970 (IMO below 7000000): often liners or wartime ships whose cruise career is debatable, so never proposed automatically. Use an `include` override if wanted, or add to `scripts/fleet-gap-ignore.json`.',
      gaps.historic,
      [
        ['Article', (g) => link(g.title)],
        ['IMO', (g) => g.imo],
        ['Wikidata', (g) => wd(g.qid)],
      ],
      25
    ),
    ...table(
      'Unresolved classes',
      'Infobox classes that could not be matched to a single Wikidata ship class, grouped by class. Fixing one on Wikidata classifies every ship listed.',
      groupUnresolved(classes.unresolved),
      [
        ['Class (Wikipedia)', (g) => g.classTitle ?? '_(no class link)_'],
        ['Ships', (g) => g.ships.map((s) => link(s.title)).join(', ')],
        ['Why', (g) => g.reason],
      ],
      40
    )
  );

  return `${lines.join('\n').trimEnd()}\n`;
}
