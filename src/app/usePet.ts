import { useCallback, useEffect, useRef, useState } from 'react';
import type { DecorId, GrowthStage } from '../core/growth';
import { decorFor, heartsFor, pet as petRule, sanitizeName, snack as snackRule, snacksLeft, stageFor } from '../core/growth';
import type { PetBook, PetProfile } from './pet';
import { loadPetBook, savePetBook } from './pet';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** How long a care reaction (hearts, snack) stays on screen. A UI timer for the user's own action. */
export const REACTION_MS = 2200;

export interface PetReaction {
  readonly kind: 'hearts' | 'snack';
  /** Changes on every reaction so repeated care replays the animation. */
  readonly id: number;
}

export interface UsePetOptions {
  readonly mode: 'demo' | 'live';
  /** The feed's completed-task counter (AgentViewState.completedTurns). */
  readonly completedTurns: number;
  /** Identity of the current feed (the source). A new feed's counter starts again at zero. */
  readonly feedKey: object;
  readonly storage: StorageLike | null;
  readonly now?: () => number;
}

export interface UsePet {
  readonly profile: PetProfile;
  readonly stage: GrowthStage;
  readonly decor: readonly DecorId[];
  readonly hearts: number;
  readonly snacksLeft: number;
  readonly reaction: PetReaction | null;
  pet(): boolean;
  feed(): boolean;
  rename(name: string): void;
}

/**
 * The desktop pet (ADR-018): grows from completed tasks, is cared for by the user.
 * Nothing here talks to the agent; care never changes energy, anger or any agent fact.
 */
export function usePet({ mode, completedTurns, feedKey, storage, now = Date.now }: UsePetOptions): UsePet {
  const [book, setBook] = useState<PetBook>(() => loadPetBook(storage));
  const profile = book[mode];

  const updateProfile = useCallback(
    (change: (profile: PetProfile) => PetProfile) => setBook((current) => ({ ...current, [mode]: change(current[mode]) })),
    [mode],
  );

  // XP = completed tasks. Only the increase since the last observation counts; a new feed starts from zero.
  const seen = useRef<{ feed: object; turns: number }>({ feed: feedKey, turns: 0 });
  useEffect(() => {
    const base = seen.current.feed === feedKey ? seen.current.turns : 0;
    const gained = completedTurns - base;
    seen.current = { feed: feedKey, turns: completedTurns };
    if (gained > 0) updateProfile((p) => ({ ...p, xp: p.xp + gained }));
  }, [feedKey, completedTurns, updateProfile]);

  useEffect(() => {
    savePetBook(storage, book);
  }, [storage, book]);

  const [reaction, setReaction] = useState<PetReaction | null>(null);
  const reactionId = useRef(0);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showReaction = useCallback((kind: PetReaction['kind']) => {
    reactionId.current += 1;
    setReaction({ kind, id: reactionId.current });
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    reactionTimer.current = setTimeout(() => setReaction(null), REACTION_MS);
  }, []);
  useEffect(
    () => () => {
      if (reactionTimer.current) clearTimeout(reactionTimer.current);
    },
    [],
  );

  const pet = useCallback(() => {
    const result = petRule(profile.care, now());
    if (!result.accepted) return false;
    updateProfile((p) => ({ ...p, care: result.care }));
    showReaction('hearts');
    return true;
  }, [profile.care, now, updateProfile, showReaction]);

  const feed = useCallback(() => {
    const result = snackRule(profile.care, now());
    if (!result.accepted) return false;
    updateProfile((p) => ({ ...p, care: result.care }));
    showReaction('snack');
    return true;
  }, [profile.care, now, updateProfile, showReaction]);

  const rename = useCallback((name: string) => updateProfile((p) => ({ ...p, name: sanitizeName(name) })), [updateProfile]);

  return {
    profile,
    stage: stageFor(profile.xp),
    decor: decorFor(profile.xp),
    hearts: heartsFor(profile.care.affection),
    snacksLeft: snacksLeft(profile.care, now()),
    reaction,
    pet,
    feed,
    rename,
  };
}
