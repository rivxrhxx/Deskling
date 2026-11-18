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

  it('stops ticking when unmounted', () => {
    const { unmount } = setup('idle');
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
