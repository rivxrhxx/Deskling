import type { UsageSnapshot } from './agentState';

/**
 * Energy and anger: fixed-threshold readings of reported numbers (ADR-016, EVENT_PROTOCOL §5.1).
 * Pure functions — nothing here estimates or extrapolates; no report means `unknown`.
 */

export const ENERGY_LEVELS = ['unknown', 'full', 'ok', 'low', 'empty'] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];

export const ANGER_LEVELS = ['unknown', 'calm', 'annoyed', 'angry', 'furious'] as const;
export type AngerLevel = (typeof ANGER_LEVELS)[number];

export interface Energy {
  readonly level: EnergyLevel;
  readonly used: number | null;
  readonly remaining: number | null;
  readonly budget: number;
  /** Remaining share of the budget, 0–1. */
  readonly ratio: number | null;
}

export interface Anger {
  readonly level: AngerLevel;
  readonly used: number | null;
  readonly limit: number | null;
  /** Context window fill, 0–1. */
  readonly ratio: number | null;
}

export interface Vitals {
  readonly energy: Energy;
  readonly anger: Anger;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

function energyLevel(ratio: number): EnergyLevel {
  if (ratio >= 0.6) return 'full';
  if (ratio >= 0.3) return 'ok';
  if (ratio >= 0.1) return 'low';
  return 'empty';
}

function angerLevel(ratio: number): AngerLevel {
  if (ratio < 0.5) return 'calm';
  if (ratio < 0.75) return 'annoyed';
  if (ratio < 0.9) return 'angry';
  return 'furious';
}

/** Energy = tokens left in the user's budget (FR-V2). */
export function energyFrom(usage: UsageSnapshot, budget: number): Energy {
  if (!usage.tokens || !(budget > 0)) {
    return { level: 'unknown', used: usage.tokens?.used ?? null, remaining: null, budget, ratio: null };
  }
  const used = usage.tokens.used;
  const remaining = Math.max(0, budget - used);
  const ratio = clamp01(remaining / budget);
  return { level: energyLevel(ratio), used, remaining, budget, ratio };
}

/** Anger = how full the context window is (FR-V3). */
export function angerFrom(usage: UsageSnapshot): Anger {
  if (!usage.context) {
    return { level: 'unknown', used: null, limit: null, ratio: null };
  }
  const { used, limit } = usage.context;
  const ratio = clamp01(used / limit);
  return { level: angerLevel(ratio), used, limit, ratio };
}

export function deriveVitals(usage: UsageSnapshot, budget: number): Vitals {
  return { energy: energyFrom(usage, budget), anger: angerFrom(usage) };
}
