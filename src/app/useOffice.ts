import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ConversationInput, MemberInput, MemberView, OfficeState } from '../core/office';
import { initialOffice, memberViewsAt, stepOffice } from '../core/office';

/** How often the office is advanced: walking steps, typing hands, the lounge schedule (DESIGN §9.4). */
export const OFFICE_TICK_MS = 300;
/** With reduced motion nothing animates, so the schedule only needs a slow check. */
const STILL_TICK_MS = 1000;
/** While someone walks, how often the walk is read again between steps, so it glides instead of jumping (ADR-027 §2). */
export const GLIDE_TICK_MS = 50;

export interface UseOfficeOptions {
  /** Sessions present, in arrival order (ADR-025 §1). */
  readonly members: readonly MemberInput[];
  /** Messages between sessions, newest first (ADR-023). */
  readonly conversations?: readonly ConversationInput[];
  readonly reducedMotion: boolean;
  /** PRNG seed for lounge choices; defaults to the wall-clock start time. */
  readonly seed?: number;
  /** Engine clock (ms). Monotonic by default so a system clock change can't stall the office. Injected in tests. */
  readonly now?: () => number;
}

export interface OfficeView {
  readonly members: readonly MemberView[];
  /** 0/1 animation frame; always 0 with reduced motion. */
  readonly frame: number;
}

interface Clocked {
  readonly office: OfficeState;
  readonly at: number;
  readonly frame: number;
}

const monotonic = () => performance.now();

/**
 * Drives the office (ADR-025 §3–§4). The engine is pure; this hook only supplies time and the session facts.
 * A change in who is here, what they do, or a new message applies in the same commit, not on the next tick.
 */
export function useOffice({ members, conversations, reducedMotion, seed, now = monotonic }: UseOfficeOptions): OfficeView {
  const input = useRef({ members, conversations, reducedMotion, now });
  // Declared first so it runs before the step below sees the new input.
  useLayoutEffect(() => {
    input.current = { members, conversations, reducedMotion, now };
  });

  const [clocked, setClocked] = useState<Clocked>(() => {
    const at = now();
    const office = stepOffice(initialOffice(seed ?? Date.now(), at), { now: at, members, conversations, reducedMotion });
    return { office, at, frame: 0 };
  });

  const advance = useCallback((flip = false) => {
    const { now: clock, ...current } = input.current;
    const at = clock();
    setClocked((prev) => ({
      office: stepOffice(prev.office, { ...current, now: at }),
      at,
      frame: current.reducedMotion ? 0 : flip ? 1 - prev.frame : prev.frame,
    }));
  }, []);

  // Between steps, a walk is read again at a later moment of the same state: positions only, nothing is stepped.
  const [glideAt, setGlideAt] = useState<number | null>(null);
  const views = memberViewsAt(clocked.office, Math.max(clocked.at, glideAt ?? clocked.at));
  const gliding = !reducedMotion && views.some((view) => view.walking);
  useEffect(() => {
    if (!gliding) return;
    const id = setInterval(() => setGlideAt(input.current.now()), GLIDE_TICK_MS);
    return () => clearInterval(id);
  }, [gliding]);

  // Keyed on values, not on the arrays: callers build fresh arrays every render.
  const who = members.map((m) => `${m.key}\u0000${m.visual}`).join('\u0001');
  const newestMessage = conversations?.reduce((max, c) => Math.max(max, c.key), -1) ?? null;
  useLayoutEffect(() => {
    advance();
  }, [who, newestMessage, reducedMotion, advance]);

  useEffect(() => {
    const id = setInterval(() => advance(true), reducedMotion ? STILL_TICK_MS : OFFICE_TICK_MS);
    return () => clearInterval(id);
  }, [reducedMotion, advance]);

  return { members: views, frame: clocked.frame };
}
