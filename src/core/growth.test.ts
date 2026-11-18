import { describe, expect, it } from 'vitest';
import type { CareState } from './growth';
import {
  AFFECTION_MAX,
  INITIAL_CARE,
  PET_COOLDOWN_MS,
  SNACKS_PER_DAY,
  dayKey,
  decorFor,
  heartsFor,
  pet,
  sanitizeName,
  snack,
  snacksLeft,
  stageFor,
} from './growth';

describe('stageFor — completed tasks grow the character (FR-G2, ADR-018)', () => {
  it.each([
    [0, 'baby'],
    [4, 'baby'],
    [5, 'kid'],
    [24, 'kid'],
    [25, 'adult'],
    [999, 'adult'],
  ] as const)('%d → %s', (xp, stage) => {
    expect(stageFor(xp)).toBe(stage);
  });
});

describe('decorFor — room decorations unlock one by one (FR-G3)', () => {
  it.each([
    [0, []],
    [1, []],
    [2, ['poster']],
    [4, ['poster', 'desk-plant']],
    [7, ['poster', 'desk-plant', 'string-lights']],
    [10, ['poster', 'desk-plant', 'string-lights', 'bedside-rug']],
    [15, ['poster', 'desk-plant', 'string-lights', 'bedside-rug', 'more-books']],
    [25, ['poster', 'desk-plant', 'string-lights', 'bedside-rug', 'more-books', 'trophy']],
  ] as const)('%d tasks → %j', (xp, decor) => {
    expect(decorFor(xp)).toEqual(decor);
  });
});

describe('care: petting and snacks (FR-G4)', () => {
  const t0 = new Date(2026, 10, 18, 10, 0, 0).getTime();

  it('petting adds one affection', () => {
    expect(pet(INITIAL_CARE, t0)).toEqual({ accepted: true, care: { ...INITIAL_CARE, affection: 1, lastPetAt: t0 } });
  });

  it(`ignores petting within ${PET_COOLDOWN_MS}ms of the last pet`, () => {
    const once = pet(INITIAL_CARE, t0).care;
    expect(pet(once, t0 + PET_COOLDOWN_MS - 1)).toEqual({ accepted: false, care: once });
    expect(pet(once, t0 + PET_COOLDOWN_MS).accepted).toBe(true);
  });

  it(`gives at most ${SNACKS_PER_DAY} snacks a day, +3 affection each`, () => {
    let care: CareState = INITIAL_CARE;
    for (let i = 0; i < SNACKS_PER_DAY; i += 1) {
      const result = snack(care, t0 + i);
      expect(result.accepted).toBe(true);
      care = result.care;
    }
    expect(care.affection).toBe(3 * SNACKS_PER_DAY);
    expect(snacksLeft(care, t0)).toBe(0);
    expect(snack(care, t0 + 10)).toEqual({ accepted: false, care });
  });

  it('refills snacks on the next local day', () => {
    let care: CareState = INITIAL_CARE;
    for (let i = 0; i < SNACKS_PER_DAY; i += 1) care = snack(care, t0).care;
    const tomorrow = new Date(2026, 10, 19, 9, 0, 0).getTime();
    expect(snacksLeft(care, tomorrow)).toBe(SNACKS_PER_DAY);
    expect(snack(care, tomorrow)).toMatchObject({ accepted: true, care: { snacksToday: 1, snackDay: '2026-11-19' } });
  });

  it(`caps affection at ${AFFECTION_MAX}`, () => {
    const full: CareState = { ...INITIAL_CARE, affection: 99 };
    expect(snack(full, t0).care.affection).toBe(AFFECTION_MAX);
    expect(pet({ ...full, affection: 100 }, t0).care.affection).toBe(AFFECTION_MAX);
  });

  it.each([
    [0, 0],
    [1, 1],
    [20, 1],
    [21, 2],
    [100, 5],
  ])('affection %d → %d hearts', (affection, hearts) => {
    expect(heartsFor(affection)).toBe(hearts);
  });

  it('uses the local calendar date as the day key', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});

describe('sanitizeName (FR-G5)', () => {
  it.each([
    ['  콩이  ', '콩이'],
    ['Deskling', 'Deskling'],
    ['a\u0000b‮c', 'abc'],
    ['콩   이\t는\n귀요미', '콩 이 는 귀요미'],
    ['열두글자가넘는아주아주긴이름입니다', '열두글자가넘는아주아주긴'],
    ['🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣', '🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣🐣'],
  ])('%j → %j', (input, output) => {
    expect(sanitizeName(input)).toBe(output);
  });

  it.each([undefined, null, 42, {}])('turns %s into an empty name', (input) => {
    expect(sanitizeName(input)).toBe('');
  });
});
