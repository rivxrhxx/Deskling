/**
 * Growing the office (ADR-025 §7). Pure rules: no storage, no timers, no React.
 * XP is the number of completed tasks (accepted turn.succeeded events of every session) — nothing else.
 */

/** Office props in unlock order, each with the XP that unlocks it. */
export const OFFICE_DECOR = [
  { id: 'poster', xp: 2 },
  { id: 'desk-plants', xp: 4 },
  { id: 'string-lights', xp: 7 },
  { id: 'lounge-rug', xp: 10 },
  { id: 'full-bookshelf', xp: 15 },
  { id: 'trophy-shelf', xp: 25 },
] as const;
export type OfficeDecorId = (typeof OFFICE_DECOR)[number]['id'];

/** XP is a non-negative integer; anything else counts as none. */
const asXp = (xp: number) => (Number.isSafeInteger(xp) && xp > 0 ? xp : 0);

export function unlockedDecor(xp: number): OfficeDecorId[] {
  const level = asXp(xp);
  return OFFICE_DECOR.filter((decor) => level >= decor.xp).map((decor) => decor.id);
}

/** The next prop to unlock, or null when everything is unlocked. */
export function nextUnlock(xp: number): { readonly id: OfficeDecorId; readonly xp: number } | null {
  const level = asXp(xp);
  return OFFICE_DECOR.find((decor) => level < decor.xp) ?? null;
}
