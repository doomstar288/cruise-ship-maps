import { describe, it, expect } from 'vitest';

import {
  applyLifecycle,
  applyOverrides,
  carryForward,
  checkGuardrails,
  currentOperator,
  deriveCategory,
  deriveStatus,
  diffRegistries,
  parseFormerNames,
  parseOperators,
  renderSummary,
  validateOverrides,
} from './fleet-registry-build.mjs';

const NOW = new Date('2026-09-17T00:00:00Z');
const date = (iso) => new Date(iso);
const binding = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, { value: v }]));

const ship = (imo, extra = {}) => ({
  imo,
  name: `Ship ${imo}`,
  operator: 'Line A',
  operatorId: 'Q1',
  status: 'in_service',
  category: 'ocean',
  ...extra,
});
const registryOf = (ships) => ({ ships, stats: { ships: ships.length, byStatus: {} } });

describe('operator resolution', () => {
  it('drops operators whose statement has ended', () => {
    const ops = parseOperators(
      'Q1|Princess Cruises|2007-01-01T00:00:00Z|2011-01-01T00:00:00Z|normal;;' +
        'Q2|Azamara|2018-01-01T00:00:00Z||normal'
    );
    expect(currentOperator(ops, NOW)).toEqual({ operator: ops[1], ambiguous: false });
  });

  it('returns no operator when every statement has ended', () => {
    const ops = parseOperators('Q1|Costa Cruises|2006-01-01T00:00:00Z|2020-01-01T00:00:00Z|normal');
    expect(currentOperator(ops, NOW).operator).toBeNull();
  });

  it('prefers a preferred-rank statement over a later-dated normal one', () => {
    const ops = parseOperators(
      'Q1|Line A|2010-01-01T00:00:00Z||preferred;;Q2|Line B|2020-01-01T00:00:00Z||normal'
    );
    expect(currentOperator(ops, NOW)).toMatchObject({ operator: { id: 'Q1' }, ambiguous: false });
  });

  it('flags undated ties and keeps last run’s choice so values do not flip', () => {
    const ops = parseOperators('Q9|Celebrity Cruises|||normal;;Q5|TUI Cruises|||normal');
    expect(currentOperator(ops, NOW, 'Q9')).toMatchObject({
      operator: { id: 'Q9' },
      ambiguous: true,
    });
    // Without history the choice is still deterministic.
    expect(currentOperator(ops, NOW).operator.id).toBe('Q5');
  });

  it('does not treat the same operator in two statements as ambiguous', () => {
    const ops = parseOperators('Q1|Line A|||normal;;Q1|Line A|2015-01-01T00:00:00Z||normal');
    expect(currentOperator(ops, NOW)).toMatchObject({ operator: { id: 'Q1' }, ambiguous: false });
  });
});

describe('status and category', () => {
  const base = { events: [], types: [], serviceEntry: null, retirement: null, operator: null };

  it('retires ships with a scrapping or sinking event even if an operator remains', () => {
    const status = deriveStatus(
      { ...base, events: ['Q336332'], serviceEntry: date('1990-01-01'), operator: {} },
      NOW
    );
    expect(status).toBe('retired');
  });

  it('marks a future service entry as on order', () => {
    expect(deriveStatus({ ...base, serviceEntry: date('2027-06-01'), operator: {} }, NOW)).toBe(
      'on_order'
    );
  });

  it('only calls a ship in service when it has entered service and has an operator', () => {
    expect(deriveStatus({ ...base, serviceEntry: date('2020-01-01'), operator: {} }, NOW)).toBe(
      'in_service'
    );
    expect(deriveStatus({ ...base, serviceEntry: date('2020-01-01') }, NOW)).toBe('unknown');
  });

  it('ignores a retirement date that has not arrived yet', () => {
    const status = deriveStatus(
      { ...base, serviceEntry: date('2000-01-01'), retirement: date('2030-01-01'), operator: {} },
      NOW
    );
    expect(status).toBe('in_service');
  });

  it('categorises river ships and cruiseferries separately from ocean ships', () => {
    expect(deriveCategory(['Q39804', 'Q18916020'])).toBe('river');
    expect(deriveCategory(['Q39804', 'Q3276983'])).toBe('ferry');
    expect(deriveCategory(['Q697196', 'Q25653'])).toBe('ocean');
    expect(deriveCategory(['Q39804'])).toBe('ocean');
    expect(deriveCategory([])).toBe('other');
    // Typed only as a generic ship, but large enough to be an ocean cruise ship.
    expect(deriveCategory(['Q11446'], 141_420)).toBe('ocean');
    expect(deriveCategory(['Q11446'], 2_000)).toBe('other');
  });
});

