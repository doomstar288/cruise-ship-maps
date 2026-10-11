import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

import {
  buildFacts,
  calibrateOrientation,
  classifyLabel,
  comparePack,
  deckNumberFromFilename,
  formatReport,
  formatRuns,
  lookup,
  mergeLines,
  normalizeName,
  packPath,
  parseArgs,
  parseSvgLabels,
  parseTransform,
  zoneOf,
  zonesAgree,
} from './official-deck-svg.mjs';

const xcel = JSON.parse(readFileSync(packPath('celebrity-xcel'), 'utf8'));

/**
 * Draws a pack deck back out as an SVG of labels only, the way an official plan would label
 * it. `column` shifts the deck sideways across the ship and crops the viewBox to it, as
 * Celebrity's plans do: every deck is cut from one drawing with the decks side by side.
 */
function svgFromPackDeck(
  pack,
  deckNumber,
  { bow = 'left', port = 'top', scale = 4, column = 0 } = {}
) {
  const { minX, maxX } = pack.geometry.extent;
  const length = (maxX - minX) * scale;
  const beam = pack.geometry.beamMeters * scale;
  const offset = column * beam * 1.5;
  const place = (along, across) => {
    const a = ['left', 'top'].includes(bow) ? along : length - along;
    const c = offset + (['left', 'top'].includes(port) ? across : beam - across);
    return ['left', 'right'].includes(bow) ? [a, c] : [c, a];
  };
  const deck = pack.decks.find((d) => d.deckNumber === deckNumber);
  const texts = deck.features
    .filter(
      (f) => f.featureType === 'venue' || f.featureType === 'poi' || f.featureType === 'cabin'
    )
    .map((f) => {
      const [x, y] = place((f.center[0] - minX) * scale, f.center[1] * scale);
      const label = f.featureType === 'cabin' ? f.cabin.number : f.name.replace(/&/g, '&amp;');
      return `<text transform="matrix(1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)})">${label}</text>`;
    });
  const [vx, vy] = place(0, 0).map((n, i) => Math.min(n, place(length, beam)[i]));
  const [vw, vh] = ['left', 'right'].includes(bow) ? [length, beam] : [beam, length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}"><g>${texts.join('')}</g></svg>`;
}

