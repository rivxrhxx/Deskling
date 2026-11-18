import { describe, expect, it } from 'vitest';
import { INITIAL_CARE } from '../core/growth';
import { NEW_PET, PET_KEY, loadPetBook, parsePetBook, savePetBook } from './pet';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const grown = {
  name: '콩이',
  xp: 12,
  care: { affection: 40, lastPetAt: 1_000, snackDay: '2026-11-18', snacksToday: 2 },
};

describe('parsePetBook (FR-G1, FR-G6, SEC-7)', () => {
  it('starts with two new pets: demo and live', () => {
    expect(parsePetBook(undefined)).toEqual({ demo: NEW_PET, live: NEW_PET });
    expect(NEW_PET).toEqual({ name: '', xp: 0, care: INITIAL_CARE });
  });

  it('keeps valid profiles', () => {
    expect(parsePetBook({ demo: grown, live: NEW_PET })).toEqual({ demo: grown, live: NEW_PET });
  });

  it('falls back field by field', () => {
    const book = parsePetBook({
      live: { name: '  긴이름은열두글자에서자릅니다  ', xp: -3, care: { affection: 250, lastPetAt: 'x', snackDay: 'tomorrow', snacksToday: 9 } },
    });
    expect(book.demo).toEqual(NEW_PET);
    expect(book.live).toEqual({
      name: '긴이름은열두글자에서자릅',
      xp: 0,
      care: { affection: 100, lastPetAt: null, snackDay: null, snacksToday: 3 },
    });
  });

  it('drops unknown keys everywhere', () => {
    const book = parsePetBook({ demo: { ...grown, token: 'SECRET', care: { ...grown.care, note: 'SECRET' } }, extra: 'SECRET' });
    expect(JSON.stringify(book)).not.toContain('SECRET');
  });
});

describe('loadPetBook / savePetBook', () => {
  it('round-trips under a single key with only numbers and the name', () => {
    const storage = memoryStorage();
    savePetBook(storage, { demo: grown, live: NEW_PET });
    expect([...storage.data.keys()]).toEqual([PET_KEY]);
    expect(loadPetBook(storage)).toEqual({ demo: grown, live: NEW_PET });
  });

  it('survives missing, corrupt or throwing storage', () => {
    expect(loadPetBook(null)).toEqual({ demo: NEW_PET, live: NEW_PET });
    expect(loadPetBook(memoryStorage({ [PET_KEY]: '{oops' }))).toEqual({ demo: NEW_PET, live: NEW_PET });
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadPetBook(throwing)).toEqual({ demo: NEW_PET, live: NEW_PET });
    expect(() => savePetBook(throwing, { demo: grown, live: NEW_PET })).not.toThrow();
  });
});
