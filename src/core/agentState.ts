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
    default:
      return online;
  }
}

/** Pure reducer: (state, normalized event) → state (FR-E4). */
export function reduceAgentState(state: AgentViewState, event: AgentEvent): AgentViewState {
  const facts = applyFacts(state.facts, event);
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
