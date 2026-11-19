import { describe, expect, it } from 'vitest';
import { LEGACY_PET_KEY, NEW_OFFICE, OFFICE_KEY, loadOfficeBook, parseOfficeBook, saveOfficeBook } from './officeProgress';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('quota');
  },
};

/** A `deskling.pet.v1` book as the pet era (ADR-018) saved it. */
const petBook = {
  demo: { name: '콩이', xp: 12, care: { affection: 40, lastPetAt: 1_000, snackDay: '2026-11-18', snacksToday: 2 } },
  live: { name: '진짜', xp: 3, care: { affection: 0, lastPetAt: null, snackDay: null, snacksToday: 0 } },
};

describe('parseOfficeBook (FR-G1, FR-G6, SEC-7)', () => {
  it('uses one key per version and the old pet key only for migration', () => {
    expect(OFFICE_KEY).toBe('deskling.office.v1');
    expect(LEGACY_PET_KEY).toBe('deskling.pet.v1');
  });

  it('starts both offices, demo and live, at 0 XP', () => {
    expect(NEW_OFFICE).toEqual({ demo: { xp: 0 }, live: { xp: 0 } });
    expect(Object.isFrozen(NEW_OFFICE)).toBe(true);
    expect(parseOfficeBook(undefined)).toEqual(NEW_OFFICE);
  });

  it('keeps valid XP for each mode', () => {
    expect(parseOfficeBook({ demo: { xp: 30 }, live: { xp: 1 } })).toEqual({ demo: { xp: 30 }, live: { xp: 1 } });
  });

  it.each<[unknown]>([[-1], [2.5], ['12'], [null], [Number.NaN], [Number.MAX_SAFE_INTEGER + 2], [{}], [true]])(
    'falls back to 0 XP for %j',
    (xp) => {
      expect(parseOfficeBook({ demo: { xp }, live: { xp: 4 } })).toEqual({ demo: { xp: 0 }, live: { xp: 4 } });
    },
  );

  it.each<[unknown]>([[null], [[]], ['office'], [42], [{ demo: 'x', live: [] }]])('falls back to new offices for %j', (value) => {
    expect(parseOfficeBook(value)).toEqual(NEW_OFFICE);
  });

  it('keeps only numbers: names, care and unknown keys are dropped', () => {
    const book = parseOfficeBook({ ...petBook, extra: 'SECRET', demo: { ...petBook.demo, token: 'SECRET' } });
    expect(book).toEqual({ demo: { xp: 12 }, live: { xp: 3 } });
    expect(JSON.stringify(book)).not.toMatch(/SECRET|콩이|care|name/);
  });
});

describe('loadOfficeBook / saveOfficeBook', () => {
  it('round-trips under a single key with only numbers', () => {
    const storage = memoryStorage();
    saveOfficeBook(storage, { demo: { xp: 7 }, live: { xp: 2 } });
    expect([...storage.data.keys()]).toEqual([OFFICE_KEY]);
    expect(JSON.parse(storage.data.get(OFFICE_KEY)!)).toEqual({ demo: { xp: 7 }, live: { xp: 2 } });
    expect(loadOfficeBook(storage)).toEqual({ demo: { xp: 7 }, live: { xp: 2 } });
  });

  it('cleans the book before saving', () => {
    const storage = memoryStorage();
    const dirty = { demo: { xp: -5 }, live: { xp: 2, name: 'SECRET' } };
    saveOfficeBook(storage, dirty);
    expect(storage.data.get(OFFICE_KEY)).toBe(JSON.stringify({ demo: { xp: 0 }, live: { xp: 2 } }));
  });

  it('carries each profile’s XP over from deskling.pet.v1 when the office key is absent', () => {
    const storage = memoryStorage({ [LEGACY_PET_KEY]: JSON.stringify(petBook) });
    expect(loadOfficeBook(storage)).toEqual({ demo: { xp: 12 }, live: { xp: 3 } });
  });

  it('migrates a partial or partly broken pet book field by field', () => {
    const onlyDemo = memoryStorage({ [LEGACY_PET_KEY]: JSON.stringify({ demo: { name: '콩이', xp: 9 } }) });
    expect(loadOfficeBook(onlyDemo)).toEqual({ demo: { xp: 9 }, live: { xp: 0 } });
    const badLive = memoryStorage({ [LEGACY_PET_KEY]: JSON.stringify({ demo: { xp: 5 }, live: { xp: -1 } }) });
    expect(loadOfficeBook(badLive)).toEqual({ demo: { xp: 5 }, live: { xp: 0 } });
  });

  it('never deletes or rewrites the old pet key', () => {
    const raw = JSON.stringify(petBook);
    const storage = memoryStorage({ [LEGACY_PET_KEY]: raw });
    const book = loadOfficeBook(storage);
    saveOfficeBook(storage, book);
    expect(storage.data.get(LEGACY_PET_KEY)).toBe(raw);
    expect(JSON.parse(storage.data.get(OFFICE_KEY)!)).toEqual({ demo: { xp: 12 }, live: { xp: 3 } });
  });

  it('prefers the office key over the pet key once it exists', () => {
    const storage = memoryStorage({
      [OFFICE_KEY]: JSON.stringify({ demo: { xp: 1 }, live: { xp: 0 } }),
      [LEGACY_PET_KEY]: JSON.stringify(petBook),
    });
    expect(loadOfficeBook(storage)).toEqual({ demo: { xp: 1 }, live: { xp: 0 } });
  });

  it('does not migrate when the office key exists but is corrupt', () => {
    const storage = memoryStorage({ [OFFICE_KEY]: '{oops', [LEGACY_PET_KEY]: JSON.stringify(petBook) });
    expect(loadOfficeBook(storage)).toEqual(NEW_OFFICE);
  });

  it('survives missing, corrupt or throwing storage', () => {
    expect(loadOfficeBook(null)).toEqual(NEW_OFFICE);
    expect(loadOfficeBook(memoryStorage())).toEqual(NEW_OFFICE);
    expect(loadOfficeBook(memoryStorage({ [OFFICE_KEY]: '{oops' }))).toEqual(NEW_OFFICE);
    expect(loadOfficeBook(memoryStorage({ [LEGACY_PET_KEY]: '{oops' }))).toEqual(NEW_OFFICE);
    expect(loadOfficeBook(throwing)).toEqual(NEW_OFFICE);
    expect(() => saveOfficeBook(throwing, { demo: { xp: 1 }, live: { xp: 1 } })).not.toThrow();
    expect(() => saveOfficeBook(null, { demo: { xp: 1 }, live: { xp: 1 } })).not.toThrow();
  });
});
