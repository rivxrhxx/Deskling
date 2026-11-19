import type { AgentEvent, AgentEventSource, SourceKind, VisualState } from './agentEvent';
import type { AgentFacts, AgentViewState, RecentEntry, UsageSnapshot } from './agentState';
import { deriveVisualState, initialAgentState, RECENT_LIMIT, reduceAgentState } from './agentState';

/**
 * The whole office (ADR-025 §1, EVENT_PROTOCOL §6 v3): one view per session, keyed by `${kind}:${session}`.
 * Every session of every kind is one member; there is no resident.
 */

export type SessionKey = string;

export function sessionKey(source: AgentEventSource): SessionKey {
  return `${source.kind}:${source.session}`;
}

export interface SessionView {
  readonly key: SessionKey;
  readonly kind: SourceKind;
  readonly session: string;
  /** 1, 2, … within its kind while present. */
  readonly ordinal: number;
  readonly facts: AgentFacts;
  readonly visual: VisualState;
  readonly lastSeq: number;
  readonly updatedAt: number;
  readonly usage: UsageSnapshot;
}

/** A recent-activity line with its session. `toKey` and `receiver` only on `session.message`. */
export interface RoomEntry extends RecentEntry {
  readonly sessionKey: SessionKey;
  readonly kind: SourceKind;
  /** The session's ordinal when the entry was recorded. */
  readonly ordinal: number;
  /** null = the sender did not say who it wrote to. */
  readonly toKey?: SessionKey | null;
  /** The receiver as it was in the office when the message was recorded; null when unknown, absent or the sender itself. */
  readonly receiver?: Pick<SessionView, 'kind' | 'ordinal'> | null;
}

/** One `session.message` (ADR-023). `key` is assigned by the reducer and strictly increases. */
export interface Conversation {
  readonly key: number;
  readonly from: SessionKey;
  readonly to: SessionKey | null;
}

export interface RoomViewState {
  /** Present sessions: every session that has not gone offline. */
  readonly sessions: Readonly<Record<SessionKey, SessionView>>;
  /** Present sessions in arrival order. */
  readonly memberKeys: readonly SessionKey[];
  /** All sessions merged, newest first, at most RECENT_LIMIT. */
  readonly recent: readonly RoomEntry[];
  /** How many entries have ever been recorded; the source of RoomEntry keys. */
  readonly entryCount: number;
  /** Accepted turn.succeeded across all sessions — the source of office XP (ADR-025 §7). */
  readonly completedTurns: number;
  /**
   * Accepted turn.succeeded per session, including sessions that left — the source of member XP (ADR-028 §2).
   * The most recently completed last, at most COMPLETED_LIMIT.
   */
  readonly completedBy: Readonly<Record<SessionKey, number>>;
  /** Newest first, at most CONVERSATION_LIMIT. */
  readonly conversations: readonly Conversation[];
  readonly conversationCount: number;
  /** Last seq of sessions that left, oldest first, at most ENDED_CURSOR_LIMIT — late events stay ignored. */
  readonly endedCursors: Readonly<Record<SessionKey, number>>;
}

export const CONVERSATION_LIMIT = 8;
export const ENDED_CURSOR_LIMIT = 64;
export const COMPLETED_LIMIT = 64;

export const initialRoomState: RoomViewState = Object.freeze({
  sessions: Object.freeze({}),
  memberKeys: Object.freeze([]),
  recent: Object.freeze([]),
  entryCount: 0,
  completedTurns: 0,
  completedBy: Object.freeze({}),
  conversations: Object.freeze([]),
  conversationCount: 0,
  endedCursors: Object.freeze({}),
});

function without<T>(record: Readonly<Record<SessionKey, T>>, key: SessionKey): Record<SessionKey, T> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/** Remembers that `key` left at `seq`, as the newest entry; the oldest fall off past the limit. */
function withEnded(
  cursors: Readonly<Record<SessionKey, number>>,
  key: SessionKey,
  seq: number,
): Record<SessionKey, number> {
  return Object.fromEntries([...Object.entries(without(cursors, key)), [key, seq]].slice(-ENDED_CURSOR_LIMIT));
}

/** One more completed task for `key`, which becomes the newest; the oldest fall off past the limit. */
function withCompleted(counts: Readonly<Record<SessionKey, number>>, key: SessionKey): Record<SessionKey, number> {
  return Object.fromEntries([...Object.entries(without(counts, key)), [key, (counts[key] ?? 0) + 1]].slice(-COMPLETED_LIMIT));
}

/** The smallest positive integer no present session of this kind uses. */
function nextOrdinal(sessions: Readonly<Record<SessionKey, SessionView>>, kind: SourceKind): number {
  const used = new Set(Object.values(sessions).flatMap((s) => (s.kind === kind ? [s.ordinal] : [])));
  let ordinal = 1;
  while (used.has(ordinal)) ordinal += 1;
  return ordinal;
}

