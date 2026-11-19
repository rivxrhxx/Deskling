import { describe, expect, it } from 'vitest';
import type { OfficeProgress } from './officeProgress';
import {
  LEGACY_PET_KEY,
  MEMBER_LIMIT,
  NEW_OFFICE,
  OFFICE_KEY,
  loadOfficeBook,
  memberId,
  parseOfficeBook,
  saveOfficeBook,
  withMemberXp,
} from './officeProgress';

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
    expect(NEW_OFFICE).toEqual({ demo: { xp: 0, members: {} }, live: { xp: 0, members: {} } });
    expect(Object.isFrozen(NEW_OFFICE)).toBe(true);
    expect(parseOfficeBook(undefined)).toEqual(NEW_OFFICE);
  });

  it('keeps valid XP for each mode', () => {
    expect(parseOfficeBook({ demo: { xp: 30, members: {} }, live: { xp: 1, members: {} } })).toEqual({ demo: { xp: 30, members: {} }, live: { xp: 1, members: {} } });
  });

  it('reads a book from before member levels with no members (ADR-028 §2)', () => {
    expect(parseOfficeBook({ demo: { xp: 30 }, live: { xp: 1 } })).toEqual({ demo: { xp: 30, members: {} }, live: { xp: 1, members: {} } });
  });

  it('keeps each mode’s member XP under opaque ids, numbers only', () => {
    const members = { m0000abcd: 3, m12345678: 0 };
    expect(parseOfficeBook({ demo: { xp: 3, members }, live: { xp: 0 } })).toEqual({ demo: { xp: 3, members }, live: { xp: 0, members: {} } });
  });

  it.each<[string, unknown]>([
    ['a raw session key', { 'claude-code:abc': 2 }],
    ['an id of the wrong shape', { m123: 2, M0000abcd: 1, m0000abcdz: 1, mABCDEF12: 1 }],
    ['a value that is not a count', { m0000abcd: -1, m0000abce: 1.5, m0000abcf: 'SECRET', m0000abd0: null }],
  ])('drops %s from members', (_, members) => {
    expect(parseOfficeBook({ demo: { xp: 1, members } }).demo.members).toEqual({});
  });

  it.each<[unknown]>([[null], [[]], ['m'], [7]])('reads members %j as none', (members) => {
    expect(parseOfficeBook({ live: { xp: 2, members } }).live).toEqual({ xp: 2, members: {} });
  });

  it(`keeps at most ${MEMBER_LIMIT} members per mode, the last ones written`, () => {
    expect(MEMBER_LIMIT).toBe(64);
    const ids = Array.from({ length: MEMBER_LIMIT + 3 }, (_, i) => `m${i.toString(16).padStart(8, '0')}`);
    const members = Object.fromEntries(ids.map((id, i) => [id, i]));
    const kept = parseOfficeBook({ demo: { xp: 0, members } }).demo.members;
    expect(Object.keys(kept)).toEqual(ids.slice(3));
  });

  it.each<[unknown]>([[-1], [2.5], ['12'], [null], [Number.NaN], [Number.MAX_SAFE_INTEGER + 2], [{}], [true]])(
    'falls back to 0 XP for %j',
    (xp) => {
      expect(parseOfficeBook({ demo: { xp }, live: { xp: 4 } })).toEqual({ demo: { xp: 0, members: {} }, live: { xp: 4, members: {} } });
    },
  );

  it.each<[unknown]>([[null], [[]], ['office'], [42], [{ demo: 'x', live: [] }]])('falls back to new offices for %j', (value) => {
    expect(parseOfficeBook(value)).toEqual(NEW_OFFICE);
  });

  it('keeps only numbers: names, care and unknown keys are dropped', () => {
    const book = parseOfficeBook({ ...petBook, extra: 'SECRET', demo: { ...petBook.demo, token: 'SECRET' } });
    expect(book).toEqual({ demo: { xp: 12, members: {} }, live: { xp: 3, members: {} } });
    expect(JSON.stringify(book)).not.toMatch(/SECRET|콩이|care|name/);
  });
});

describe('memberId — a member’s storage id (ADR-028 §2)', () => {
  it('is m and eight hex digits, the same for the same session key every time', () => {
    const id = memberId('claude-code:6f1c2a9e-0b7d-4f43-9b1a-2f4e8c0d1a33');
    expect(id).toMatch(/^m[0-9a-f]{8}$/);
    expect(memberId('claude-code:6f1c2a9e-0b7d-4f43-9b1a-2f4e8c0d1a33')).toBe(id);
  });

  it('does not contain the session id, and differs between sessions and kinds', () => {
    const ids = ['claude-code:a', 'claude-code:b', 'codex:a', 'demo:a'].map(memberId);
    expect(new Set(ids).size).toBe(4);
    expect(memberId('claude-code:abcdef')).not.toContain('abcdef');
  });

  it('is FNV-1a over the key', () => {
    expect(memberId('')).toBe('m811c9dc5');
    expect(memberId('a')).toBe('me40c292c');
  });
});