describe('parseTransform', () => {
  it('composes translate, scale and matrix in order', () => {
    expect(parseTransform('translate(10 20) scale(2)')).toEqual([2, 0, 0, 2, 10, 20]);
    expect(parseTransform('matrix(1 0 0 1 5 6)')).toEqual([1, 0, 0, 1, 5, 6]);
    expect(parseTransform(undefined)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('rotates about a point', () => {
    const [a, b, c, d, e, f] = parseTransform('rotate(90 10 10)');
    // (20, 10) rotates a quarter turn about (10, 10) to (10, 20).
    expect(a * 20 + c * 10 + e).toBeCloseTo(10);
    expect(b * 20 + d * 10 + f).toBeCloseTo(20);
  });
});

describe('parseSvgLabels', () => {
  it('applies ancestor transforms, joins tspans and decodes entities', () => {
    const svg = `<?xml version="1.0"?>
      <svg viewBox="0 0 1000 120">
        <defs><style>.a{fill:#000}</style><text>ignored</text></defs>
        <!-- <text x="1" y="1">commented out</text> -->
        <g transform="translate(100 10)">
          <text x="5" y="7">Caf&#233; al Bacio &amp; Gelateria</text>
          <text transform="matrix(1 0 0 1 200 30)"><tspan x="0" y="0">MAST</tspan><tspan x="0" y="14">GRILL</tspan></text>
        </g>
        <svg:text x="900" y="60">Rooftop&#x20;Garden</svg:text>
      </svg>`;
    const { viewBox, labels } = parseSvgLabels(svg);
    expect(viewBox).toEqual({ minX: 0, minY: 0, width: 1000, height: 120 });
    expect(labels.map(({ text, x, y }) => ({ text, x, y }))).toEqual([
      { text: 'Café al Bacio & Gelateria', x: 105, y: 17 },
      { text: 'MAST GRILL', x: 300, y: 40 },
      { text: 'Rooftop Garden', x: 900, y: 60 },
    ]);
  });

  it('records reading direction and font size, defaulting to the typical size', () => {
    const svg = `<svg>
      <text font-size="4" transform="matrix(0 -1 1 0 10 50)">THE CLUB</text>
      <text font-size="4" x="0" y="0">A</text>
      <g transform="scale(2)"><text x="1" y="1">POOL</text></g>
    </svg>`;
    const [club, , pool] = parseSvgLabels(svg).labels;
    expect(club.u[0]).toBeCloseTo(0);
    expect(club.u[1]).toBeCloseTo(-1);
    expect(club.v).toEqual([1, 0]);
    expect(club.size).toBe(4);
    // No font-size anywhere: the document's typical size, scaled by its transform.
    expect(pool.size).toBe(4);
    expect([pool.x, pool.y]).toEqual([2, 2]);
  });

  it('reads CDATA as text and skips comments, even unclosed ones', () => {
    const svg =
      '<svg><text x="1" y="2"><![CDATA[Eden & Eden Bar]]></text><text x="3" y="4">Bora</text><!-- <text x="5" y="6">Gone</text>';
    expect(parseSvgLabels(svg).labels.map((l) => l.text)).toEqual(['Eden & Eden Bar', 'Bora']);
  });

  it('returns no labels when text is drawn as outlines', () => {
    expect(parseSvgLabels('<svg viewBox="0 0 10 10"><path d="M0 0L1 1"/></svg>').labels).toEqual(
      []
    );
  });
});

describe('deck files and labels', () => {
  it("reads Celebrity's spelled-out deck file names", () => {
    expect(deckNumberFromFilename('deck-fourteen.svg')).toBe(14);
    expect(deckNumberFromFilename('deck-three.svg')).toBe(3);
    expect(deckNumberFromFilename('deck-14.svg')).toBe(14);
    expect(deckNumberFromFilename('CEL-silhouette.svg')).toBeNull();
  });

  it('classifies labels by what they name', () => {
    expect(classifyLabel('6101', 6)).toBe('cabin');
    expect(classifyLabel('10122', 10)).toBe('cabin');
    expect(classifyLabel('7101', 6)).toBe('other');
    expect(classifyLabel('Forward Elevators', 6)).toBe('elevator');
    expect(classifyLabel('STAIRS', 6)).toBe('stairs');
    expect(classifyLabel('A', 6)).toBe('other');
    expect(classifyLabel('GENTS', 6)).toBe('restroom');
    expect(classifyLabel('WC', 6)).toBe('restroom');
    expect(classifyLabel('Mast Grill', 14)).toBe('venue');
  });

  it('matches a shortened official name word by word, never on one word', () => {
    const entry = { deckNumber: 14 };
    const index = new Map([
      ['mast grill and bar', [entry]],
      ['mast bar', [{ deckNumber: 16 }]],
    ]);
    expect(lookup(index, 'mast grill')).toEqual([entry]);
    expect(lookup(index, 'mast')).toEqual([]);
    expect(lookup(index, 'grill mast and bar')).toEqual([entry]);
  });

  it('folds names for matching', () => {
    expect(normalizeName('The Café & Bar')).toBe(normalizeName('cafe and bar'));
    expect(normalizeName('Eden’s Bar')).toBe('edens bar');
  });

  it('zones by thirds, with slack at the boundaries', () => {
    expect([0.1, 0.5, 0.9].map(zoneOf)).toEqual(['fwd', 'mid', 'aft']);
    expect(zonesAgree(0.35, 'fwd')).toBe(true);
    expect(zonesAgree(0.35, 'aft')).toBe(false);
    expect(zonesAgree(0.5, 'fwd')).toBe(false);
  });

  it('collapses cabin numbers into runs', () => {
    expect(formatRuns([6101, 6103, 6105, 6109])).toBe('6101–6105, 6109');
  });
});

describe('mergeLines', () => {
  const at = (text, x, y, vertical = false) => ({
    text,
    x,
    y,
    u: vertical ? [0, -1] : [1, 0],
    v: vertical ? [1, 0] : [0, 1],
    size: 4,
  });
  const merged = (labels) =>
    mergeLines(labels, 14)
      .map((l) => l.text)
      .sort();

  // Positions below are Celebrity Xcel's own, from its deck 3 and deck 14 plans.
  it('joins a name set over several lines, top line first', () => {
    expect(
      merged([at('POOL', 437.5, 430.4), at('CLUB', 437.5, 434.4), at('THE', 438.7, 426.4)])
    ).toEqual(['THE POOL CLUB']);
    expect(merged([at('BACIO', 423.6, 565.5, true), at('IL SECONDO', 419.6, 570, true)])).toEqual([
      'IL SECONDO BACIO',
    ]);
  });

  it('keeps neighbouring names apart', () => {
    // Side by side, a line apart, but only touching end to end.
    expect(
      merged([
        at('GUEST', 1600, 471.1),
        at('RELATIONS', 1600, 475.1),
        at('CONCIERGE', 1620.6, 475.3),
        at('LOUNGE', 1620.6, 479.3),
      ])
    ).toEqual(['CONCIERGE LOUNGE', 'GUEST RELATIONS']);
    // Two lines down is another label, and a hot tub beside the pool isn't part of it.
    expect(
      merged([
        at('SUNDECK', 69, 196),
        at('THE', 74, 202),
        at('POOL', 437.9, 324.2),
        at('HOT', 453.6, 326.8),
      ])
    ).toEqual(['HOT', 'POOL', 'SUNDECK', 'THE']);
    // Text reading another way never joins.
    expect(merged([at('RELAXATION', 407.6, 239.5, true), at('BARBER', 418, 239.2)])).toEqual([
      'BARBER',
      'RELAXATION',
    ]);
  });

  it('leaves staterooms, lifts and restrooms alone', () => {
    expect(
      mergeLines([at('GENTS', 0, 0), at('LADIES', 0, 4), at('ELEVATORS', 0, 8)], 14).map(
        (l) => l.text
      )
    ).toEqual(['GENTS', 'LADIES', 'ELEVATORS']);
  });
});

describe('calibrateOrientation', () => {
  const cabinsAt = (pairs) => pairs.map(([text, x, y]) => ({ text, x, y }));

  it('reads bow and port from the stateroom numbering', () => {
    const labels = cabinsAt([
      ['6101', 900, 10],
      ['6103', 800, 10],
      ['6105', 700, 10],
      ['6100', 900, 90],
      ['6102', 800, 90],
      ['6104', 700, 90],
    ]);
    expect(calibrateOrientation([{ deckNumber: 6, labels }])).toEqual({
      bow: 'right',
      port: 'top',
    });
  });

  it('finds the long axis when the ship is drawn upright, as Celebrity draws it', () => {
    const labels = cabinsAt([
      ['6101', 10, 100],
      ['6103', 10, 200],
      ['6105', 10, 300],
      ['6100', 60, 100],
      ['6102', 60, 200],
      ['6104', 60, 300],
    ]);
    expect(calibrateOrientation([{ deckNumber: 6, labels }])).toEqual({ bow: 'top', port: 'left' });
  });

  it('gives up without enough staterooms', () => {
    expect(calibrateOrientation([{ deckNumber: 14, labels: cabinsAt([['Pool', 1, 1]]) }])).toEqual({
      bow: null,
      port: null,
    });
  });
});

describe('against the Xcel pack', () => {
  const decks = xcel.decks.map((d) => d.deckNumber);

  for (const [bow, port] of [
    ['left', 'top'],
    ['right', 'bottom'],
    ['top', 'left'], // how Celebrity draws its plans
  ]) {
    it(`agrees with itself when drawn bow-${bow}, port-${port}`, () => {
      const files = decks.map((n, column) => ({
        name: `deck-${n}.svg`,
        svg: svgFromPackDeck(xcel, n, { bow, port, column }),
      }));
      const facts = buildFacts({ files });
      expect(facts.orientation).toEqual({ bow, port });

      const { venues, cabins } = comparePack(facts, xcel);
      expect(venues.length).toBeGreaterThan(10);
      const off = venues.filter((v) => v.status !== 'match');
      expect(off).toEqual([]);
      for (const c of cabins) {
        expect(c.missingFromPack).toEqual([]);
        expect(c.notOnOfficialPlan).toEqual([]);
      }
    });
  }

  it('flags a venue the official plan puts on another deck or zone', () => {
    const svg3 = svgFromPackDeck(xcel, 3).replace(
      '</g>',
      // Mast Grill is on 14 in the pack; the Theatre is drawn forward in the pack.
      '<text x="20" y="40">Mast Grill</text><text x="1200" y="80">The Theatre</text><text x="944" y="80">Nowhere Bar</text></g>'
    );
    const files = [3, 6].map((n) => ({
      name: `deck-${n}.svg`,
      svg: n === 3 ? svg3 : svgFromPackDeck(xcel, n),
    }));
    const facts = buildFacts({ files });
    const { venues } = comparePack(facts, xcel);
    const byName = (name) => venues.filter((v) => v.name === name);

    expect(byName('Mast Grill')[0]).toMatchObject({ status: 'deck-mismatch', packDecks: [14] });
    expect(
      byName('The Theatre')
        .map((v) => v.status)
        .sort()
    ).toEqual(['match', 'zone-mismatch']);
    expect(byName('Nowhere Bar')[0].status).toBe('not-in-pack');

    const report = formatReport('celebrity-xcel', facts, comparePack(facts, xcel));
    expect(report).toContain('Mast Grill: official deck 3, pack deck 14');
    expect(report).toContain('Nowhere Bar');
  });

  it('flags stateroom numbers the pack is missing or invents', () => {
    const svg = svgFromPackDeck(xcel, 6).replace('>6101<', '>6999<');
    const facts = buildFacts({ files: [{ name: 'deck-six.svg', svg }] });
    const port = comparePack(facts, xcel).cabins.find(
      (c) => c.deckNumber === 6 && c.side === 'port'
    );
    expect(port.missingFromPack).toEqual([6999]);
    expect(port.notOnOfficialPlan).toEqual([6101]);
  });

  it('explains outlined labels instead of reporting an empty match', () => {
    expect(() =>
      buildFacts({ files: [{ name: 'deck-six.svg', svg: '<svg><path d="M0 0"/></svg>' }] })
    ).toThrow(/outlines/);
  });
});

describe('parseArgs', () => {
  it('reads flags and rejects bad orientations', () => {
    expect(parseArgs(['--ship-id', 'celebrity-edge', '--bow', 'right', '--write'])).toMatchObject({
      shipId: 'celebrity-edge',
      bow: 'right',
      write: true,
    });
    expect(() => parseArgs(['--bow', 'up'])).toThrow();
    expect(() => parseArgs(['--nope'])).toThrow();
  });
});
