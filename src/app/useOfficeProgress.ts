import { useEffect, useRef, useState } from 'react';
import type { OfficeDecorId } from '../core/growth';
import { nextUnlock, unlockedDecor } from '../core/growth';
import type { OfficeBook, OfficeMode } from './officeProgress';
import { loadOfficeBook, saveOfficeBook } from './officeProgress';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface UseOfficeProgressOptions {
  readonly mode: OfficeMode;
  /** The feed's completed-task counter (RoomViewState.completedTurns). */
  readonly completedTurns: number;
  /** Identity of the current feed (the source). A new feed's counter starts again at zero. */
  readonly feedKey: object;
  readonly storage: StorageLike | null;
}

export interface OfficeProgressView {
  readonly xp: number;
  readonly decor: readonly OfficeDecorId[];
  readonly next: ReturnType<typeof nextUnlock>;
}

/**
 * The office grows from completed tasks (ADR-025 §7), separately for demo and live.
 * Nothing here talks to an agent or changes any agent fact.
 */
export function useOfficeProgress({ mode, completedTurns, feedKey, storage }: UseOfficeProgressOptions): OfficeProgressView {
  const [book, setBook] = useState<OfficeBook>(() => loadOfficeBook(storage));

  // XP = completed tasks. Only the increase since the last observation counts; a new feed starts from zero.
  const seen = useRef<{ feed: object; turns: number }>({ feed: feedKey, turns: 0 });
  useEffect(() => {
    const base = seen.current.feed === feedKey ? seen.current.turns : 0;
    const gained = completedTurns - base;
    seen.current = { feed: feedKey, turns: completedTurns };
    if (gained > 0) setBook((current) => ({ ...current, [mode]: { xp: current[mode].xp + gained } }));
  }, [feedKey, completedTurns, mode]);

  // Saved only when the XP changes; the loaded (or migrated) book is not written back on its own.
  const saved = useRef(book);
  useEffect(() => {
    if (saved.current === book) return;
    saved.current = book;
    saveOfficeBook(storage, book);
  }, [storage, book]);

  const { xp } = book[mode];
  return { xp, decor: unlockedDecor(xp), next: nextUnlock(xp) };
}
