import { describe, it, expect } from 'vitest';
import {
  CENTERLINE_Y,
  SHIP_BEAM_M,
  clampToHull,
  describeLocation,
  generateHullOutline,
  hullHalfWidth,
  isInsideHull,
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