describe('applyLifecycle', () => {
  const row = binding({
    operators:
      'Q1|Seabourn|2010-01-01T00:00:00Z|2024-06-01T00:00:00Z|normal;;Q2|Mitsui|2024-06-01T00:00:00Z||normal',
    names:
      'Seabourn Sojourn|2010-01-01T00:00:00Z|2024-06-01T00:00:00Z;;Mitsui Ocean Sakura|2024-06-01T00:00:00Z|',
    events: 'Q596643',
    types: 'Q39804',
    serviceEntry: '2010-06-01T00:00:00Z',
  });

  it('records current operator, former operators and former names', () => {
    const result = applyLifecycle({ imo: '9417098', name: 'Mitsui Ocean Sakura' }, row, NOW);
    expect(result).toMatchObject({
      operator: 'Mitsui',
      operatorId: 'Q2',
      status: 'in_service',
      category: 'ocean',
      formerOperators: ['Seabourn'],
      formerNames: ['Seabourn Sojourn'],
    });
    expect(result.operatorAmbiguous).toBeUndefined();
  });

  it('replaces a placeholder label with the official or previous name', () => {
    expect(applyLifecycle({ imo: '9417098', name: 'IMO 9417098' }, row, NOW).name).toBe(
      'Mitsui Ocean Sakura'
    );
    const bare = binding({ types: 'Q39804' });
    expect(
      applyLifecycle({ imo: '9239795', name: 'IMO 9239795' }, bare, NOW, {
        name: 'Goddess of the Night',
      }).name
    ).toBe('Goddess of the Night');
  });
});

describe('parseFormerNames', () => {
  it('keeps only ended names that differ from the current one', () => {
    expect(parseFormerNames('A|2000|2010;;B|2010|;;A|2000|2010;;B|1990|2000', 'B')).toEqual(['A']);
  });

  it('orders former names chronologically regardless of query order', () => {
    const raw = 'Sky|2001|2010-01-01;;Aurora|1990|2001-01-01;;Renai|2010|2015-01-01';
    expect(parseFormerNames(raw, 'Now')).toEqual(['Aurora', 'Sky', 'Renai']);
  });
});

describe('carryForward', () => {
  it('keeps ships the source stopped returning and dates when they vanished', () => {
    const previous = registryOf([ship('1111111'), ship('2222222')]);
    const result = carryForward([ship('1111111')], previous, '2026-09-17');
    expect(result.map((s) => s.imo)).toEqual(['1111111', '2222222']);
    expect(result[1].sourceMissingSince).toBe('2026-09-17');
  });

  it('preserves the original missing date across runs', () => {
    const previous = registryOf([ship('2222222', { sourceMissingSince: '2026-01-01' })]);
    expect(carryForward([], previous, '2026-09-17')[0].sourceMissingSince).toBe('2026-01-01');
  });

  it('does not resurrect ships that only existed through an add override', () => {
    const previous = registryOf([ship('3333333', { source: 'override' })]);
    expect(carryForward([], previous, '2026-09-17')).toEqual([]);
  });
});

describe('overrides', () => {
  it('accepts a well-formed file', () => {
    const file = {
      overrides: [
        { imo: '1111111', reason: 'wrong operator', set: { operator: 'X', status: 'retired' } },
        { imo: '2222222', reason: 'missing', add: { name: 'New Ship' } },
        { imo: '3333333', reason: 'a ferry', exclude: true },
      ],
    };
    expect(validateOverrides(file)).toEqual([]);
  });

  it('rejects entries without a reason, with several actions, or touching identity', () => {
    const errors = validateOverrides({
      overrides: [
        { imo: '1111111', set: { operator: 'X' } },
        { imo: '2222222', reason: 'r', set: {}, exclude: true },
        { imo: '3333333', reason: 'r', set: { imo: '9999999', status: 'sunk' } },
        { imo: '3333333', reason: 'r', exclude: true },
      ],
    });
    expect(errors.join('\n')).toMatch(/"reason" is required/);
    expect(errors.join('\n')).toMatch(/exactly one of/);
    expect(errors.join('\n')).toMatch(/"imo" cannot be overridden/);
    expect(errors.join('\n')).toMatch(/status must be one of/);
    expect(errors.join('\n')).toMatch(/duplicate IMO/);
  });

  it('patches, adds and excludes, recording which fields were hand-set', () => {
    const { ships, stale } = applyOverrides([ship('1111111'), ship('3333333')], {
      overrides: [
        { imo: '1111111', reason: 'r', set: { operator: 'Azamara' } },
        { imo: '2222222', reason: 'r', add: { name: 'Added', status: 'on_order' } },
        { imo: '3333333', reason: 'r', exclude: true },
      ],
    });
    expect(stale).toEqual([]);
    expect(ships.find((s) => s.imo === '1111111')).toMatchObject({
      operator: 'Azamara',
      overriddenFields: ['operator'],
    });
    expect(ships.find((s) => s.imo === '2222222')).toMatchObject({
      name: 'Added',
      status: 'on_order',
      source: 'override',
      imoValid: false,
    });
    expect(ships.some((s) => s.imo === '3333333')).toBe(false);
  });

  it('reports overrides that no longer match anything, or that Wikidata made redundant', () => {
    const { stale } = applyOverrides([ship('1111111')], {
      overrides: [
        { imo: '9999999', reason: 'r', set: { operator: 'X' } },
        { imo: '1111111', reason: 'r', add: { name: 'Now on Wikidata' } },
      ],
    });
    expect(stale).toEqual([
      { imo: '9999999', action: 'set' },
      { imo: '1111111', action: 'add' },
    ]);
  });
});

