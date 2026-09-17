import { describe, it, expect } from 'vitest';

import {
  FIELD_MARKER,
  decodeEntities,
  extractClassField,
  extractImo,
  findMissingShips,
  groupUnresolved,
  guessClassTitle,
  isShipArticle,
  linksByField,
  findIgnoredOverrides,
  mergeProposalsIntoOverrides,
  pickClassLink,
  proposeCategories,
  proposeClasses,
  sharesLineage,
  toQuickStatements,
} from './fleet-gaps-build.mjs';
import { validateOverrides } from './fleet-registry-build.mjs';

const ship = (imo, extra = {}) => ({
  imo,
  name: `Ship ${imo}`,
  wikidataId: `Q${imo}`,
  operator: 'Line A',
  builder: 'Meyer Werft',
  category: 'ocean',
  shipClassId: null,
  ...extra,
});
const registryOf = (ships, classes = []) => ({ ships, classes });

describe('article parsing', () => {
  it('recognises ship articles but not class overviews', () => {
    expect(isShipArticle('{{Infobox ship begin}}\n{{Infobox ship career}}')).toBe(true);
    expect(isShipArticle('{{Infobox ship begin}}\n{{Infobox ship class overview|...}}')).toBe(
      false
    );
    expect(isShipArticle('{{Infobox company}}')).toBe(false);
  });

  it('takes IMO numbers only from structured fields, and only valid ones', () => {
    expect(extractImo('{{IMO Number|9884136}}')).toBe('9884136');
    expect(extractImo('| Ship identification = IMO number: 9884136')).toBe('9884136');
    // Checksum failure: a 7-digit number that isn't an IMO (1234567 happens to be valid).
    expect(extractImo('{{IMO Number|1234568}}')).toBeNull();
    // Bare numbers in prose are not identifiers.
    expect(extractImo('She carried 9884136 passengers')).toBeNull();
  });

  it('decodes entities in one pass, without double-unescaping', () => {
    expect(decodeEntities('Queen&#39;s &amp; Co &quot;X&quot;')).toBe('Queen\'s & Co "X"');
    expect(decodeEntities('&#x27;a&#x27;')).toBe("'a'");
    // A title containing the literal text "&lt;" must not become "<".
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeEntities('AT&T &unknown; 100% &#999999999;')).toBe(
      'AT&T &unknown; 100% &#999999999;'
    );
  });

  it('strips nested and unterminated comments and refs', () => {
    expect(extractClassField('| class = A<!--<!-- x -->-->')).toBe('A');
    expect(extractClassField('| class = A<!-- unterminated')).toBe('A');
    expect(extractClassField('| class = A<ref>note')).toBe('A');
  });

  it('reads the class field without references or comments', () => {
    const wikitext =
      '{{Infobox ship begin}}\n| Ship class = {{sclass|Edge|cruise ship}}<ref name="a">x</ref>\n';
    expect(extractClassField(wikitext)).toBe('{{sclass|Edge|cruise ship}}');
    expect(extractClassField('| class = <!-- unknown -->')).toBeNull();
    expect(extractClassField('no infobox here')).toBeNull();
  });
});

