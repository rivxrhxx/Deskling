import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualState } from '../core/agentEvent';
import { SPOTS } from '../core/room';
import type { UseLifeOptions } from './useLife';
import { LIFE_TICK_MS, useLife } from './useLife';

let clock = 1_000_000;
const now = () => clock;

beforeEach(() => {
  vi.useFakeTimers();
  clock = 1_000_000;
});

afterEach(() => {
  vi.useRealTimers();
});

function setup(visual: VisualState, extra: Partial<UseLifeOptions> = {}) {
  return renderHook((props: UseLifeOptions) => useLife(props), {
    initialProps: { visual, energy: 'full', reducedMotion: false, seed: 7, now, ...extra },
  });
}

function advance(ms: number) {
  act(() => {
    clock += ms;
    vi.advanceTimersByTime(ms);
  });
}

describe('useLife (FR-R2–R6)', () => {
  it('starts asleep in bed', () => {
    const { result } = setup('offline');
    expect(result.current.hermes).toMatchObject({ activity: 'sleep', walking: false, at: SPOTS.bed.at });
    expect(result.current.friend).toBeNull();
  });

  it('reacts at once when the agent starts working, then walks to the desk', () => {
    const { result, rerender } = setup('offline');
    rerender({ visual: 'coding', energy: 'full', reducedMotion: false, seed: 7, now });
    expect(result.current.hermes).toMatchObject({ activity: 'type-code', walking: true });
    advance(15_000);
    expect(result.current.hermes).toMatchObject({ activity: 'type-code', walking: false, at: SPOTS.desk.at });
  });

  it('lives its own life while idle and never at the computer', () => {
    const { result } = setup('idle');
    const seen = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      advance(LIFE_TICK_MS * 5);
      seen.add(result.current.hermes.activity);
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
    for (const activity of ['type-code', 'browse', 'type-terminal', 'ponder', 'handle-files']) expect(seen.has(activity)).toBe(false);
  });

  it('animates walking frames, but holds still with reduced motion', () => {
    const { result } = setup('coding');
    const frames = new Set<number>();
    for (let i = 0; i < 6; i += 1) {
      advance(LIFE_TICK_MS);
      frames.add(result.current.frame);
    }
    expect(frames.size).toBe(2);

    const still = setup('coding', { reducedMotion: true });
    expect(still.result.current.hermes).toMatchObject({ walking: false, at: SPOTS.desk.at });
    advance(LIFE_TICK_MS * 6);
    expect(still.result.current.frame).toBe(0);
  });

  it('invites a friend over', () => {
    const { result } = setup('idle');
    advance(LIFE_TICK_MS);
    act(() => result.current.invite());
    advance(LIFE_TICK_MS);
    expect(result.current.friend).not.toBeNull();
    expect(result.current.friend?.activity).toBe('visit');
  });

  it('a session friend walks in and sits down, then leaves when its session is gone', () => {
    const guest = { key: 'claude-code:a', kind: 'claude-code', ordinal: 1, visual: 'coding' } as const;
    const props: UseLifeOptions = { visual: 'idle', energy: 'full', reducedMotion: false, seed: 7, now, guests: [guest] };
    const { result, rerender } = renderHook((p: UseLifeOptions) => useLife(p), { initialProps: props });
    expect(result.current.guests).toHaveLength(1);
    expect(result.current.guests[0]).toMatchObject({ key: guest.key, kind: 'claude-code', ordinal: 1, phase: 'arriving', walking: true });
    advance(15_000);
    expect(result.current.guests[0]).toMatchObject({ phase: 'seated', walking: false, at: SPOTS['guest-1'].at, visual: 'coding' });
    rerender({ ...props, guests: [] });
    advance(LIFE_TICK_MS);
    expect(result.current.guests[0]).toMatchObject({ phase: 'leaving', walking: true });
    advance(15_000);
    expect(result.current.guests).toEqual([]);
  });

  it('a message between two friends shows a talk for about 4 s, then clears', () => {
    const a = { key: 'claude-code:a', kind: 'claude-code', ordinal: 1, visual: 'coding' } as const;
    const b = { key: 'codex:b', kind: 'codex', ordinal: 1, visual: 'idle' } as const;
    const props: UseLifeOptions = {
      visual: 'coding',
      energy: 'full',
      reducedMotion: false,
      seed: 7,
      now,
      guests: [a, b],
      conversations: [],
      residentKey: 'hermes:main',
    };
    const { result, rerender } = renderHook((p: UseLifeOptions) => useLife(p), { initialProps: props });
    advance(15_000);
    expect(result.current.guests.map((g) => g.phase)).toEqual(['seated', 'seated']);
    rerender({ ...props, conversations: [{ key: 1, from: a.key, to: b.key }] });
    advance(LIFE_TICK_MS);
    expect(result.current.guests.map((g) => g.chat)).toEqual(['talk', 'talk']);
    expect(result.current.hermesChat).toBeNull();
    advance(3_300);
    expect(result.current.guests.map((g) => g.chat)).toEqual(['talk', 'talk']);
    advance(LIFE_TICK_MS * 3);
    expect(result.current.guests.map((g) => g.chat)).toEqual([null, null]);
  });

  it('Hermes turns to a friend he is talking with', () => {
    const a = { key: 'claude-code:a', kind: 'claude-code', ordinal: 1, visual: 'idle' } as const;
    const props: UseLifeOptions = { visual: 'coding', energy: 'full', reducedMotion: true, seed: 7, now, guests: [a], conversations: [], residentKey: 'hermes:main' };
    const { result, rerender } = renderHook((p: UseLifeOptions) => useLife(p), { initialProps: props });
    expect(result.current.hermes).toMatchObject({ at: SPOTS.desk.at, face: 'back-right' });
    rerender({ ...props, conversations: [{ key: 1, from: a.key, to: 'hermes:main' }] });
    advance(1_000);
    expect(result.current.hermesChat).toBe('talk');
    expect(result.current.hermes.face).toBe('front-left');
    expect(result.current.guests[0]).toMatchObject({ chat: 'talk', face: 'back-right' });
    advance(4_000);
    expect(result.current.hermesChat).toBeNull();
    expect(result.current.hermes.face).toBe('back-right');
  });

  it('stops ticking when unmounted', () => {
    const { unmount } = setup('idle');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
