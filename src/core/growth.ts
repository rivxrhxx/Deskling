/**
 * Growing the desktop pet (ADR-018). Pure rules: no storage, no timers, no React.
 * XP is the number of completed tasks (accepted turn.succeeded events) — nothing else.
 * Care (petting, snacks) only changes the pet's affection, never anything about the agent.
 */

export const GROWTH_STAGES = ['baby', 'kid', 'adult'] as const;
export type GrowthStage = (typeof GROWTH_STAGES)[number];

export function stageFor(xp: number): GrowthStage {
  if (xp < 5) return 'baby';
  if (xp < 25) return 'kid';
  return 'adult';
}

export const DECOR_UNLOCKS = [
  { id: 'poster', at: 2 },
  { id: 'desk-plant', at: 4 },
  { id: 'string-lights', at: 7 },
  { id: 'bedside-rug', at: 10 },
  { id: 'more-books', at: 15 },
  { id: 'trophy', at: 25 },
] as const;
export type DecorId = (typeof DECOR_UNLOCKS)[number]['id'];

export function decorFor(xp: number): DecorId[] {
  return DECOR_UNLOCKS.filter((unlock) => xp >= unlock.at).map((unlock) => unlock.id);
}

export interface CareState {
  /** 0–100. */
  readonly affection: number;
  readonly lastPetAt: number | null;
  /** Local calendar day of the last snack, `YYYY-MM-DD`. */
  readonly snackDay: string | null;
  readonly snacksToday: number;
}

export const INITIAL_CARE: CareState = Object.freeze({ affection: 0, lastPetAt: null, snackDay: null, snacksToday: 0 });

export const PET_COOLDOWN_MS = 5_000;
export const SNACKS_PER_DAY = 3;
export const AFFECTION_MAX = 100;
const PET_AFFECTION = 1;
const SNACK_AFFECTION = 3;

export interface CareResult {
  readonly accepted: boolean;
  readonly care: CareState;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Local calendar day for `now`. */
export function dayKey(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const withAffection = (care: CareState, gain: number) => Math.min(AFFECTION_MAX, care.affection + gain);

export function pet(care: CareState, now: number): CareResult {
  if (care.lastPetAt !== null && now - care.lastPetAt < PET_COOLDOWN_MS) {
    return { accepted: false, care };
  }
  return { accepted: true, care: { ...care, affection: withAffection(care, PET_AFFECTION), lastPetAt: now } };
}

export function snacksLeft(care: CareState, now: number): number {
  return care.snackDay === dayKey(now) ? Math.max(0, SNACKS_PER_DAY - care.snacksToday) : SNACKS_PER_DAY;
}

export function snack(care: CareState, now: number): CareResult {
  if (snacksLeft(care, now) === 0) {
    return { accepted: false, care };
  }
  const today = dayKey(now);
  const eatenToday = care.snackDay === today ? care.snacksToday : 0;
  return {
    accepted: true,
    care: { ...care, affection: withAffection(care, SNACK_AFFECTION), snackDay: today, snacksToday: eatenToday + 1 },
  };
}

/** 0–5 hearts. */
export function heartsFor(affection: number): number {
  return Math.min(5, Math.max(0, Math.ceil(affection / 20)));
}

export const NAME_MAX = 12;

/** The user's name for the pet: trimmed, single-spaced, no control or format characters, at most 12 characters. */
export function sanitizeName(input: unknown): string {
  if (typeof input !== 'string') return '';
  const cleaned = input
    .replace(/\s+/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/ {2,}/g, ' ')
    .trim();
  return Array.from(cleaned).slice(0, NAME_MAX).join('');
}
