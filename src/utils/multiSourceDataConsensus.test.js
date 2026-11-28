import { describe, it, expect } from 'vitest';
import { ACCURACY_SOURCES } from './multiSourceDataConsensus';
import { isValidImo } from './imo';

describe('ACCURACY_SOURCES', () => {
  it('only mentions IMO numbers that pass the check-digit test', () => {
    const imos = ACCURACY_SOURCES.flatMap((source) =>
      [source.id, source.name, source.description].flatMap((text) => text.match(/\d{7}/g) ?? [])
    );
    expect(imos.length).toBeGreaterThan(0);
    for (const imo of imos) {
      expect(isValidImo(imo), `IMO ${imo} fails the check digit`).toBe(true);
    }
  });
});
