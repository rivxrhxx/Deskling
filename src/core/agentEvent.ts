/**
 * AgentEvent v1 — the only input Deskling understands. Provider-neutral.
 * Source of truth for docs/EVENT_PROTOCOL.md; change both in the same commit.
 *
 * v1 deliberately has no free-text fields: events say *what kind* of thing happened,
 * never *what* the agent is reading, writing, running or thinking (ADR-003).
 */

export const AGENT_EVENT_SCHEMA = 'deskling.agent-event';
export const AGENT_EVENT_VERSION = 1;

export const SOURCE_KINDS = ['demo', 'hermes', 'custom'] as const;
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
  readonly version: typeof AGENT_EVENT_VERSION;
  readonly id: string;
  readonly seq: number;
  /** Unix epoch milliseconds when the provider observed the fact. */
  readonly at: number;
  readonly source: AgentEventSource;
}

export type PlainEventType = Exclude<AgentEventType, 'tool.started' | 'tool.finished'>;

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

export type AgentEvent = PlainAgentEvent | ToolStartedEvent | ToolFinishedEvent;