describe('class links', () => {
  const html = [
    `<p>${FIELD_MARKER(0)}</p><p><a href="/wiki/Edge-class_cruise_ship" title="Edge-class cruise ship">Edge-class</a> <a href="/wiki/Cruise_ship" title="Cruise ship">cruise ship</a></p>`,
    `<p>${FIELD_MARKER(1)}</p><p><a href="/wiki/Vista-class_cruise_ship" class="mw-disambig" title="Vista-class cruise ship">Vista-class</a></p>`,
    `<p>${FIELD_MARKER(2)}</p><p><a href="/w/index.php?title=Galaxy-class_cruiseferry&amp;action=edit&amp;redlink=1" class="new" title="Galaxy-class cruiseferry (page does not exist)">Galaxy-class</a></p>`,
    `<p>${FIELD_MARKER(3)}</p><p><a href="/wiki/Passenger_ship" title="Passenger ship">passenger ship</a></p>`,
  ].join('');
  const fields = linksByField(html, 4);

  it('splits links per field and decodes titles', () => {
    expect(fields[0].map((l) => l.title)).toEqual(['Edge-class cruise ship', 'Cruise ship']);
    expect(fields[2][0]).toMatchObject({ title: 'Galaxy-class cruiseferry', missing: true });
  });

  it('picks the class link, keeps red links, and refuses disambiguation pages', () => {
    expect(pickClassLink(fields[0])).toEqual({ title: 'Edge-class cruise ship' });
    expect(pickClassLink(fields[1])).toEqual({ unresolved: 'ambiguous class link' });
    // No article yet, but the class may still exist on Wikidata.
    expect(pickClassLink(fields[2])).toEqual({ title: 'Galaxy-class cruiseferry' });
    expect(pickClassLink(fields[3])).toEqual({ unresolved: 'no class link' });
  });

  it('guesses a title from plain-text class fields', () => {
    expect(guessClassTitle("''Magic''-class [[cruise ship]]")).toBe('Magic-class cruise ship');
    expect(guessClassTitle('Sphinx-class [[cruise ship]]')).toBe('Sphinx-class cruise ship');
    expect(guessClassTitle("''Galaxy'' class [[cruiseferry]]")).toBe('Galaxy-class cruiseferry');
    expect(guessClassTitle('[[passenger ship]]')).toBeNull();
  });
});

describe('findMissingShips', () => {
  const registry = registryOf([ship('9884136', { wikidataId: 'Q137168318' })]);
  const article = (title, extra = {}) => ({
    title,
    qid: 'Q1',
    sources: ['Category:Cruise ships'],
    wikitext: '{{Infobox ship begin}}{{IMO Number|9805348}}',
    ...extra,
  });
  const wikidata = (imo) => new Map([['Q1', { imo, label: 'Resilient Lady' }]]);

  it('proposes inclusion when Wikidata has the ship but the registry query misses it', () => {
    const gaps = findMissingShips({
      articles: [article('Resilient Lady')],
      registry,
      wikidata: wikidata('9805348'),
    });
    expect(gaps.include).toMatchObject([{ imo: '9805348', qid: 'Q1', name: 'Resilient Lady' }]);
  });

  it('asks for an IMO on Wikidata when only Wikipedia has one', () => {
    const gaps = findMissingShips({
      articles: [article('Brilliant Lady')],
      registry,
      wikidata: wikidata(null),
    });
    expect(gaps.addImo).toHaveLength(1);
    expect(gaps.include).toEqual([]);
  });

  it('reports a second Wikidata item for a ship the registry already has', () => {
    const articles = [
      article('Celebrity Xcel', { wikitext: '{{Infobox ship begin}}{{IMO Number|9884136}}' }),
    ];
    const gaps = findMissingShips({
      articles,
      registry,
      wikidata: new Map([['Q1', { imo: '9884136' }]]),
    });
    expect(gaps.duplicateItem).toMatchObject([{ qid: 'Q1', registryQid: 'Q137168318' }]);
  });

  it('holds pre-1970 ships back for review and skips non-ship pages', () => {
    const articles = [
      article('SS Rotterdam', { wikitext: '{{Infobox ship begin}}{{IMO Number|5301019}}' }),
      article('Royal Caribbean International', { wikitext: '{{Infobox company}}' }),
    ];
    const gaps = findMissingShips({
      articles,
      registry,
      wikidata: new Map([['Q1', { imo: '5301019' }]]),
    });
    expect(gaps.historic).toHaveLength(1);
    expect(gaps.include).toEqual([]);
  });

  it('skips ignored articles and ships already in the registry', () => {
    const articles = [article('Resilient Lady'), article('Celebrity Xcel', { qid: 'Q137168318' })];
    const gaps = findMissingShips({
      articles,
      registry,
      wikidata: wikidata('9805348'),
      ignored: new Set(['Resilient Lady']),
    });
    expect(gaps.include).toEqual([]);
  });
});

