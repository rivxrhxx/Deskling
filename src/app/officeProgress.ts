/**
 * Office progress (ADR-025 §7): one XP count for demo sources and one for real agents, so demo growth
 * never mixes with real growth. Each mode also keeps every member's own XP (ADR-028 §2) under an opaque id.
 * Stored under a single key; numbers only (SEC-7).
 */

export const OFFICE_KEY = 'deskling.office.v1';
/** The pet era's book (ADR-018). Read once to carry XP over; never written or deleted. */
export const LEGACY_PET_KEY = 'deskling.pet.v1';

/** How many members' XP a mode keeps: the ones that grew most recently. */
export const MEMBER_LIMIT = 64;

/** A member's storage id: `m` and eight hex digits (`memberId`). Never the session id itself. */
export type MemberId = string;

export interface OfficeProgress {
  /** Completed tasks seen in this mode. */
  readonly xp: number;
  /** Completed tasks of each member, by `memberId`, the one that grew most recently last. */
  readonly members: Readonly<Record<MemberId, number>>;
}

export interface OfficeBook {
  readonly demo: OfficeProgress;
  readonly live: OfficeProgress;
}

export type OfficeMode = keyof OfficeBook;

const NEW_PROGRESS: OfficeProgress = Object.freeze({ xp: 0, members: Object.freeze({}) });
export const NEW_OFFICE: OfficeBook = Object.freeze({ demo: NEW_PROGRESS, live: NEW_PROGRESS });

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const MEMBER_ID = /^m[0-9a-f]{8}$/;

/**
 * A member's storage id: FNV-1a (32-bit) of its session key (`${kind}:${session}`), as `m` + 8 hex digits,
 * so the book holds no session id (ADR-028 §2). The `m` keeps ids from reading as array indexes, which would reorder them.
 */
export function memberId(key: string): MemberId {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  return `m${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function parseMembers(value: unknown): Record<MemberId, number> {
  if (!isRecord(value)) return {};
  const kept = Object.entries(value).flatMap(([id, xp]) => (MEMBER_ID.test(id) && isCount(xp) ? [[id, xp] as const] : []));
  return Object.fromEntries(kept.slice(-MEMBER_LIMIT));
}

function parseProgress(value: unknown): OfficeProgress {
  const record = isRecord(value) ? value : {};
  return { xp: isCount(record.xp) ? record.xp : 0, members: parseMembers(record.members) };
}

/** `gained` more completed tasks for the member with session key `key`, which becomes the newest; the oldest fall off. */
export function withMemberXp(progress: OfficeProgress, key: string, gained: number): OfficeProgress {
  if (!Number.isSafeInteger(gained) || gained <= 0) return progress;
  const id = memberId(key);
  const rest = Object.entries(progress.members).filter(([other]) => other !== id);
  const members = Object.fromEntries([...rest, [id, (progress.members[id] ?? 0) + gained]].slice(-MEMBER_LIMIT));
  return { ...progress, members };
}

/** Keeps only each mode's XP and its members' XP. Also reads a pet book, whose profiles carry `xp` beside names and care. */
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
