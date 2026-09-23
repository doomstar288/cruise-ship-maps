import { describe, it, expect } from 'vitest';
import {
  CENTERLINE_Y,
  SHIP_BEAM_M,
  clampToHull,
  describeLocation,
  generateHullOutline,
  generateStaterooms,
  hullHalfWidth,
  isInsideHull,
  numberCabins,
} from './deckPlanDataPipeline';

describe('hullHalfWidth', () => {
  it('comes to a point at the bow and reaches full beam midship', () => {
    expect(hullHalfWidth(8, 0)).toBe(0);
    expect(hullHalfWidth(8, 160)).toBeCloseTo(SHIP_BEAM_M / 2);
  });

  it('widens steadily through the bow', () => {
    let previous = -1;
    for (let x = 0; x <= 80; x += 5) {
      const hw = hullHalfWidth(8, x);
      expect(hw).toBeGreaterThanOrEqual(previous);
      previous = hw;
    }
  });

  it('ends in a broad transom rather than a second bow', () => {
    expect(hullHalfWidth(8, 327)).toBeGreaterThan(15);
    expect(hullHalfWidth(8, 327)).toBeLessThan(SHIP_BEAM_M / 2);
  });

  it('is zero outside a stepped-back deck', () => {
    expect(hullHalfWidth(17, 60)).toBe(0);
    expect(hullHalfWidth(17, 120)).toBeGreaterThan(0);
  });

  it('keeps the plan at the real length-to-beam proportion', () => {
    const outline = generateHullOutline(8);
    const ys = outline.map(([, y]) => y);
    const xs = outline.map(([x]) => x);
    const ratio = (Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys));
    expect(ratio).toBeGreaterThan(8);
    expect(ratio).toBeLessThan(9);
  });
});

describe('generateHullOutline', () => {
  it('extends the bridge wings past the hull on Deck 11 only', () => {
    const minY = (level) => Math.min(...generateHullOutline(level).map(([, y]) => y));
    expect(minY(11)).toBeLessThan(0);
    expect(minY(12)).toBeGreaterThanOrEqual(0);
  });
});

describe('clampToHull', () => {
  it('pulls a rectangle inside a tapering bow', () => {
    const [[x1, y1], [x2, y2]] = clampToHull(8, [20, 40], [0, SHIP_BEAM_M]);
    for (const corner of [[x1, y1], [x2, y2], [x1, y2], [x2, y1]]) {
      expect(isInsideHull(8, corner)).toBe(true);
    }
  });

  it('returns null for a rectangle entirely off the deck', () => {
    expect(clampToHull(17, [10, 40], [0, SHIP_BEAM_M])).toBeNull();
  });
});

describe('describeLocation', () => {
  it('names the fore/aft third and the side', () => {
    expect(describeLocation([30, 5])).toBe('Forward · Port side');
    expect(describeLocation([160, CENTERLINE_Y])).toBe('Midship · Centerline');
    expect(describeLocation([300, 43])).toBe('Aft · Starboard side (outboard)');
  });
});

describe('numberCabins and cabin parity', () => {
  const sampleCabins = [
    { code: 'E1', side: 'Port', row: 'outside', bounds: [[50, 0], [53, 5]] },
    { code: 'E1', side: 'Port', row: 'outside', bounds: [[54, 0], [57, 5]] },
    { code: 'E1', side: 'Port', row: 'outside', bounds: [[58, 0], [61, 5]] },
    { code: 'E1', side: 'Starboard', row: 'outside', bounds: [[50, 34], [53, 39]] },
    { code: 'E1', side: 'Starboard', row: 'outside', bounds: [[54, 34], [57, 39]] },
    { code: 'E1', side: 'Starboard', row: 'outside', bounds: [[58, 34], [61, 39]] },
  ];

  it('assigns odd numbers to port and even numbers to starboard by default', () => {
    const numbered = numberCabins(8, sampleCabins);
    const port = numbered.filter((c) => c.side === 'Port');
    const starboard = numbered.filter((c) => c.side === 'Starboard');

    expect(port.map((c) => Number(c.label))).toEqual([8101, 8103, 8105]);
    expect(starboard.map((c) => Number(c.label))).toEqual([8100, 8102, 8104]);

    for (const c of port) {
      expect(Number(c.label) % 2).toBe(1);
    }
    for (const c of starboard) {
      expect(Number(c.label) % 2).toBe(0);
    }
  });

  it('supports custom cabinRanges for fore/mid/aft segments', () => {
    const cabinRanges = {
      port: [{ x: [50, 56], from: 8151, to: 8199 }],
      starboard: [{ x: [50, 56], from: 8150, to: 8198 }],
    };
    const numbered = numberCabins(8, sampleCabins, cabinRanges);
    const port = numbered.filter((c) => c.side === 'Port');
    const starboard = numbered.filter((c) => c.side === 'Starboard');

    // First two cabins are in [50, 56], third cabin is at x=59.5 (outside range, falls back to sequence)
    expect(port[0].label).toBe('8151');
    expect(port[1].label).toBe('8153');
    expect(port[2].label).toBe('8155');

    expect(starboard[0].label).toBe('8150');
    expect(starboard[1].label).toBe('8152');
    expect(starboard[2].label).toBe('8154');
  });

  it('preserves ada accessible and connecting stateroom properties', () => {
    const withFlags = [
      { code: 'E1', side: 'Port', row: 'outside', bounds: [[50, 0], [53, 5]], ada: true },
      {
        code: 'E1',
        side: 'Port',
        row: 'outside',
        bounds: [[54, 0], [57, 5]],
        connecting: 'c8-8105',
      },
    ];
    const numbered = numberCabins(8, withFlags);
    expect(numbered[0].ada).toBe(true);
    expect(numbered[1].connecting).toBe('c8-8105');
  });

  it('generateStaterooms applies odd-port / even-starboard parity and forwards cabinRanges', () => {
    const staterooms = generateStaterooms(9, {
      range: [100, 110],
      typeFor: () => 'E1',
      cabinRanges: {
        port: [{ x: [95, 115], from: 9201, to: 9250 }],
        starboard: [{ x: [95, 115], from: 9200, to: 9250 }],
      },
    });
    expect(staterooms.length).toBeGreaterThan(0);
    for (const c of staterooms) {
      const num = Number(c.label);
      expect(num % 2).toBe(c.side === 'Port' ? 1 : 0);
      expect(num).toBeGreaterThanOrEqual(9200);
    }
  });
});
