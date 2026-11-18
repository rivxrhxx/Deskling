import type { AgentEvent, AgentEventVersion, PlainEventType, ToolCategory } from '../../core/agentEvent';
import { AGENT_EVENT_SCHEMA, TOOL_CATEGORIES } from '../../core/agentEvent';

/**
 * Claude Code hook record v1 → AgentEvent v3 (ADR-024 §2, §5; FR-CC3). Pure: no clock, no I/O.
 * The Rust bridge has validated each record already; it is checked again here and anything malformed
 * is dropped silently. Only whitelisted enum values are copied into events — never record contents.
 * No `usage.reported` is ever produced: Claude Code numbers would need the transcript (FR-CC6).
 */

const HOOK_EVENTS = [
  'session-start',
  'session-end',
  'prompt',
  'tool-start',
  'tool-end',
  'approval',
  'stop',
  'stop-failure',
  'subagent-stop',
] as const;
type HookEvent = (typeof HOOK_EVENTS)[number];

const HOOK_TOOLS = [...TOOL_CATEGORIES, 'delegate', 'message'] as const;
type HookTool = (typeof HOOK_TOOLS)[number];

type HookRecord =
  | { readonly session: string; readonly at: number; readonly event: Exclude<HookEvent, 'tool-start' | 'tool-end'> }
  | { readonly session: string; readonly at: number; readonly event: 'tool-start'; readonly tool: HookTool }
  | {
      readonly session: string;
      readonly at: number;
      readonly event: 'tool-end';
      readonly tool: HookTool;
      readonly ok: boolean;
    };

/** What one live session remembers. */
export interface SessionTrack {
  /** The seq of the next emitted event. */
  readonly nextSeq: number;
  /** Claude Code shows one permission prompt at a time. */
  readonly pendingApproval: boolean;
  readonly openDelegations: number;
}

export interface TranslatorState {
  /** Seen, not-ended sessions, least recently seen first. Presence means the friend is known. */
  readonly live: ReadonlyMap<string, SessionTrack>;
  /** Last emitted seq of sessions that ended (or were dropped from `live`), oldest first. */
  readonly ended: ReadonlyMap<string, number>;
}

export const initialTranslatorState: TranslatorState = Object.freeze({ live: new Map(), ended: new Map() });

const LIVE_LIMIT = 64;
const ENDED_LIMIT = 64;
const VERSION: AgentEventVersion = 3;
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,64}$/;
const MAX_AT = 8_640_000_000_000_000;
const KEYS = new Set(['v', 'agent', 'session', 'event', 'tool', 'ok', 'at']);
const NO_EVENTS: readonly AgentEvent[] = Object.freeze([]);

type UnknownRecord = Record<string, unknown>;

function isPlainRecord(value: unknown): value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/** Mirrors the bridge's serde rules: no unknown keys, `tool` iff tool event, `ok` iff tool-end. */
function parse(raw: unknown): HookRecord | null {
  if (!isPlainRecord(raw)) return null;
  if (!Reflect.ownKeys(raw).every((key) => typeof key === 'string' && KEYS.has(key))) return null;
  const get = (key: string): unknown => (Object.hasOwn(raw, key) ? raw[key] : undefined);

  const session = get('session');
  const event = get('event');
  const tool = get('tool');
  const ok = get('ok');
  const at = get('at');
  if (get('v') !== 1 || get('agent') !== 'claude-code') return null;
  if (typeof session !== 'string' || !IDENTIFIER.test(session)) return null;
  if (typeof at !== 'number' || !Number.isSafeInteger(at) || at < 0 || at > MAX_AT) return null;
  if (!oneOf(HOOK_EVENTS, event)) return null;

  if (event === 'tool-start' || event === 'tool-end') {
    if (!oneOf(HOOK_TOOLS, tool)) return null;
    if (event === 'tool-start') return ok === undefined ? { session, at, event, tool } : null;
    return typeof ok === 'boolean' ? { session, at, event, tool, ok } : null;
  }
  return tool === undefined && ok === undefined ? { session, at, event } : null;
}

type Body =
  | { readonly type: PlainEventType | 'session.message' }
  | { readonly type: 'tool.started'; readonly tool: ToolCategory }
  | { readonly type: 'tool.finished'; readonly tool: ToolCategory; readonly outcome: 'ok' | 'error' };