/** One session's facts after an event. The single-session reducer owns the fact rules (EVENT_PROTOCOL §4). */
function advance(view: SessionView | undefined, event: AgentEvent): Pick<SessionView, 'facts' | 'visual' | 'usage'> {
  if (event.type === 'session.message') {
    // Sending a message proves the session is online; it says nothing about its work.
    const facts = view?.facts ?? initialAgentState.facts;
    const online: AgentFacts = facts.connection === 'online' ? facts : { ...facts, connection: 'online' };
    return { facts: online, visual: deriveVisualState(online), usage: view?.usage ?? initialAgentState.usage };
  }
  const prior: AgentViewState = view
    ? {
        ...initialAgentState,
        facts: view.facts,
        visual: view.visual,
        session: view.session,
        sourceKind: view.kind,
        lastSeq: view.lastSeq,
        updatedAt: view.updatedAt,
        usage: view.usage,
      }
    : initialAgentState;
  const next = reduceAgentState(prior, event);
  return { facts: next.facts, visual: next.visual, usage: next.usage };
}

function toEntry(event: AgentEvent, key: number, view: SessionView, sessions: RoomViewState['sessions']): RoomEntry {
  const entry = {
    key,
    seq: event.seq,
    at: event.at,
    type: event.type,
    sessionKey: view.key,
    kind: view.kind,
    ordinal: view.ordinal,
  };
  switch (event.type) {
    case 'tool.started':
      return { ...entry, tool: event.tool };
    case 'tool.finished':
      return { ...entry, tool: event.tool, outcome: event.outcome };
    case 'session.message': {
      const toKey = event.to ? sessionKey(event.to) : null;
      const to = toKey === null || toKey === view.key ? undefined : sessions[toKey];
      return { ...entry, toKey, receiver: to ? { kind: to.kind, ordinal: to.ordinal } : null };
    }
    default:
      return entry;
  }
}

/** Pure reducer: (room, normalized event) → room. Ignored events return the same state object. */
export function reduceRoom(state: RoomViewState, event: AgentEvent): RoomViewState {
  const key = sessionKey(event.source);
  const present = state.sessions[key];
  const cursor = present ? present.lastSeq : state.endedCursors[key];
  if (cursor !== undefined && event.seq <= cursor) return state;

  const view: SessionView = {
    key,
    kind: event.source.kind,
    session: event.source.session,
    ordinal: present ? present.ordinal : nextOrdinal(state.sessions, event.source.kind),
    ...advance(present, event),
    lastSeq: event.seq,
    updatedAt: event.at,
  };

  let sessions: Readonly<Record<SessionKey, SessionView>> = { ...state.sessions, [key]: view };
  // A session that re-joins is no longer ended: its live cursor takes over.
  let endedCursors = Object.hasOwn(state.endedCursors, key) ? without(state.endedCursors, key) : state.endedCursors;
  let { memberKeys } = state;

  if (event.type === 'agent.offline') {
    // A member whose session ended walks out; its cursor keeps late events out.
    sessions = without(sessions, key);
    memberKeys = memberKeys.filter((k) => k !== key);
    endedCursors = withEnded(endedCursors, key, event.seq);
  } else if (!present) {
    memberKeys = [...memberKeys, key];
  }

  const recorded = event.type !== 'usage.reported';
  const message = event.type === 'session.message';
  return {
    sessions,
    memberKeys,
    recent: recorded
      ? [toEntry(event, state.entryCount + 1, view, state.sessions), ...state.recent].slice(0, RECENT_LIMIT)
      : state.recent,
    entryCount: state.entryCount + (recorded ? 1 : 0),
    completedTurns: state.completedTurns + (event.type === 'turn.succeeded' ? 1 : 0),
    completedBy: event.type === 'turn.succeeded' ? withCompleted(state.completedBy, key) : state.completedBy,
    conversations: message
      ? [
          { key: state.conversationCount + 1, from: key, to: event.to ? sessionKey(event.to) : null },
          ...state.conversations,
        ].slice(0, CONVERSATION_LIMIT)
      : state.conversations,
    conversationCount: state.conversationCount + (message ? 1 : 0),
    endedCursors,
  };
}

/** Fixed display names (FR-MS1, ADR-025 §1): every member is numbered within its kind. */
export function sessionLabel(view: Pick<SessionView, 'kind' | 'ordinal'>): string {
  switch (view.kind) {
    case 'claude-code':
      return `Claude ${view.ordinal}`;
    case 'codex':
      return `Codex ${view.ordinal}`;
    case 'hermes':
      return `Hermes ${view.ordinal}`;
    case 'demo':
      return `데모 ${view.ordinal}`;
    case 'custom':
      return `에이전트 ${view.ordinal}`;
  }
}

/** How many members are in each part of the office summary (ADR-025 §5). */
export interface OfficeCounts {
  readonly total: number;
  readonly working: number;
  readonly waiting: number;
  readonly failing: number;
  readonly resting: number;
}

/** Which summary group a visual state counts in; offline members are not in the office. */
const OFFICE_GROUP: Readonly<Record<VisualState, Exclude<keyof OfficeCounts, 'total'> | null>> = Object.freeze({
  offline: null,
  idle: 'resting',
  success: 'resting',
  thinking: 'working',
  coding: 'working',
  browsing: 'working',
  terminal: 'working',
  'file-work': 'working',
  delegated: 'working',
  'waiting-approval': 'waiting',
  error: 'failing',
});

/** Pure: counts the present members by what they are doing. */
export function officeCounts(state: RoomViewState): OfficeCounts {
  const counts = { total: 0, working: 0, waiting: 0, failing: 0, resting: 0 };
  for (const view of Object.values(state.sessions)) {
    const group = OFFICE_GROUP[view.visual];
    if (group === null) continue;
    counts[group] += 1;
    counts.total += 1;
  }
  return counts;
}
