import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LEGACY_PET_KEY, OFFICE_KEY } from './officeProgress';
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
    expect(result.current).toEqual({ xp: 0, decor: [], next: { id: 'poster', xp: 2 } });
  });

  it('adds the increase in completed tasks to XP and saves it', () => {
    const { result, update, stored } = setup();
    update({ completedTurns: 2 });
    expect(result.current).toEqual({ xp: 2, decor: ['poster'], next: { id: 'desk-plants', xp: 4 } });
    update({ completedTurns: 5 });
    expect(result.current.xp).toBe(5);
    expect(result.current.decor).toEqual(['poster', 'desk-plants']);
    expect(stored()).toEqual({ demo: { xp: 5 }, live: { xp: 0 } });
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
    expect(result.current).toEqual({
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
    expect(stored()).toEqual({ demo: { xp: 2 }, live: { xp: 10 } });

    update({ mode: 'live', feedKey: feedB, completedTurns: 0 });
    expect(result.current.xp).toBe(10);
    expect(result.current.decor).toEqual(['poster', 'desk-plants', 'string-lights', 'lounge-rug']);
    update({ completedTurns: 1 });
    expect(stored()).toEqual({ demo: { xp: 2 }, live: { xp: 11 } });

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
    expect(stored()).toEqual({ demo: { xp: 12 }, live: { xp: 4 } });
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