describe('withMemberXp (ADR-028 §2)', () => {
  const office: OfficeProgress = { xp: 5, members: {} };

  it('adds XP to one member and leaves the office XP alone', () => {
    const once = withMemberXp(office, 'claude-code:a', 2);
    expect(once).toEqual({ xp: 5, members: { [memberId('claude-code:a')]: 2 } });
    expect(withMemberXp(once, 'claude-code:a', 1).members[memberId('claude-code:a')]).toBe(3);
  });

  it('moves the member that grew to the end, dropping the oldest past the limit', () => {
    let progress = office;
    for (let i = 0; i < MEMBER_LIMIT; i += 1) progress = withMemberXp(progress, `demo:s${i}`, 1);
    progress = withMemberXp(progress, 'demo:s0', 1);
    progress = withMemberXp(progress, 'demo:new', 1);
    const ids = Object.keys(progress.members);
    expect(ids).toHaveLength(MEMBER_LIMIT);
    expect(ids.at(-1)).toBe(memberId('demo:new'));
    expect(ids.at(-2)).toBe(memberId('demo:s0'));
    expect(progress.members[memberId('demo:s1')]).toBeUndefined();
  });

  it.each([0, -1, 1.5])('ignores a gain of %s', (gain) => {
    expect(withMemberXp(office, 'claude-code:a', gain)).toBe(office);
  });
});

describe('loadOfficeBook / saveOfficeBook', () => {
  it('round-trips under a single key with only numbers', () => {
    const storage = memoryStorage();
    saveOfficeBook(storage, { demo: { xp: 7, members: {} }, live: { xp: 2, members: {} } });
    expect([...storage.data.keys()]).toEqual([OFFICE_KEY]);
    expect(JSON.parse(storage.data.get(OFFICE_KEY)!)).toEqual({ demo: { xp: 7, members: {} }, live: { xp: 2, members: {} } });
    expect(loadOfficeBook(storage)).toEqual({ demo: { xp: 7, members: {} }, live: { xp: 2, members: {} } });
  });

  it('cleans the book before saving', () => {
    const storage = memoryStorage();
    const dirty = { demo: { xp: -5, members: { 'claude-code:a': 1 } }, live: { xp: 2, name: 'SECRET', members: {} } };
    saveOfficeBook(storage, dirty);
    expect(storage.data.get(OFFICE_KEY)).toBe(JSON.stringify({ demo: { xp: 0, members: {} }, live: { xp: 2, members: {} } }));
  });

  it('carries each profile’s XP over from deskling.pet.v1 when the office key is absent', () => {
    const storage = memoryStorage({ [LEGACY_PET_KEY]: JSON.stringify(petBook) });
    expect(loadOfficeBook(storage)).toEqual({ demo: { xp: 12, members: {} }, live: { xp: 3, members: {} } });
  });

  it('migrates a partial or partly broken pet book field by field', () => {
    const onlyDemo = memoryStorage({ [LEGACY_PET_KEY]: JSON.stringify({ demo: { name: '콩이', xp: 9 } }) });
    expect(loadOfficeBook(onlyDemo)).toEqual({ demo: { xp: 9, members: {} }, live: { xp: 0, members: {} } });
    const badLive = memoryStorage({ [LEGACY_PET_KEY]: JSON.stringify({ demo: { xp: 5, members: {} }, live: { xp: -1 } }) });
    expect(loadOfficeBook(badLive)).toEqual({ demo: { xp: 5, members: {} }, live: { xp: 0, members: {} } });
  });

  it('never deletes or rewrites the old pet key', () => {
    const raw = JSON.stringify(petBook);
    const storage = memoryStorage({ [LEGACY_PET_KEY]: raw });
    const book = loadOfficeBook(storage);
    saveOfficeBook(storage, book);
    expect(storage.data.get(LEGACY_PET_KEY)).toBe(raw);
    expect(JSON.parse(storage.data.get(OFFICE_KEY)!)).toEqual({ demo: { xp: 12, members: {} }, live: { xp: 3, members: {} } });
  });

  it('prefers the office key over the pet key once it exists', () => {
    const storage = memoryStorage({
      [OFFICE_KEY]: JSON.stringify({ demo: { xp: 1, members: {} }, live: { xp: 0, members: {} } }),
      [LEGACY_PET_KEY]: JSON.stringify(petBook),
    });
    expect(loadOfficeBook(storage)).toEqual({ demo: { xp: 1, members: {} }, live: { xp: 0, members: {} } });
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
    expect(() => saveOfficeBook(throwing, { demo: { xp: 1, members: {} }, live: { xp: 1, members: {} } })).not.toThrow();
    expect(() => saveOfficeBook(null, { demo: { xp: 1, members: {} }, live: { xp: 1, members: {} } })).not.toThrow();
  });
});
