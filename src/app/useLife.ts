import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { VisualState } from '../core/agentEvent';
import type { Activity, LifeInput, LifeState } from '../core/life';
import { initialLife, positionAt, stepLife } from '../core/life';
import type { EnergyLevel } from '../core/mood';
import type { Facing, Tile } from '../core/room';

/** How often the room is advanced: walking steps, typing hands, idle schedule (DESIGN §9.4). */
export const LIFE_TICK_MS = 300;
/** With reduced motion nothing animates, so the schedule only needs a slow check. */
const STILL_TICK_MS = 1000;

export interface UseLifeOptions {
  readonly visual: VisualState;
  readonly energy: EnergyLevel;
  readonly reducedMotion: boolean;
  /** PRNG seed for idle choices; defaults to the start time. */
  readonly seed?: number;
  /** Injected clock for tests. */
  readonly now?: () => number;
}

export interface HermesView {
  readonly activity: Activity;
  readonly at: Tile;
  readonly walking: boolean;
  readonly face: Facing;
}

export interface FriendView {
  readonly activity: 'visit' | 'help' | 'leave';
  readonly at: Tile;
  readonly walking: boolean;
  readonly face: Facing;
  readonly look: number;
}

export interface LifeView {
  readonly hermes: HermesView;
  readonly friend: FriendView | null;
  /** 0/1 animation frame; always 0 with reduced motion. */
  readonly frame: number;
  /** Asks a friend over (no-op while offline or when someone is already visiting). */
  readonly invite: () => void;
}

interface Clocked {
  readonly life: LifeState;
  readonly at: number;
  readonly frame: number;
}

/**
 * Drives Hermes' life in the room (FR-R2–R6). The engine is pure; this hook only supplies time,
 * the agent's visual state and the invite button. Agent facts apply at once, not on the next tick.
 */
export function useLife({ visual, energy, reducedMotion, seed, now = Date.now }: UseLifeOptions): LifeView {
  const input = useRef({ visual, energy, reducedMotion, now });
  // Declared first so it runs before the step below sees the new input.
  useLayoutEffect(() => {
    input.current = { visual, energy, reducedMotion, now };
  });

  const [clocked, setClocked] = useState<Clocked>(() => {
    const at = now();
    const life = stepLife(initialLife(seed ?? at, at), { now: at, visual, energy, reducedMotion });
    return { life, at, frame: 0 };
  });

  const advance = useCallback((extra: Partial<LifeInput> = {}, flip = false) => {
    const current = input.current;
    const at = current.now();
    setClocked((prev) => ({
      life: stepLife(prev.life, { now: at, visual: current.visual, energy: current.energy, reducedMotion: current.reducedMotion, ...extra }),
      at,
      frame: current.reducedMotion ? 0 : flip ? 1 - prev.frame : prev.frame,
    }));
  }, []);

  // Agent facts (and energy/motion changes) take effect before paint.
  useLayoutEffect(() => {
    advance();
  }, [visual, energy, reducedMotion, advance]);

  useEffect(() => {
    const id = setInterval(() => advance({}, true), reducedMotion ? STILL_TICK_MS : LIFE_TICK_MS);
    return () => clearInterval(id);
  }, [reducedMotion, advance]);

  const invite = useCallback(() => advance({ invite: true }), [advance]);

  const { life, at, frame } = clocked;
  const hermes = { activity: life.hermes.activity, ...positionAt(life.hermes, at) };
  const friend = life.friend ? { activity: life.friend.activity, look: life.friend.look, ...positionAt(life.friend, at) } : null;
  return { hermes, friend, frame, invite };
}
