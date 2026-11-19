import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberInput, MemberView } from '../core/office';
import { CHAT_MS } from '../core/office';
import type { Tile } from '../core/room';
import { LOUNGE_SPOTS, SPOTS } from '../core/room';
import type { UseOfficeOptions } from './useOffice';
import { GLIDE_TICK_MS, OFFICE_TICK_MS, useOffice } from './useOffice';

let clock = 1_000_000;
const now = () => clock;

beforeEach(() => {
  vi.useFakeTimers();
  clock = 1_000_000;
});

afterEach(() => {
  vi.useRealTimers();
});

const A: MemberInput = { key: 'claude-code:a', kind: 'claude-code', ordinal: 1, visual: 'coding' };
const B: MemberInput = { key: 'codex:b', kind: 'codex', ordinal: 1, visual: 'coding' };
const BASE: UseOfficeOptions = { members: [], reducedMotion: false, seed: 7, now };

function setup(props: Partial<UseOfficeOptions> = {}) {
  let renders = 0;
  const hook = renderHook(
    (p: UseOfficeOptions) => {
      renders += 1;
      return useOffice(p);
    },
    { initialProps: { ...BASE, ...props } },
  );
  return { ...hook, renders: () => renders };
}

function advance(ms: number) {
  act(() => {
    clock += ms;
    vi.advanceTimersByTime(ms);
  });
}

const same = (a: Tile, b: Tile) => a.x === b.x && a.y === b.y;
const inLounge = (view: MemberView | undefined) => view !== undefined && LOUNGE_SPOTS.some((id) => same(SPOTS[id].at, view.at));

