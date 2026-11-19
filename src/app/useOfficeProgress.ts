import { useCallback, useEffect, useRef, useState } from 'react';
import type { OfficeDecorId } from '../core/growth';
import { nextUnlock, unlockedDecor } from '../core/growth';
import type { OfficeBook, OfficeMode } from './officeProgress';
import { loadOfficeBook, memberId, saveOfficeBook, withMemberXp } from './officeProgress';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface UseOfficeProgressOptions {
  readonly mode: OfficeMode;
  /** The feed's completed-task counter (RoomViewState.completedTurns). */
  readonly completedTurns: number;
  /** The feed's completed tasks per session (RoomViewState.completedBy) — member XP (ADR-028 §2). */
  readonly completedBy?: Readonly<Record<string, number>>;
  /** Identity of the current feed (the source). Each feed's counters are remembered on their own. */
  readonly feedKey: object;
  readonly storage: StorageLike | null;
}

export interface OfficeProgressView {
  readonly xp: number;
  readonly decor: readonly OfficeDecorId[];
  readonly next: ReturnType<typeof nextUnlock>;
  /** A member's own XP in this mode, by session key; 0 for one never seen to complete a task. */
  readonly memberXp: (key: string) => number;
}

interface Seen {
  readonly turns: number;
  readonly by: Readonly<Record<string, number>>;
}

const NOTHING_SEEN: Seen = { turns: 0, by: {} };
const NO_COUNTS: Readonly<Record<string, number>> = Object.freeze({});

/**
 * The office grows from completed tasks (ADR-025 §7), separately for demo and live, and so does every member,
 * each from its own session's tasks (ADR-028 §2). Nothing here talks to an agent or changes any agent fact.
 */
export function useOfficeProgress({
  mode,
  completedTurns,
  completedBy = NO_COUNTS,
  feedKey,
  storage,
}: UseOfficeProgressOptions): OfficeProgressView {
  const [book, setBook] = useState<OfficeBook>(() => loadOfficeBook(storage));

  // XP = completed tasks. Only the increase since the last look at the same feed counts, so a feed shown again
  // after another one is not counted twice; a feed seen for the first time counts from zero.
  const seen = useRef(new WeakMap<object, Seen>());
  useEffect(() => {
    const before = seen.current.get(feedKey) ?? NOTHING_SEEN;
    seen.current.set(feedKey, { turns: completedTurns, by: completedBy });
    const gained = completedTurns - before.turns;
    const grown = Object.entries(completedBy).flatMap(([key, count]) => {
      const gain = count - (before.by[key] ?? 0);
      return gain > 0 ? [[key, gain] as const] : [];
    });
    if (gained <= 0 && grown.length === 0) return;
    setBook((current) => {
      let progress = current[mode];
      if (gained > 0) progress = { ...progress, xp: progress.xp + gained };
      for (const [key, gain] of grown) progress = withMemberXp(progress, key, gain);
      return { ...current, [mode]: progress };
    });
  }, [feedKey, completedTurns, completedBy, mode]);

  // Saved only when the XP changes; the loaded (or migrated) book is not written back on its own.
  const saved = useRef(book);
  useEffect(() => {
    if (saved.current === book) return;
    saved.current = book;
    saveOfficeBook(storage, book);
  }, [storage, book]);

  const { xp, members } = book[mode];
  const memberXp = useCallback((key: string) => members[memberId(key)] ?? 0, [members]);
  return { xp, decor: unlockedDecor(xp), next: nextUnlock(xp), memberXp };
}
