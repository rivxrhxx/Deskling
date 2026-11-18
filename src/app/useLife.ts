import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { VisualState } from '../core/agentEvent';
import type { Activity, Chat, ConversationInput, GuestInput, GuestView, LifeState } from '../core/life';
import { guestViewsAt, hermesChatAt, hermesFaceOverride, initialLife, positionAt, stepLife } from '../core/life';
import type { EnergyLevel } from '../core/mood';
import type { Facing, Tile } from '../core/room';
import type { FriendView } from '../ui/miniroom/MiniRoom';

/** How often the room is advanced: walking steps, typing hands, idle schedule (DESIGN §9.4). */
export const LIFE_TICK_MS = 300;
/** With reduced motion nothing animates, so the schedule only needs a slow check. */
const STILL_TICK_MS = 1000;

export interface UseLifeOptions {
  readonly visual: VisualState;
  readonly energy: EnergyLevel;
  readonly reducedMotion: boolean;
  /** PRNG seed for idle choices; defaults to the wall-clock start time. */
  readonly seed?: number;
  /** Engine clock (ms). Monotonic by default so a system clock change can't stall the routine. Injected in tests. */
  readonly now?: () => number;
  /** Session friends present, in arrival order (ADR-022). Picked up on the next tick. */
  readonly guests?: readonly GuestInput[];
  /** Messages between sessions, newest first (ADR-023). Picked up on the next tick. */
  readonly conversations?: readonly ConversationInput[];
  /** The session that drives Hermes, as conversations address him. */
  readonly residentKey?: string | null;
}

export interface HermesView {
  readonly activity: Activity;
  readonly at: Tile;
  readonly walking: boolean;
  readonly face: Facing;
}

export interface LifeView {
  /** While Hermes talks with a friend his `face` already points at them. */
  readonly hermes: HermesView;
  readonly friend: FriendView | null;
  readonly guests: readonly GuestView[];
  /** Hermes' part in a conversation: talking, or a letter he sent. */
  readonly hermesChat: Chat['kind'] | null;
  /** 0/1 animation frame; always 0 with reduced motion. */
  readonly frame: number;
}

interface Clocked {
  readonly life: LifeState;
  readonly at: number;
  readonly frame: number;
}

const monotonic = () => performance.now();

/**
 * Drives Hermes' life in the room (FR-R2–R6) and the session friends (FR-MS2–MS5). The engine is pure;
 * this hook only supplies time and the agent facts. Hermes' facts apply at once, not on the next tick.
 */
export function useLife({
  visual,
  energy,
  reducedMotion,
  seed,
  now = monotonic,
  guests,
  conversations,
  residentKey = null,
}: UseLifeOptions): LifeView {
  const input = useRef({ visual, energy, reducedMotion, now, guests, conversations, residentKey });
  // Declared first so it runs before the step below sees the new input.
  useLayoutEffect(() => {
    input.current = { visual, energy, reducedMotion, now, guests, conversations, residentKey };
  });

  const [clocked, setClocked] = useState<Clocked>(() => {
    const at = now();
    const life = stepLife(initialLife(seed ?? Date.now(), at), { now: at, visual, energy, reducedMotion, guests, conversations, residentKey });
    return { life, at, frame: 0 };
  });

  const advance = useCallback((flip = false) => {
    const { now: clock, ...current } = input.current;
    const at = clock();
    setClocked((prev) => ({
      life: stepLife(prev.life, { ...current, now: at }),
      at,
      frame: current.reducedMotion ? 0 : flip ? 1 - prev.frame : prev.frame,
    }));
  }, []);

  // Agent facts (and energy/motion changes) take effect before paint.
  useLayoutEffect(() => {
    advance();
  }, [visual, energy, reducedMotion, advance]);

  useEffect(() => {
    const id = setInterval(() => advance(true), reducedMotion ? STILL_TICK_MS : LIFE_TICK_MS);
    return () => clearInterval(id);
  }, [reducedMotion, advance]);

  const { life, at, frame } = clocked;
  const place = positionAt(life.hermes, at);
  const hermes = { activity: life.hermes.activity, ...place, face: hermesFaceOverride(life, at, residentKey) ?? place.face };
  const friend = life.friend ? { activity: life.friend.activity, look: life.friend.look, ...positionAt(life.friend, at) } : null;
  return { hermes, friend, guests: guestViewsAt(life, at), hermesChat: hermesChatAt(life, at, residentKey), frame };
}
