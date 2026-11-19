import { describe, expect, it } from 'vitest';
import * as growth from './growth';
import { MAX_LEVEL, OFFICE_DECOR, memberLevel, nextUnlock, unlockedDecor } from './growth';

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

  it('has no growth stages, names or care any more: office props and member levels only', () => {
    expect(Object.keys(growth).sort()).toEqual(['MAX_LEVEL', 'OFFICE_DECOR', 'memberLevel', 'nextUnlock', 'unlockedDecor']);
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

describe('memberLevel — a member level from its own completed tasks (ADR-028 §1)', () => {
  it.each([
    [0, 1],
    [1, 2],
    [2, 2],
    [3, 3],
    [5, 3],
    [6, 4],
    [9, 4],
    [10, 5],
    [15, 6],
    [21, 7],
    [45, 10],
  ])('%i XP → Lv %i (level n needs n(n−1)/2)', (xp, level) => {
    expect(memberLevel(xp).level).toBe(level);
  });

  it('says where the level starts and where the next one does', () => {
    expect(memberLevel(0)).toEqual({ level: 1, xp: 0, floor: 0, next: 1 });
    expect(memberLevel(4)).toEqual({ level: 3, xp: 4, floor: 3, next: 6 });
    expect(memberLevel(10)).toEqual({ level: 5, xp: 10, floor: 10, next: 15 });
  });

  it('stops at Lv 99 with nothing next', () => {
    expect(MAX_LEVEL).toBe(99);
    expect(memberLevel(4850)).toMatchObject({ level: 98, next: 4851 });
    expect(memberLevel(4851)).toEqual({ level: 99, xp: 4851, floor: 4851, next: null });
    expect(memberLevel(1_000_000)).toMatchObject({ level: 99, floor: 4851, next: null });
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('reads %s XP as none', (xp) => {
    expect(memberLevel(xp)).toEqual({ level: 1, xp: 0, floor: 0, next: 1 });
  });
});
