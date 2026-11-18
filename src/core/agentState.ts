import type { AgentEvent, SourceKind, ToolCategory, ToolOutcome, AgentEventType, VisualState } from './agentEvent';
import { TOOL_VISUAL } from './agentEvent';

/** Facts the reducer tracks. Only events change them; time never does (ADR-004, FR-E6). */
export interface AgentFacts {
  readonly connection: 'offline' | 'online';
  readonly turnActive: boolean;
  /** Running tools, most recently started last. */
  readonly activeTools: readonly ToolCategory[];
  readonly pendingApprovals: number;
  readonly delegations: number;
  readonly lastOutcome: 'success' | 'error' | null;
}

/** One line in the activity panel. Only protocol enums — never free text (FR-P4). */
export interface RecentEntry {
  readonly id: string;
  readonly seq: number;
  readonly at: number;
  readonly type: AgentEventType;
  readonly tool?: ToolCategory;
  readonly outcome?: ToolOutcome;
}

export interface AgentViewState {
  readonly facts: AgentFacts;
  readonly visual: VisualState;
  readonly session: string | null;
  readonly sourceKind: SourceKind | null;
  readonly lastSeq: number | null;
  readonly updatedAt: number | null;
  /** Newest first. */
  readonly recent: readonly RecentEntry[];
}

const OFFLINE_FACTS: AgentFacts = Object.freeze({
  connection: 'offline',
  turnActive: false,
  activeTools: Object.freeze([]),
  pendingApprovals: 0,
  delegations: 0,
  lastOutcome: null,
});

export const initialAgentState: AgentViewState = Object.freeze({
  facts: OFFLINE_FACTS,
  visual: 'offline',
  session: null,
  sourceKind: null,
  lastSeq: null,
  updatedAt: null,
  recent: Object.freeze([]),
});

/** EVENT_PROTOCOL §5 — the first matching rule wins. */
export function deriveVisualState(facts: AgentFacts): VisualState {
  if (facts.connection === 'offline') return 'offline';
  if (facts.pendingApprovals > 0) return 'waiting-approval';
  const topTool = facts.activeTools[facts.activeTools.length - 1];
  if (topTool) return TOOL_VISUAL[topTool];
  if (facts.delegations > 0) return 'delegated';
  if (facts.turnActive) return 'thinking';
  if (facts.lastOutcome === 'success') return 'success';
  if (facts.lastOutcome === 'error') return 'error';
  return 'idle';
}

/** Facts reset when a turn ends or the agent goes idle/offline. */
function settled(connection: AgentFacts['connection'], lastOutcome: AgentFacts['lastOutcome']): AgentFacts {
  return { ...OFFLINE_FACTS, connection, lastOutcome };
}

/** Removes the most recently started tool of this category; unknown finishes change nothing. */
function withoutLatest(tools: readonly ToolCategory[], tool: ToolCategory): readonly ToolCategory[] {
  const index = tools.lastIndexOf(tool);
  return index === -1 ? tools : [...tools.slice(0, index), ...tools.slice(index + 1)];
}

function applyFacts(facts: AgentFacts, event: AgentEvent): AgentFacts {
  const online: AgentFacts = facts.connection === 'online' ? facts : { ...facts, connection: 'online' };
  switch (event.type) {
    case 'agent.offline':
      return OFFLINE_FACTS;
    case 'agent.online':
      return online;
    case 'agent.idle':
      return settled('online', null);
    case 'turn.started':
      return { ...online, turnActive: true, lastOutcome: null };
    case 'turn.succeeded':
      return settled('online', 'success');
    case 'turn.failed':
      return settled('online', 'error');
    case 'tool.started':
      return { ...online, activeTools: [...online.activeTools, event.tool] };
    case 'tool.finished':
      return { ...online, activeTools: withoutLatest(online.activeTools, event.tool) };
    case 'approval.requested':
      return { ...online, pendingApprovals: online.pendingApprovals + 1 };
    case 'approval.resolved':
      return { ...online, pendingApprovals: Math.max(0, online.pendingApprovals - 1) };
    case 'delegation.started':
      return { ...online, delegations: online.delegations + 1 };
    case 'delegation.finished':
      return { ...online, delegations: Math.max(0, online.delegations - 1) };
  }
}

/** Pure reducer: (state, normalized event) → state (FR-E4). */
export function reduceAgentState(state: AgentViewState, event: AgentEvent): AgentViewState {
  const sameSession = state.session === event.source.session;
  // FR-E5: duplicates and stale events within a session are ignored entirely.
  if (sameSession && state.lastSeq !== null && event.seq <= state.lastSeq) {
    return state;
  }
  // A new session starts from scratch; facts from another session are not carried over.
  const facts = applyFacts(sameSession ? state.facts : OFFLINE_FACTS, event);
  return {
    facts,
    visual: deriveVisualState(facts),
    session: event.source.session,
    sourceKind: event.source.kind,
    lastSeq: event.seq,
    updatedAt: event.at,
    recent: state.recent,
  };
}
