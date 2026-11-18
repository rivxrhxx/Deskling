import type { AgentEvent, AgentEventSource, SourceKind, VisualState } from './agentEvent';
import { GUEST_KINDS } from './agentEvent';
import type { AgentFacts, AgentViewState, RecentEntry, UsageSnapshot } from './agentState';
import { deriveVisualState, initialAgentState, RECENT_LIMIT, reduceAgentState } from './agentState';

/**
 * The whole room (ADR-022, EVENT_PROTOCOL §6 v3): one view per session, keyed by `${kind}:${session}`.
 * Resident kinds (demo/hermes/custom) drive Hermes; every guest session (claude-code/codex) is one friend.
 */

export type SessionKey = string;

export function sessionKey(source: AgentEventSource): SessionKey {
  return `${source.kind}:${source.session}`;
}

export interface SessionView {
  readonly key: SessionKey;
  readonly kind: SourceKind;
  readonly session: string;
  /** Guests: 1, 2, … within their kind while present. Residents: 0. */
  readonly ordinal: number;
  readonly facts: AgentFacts;
  readonly visual: VisualState;
  readonly lastSeq: number;
  readonly updatedAt: number;
  readonly usage: UsageSnapshot;
}

/** A recent-activity line with its session. `toKey` only on `session.message` (null = unknown receiver). */
export interface RoomEntry extends RecentEntry {
  readonly sessionKey: SessionKey;
  readonly kind: SourceKind;
  /** The session's ordinal when the entry was recorded. */
  readonly ordinal: number;
  readonly toKey?: SessionKey | null;
}

/** One `session.message` (ADR-023). `key` is assigned by the reducer and strictly increases. */
export interface Conversation {
  readonly key: number;
  readonly from: SessionKey;
  readonly to: SessionKey | null;
}

export interface RoomViewState {
  /** Present sessions: every online session, plus the resident session even when it is offline. */
  readonly sessions: Readonly<Record<SessionKey, SessionView>>;
  /** The resident-kind session that received an event most recently (may be offline: Hermes sleeps). */
  readonly residentKey: SessionKey | null;
  /** Present guest sessions in arrival order. */
  readonly guestKeys: readonly SessionKey[];
  /** All sessions merged, newest first, at most RECENT_LIMIT. */
  readonly recent: readonly RoomEntry[];
  /** How many entries have ever been recorded; the source of RoomEntry keys. */
  readonly entryCount: number;
  /** Accepted turn.succeeded across all sessions — the source of growth XP (ADR-018). */
  readonly completedTurns: number;
  /** Newest first, at most CONVERSATION_LIMIT. */
  readonly conversations: readonly Conversation[];
  readonly conversationCount: number;
  /** Last seq of sessions that left, oldest first, at most ENDED_CURSOR_LIMIT — late events stay ignored. */
  readonly endedCursors: Readonly<Record<SessionKey, number>>;
}

export const CONVERSATION_LIMIT = 8;
export const ENDED_CURSOR_LIMIT = 64;

export const initialRoomState: RoomViewState = Object.freeze({
  sessions: Object.freeze({}),
  residentKey: null,
  guestKeys: Object.freeze([]),
  recent: Object.freeze([]),
  entryCount: 0,
  completedTurns: 0,
  conversations: Object.freeze([]),
  conversationCount: 0,
  endedCursors: Object.freeze({}),
});

function isGuest(kind: SourceKind): boolean {
  return (GUEST_KINDS as readonly SourceKind[]).includes(kind);
}

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

function toEntry(event: AgentEvent, key: number, view: SessionView): RoomEntry {
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
    case 'session.message':
      return { ...entry, toKey: event.to ? sessionKey(event.to) : null };
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

  const guest = isGuest(event.source.kind);
  const view: SessionView = {
    key,
    kind: event.source.kind,
    session: event.source.session,
    ordinal: present ? present.ordinal : guest ? nextOrdinal(state.sessions, event.source.kind) : 0,
    ...advance(present, event),
    lastSeq: event.seq,
    updatedAt: event.at,
  };

  let sessions: Readonly<Record<SessionKey, SessionView>> = { ...state.sessions, [key]: view };
  // A session that re-joins is no longer ended: its live cursor takes over.
  let endedCursors = Object.hasOwn(state.endedCursors, key) ? without(state.endedCursors, key) : state.endedCursors;
  let { residentKey, guestKeys } = state;

  if (guest && event.type === 'agent.offline') {
    // A friend whose session ended walks out; its cursor keeps late events out.
    sessions = without(sessions, key);
    guestKeys = guestKeys.filter((k) => k !== key);
    endedCursors = withEnded(endedCursors, key, event.seq);
  } else if (guest) {
    if (!present) guestKeys = [...guestKeys, key];
  } else {
    // The latest resident session drives Hermes. One that is offline and no longer drives him leaves.
    const previous = residentKey === null ? undefined : sessions[residentKey];
    if (previous && previous.key !== key && previous.facts.connection === 'offline') {
      sessions = without(sessions, previous.key);
      endedCursors = withEnded(endedCursors, previous.key, previous.lastSeq);
    }
    residentKey = key;
  }

  const recorded = event.type !== 'usage.reported';
  const message = event.type === 'session.message';
  return {
    sessions,
    residentKey,
    guestKeys,
    recent: recorded
      ? [toEntry(event, state.entryCount + 1, view), ...state.recent].slice(0, RECENT_LIMIT)
      : state.recent,
    entryCount: state.entryCount + (recorded ? 1 : 0),
    completedTurns: state.completedTurns + (event.type === 'turn.succeeded' ? 1 : 0),
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

const NO_RESIDENT = Object.freeze({ visual: 'offline', usage: initialAgentState.usage, key: null } as const);

/** The resident (Hermes) as the existing UI expects: visual 'offline' + empty usage when there is none. */
export function residentView(state: RoomViewState): {
  readonly visual: VisualState;
  readonly usage: UsageSnapshot;
  readonly key: SessionKey | null;
} {
  const resident = state.residentKey === null ? undefined : state.sessions[state.residentKey];
  return resident ? { visual: resident.visual, usage: resident.usage, key: resident.key } : NO_RESIDENT;
}

/** Fixed display names (FR-MS1): residents are Hermes, guests are numbered within their kind. */
export function sessionLabel(view: Pick<SessionView, 'kind' | 'ordinal'>): string {
  switch (view.kind) {
    case 'claude-code':
      return `Claude ${view.ordinal}`;
    case 'codex':
      return `Codex ${view.ordinal}`;
    case 'demo':
    case 'hermes':
    case 'custom':
      return '헤르메스';
  }
}