describe('class proposals', () => {
  const classes = new Map([
    ['Q36847697', { label: 'Edge-class cruise ship', isShipClass: true }],
    ['Q1256121', { label: 'Dream-class cruise ship', isShipClass: true }],
    ['Q663626', { label: 'MSC Cruises', isShipClass: false }],
  ]);
  const article = (imo, classQid, extra = {}) => ({
    imo,
    title: `Article ${imo}`,
    classLink: { title: 'Edge-class cruise ship' },
    classQid,
    ...extra,
  });

  it('proposes a class for an unclassed ship', () => {
    const registry = registryOf([ship('9884136')], []);
    const { proposals } = proposeClasses({
      registry,
      articles: [article('9884136', 'Q36847697')],
      classes,
    });
    expect(proposals).toMatchObject([
      { imo: '9884136', shipClass: 'Edge-class cruise ship', knownClass: false },
    ]);
  });

  it('holds back a class whose members share no operator or builder', () => {
    const registry = registryOf(
      [
        ship('9434254', {
          name: 'Disney Dream',
          operator: 'Disney Cruise Line',
          builder: 'Meyer Werft',
        }),
        ship('9378475', {
          operator: 'Carnival Cruise Line',
          builder: 'Fincantieri',
          shipClassId: 'Q1256121',
        }),
      ],
      [{ id: 'Q1256121' }]
    );
    const result = proposeClasses({
      registry,
      articles: [article('9434254', 'Q1256121')],
      classes,
    });
    expect(result.proposals).toEqual([]);
    expect(result.suspect).toMatchObject([{ name: 'Disney Dream', shipClassId: 'Q1256121' }]);
  });

  it('reports a disagreement with an existing class instead of overwriting it', () => {
    const registry = registryOf([
      ship('9884136', { shipClassId: 'Q999', shipClass: 'Other class' }),
    ]);
    const { conflicts, proposals } = proposeClasses({
      registry,
      articles: [article('9884136', 'Q36847697')],
      classes,
    });
    expect(proposals).toEqual([]);
    expect(conflicts).toMatchObject([{ currentClassId: 'Q999', shipClassId: 'Q36847697' }]);
  });

  it('explains why a class could not be resolved, only for unclassed ships', () => {
    const registry = registryOf([ship('9884136'), ship('9999999', { shipClassId: 'Q1' })]);
    const { unresolved } = proposeClasses({
      registry,
      articles: [
        article('9884136', 'Q663626', { classLink: { title: 'Meraviglia-class cruise ship' } }),
        article('9999999', null, { classLink: { unresolved: 'no class link' } }),
      ],
      classes,
    });
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].reason).toMatch(/not a ship class/);
  });

  it('groups unresolved ships by class so one Wikidata fix is one row', () => {
    const grouped = groupUnresolved([
      {
        name: 'A',
        classTitle: 'Pinnacle-class cruise ship',
        reason: 'no ship class item on Wikidata — create one',
      },
      {
        name: 'B',
        classTitle: 'Pinnacle-class cruise ship',
        reason: 'no ship class item on Wikidata — create one',
      },
      { name: 'C', classTitle: null, reason: 'no class link' },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].ships).toHaveLength(2);
    expect(grouped.at(-1).classTitle).toBeNull();
  });
});

describe('sharesLineage', () => {
  const member = ship('1', { operator: 'Carnival Cruise Line', builder: 'Fincantieri' });

  it('accepts an empty class and a shared operator or yard', () => {
    expect(sharesLineage(ship('2'), [])).toBe(true);
    expect(
      sharesLineage(ship('2', { operator: 'Carnival Cruise Line', builder: 'X' }), [member])
    ).toBe(true);
    // Meyer Werft and Meyer Turku are the same yard group.
    expect(
      sharesLineage(ship('2', { operator: 'AIDA', builder: 'Meyer Turku' }), [
        ship('1', { operator: 'Costa', builder: 'Meyer Werft' }),
      ])
    ).toBe(true);
  });

  it('matches on a former operator', () => {
    const sold = ship('2', {
      operator: 'Marella Cruises',
      formerOperators: ['Carnival Cruise Line'],
    });
    expect(sharesLineage(sold, [member])).toBe(true);
  });

  it('rejects a ship with no connection to the class', () => {
    expect(
      sharesLineage(ship('2', { operator: 'Disney Cruise Line', builder: 'Meyer Werft' }), [member])
    ).toBe(false);
  });
});

