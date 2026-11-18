/**
 * AgentEvent v3 — the only input Deskling understands. Provider-neutral.
 * Source of truth for docs/EVENT_PROTOCOL.md; change both in the same commit.
 *
 * The protocol deliberately has no free-text fields: events say *what kind* of thing happened,
 * never *what* the agent is reading, writing, running or thinking (ADR-003).
 * v2 adds `usage.reported`, which carries token and context counts only (ADR-016).
 * v3 adds the session-friend kinds `claude-code`/`codex` (ADR-022) and `session.message` (ADR-023).
 */

export const AGENT_EVENT_SCHEMA = 'deskling.agent-event';
/** Accepted protocol versions. v2 adds `usage.reported` (ADR-016), v3 session friends and messages (ADR-022/023). */
export const AGENT_EVENT_VERSIONS = [1, 2, 3] as const;
export type AgentEventVersion = (typeof AGENT_EVENT_VERSIONS)[number];
/** The version Deskling's own demo source emits. */
export const AGENT_EVENT_VERSION: AgentEventVersion = 3;

/** Kinds whose sessions drive the resident, Hermes — the most recently updated one wins (ADR-022). */
export const RESIDENT_KINDS = ['demo', 'hermes', 'custom'] as const;
export type ResidentKind = (typeof RESIDENT_KINDS)[number];
/** Kinds whose sessions each bring one friend into the room (v3 only, ADR-022). */
export const GUEST_KINDS = ['claude-code', 'codex'] as const;
export type GuestKind = (typeof GUEST_KINDS)[number];

export const SOURCE_KINDS = [...RESIDENT_KINDS, ...GUEST_KINDS] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const TOOL_CATEGORIES = ['code', 'browser', 'terminal', 'file'] as const;
export type ToolCategory = (typeof TOOL_CATEGORIES)[number];

export const TOOL_OUTCOMES = ['ok', 'error'] as const;
export type ToolOutcome = (typeof TOOL_OUTCOMES)[number];

export const EVENT_TYPES = [
  'agent.online',
  'agent.offline',
  'agent.idle',
  'turn.started',
  'tool.started',
  'tool.finished',
  'approval.requested',
  'approval.resolved',
  'delegation.started',
  'delegation.finished',
  'turn.succeeded',
  'turn.failed',
  'usage.reported',
  'session.message',
] as const;
export type AgentEventType = (typeof EVENT_TYPES)[number];

/** Every state the workshop can show. Derived by the reducer, never sent by providers. */
export const VISUAL_STATES = [
  'offline',
  'idle',
  'thinking',
  'coding',
  'browsing',
  'terminal',
  'file-work',
  'waiting-approval',
  'delegated',
  'success',
  'error',
] as const;
export type VisualState = (typeof VISUAL_STATES)[number];

export const TOOL_VISUAL: Readonly<Record<ToolCategory, VisualState>> = Object.freeze({
  code: 'coding',
  browser: 'browsing',
  terminal: 'terminal',
  file: 'file-work',
});

export interface AgentEventSource {
  readonly kind: SourceKind;
  /** Opaque session identifier. Carries no content. */
  readonly session: string;
}

interface AgentEventBase {
  readonly schema: typeof AGENT_EVENT_SCHEMA;
  readonly version: AgentEventVersion;
  readonly id: string;
  readonly seq: number;
  /** Unix epoch milliseconds when the provider observed the fact. */
  readonly at: number;
  readonly source: AgentEventSource;
}

export type PlainEventType = Exclude<
  AgentEventType,
  'tool.started' | 'tool.finished' | 'usage.reported' | 'session.message'
>;

export interface PlainAgentEvent extends AgentEventBase {
  readonly type: PlainEventType;
}

export interface ToolStartedEvent extends AgentEventBase {
  readonly type: 'tool.started';
  readonly tool: ToolCategory;
}

export interface ToolFinishedEvent extends AgentEventBase {
  readonly type: 'tool.finished';
  readonly tool: ToolCategory;
  readonly outcome: ToolOutcome;
}

/** Numbers only: how many tokens the session used and how full the context window is (v2). */
export interface UsageReport {
  readonly tokens?: { readonly used: number };
  readonly context?: { readonly used: number; readonly limit: number };
}

export interface UsageReportedEvent extends AgentEventBase {
  readonly type: 'usage.reported';
  readonly usage: UsageReport;
}

/** This session sent a message to another session (v3, ADR-023). The fact only — no body, title or length. */
export interface SessionMessageEvent extends AgentEventBase {
  readonly type: 'session.message';
  /** The receiving session, when the provider knows it. */
  readonly to?: AgentEventSource;
}

export type AgentEvent =
  | PlainAgentEvent
  | ToolStartedEvent
  | ToolFinishedEvent
  | UsageReportedEvent
  | SessionMessageEvent;
