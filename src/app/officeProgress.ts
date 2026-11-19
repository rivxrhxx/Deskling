/**
 * Office progress (ADR-025 §7): one XP count for demo sources and one for real agents, so demo growth
 * never mixes with real growth. Stored under a single key; numbers only (SEC-7).
 */

export const OFFICE_KEY = 'deskling.office.v1';
/** The pet era's book (ADR-018). Read once to carry XP over; never written or deleted. */
export const LEGACY_PET_KEY = 'deskling.pet.v1';

export interface OfficeProgress {
  /** Completed tasks seen in this mode. */
  readonly xp: number;
}

export interface OfficeBook {
  readonly demo: OfficeProgress;
  readonly live: OfficeProgress;
}

export type OfficeMode = keyof OfficeBook;

export const NEW_OFFICE: OfficeBook = Object.freeze({ demo: Object.freeze({ xp: 0 }), live: Object.freeze({ xp: 0 }) });

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function parseProgress(value: unknown): OfficeProgress {
  return { xp: isRecord(value) && isCount(value.xp) ? value.xp : 0 };
}

/** Keeps only each mode's XP. Also reads a pet book, whose profiles carry `xp` beside names and care. */
export function parseOfficeBook(value: unknown): OfficeBook {
  const record = isRecord(value) ? value : {};
  return { demo: parseProgress(record.demo), live: parseProgress(record.live) };
}

export function loadOfficeBook(storage: StorageLike | null): OfficeBook {
  try {
    const raw = storage?.getItem(OFFICE_KEY) ?? null;
    if (raw !== null) return parseOfficeBook(JSON.parse(raw));
    const legacy = storage?.getItem(LEGACY_PET_KEY);
    return parseOfficeBook(legacy ? JSON.parse(legacy) : undefined);
  } catch {
    return NEW_OFFICE;
  }
}

export function saveOfficeBook(storage: StorageLike | null, book: OfficeBook): void {
  try {
    storage?.setItem(OFFICE_KEY, JSON.stringify(parseOfficeBook(book)));
  } catch {
    // Storage may be unavailable; growth then lasts for this run only.
  }
}
