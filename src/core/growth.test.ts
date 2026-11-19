import { describe, expect, it } from 'vitest';
import * as growth from './growth';
import { OFFICE_DECOR, nextUnlock, unlockedDecor } from './growth';

describe('OFFICE_DECOR — office props unlocked by completed tasks (FR-G3, ADR-025 §7)', () => {
  it('lists the six props in unlock order with their XP thresholds', () => {
    expect(OFFICE_DECOR).toEqual([
      { id: 'poster', xp: 2 },
      { id: 'desk-plants', xp: 4 },
      { id: 'string-lights', xp: 7 },
      { id: 'lounge-rug', xp: 10 },
      { id: 'full-bookshelf', xp: 15 },
      { id: 'trophy-shelf', xp: 25 },
    ]);
  });

  it('has no growth stages, names or care any more', () => {
    expect(Object.keys(growth).sort()).toEqual(['OFFICE_DECOR', 'nextUnlock', 'unlockedDecor']);
  });
});

describe('unlockedDecor', () => {
  it.each([
    [0, []],
    [1, []],
    [2, ['poster']],
    [3, ['poster']],
    [4, ['poster', 'desk-plants']],
    [6, ['poster', 'desk-plants']],
    [7, ['poster', 'desk-plants', 'string-lights']],
    [9, ['poster', 'desk-plants', 'string-lights']],
    [10, ['poster', 'desk-plants', 'string-lights', 'lounge-rug']],
    [14, ['poster', 'desk-plants', 'string-lights', 'lounge-rug']],
    [15, ['poster', 'desk-plants', 'string-lights', 'lounge-rug', 'full-bookshelf']],
    [24, ['poster', 'desk-plants', 'string-lights', 'lounge-rug', 'full-bookshelf']],
    [25, ['poster', 'desk-plants', 'string-lights', 'lounge-rug', 'full-bookshelf', 'trophy-shelf']],
    [9_999, ['poster', 'desk-plants', 'string-lights', 'lounge-rug', 'full-bookshelf', 'trophy-shelf']],
  ] as const)('%d XP → %j', (xp, decor) => {
    expect(unlockedDecor(xp)).toEqual(decor);
  });

  it.each([-1, -25, 2.5, Number.NaN, Number.POSITIVE_INFINITY])('treats %s, which is not XP, as 0', (xp) => {
    expect(unlockedDecor(xp)).toEqual([]);
  });

  it('returns a fresh list each call', () => {
    const first = unlockedDecor(25);
    first.pop();
    expect(unlockedDecor(25)).toHaveLength(6);
  });
});

describe('nextUnlock', () => {
  it.each([
    [0, { id: 'poster', xp: 2 }],
    [1, { id: 'poster', xp: 2 }],
    [2, { id: 'desk-plants', xp: 4 }],
    [3, { id: 'desk-plants', xp: 4 }],
    [4, { id: 'string-lights', xp: 7 }],
    [7, { id: 'lounge-rug', xp: 10 }],
    [10, { id: 'full-bookshelf', xp: 15 }],
    [15, { id: 'trophy-shelf', xp: 25 }],
    [24, { id: 'trophy-shelf', xp: 25 }],
  ] as const)('%d XP → %j', (xp, next) => {
    expect(nextUnlock(xp)).toEqual(next);
  });

  it.each([25, 26, 9_999])('is null once everything is unlocked (%d XP)', (xp) => {
    expect(nextUnlock(xp)).toBeNull();
  });

  it.each([-1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])('treats %s, which is not XP, as 0', (xp) => {
    expect(nextUnlock(xp)).toEqual({ id: 'poster', xp: 2 });
  });

  it('is always the first prop not yet unlocked', () => {
    for (let xp = 0; xp <= 30; xp += 1) {
      const unlocked = unlockedDecor(xp);
      expect(nextUnlock(xp)).toEqual(OFFICE_DECOR[unlocked.length] ?? null);
    }
  });
});