describe('useOffice (ADR-025 §3)', () => {
  it('starts with an empty office', () => {
    const { result } = setup();
    expect(result.current).toEqual({ members: [], frame: 0 });
  });

  it('a member walks in through the door on the ticks and sits down at its desk', () => {
    const { result } = setup({ members: [A] });
    expect(result.current.members[0]).toMatchObject({ key: A.key, desk: 'desk-1', phase: 'arriving', walking: true, at: SPOTS.outside.at });
    advance(OFFICE_TICK_MS);
    expect(result.current.members[0]?.at).not.toEqual(SPOTS.outside.at);
    advance(15_000);
    expect(result.current.members[0]).toMatchObject({ phase: 'present', walking: false, at: SPOTS['desk-1'].at, activity: 'work' });
  });

  it('takes a level rise at once and shows the level-up (ADR-028 §4)', () => {
    const { result, rerender } = setup({ members: [{ ...A, level: 2 }] });
    advance(5_000);
    expect(result.current.members[0]).toMatchObject({ level: 2, levelUp: false });
    rerender({ ...BASE, members: [{ ...A, level: 3 }] });
    expect(result.current.members[0]).toMatchObject({ level: 3, levelUp: true });
  });

  it('takes changes to the members and their facts at once, not on the next tick', () => {
    const { result, rerender } = setup({ members: [A] });
    advance(15_000);
    rerender({ ...BASE, members: [{ ...A, visual: 'waiting-approval' }] });
    expect(result.current.members[0]).toMatchObject({ activity: 'wave' });
    rerender({ ...BASE, members: [{ ...A, visual: 'waiting-approval' }, B] });
    expect(result.current.members.map((m) => [m.key, m.phase])).toEqual([
      [A.key, 'present'],
      [B.key, 'arriving'],
    ]);
    rerender({ ...BASE, members: [B] });
    expect(result.current.members[0]).toMatchObject({ key: A.key, phase: 'leaving', walking: true });
  });

  it('shows a new conversation at once', () => {
    const props = { ...BASE, members: [A, B], conversations: [] };
    const { result, rerender } = setup(props);
    advance(15_000);
    rerender({ ...props, conversations: [{ key: 1, from: A.key, to: B.key }] });
    expect(result.current.members.map((m) => m.chat)).toEqual(['talk', 'talk']);
    advance(CHAT_MS.talk + OFFICE_TICK_MS);
    expect(result.current.members.map((m) => m.chat)).toEqual([null, null]);
  });

  it('does not step again for fresh arrays with the same members and conversations', () => {
    const { result, rerender, renders } = setup({ members: [A], conversations: [{ key: 1, from: A.key, to: null }] });
    const before = renders();
    const first = result.current;
    rerender({ ...BASE, members: [{ ...A }], conversations: [{ key: 1, from: A.key, to: null }] });
    expect(renders()).toBe(before + 1);
    expect(result.current.members).toEqual(first.members);
  });

  it('ticks every 300 ms: walking frames alternate', () => {
    const { result } = setup({ members: [A] });
    expect(OFFICE_TICK_MS).toBe(300);
    const frames: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      advance(OFFICE_TICK_MS);
      frames.push(result.current.frame);
    }
    expect(frames).toEqual([1, 0, 1, 0, 1, 0]);
  });

  it('an idle member goes off to the lounge on its own, driven by the ticks', () => {
    const { result } = setup({ members: [{ ...A, visual: 'idle' }] });
    for (let i = 0; i < 100; i += 1) advance(OFFICE_TICK_MS);
    expect(inLounge(result.current.members[0])).toBe(true);
    expect(result.current.members[0]?.walking).toBe(false);
  });

  it('with reduced motion nobody walks, the frame stays 0 and the office is checked once a second', () => {
    const { result } = setup({ members: [{ ...A, visual: 'idle' }], reducedMotion: true });
    expect(result.current.members[0]).toMatchObject({ phase: 'present', walking: false, at: SPOTS['desk-1'].at });
    advance(1_000);
    advance(900);
    // Settled at 1.5 s, but the next check is at 2 s.
    expect(result.current.members[0]?.at).toEqual(SPOTS['desk-1'].at);
    advance(100);
    expect(inLounge(result.current.members[0])).toBe(true);
    expect(result.current.members[0]?.walking).toBe(false);
    expect(result.current.frame).toBe(0);
  });

  it('snaps everyone to where they were going when reduced motion turns on', () => {
    const { result, rerender } = setup({ members: [A] });
    advance(OFFICE_TICK_MS);
    expect(result.current.members[0]?.walking).toBe(true);
    rerender({ ...BASE, members: [A], reducedMotion: true });
    expect(result.current.members[0]).toMatchObject({ walking: false, at: SPOTS['desk-1'].at });
    expect(result.current.frame).toBe(0);
  });

  it('the seed decides the lounge spot: the same seed, the same spot', () => {
    const spotFor = (seed: number) => {
      const { result, unmount } = setup({ members: [{ ...A, visual: 'idle' }], reducedMotion: true, seed });
      advance(2_000);
      const at = result.current.members[0]?.at;
      unmount();
      return at && LOUNGE_SPOTS.find((id) => same(SPOTS[id].at, at));
    };
    expect(spotFor(11)).toBe(spotFor(11));
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(spotFor)).size).toBeGreaterThan(1);
  });

  it('defaults to the monotonic clock and a wall-clock seed', () => {
    const clockSpy = vi.spyOn(performance, 'now').mockReturnValue(5_000);
    const seedSpy = vi.spyOn(Date, 'now');
    renderHook(() => useOffice({ members: [A], reducedMotion: false }));
    expect(clockSpy).toHaveBeenCalled();
    expect(seedSpy).toHaveBeenCalled();
  });

  it('a member whose session ends walks out and is gone', () => {
    const { result, rerender } = setup({ members: [A] });
    advance(15_000);
    rerender({ ...BASE, members: [] });
    expect(result.current.members[0]).toMatchObject({ phase: 'leaving', walking: true });
    advance(15_000);
    expect(result.current.members).toEqual([]);
  });

  it('stops ticking when unmounted', () => {
    const { unmount } = setup({ members: [A] });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('gliding walks (ADR-027 §2)', () => {
  it('while someone walks, the walk is read again every 50 ms, between the 300 ms steps', () => {
    expect(GLIDE_TICK_MS).toBe(50);
    const { result } = setup({ members: [A] });
    advance(OFFICE_TICK_MS);
    const stepped = result.current;
    expect(stepped.members[0]?.walking).toBe(true);
    const seen = [stepped.members[0]?.at];
    for (let i = 0; i < 5; i += 1) {
      advance(GLIDE_TICK_MS);
      seen.push(result.current.members[0]?.at);
      // Only the steps flip the walking frame; a glide only moves.
      expect(result.current.frame).toBe(stepped.frame);
    }
    for (let i = 1; i < seen.length; i += 1) expect(seen[i], `glide ${i}`).not.toEqual(seen[i - 1]);
  });

  it('glides along the same walk the steps follow, ending where the step would put it', () => {
    const glided = setup({ members: [A] });
    for (let i = 0; i < 60; i += 1) advance(GLIDE_TICK_MS);
    const at = glided.result.current.members[0]?.at;
    glided.unmount();
    clock = 1_000_000;
    // The same moment read by a step alone: the hook re-steps on a change of facts.
    const stepped = setup({ members: [A] });
    advance(3_000);
    expect(at).toEqual(stepped.result.current.members[0]?.at);
  });

  it('has no glide timer while nobody walks', () => {
    const { result } = setup({ members: [A] });
    advance(15_000);
    expect(result.current.members[0]).toMatchObject({ walking: false, at: SPOTS['desk-1'].at });
    expect(vi.getTimerCount()).toBe(1);
    const empty = setup();
    expect(empty.result.current.members).toEqual([]);
    expect(vi.getTimerCount()).toBe(2);
  });

  it('has no glide timer with reduced motion', () => {
    setup({ members: [A], reducedMotion: true });
    expect(vi.getTimerCount()).toBe(1);
  });
});
