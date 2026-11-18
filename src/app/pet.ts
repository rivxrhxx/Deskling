import type { CareState } from '../core/growth';
import { AFFECTION_MAX, INITIAL_CARE, SNACKS_PER_DAY, sanitizeName } from '../core/growth';

/**
 * Pet profiles (ADR-018): one for demo sources and one for real agents, so demo growth never mixes
 * with real growth. Stored under a single key; only numbers and the user's chosen name (SEC-7).
 */

export const PET_KEY = 'deskling.pet.v1';

export interface PetProfile {
  readonly name: string;
  /** Completed tasks seen with this profile. */
  readonly xp: number;
  readonly care: CareState;
}

export interface PetBook {
  readonly demo: PetProfile;
  readonly live: PetProfile;
}

export const NEW_PET: PetProfile = Object.freeze({ name: '', xp: 0, care: INITIAL_CARE });

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function parseCare(value: unknown): CareState {
  if (!isRecord(value)) return INITIAL_CARE;
  const affection = isCount(value.affection) ? Math.min(AFFECTION_MAX, value.affection) : INITIAL_CARE.affection;
  const lastPetAt = isCount(value.lastPetAt) ? value.lastPetAt : null;
  const snackDay = typeof value.snackDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.snackDay) ? value.snackDay : null;
  const snacksToday = isCount(value.snacksToday) ? Math.min(SNACKS_PER_DAY, value.snacksToday) : 0;
  return { affection, lastPetAt, snackDay, snacksToday };
}

function parseProfile(value: unknown): PetProfile {
  if (!isRecord(value)) return NEW_PET;
  return {
    name: sanitizeName(value.name),
    xp: isCount(value.xp) ? value.xp : 0,
    care: parseCare(value.care),
  };
}

export function parsePetBook(value: unknown): PetBook {
  const record = isRecord(value) ? value : {};
  return { demo: parseProfile(record.demo), live: parseProfile(record.live) };
}

export function loadPetBook(storage: StorageLike | null): PetBook {
  try {
    const raw = storage?.getItem(PET_KEY);
    return parsePetBook(raw ? JSON.parse(raw) : undefined);
  } catch {
    return parsePetBook(undefined);
  }
}

export function savePetBook(storage: StorageLike | null, book: PetBook): void {
  try {
    storage?.setItem(PET_KEY, JSON.stringify(parsePetBook(book)));
  } catch {
    // Storage may be unavailable; growth then lasts for this run only.
  }
}