/** The events one record means for a known session, and the session's new bookkeeping. */
function mapRecord(record: HookRecord, track: SessionTrack): { bodies: Body[]; track: SessionTrack } {
  const resolve: Body[] = track.pendingApproval ? [{ type: 'approval.resolved' }] : [];
  const resolved: SessionTrack = { ...track, pendingApproval: false };

  switch (record.event) {
    case 'session-start':
    case 'subagent-stop':
      // A known session restarting (resume/compact) changes nothing; the Agent/Task tool-end
      // already finishes the delegation, so subagent-stop would count it twice.
      return { bodies: [], track };
    case 'approval':
      return track.pendingApproval
        ? { bodies: [], track }
        : { bodies: [{ type: 'approval.requested' }], track: { ...track, pendingApproval: true } };
    case 'prompt':
      return { bodies: [...resolve, { type: 'turn.started' }], track: resolved };
    case 'stop':
      return { bodies: [...resolve, { type: 'turn.succeeded' }], track: { ...resolved, openDelegations: 0 } };
    case 'stop-failure':
      return { bodies: [...resolve, { type: 'turn.failed' }], track: { ...resolved, openDelegations: 0 } };
    case 'session-end':
      return { bodies: [...resolve, { type: 'agent.offline' }], track: resolved };
    case 'tool-start':
      if (record.tool === 'delegate') {
        return {
          bodies: [{ type: 'delegation.started' }],
          track: { ...track, openDelegations: track.openDelegations + 1 },
        };
      }
      // The receiving session is unknown, so no `to` (ADR-023).
      if (record.tool === 'message') return { bodies: [{ type: 'session.message' }], track };
      return { bodies: [{ type: 'tool.started', tool: record.tool }], track };
    case 'tool-end':
      if (record.tool === 'delegate') {
        return track.openDelegations > 0
          ? {
              bodies: [...resolve, { type: 'delegation.finished' }],
              track: { ...resolved, openDelegations: track.openDelegations - 1 },
            }
          : { bodies: resolve, track: resolved };
      }
      if (record.tool === 'message') return { bodies: resolve, track: resolved };
      return {
        bodies: [...resolve, { type: 'tool.finished', tool: record.tool, outcome: record.ok ? 'ok' : 'error' }],
        track: resolved,
      };
  }
}

/** Appends `key` as the newest entry; the oldest fall off past `limit`. */
function remember<V>(entries: ReadonlyMap<string, V>, key: string, value: V, limit: number): Map<string, V> {
  const next = new Map(entries);
  next.delete(key);
  next.set(key, value);
  for (const oldest of next.keys()) {
    if (next.size <= limit) break;
    next.delete(oldest);
  }
  return next;
}

/**
 * Pure: (state, untrusted hook record) → (state, raw AgentEvent v3 objects). Malformed input returns
 * the same state and no events. The events still go through `normalizeAgentEvent` in the app.
 */
export function translateHookRecord(
  state: TranslatorState,
  raw: unknown,
): { readonly state: TranslatorState; readonly events: readonly AgentEvent[] } {
  let record: HookRecord | null;
  try {
    record = parse(raw);
  } catch {
    // Hostile getters or proxies: unreadable, so ignored.
    record = null;
  }
  if (!record) return { state, events: NO_EVENTS };

  const { session, at } = record;
  const known = state.live.get(session);
  // Nothing to show for a session that ends before we ever saw it.
  if (!known && record.event === 'session-end') return { state, events: NO_EVENTS };

  // An unseen session announces itself first, so the friend appears (and resumes past its old seq).
  const opening: Body[] = known ? [] : [{ type: 'agent.online' }];
  const track = known ?? { nextSeq: (state.ended.get(session) ?? 0) + 1, pendingApproval: false, openDelegations: 0 };
  const { bodies, track: mapped } = mapRecord(record, track);

  const events = [...opening, ...bodies].map((b, i): AgentEvent => {
    const seq = mapped.nextSeq + i;
    return {
      schema: AGENT_EVENT_SCHEMA,
      version: VERSION,
      id: `cc-${seq}-${session.slice(0, 40)}`,
      seq,
      at,
      source: { kind: 'claude-code', session },
      ...b,
    };
  });
  const next: SessionTrack = { ...mapped, nextSeq: mapped.nextSeq + events.length };
  const lastSeq = next.nextSeq - 1;

  let ended: ReadonlyMap<string, number> = state.ended;
  if (!known && ended.has(session)) {
    const back = new Map(ended);
    back.delete(session);
    ended = back;
  }

  if (record.event === 'session-end') {
    const live = new Map(state.live);
    live.delete(session);
    return { state: { live, ended: remember(ended, session, lastSeq, ENDED_LIMIT) }, events };
  }

  const live = remember(state.live, session, next, Infinity);
  for (const [oldest, dropped] of live) {
    if (live.size <= LIVE_LIMIT) break;
    // Too many sessions: forget the least recently seen one, but keep its seq moving forward.
    live.delete(oldest);
    ended = remember(ended, oldest, dropped.nextSeq - 1, ENDED_LIMIT);
  }
  return { state: { live, ended }, events };
}
