import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PET_KEY } from './pet';
import type { UsePetOptions } from './usePet';
import { REACTION_MS, usePet } from './usePet';

function memoryStorage(initial?: object) {
  const data = new Map<string, string>(initial ? [[PET_KEY, JSON.stringify(initial)]] : []);
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const sourceA = {};
const sourceB = {};
let clock = new Date(2026, 10, 18, 12, 0, 0).getTime();

function setup(initial: Partial<UsePetOptions> = {}) {
  const storage = initial.storage ?? memoryStorage();
  const hook = renderHook((props: UsePetOptions) => usePet(props), {
    initialProps: { mode: 'demo', completedTurns: 0, feedKey: sourceA, storage, now: () => clock, ...initial },
  });
  return { ...hook, storage, stored: () => JSON.parse((storage as ReturnType<typeof memoryStorage>).data.get(PET_KEY) ?? '{}') };
}

beforeEach(() => {
  vi.useFakeTimers();
  clock = new Date(2026, 10, 18, 12, 0, 0).getTime();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePet — growth from completed tasks (FR-G1, FR-G6)', () => {
  it('starts as a nameless baby with no decorations', () => {
    const { result } = setup();
    expect(result.current).toMatchObject({ stage: 'baby', decor: [], hearts: 0, snacksLeft: 3, reaction: null });
    expect(result.current.profile).toMatchObject({ name: '', xp: 0 });
  });

  it('adds the increase in completed tasks to xp and saves it', () => {
    const { result, rerender, stored, storage } = setup();
    rerender({ mode: 'demo', completedTurns: 2, feedKey: sourceA, storage, now: () => clock });
    expect(result.current.profile.xp).toBe(2);
    expect(result.current.decor).toEqual(['poster']);
    rerender({ mode: 'demo', completedTurns: 5, feedKey: sourceA, storage, now: () => clock });
    expect(result.current.profile.xp).toBe(5);
    expect(result.current.stage).toBe('kid');
    expect(stored().demo.xp).toBe(5);
  });

  it('does not double count when the source changes and its count restarts', () => {
    const { result, rerender, storage } = setup();
    rerender({ mode: 'demo', completedTurns: 3, feedKey: sourceA, storage, now: () => clock });
    rerender({ mode: 'demo', completedTurns: 0, feedKey: sourceB, storage, now: () => clock });
    expect(result.current.profile.xp).toBe(3);
    rerender({ mode: 'demo', completedTurns: 1, feedKey: sourceB, storage, now: () => clock });
    expect(result.current.profile.xp).toBe(4);
  });

  it('keeps demo and live growth apart', () => {
    const storage = memoryStorage({ demo: { name: '데모', xp: 30 }, live: { name: '진짜', xp: 1 } });
    const { result } = setup({ mode: 'live', storage });
    expect(result.current.profile).toMatchObject({ name: '진짜', xp: 1 });
    expect(result.current.stage).toBe('baby');
  });
});

describe('usePet — care (FR-G4, FR-G5)', () => {
  it('petting raises affection and shows hearts for a moment', () => {
    const { result, stored } = setup();
    act(() => {
      expect(result.current.pet()).toBe(true);
    });
    expect(result.current.profile.care.affection).toBe(1);
    expect(result.current.hearts).toBe(1);
    expect(result.current.reaction).toMatchObject({ kind: 'hearts' });
    expect(stored().demo.care.affection).toBe(1);
    act(() => vi.advanceTimersByTime(REACTION_MS));
    expect(result.current.reaction).toBeNull();
  });

  it('refuses petting during the cooldown without a reaction', () => {
    const { result } = setup();
    act(() => void result.current.pet());
    act(() => vi.advanceTimersByTime(REACTION_MS));
    act(() => {
      expect(result.current.pet()).toBe(false);
    });
    expect(result.current.reaction).toBeNull();
    expect(result.current.profile.care.affection).toBe(1);
  });

  it('feeding a snack raises affection by 3 and uses up a daily snack', () => {
    const { result } = setup();
    act(() => {
      expect(result.current.feed()).toBe(true);
    });
    expect(result.current.profile.care.affection).toBe(3);
    expect(result.current.snacksLeft).toBe(2);
    expect(result.current.reaction).toMatchObject({ kind: 'snack' });
  });

  it('renames the pet with a cleaned-up name and saves it', () => {
    const { result, stored } = setup();
    act(() => result.current.rename('  콩\u0000이  '));
    expect(result.current.profile.name).toBe('콩이');
    expect(stored().demo.name).toBe('콩이');
  });

  it('gives each reaction a new id so repeated care replays the animation', () => {
    const { result } = setup();
    act(() => void result.current.feed());
    const first = result.current.reaction?.id;
    act(() => void result.current.feed());
    expect(result.current.reaction?.id).not.toBe(first);
  });
});
