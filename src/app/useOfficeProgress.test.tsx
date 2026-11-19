import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LEGACY_PET_KEY, OFFICE_KEY, memberId } from './officeProgress';
import type { UseOfficeProgressOptions } from './useOfficeProgress';
import { useOfficeProgress } from './useOfficeProgress';

function memoryStorage(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    data,
    writes: 0,
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      this.writes += 1;
      data.set(key, value);
    },
  };
}

const feedA = {};
const feedB = {};

function setup(initial: Partial<UseOfficeProgressOptions> = {}) {
  const storage = initial.storage === undefined ? memoryStorage() : initial.storage;
  let props: UseOfficeProgressOptions = { mode: 'demo', completedTurns: 0, feedKey: feedA, storage, ...initial };
  const hook = renderHook((p: UseOfficeProgressOptions) => useOfficeProgress(p), { initialProps: props });
  const update = (change: Partial<UseOfficeProgressOptions>) => {
    props = { ...props, ...change };
    hook.rerender(props);
  };
  const stored = () => {
    const raw = (storage as ReturnType<typeof memoryStorage> | null)?.data.get(OFFICE_KEY);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  };
  return { ...hook, update, stored };
}

describe('useOfficeProgress — office XP from completed tasks (FR-G1, ADR-025 §7)', () => {
  it('starts an empty office with no props and the poster next', () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ xp: 0, decor: [], next: { id: 'poster', xp: 2 } });
  });

  it('adds the increase in completed tasks to XP and saves it', () => {
    const { result, update, stored } = setup();
    update({ completedTurns: 2 });
    expect(result.current).toMatchObject({ xp: 2, decor: ['poster'], next: { id: 'desk-plants', xp: 4 } });
    update({ completedTurns: 5 });
    expect(result.current.xp).toBe(5);
    expect(result.current.decor).toEqual(['poster', 'desk-plants']);
    expect(stored()).toEqual({ demo: { xp: 5, members: {} }, live: { xp: 0, members: {} } });
  });

  it("counts the feed's completed tasks from zero when it is first seen", () => {
    const { result } = setup({ completedTurns: 3 });
    expect(result.current.xp).toBe(3);
  });

  it('does not count the same completed tasks twice on a re-render', () => {
    const { result, update } = setup();
    update({ completedTurns: 4 });
    update({ completedTurns: 4 });
    update({ completedTurns: 4 });
    expect(result.current.xp).toBe(4);
  });

  it('only ever grows: a lower count never takes XP away', () => {
    const { result, update } = setup();
    update({ completedTurns: 6 });
    update({ completedTurns: 2 });
    expect(result.current.xp).toBe(6);
  });

  it('does not double count when the feed changes and its count restarts', () => {
    const { result, update } = setup();
    update({ completedTurns: 3 });
    update({ completedTurns: 0, feedKey: feedB });
    expect(result.current.xp).toBe(3);
    update({ completedTurns: 1 });
    expect(result.current.xp).toBe(4);
  });

  it('shows every prop and nothing next at 25 XP', () => {
    const { result } = setup({ storage: memoryStorage({ [OFFICE_KEY]: { demo: { xp: 25 }, live: { xp: 0 } } }) });
    expect(result.current).toMatchObject({
      xp: 25,
      decor: ['poster', 'desk-plants', 'string-lights', 'lounge-rug', 'full-bookshelf', 'trophy-shelf'],
      next: null,
    });
  });
});

describe('useOfficeProgress — demo and live offices are separate (FR-G6)', () => {
  it('loads the XP of its own mode', () => {
    const storage = memoryStorage({ [OFFICE_KEY]: { demo: { xp: 30 }, live: { xp: 1 } } });
    expect(setup({ mode: 'live', storage }).result.current.xp).toBe(1);
    expect(setup({ mode: 'demo', storage }).result.current.xp).toBe(30);
  });

  it('grows only the current mode and shows the other mode’s XP after switching', () => {
    const { result, update, stored } = setup({ storage: memoryStorage({ [OFFICE_KEY]: { demo: { xp: 0 }, live: { xp: 10 } } }) });
    update({ completedTurns: 2 });
    expect(stored()).toEqual({ demo: { xp: 2, members: {} }, live: { xp: 10, members: {} } });

    update({ mode: 'live', feedKey: feedB, completedTurns: 0 });
    expect(result.current.xp).toBe(10);
    expect(result.current.decor).toEqual(['poster', 'desk-plants', 'string-lights', 'lounge-rug']);
    update({ completedTurns: 1 });
    expect(stored()).toEqual({ demo: { xp: 2, members: {} }, live: { xp: 11, members: {} } });

    update({ mode: 'demo', feedKey: feedA, completedTurns: 0 });
    expect(result.current.xp).toBe(2);
  });
});

