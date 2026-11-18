import { describe, expect, it } from 'vitest';
import { angerFrom, deriveVitals, energyFrom } from './mood';

const BUDGET = 200_000;
const tokens = (used: number) => ({ tokens: { used }, context: null });
const context = (used: number, limit: number) => ({ tokens: null, context: { used, limit } });

describe('energyFrom — remaining tokens against the user budget (FR-V2, ADR-016)', () => {
  it('is unknown when no token usage was reported', () => {
    expect(energyFrom({ tokens: null, context: null }, BUDGET)).toEqual({
      level: 'unknown',
      used: null,
      remaining: null,
      budget: BUDGET,
      ratio: null,
    });
  });

  it.each([
    [0, 'full', 1],
    [80_000, 'full', 0.6],
    [80_001, 'ok', 0.599995],
    [140_000, 'ok', 0.3],
    [140_001, 'low', 0.299995],
    [180_000, 'low', 0.1],
    [180_001, 'empty', 0.099995],
    [200_000, 'empty', 0],
  ] as const)('%d tokens used → %s', (used, level, ratio) => {
    const energy = energyFrom(tokens(used), BUDGET);
    expect(energy.level).toBe(level);
    expect(energy.ratio).toBeCloseTo(ratio, 6);
    expect(energy.remaining).toBe(BUDGET - used);
  });

  it('never goes below empty when usage exceeds the budget', () => {
    expect(energyFrom(tokens(450_000), BUDGET)).toMatchObject({ level: 'empty', remaining: 0, ratio: 0 });
  });

  it('is unknown for a non-positive budget instead of dividing by zero', () => {
    expect(energyFrom(tokens(10), 0).level).toBe('unknown');
  });
});

describe('angerFrom — how full the context window is (FR-V3, ADR-016)', () => {
  it('is unknown when no context usage was reported', () => {
    expect(angerFrom({ tokens: null, context: null })).toEqual({ level: 'unknown', used: null, limit: null, ratio: null });
  });

  it.each([
    [0, 'calm'],
    [49_999, 'calm'],
    [50_000, 'annoyed'],
    [74_999, 'annoyed'],
    [75_000, 'angry'],
    [89_999, 'angry'],
    [90_000, 'furious'],
    [100_000, 'furious'],
  ] as const)('%d / 100000 → %s', (used, level) => {
    expect(angerFrom(context(used, 100_000)).level).toBe(level);
  });

  it('caps the ratio at 1 when the window overflows', () => {
    expect(angerFrom(context(130, 100))).toMatchObject({ level: 'furious', ratio: 1, used: 130, limit: 100 });
  });
});

describe('deriveVitals', () => {
  it('combines both and is pure', () => {
    const usage = { tokens: { used: 150_000 }, context: { used: 80, limit: 100 } };
    const a = deriveVitals(usage, BUDGET);
    expect(a.energy.level).toBe('low');
    expect(a.anger.level).toBe('angry');
    expect(deriveVitals(usage, BUDGET)).toEqual(a);
  });
});