describe('proposeCategories', () => {
  it('corrects a category from the Wikipedia category a ship is filed under', () => {
    const registry = registryOf([
      ship('9524176', { wikidataId: 'Q5', category: 'other' }),
      ship('9884136'),
    ]);
    const categoryQids = new Map([
      ['Category:River cruise ships', new Set(['Q5'])],
      ['Category:Expedition cruise ships', new Set(['Q5'])],
    ]);
    const proposals = proposeCategories({ registry, categoryQids });
    // River wins: it is the more specific of the two categories.
    expect(proposals).toMatchObject([{ imo: '9524176', from: 'other', to: 'river' }]);
  });
});

describe('merging proposals into overrides', () => {
  const base = {
    overrides: [
      { imo: '9884136', reason: 'existing', set: { shipClass: 'Edge-class cruise ship' } },
    ],
  };
  const proposals = {
    include: [
      {
        imo: '9805348',
        qid: 'Q113679865',
        title: 'Resilient Lady',
        sources: ['Category:Cruise ships'],
      },
    ],
    classes: [
      { imo: '9884136', shipClass: 'X', shipClassId: 'Q1', title: 'Celebrity Xcel' },
      {
        imo: '9838400',
        shipClass: 'Edge-class cruise ship',
        shipClassId: 'Q36847697',
        title: 'Celebrity Ascent',
      },
    ],
    categories: [
      {
        imo: '9884136',
        from: 'ocean',
        to: 'expedition',
        wpCategory: 'Category:Expedition cruise ships',
      },
    ],
  };

  it('adds proposals, never overwriting a field an override already decides', () => {
    const { file, added, skipped } = mergeProposalsIntoOverrides(base, proposals);
    expect(added).toBe(3);
    expect(skipped).toBe(1); // the class for 9884136, already set by hand
    const existing = file.overrides.find((o) => o.imo === '9884136');
    expect(existing.set).toEqual({ shipClass: 'Edge-class cruise ship', category: 'expedition' });
    expect(file.overrides.find((o) => o.imo === '9805348')).toMatchObject({
      include: 'Q113679865',
    });
    expect(validateOverrides(file)).toEqual([]);
  });

  it('leaves the input file untouched', () => {
    mergeProposalsIntoOverrides(base, proposals);
    expect(base.overrides).toHaveLength(1);
    expect(base.overrides[0].set).toEqual({ shipClass: 'Edge-class cruise ship' });
  });
});

describe('findIgnoredOverrides', () => {
  const ignore = [{ title: 'Yamal (icebreaker)', qid: 'Q1459518', reason: 'not a cruise ship' }];

  it('reports an include override for a ship the ignore list rejects', () => {
    const overrides = [
      { imo: '9077549', include: 'Q1459518' },
      { imo: '9805348', include: 'Q113679865' },
      { imo: '9884136', set: { category: 'ocean' } },
    ];
    expect(findIgnoredOverrides(overrides, ignore)).toEqual([
      { imo: '9077549', qid: 'Q1459518', title: 'Yamal (icebreaker)' },
    ]);
  });

  it('is quiet when the two files agree', () => {
    expect(findIgnoredOverrides([{ imo: '9805348', include: 'Q113679865' }], ignore)).toEqual([]);
    expect(findIgnoredOverrides(undefined, ignore)).toEqual([]);
  });
});

describe('QuickStatements', () => {
  it('writes cruise-ship typing, IMO and class statements, each sourced to Wikipedia', () => {
    const qs = toQuickStatements({
      gaps: {
        include: [{ qid: 'Q113679865' }],
        addImo: [{ qid: 'Q135706602', imo: '9870654' }],
      },
      classes: { proposals: [{ shipWikidataId: 'Q137168318', shipClassId: 'Q36847697' }] },
    });
    expect(qs.trim().split('\n')).toEqual([
      'Q113679865|P31|Q39804|S143|Q328',
      'Q135706602|P458|"9870654"|S143|Q328',
      'Q135706602|P31|Q39804|S143|Q328',
      'Q137168318|P289|Q36847697|S143|Q328',
    ]);
  });
});