describe('useOfficeProgress — storage (SEC-7)', () => {
  it('carries the pet XP over from deskling.pet.v1 and keeps the old key', () => {
    const pet = { demo: { name: '콩이', xp: 12, care: { affection: 40 } }, live: { name: '', xp: 3 } };
    const storage = memoryStorage({ [LEGACY_PET_KEY]: pet });
    const { result, update, stored } = setup({ mode: 'live', storage });
    expect(result.current.xp).toBe(3);
    update({ completedTurns: 1 });
    expect(stored()).toEqual({ demo: { xp: 12, members: {} }, live: { xp: 4, members: {} } });
    expect(JSON.parse(storage.data.get(LEGACY_PET_KEY)!)).toEqual(pet);
  });

  it('saves only when the XP changes', () => {
    const storage = memoryStorage({ [OFFICE_KEY]: { demo: { xp: 1 }, live: { xp: 0 } } });
    const { update } = setup({ storage });
    expect(storage.writes).toBe(0);
    update({ completedTurns: 0 });
    update({ completedTurns: 0, feedKey: feedB });
    update({ mode: 'live' });
    expect(storage.writes).toBe(0);
    update({ completedTurns: 1 });
    expect(storage.writes).toBe(1);
  });

  it('does not write the migrated book until the XP changes', () => {
    const storage = memoryStorage({ [LEGACY_PET_KEY]: { demo: { xp: 5 }, live: { xp: 0 } } });
    const { result } = setup({ storage });
    expect(result.current.xp).toBe(5);
    expect(storage.writes).toBe(0);
    expect(storage.data.has(OFFICE_KEY)).toBe(false);
  });

  it('keeps growing for this run when storage is missing or throws', () => {
    const throwing = {
      getItem: (): string | null => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    for (const storage of [null, throwing]) {
      const { result, update } = setup({ storage });
      expect(result.current.xp).toBe(0);
      expect(() => update({ completedTurns: 3 })).not.toThrow();
      expect(result.current.xp).toBe(3);
    }
  });

  it('falls back to 0 XP for a corrupt book', () => {
    const storage = memoryStorage();
    storage.data.set(OFFICE_KEY, '{oops');
    const { result } = setup({ storage });
    expect(result.current.xp).toBe(0);
  });
});

describe('useOfficeProgress — every member grows on its own (ADR-028 §2)', () => {
  const A = 'claude-code:6f1c2a9e';
  const X = 'codex:019a-77';

  it('adds each session’s new completed tasks to that member alone and saves them under opaque ids', () => {
    const { result, update, stored } = setup();
    expect(result.current.memberXp(A)).toBe(0);
    update({ completedTurns: 3, completedBy: { [A]: 2, [X]: 1 } });
    expect(result.current.xp).toBe(3);
    expect(result.current.memberXp(A)).toBe(2);
    expect(result.current.memberXp(X)).toBe(1);
    expect(result.current.memberXp('demo:nobody')).toBe(0);
    expect(stored()).toEqual({ demo: { xp: 3, members: { [memberId(A)]: 2, [memberId(X)]: 1 } }, live: { xp: 0, members: {} } });
    expect(JSON.stringify(stored())).not.toMatch(/6f1c2a9e|019a|claude|codex/);
  });

  it('counts only the increase, once per completed task', () => {
    const { result, update } = setup();
    update({ completedTurns: 2, completedBy: { [A]: 2 } });
    update({ completedTurns: 2, completedBy: { [A]: 2 } });
    update({ completedTurns: 3, completedBy: { [A]: 3 } });
    expect(result.current.memberXp(A)).toBe(3);
  });

  it('keeps a member’s XP across restarts, so a session that comes back goes on from its level', () => {
    const storage = memoryStorage({ [OFFICE_KEY]: { demo: { xp: 9, members: { [memberId(A)]: 9 } }, live: { xp: 0 } } });
    const { result, update } = setup({ storage });
    expect(result.current.memberXp(A)).toBe(9);
    update({ completedTurns: 1, completedBy: { [A]: 1 } });
    expect(result.current.memberXp(A)).toBe(10);
  });

  it('keeps demo and live members apart', () => {
    const storage = memoryStorage({ [OFFICE_KEY]: { demo: { xp: 4, members: { [memberId(A)]: 4 } }, live: { xp: 0 } } });
    const { result, update } = setup({ storage, mode: 'live', feedKey: feedB });
    expect(result.current.memberXp(A)).toBe(0);
    update({ completedTurns: 1, completedBy: { [A]: 1 } });
    expect(result.current.memberXp(A)).toBe(1);
    update({ mode: 'demo', feedKey: feedA, completedTurns: 0, completedBy: {} });
    expect(result.current.memberXp(A)).toBe(4);
  });

  it('never counts a feed’s tasks twice when the view switches away and back', () => {
    const { result, update } = setup();
    update({ completedTurns: 3, completedBy: { [A]: 3 } });
    update({ mode: 'live', feedKey: feedB, completedTurns: 0, completedBy: {} });
    update({ mode: 'demo', feedKey: feedA, completedTurns: 3, completedBy: { [A]: 3 } });
    expect(result.current.xp).toBe(3);
    expect(result.current.memberXp(A)).toBe(3);
    update({ completedTurns: 4, completedBy: { [A]: 4 } });
    expect(result.current.xp).toBe(4);
    expect(result.current.memberXp(A)).toBe(4);
  });

  it('counts a session again from zero once the room has forgotten it', () => {
    const { result, update } = setup();
    update({ completedTurns: 5, completedBy: { [A]: 5 } });
    // A busy room dropped A's count (COMPLETED_LIMIT); a new task of A's shows as 1.
    update({ completedTurns: 6, completedBy: { [X]: 9 } });
    update({ completedTurns: 7, completedBy: { [X]: 9, [A]: 1 } });
    expect(result.current.memberXp(A)).toBe(6);
  });
});