describe('guardrails', () => {
  const fleet = (n, extra) => Array.from({ length: n }, (_, i) => ship(String(1000000 + i), extra));

  it('passes a first run with nothing to compare against', () => {
    expect(checkGuardrails(null, registryOf(fleet(10)))).toEqual([]);
  });

  it('fails when the source suddenly returns far fewer ships', () => {
    const failures = checkGuardrails(registryOf(fleet(100)), registryOf(fleet(90)));
    expect(failures.join()).toMatch(/down from 100/);
  });

  it('counts carried-forward ships as missing, not as returned', () => {
    const next = [
      ...fleet(90),
      ...fleet(10).map((s, i) => ({
        ...s,
        imo: String(2000000 + i),
        sourceMissingSince: '2026-09-17',
      })),
    ];
    expect(checkGuardrails(registryOf(fleet(100)), registryOf(next)).join()).toMatch(/returned 90/);
  });

  it('fails when a major line loses a large share of its in-service fleet', () => {
    const before = fleet(20);
    const after = before.map((s, i) => (i < 8 ? { ...s, status: 'retired' } : s));
    const failures = checkGuardrails(registryOf(before), registryOf(after));
    expect(failures).toEqual([expect.stringMatching(/Line A in-service fleet fell from 20 to 12/)]);
  });

  it('ignores small lines where one ship is a large percentage', () => {
    const before = fleet(3);
    const after = before.map((s) => ({ ...s, status: 'retired' }));
    expect(checkGuardrails(registryOf(before), registryOf(after))).toEqual([]);
  });
});

describe('diff and summary', () => {
  const previous = registryOf([
    ship('1111111', { name: 'Old Name' }),
    ship('2222222'),
    ship('4444444', { grossTonnage: 1000 }),
  ]);
  const next = {
    ...registryOf([
      ship('1111111', { name: 'New Name' }),
      ship('2222222', { status: 'retired', operator: null }),
      ship('3333333'),
      ship('4444444', { grossTonnage: 2000 }),
    ]),
    stats: { ships: 4, byStatus: { in_service: 3, retired: 1 } },
  };

  it('classifies every kind of change', () => {
    const diff = diffRegistries(previous, next);
    expect(diff.added.map((s) => s.imo)).toEqual(['3333333']);
    expect(diff.renames).toMatchObject([{ from: 'Old Name', to: 'New Name' }]);
    expect(diff.statusChanges).toMatchObject([{ from: 'in_service', to: 'retired' }]);
    expect(diff.operatorChanges).toMatchObject([{ from: 'Line A', to: null }]);
    expect(diff.specChanges).toMatchObject([{ fields: ['grossTonnage'] }]);
  });

  it('does not report status changes against a registry that predates statuses', () => {
    const legacy = registryOf([{ imo: '2222222', name: 'Ship 2222222', operator: 'Line A' }]);
    expect(diffRegistries(legacy, next).statusChanges).toEqual([]);
  });

  it('renders a headline and a caution block when guardrails trip', () => {
    const summary = renderSummary({
      diff: diffRegistries(previous, next),
      registry: next,
      stale: [{ imo: '9999999', action: 'set' }],
      guardrailFailures: ['Line A in-service fleet fell from 20 to 12'],
    });
    expect(summary).toContain(
      '**+1 new, 1 status changes, 1 renames, 1 operator changes, 1 spec updates**'
    );
    expect(summary).toContain('> [!CAUTION]');
    expect(summary).toContain('Old Name → New Name');
    expect(summary).toContain('### Stale overrides (1)');
  });
});
