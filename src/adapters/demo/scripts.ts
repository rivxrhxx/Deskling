import type { AgentEventSource, PlainEventType, ToolCategory, ToolOutcome, UsageReport } from '../../core/agentEvent';
import { AGENT_EVENT_SCHEMA, AGENT_EVENT_VERSION } from '../../core/agentEvent';

/**
 * Deterministic demo scripts (ADR-005). Pure data: what happens, in which order, for how long.
 * The demo never claims to be a real agent — the app always shows a DEMO badge while it runs.
 */

export type DemoEventBody =
  | { readonly type: PlainEventType }
  | { readonly type: 'tool.started'; readonly tool: ToolCategory }
  | { readonly type: 'tool.finished'; readonly tool: ToolCategory; readonly outcome: ToolOutcome }
  | { readonly type: 'usage.reported'; readonly usage: UsageReport }
  | { readonly type: 'session.message'; readonly to?: AgentEventSource };

/** A scripted event. Without its own `source` it belongs to the script's session, as kind `demo`. */
export type DemoEventSpec = DemoEventBody & { readonly source?: AgentEventSource };

export interface DemoStep {
  /** Events emitted together at the start of the step. */
  readonly events: readonly DemoEventSpec[];
  /** How long the step is shown before the next one starts. */
  readonly dwellMs: number;
}

export interface DemoScript {
  readonly id: string;
  /** The session of events that name no source of their own. */
  readonly session: string;
  readonly steps: readonly DemoStep[];
}

const step = (dwellMs: number, ...events: DemoEventSpec[]): DemoStep => ({ events, dwellMs });
const toolStart = (tool: ToolCategory): DemoEventSpec => ({ type: 'tool.started', tool });
const toolDone = (tool: ToolCategory, outcome: ToolOutcome = 'ok'): DemoEventSpec => ({
  type: 'tool.finished',
  tool,
  outcome,
});

/** A usage report (ADR-016). Context limit defaults to a 200k window. */
const usage = (tokensUsed: number, contextUsed?: number, contextLimit = 200_000): DemoEventSpec => ({
  type: 'usage.reported',
  usage: {
    tokens: { used: tokensUsed },
    ...(contextUsed === undefined ? {} : { context: { used: contextUsed, limit: contextLimit } }),
  },
});

/** Context only — e.g. after the agent compacts its context window. */
const contextOnly = (contextUsed: number, contextLimit = 200_000): DemoEventSpec => ({
  type: 'usage.reported',
  usage: { context: { used: contextUsed, limit: contextLimit } },
});

/** The first vertical slice: idle → thinking → coding → terminal → success → idle (FR-D2). */
const core: DemoScript = {
  id: 'core',
  session: 'demo-core',
  steps: [
    step(2400, { type: 'agent.online' }, usage(2_000, 3_000)),
    step(2400, { type: 'turn.started' }, usage(8_000, 14_000)),
    step(3600, toolStart('code'), usage(26_000, 52_000)),
    step(3600, toolDone('code'), toolStart('terminal'), usage(41_000, 88_000)),
    step(2800, toolDone('terminal'), { type: 'turn.succeeded' }, usage(48_000, 96_000)),
    step(1600, { type: 'agent.idle' }),
  ],
};

/** Every visual state, in protocol order (FR-D3). Each step is a plausible sequence of real event kinds. */
const tour: DemoScript = {
  id: 'tour',
  session: 'demo-tour',
  steps: [
    step(2400, { type: 'agent.offline' }), // offline
    step(2400, { type: 'agent.online' }, usage(5_000, 6_000)), // idle
    step(2400, { type: 'turn.started' }, usage(20_000, 30_000)), // thinking
    step(3000, toolStart('code'), usage(50_000, 70_000)), // coding
    step(3000, toolDone('code'), toolStart('browser'), usage(80_000, 105_000)), // browsing
    step(3000, toolDone('browser'), toolStart('terminal'), usage(105_000, 130_000)), // terminal
    step(3000, toolDone('terminal'), toolStart('file'), usage(125_000, 150_000)), // file-work
    step(3200, toolDone('file'), { type: 'approval.requested' }, usage(140_000, 160_000)), // waiting-approval
    step(3200, { type: 'approval.resolved' }, { type: 'delegation.started' }, usage(160_000, 175_000)), // delegated
    step(2800, { type: 'delegation.finished' }, { type: 'turn.succeeded' }, usage(175_000, 182_000)), // success
    step(2800, { type: 'turn.started' }, { type: 'turn.failed' }, usage(192_000, 194_000)), // error
  ],
};

/**
 * "하루 일과": one member's day (ADR-016, ADR-025). A rest in the lounge, a working turn that burns through the
 * token budget while the context window fills up (calm → annoyed → angry → furious), back to the lounge, exhausted
 * after the context is compacted, then home (offline: out of the door). With the default 200k budget it visits every energy level.
 */
const life: DemoScript = {
  id: 'life',
  session: 'demo-life',
  steps: [
    step(4200, { type: 'agent.online' }, usage(10_000, 8_000)), // idle (resting in the lounge) — full, calm
    step(3000, { type: 'turn.started' }, usage(30_000, 60_000)), // thinking — full, calm
    step(3600, toolStart('code'), usage(70_000, 110_000)), // coding — full, annoyed
    step(3600, toolDone('code'), toolStart('terminal'), usage(115_000, 160_000)), // terminal — ok, angry
    step(3600, toolDone('terminal'), toolStart('browser'), usage(150_000, 185_000)), // browsing — low, furious
    step(3000, toolDone('browser'), { type: 'turn.succeeded' }, usage(185_000, 192_000)), // success — empty, furious
    step(4200, { type: 'agent.idle' }, contextOnly(20_000)), // idle again (lounge) — empty, calm again
    step(4200, { type: 'agent.offline' }), // goes home: the office is empty, lights out
  ],
};

const CLAUDE_1: AgentEventSource = { kind: 'claude-code', session: 'demo-claude-a' };
const CLAUDE_2: AgentEventSource = { kind: 'claude-code', session: 'demo-claude-b' };
const CLAUDE_3: AgentEventSource = { kind: 'claude-code', session: 'demo-claude-c' };
const CODEX_1: AgentEventSource = { kind: 'codex', session: 'demo-codex-a' };
const CODEX_2: AgentEventSource = { kind: 'codex', session: 'demo-codex-b' };
const AGENT_1: AgentEventSource = { kind: 'custom', session: 'demo-agent-a' };

/** The same specs, from another session. */
const by = (source: AgentEventSource, ...specs: DemoEventBody[]): DemoEventSpec[] => specs.map((spec) => ({ ...spec, source }));
const message = (from: AgentEventSource, to?: AgentEventSource): DemoEventSpec =>
  to ? { type: 'session.message', source: from, to } : { type: 'session.message', source: from };

/**
 * "사무실 하루" (ADR-025, ADR-023, FR-MS7): six sessions — Claude ×3, Codex ×2 and one other agent — arrive one after
 * another, work at their desks, talk, rest in the lounge and come back, need the user, delegate, succeed or fail,
 * and leave one by one until the lights go out. Claude sessions report no usage, as in real life (FR-CC6).
 * Every beat stays on screen for at least 3 s; the loop lasts about 1½ minutes.
 */
const office: DemoScript = {
  id: 'office',
  session: 'demo-office',
  steps: [
    step(4000, ...by(CLAUDE_1, { type: 'agent.online' }, { type: 'turn.started' }, toolStart('code'))), // Claude 1 comes in to code
    step(4000, ...by(CODEX_1, { type: 'agent.online' }, { type: 'turn.started' }, usage(20_000, 24_000))), // Codex 1 comes in, thinking
    step(4000, ...by(CLAUDE_2, { type: 'agent.online' }, { type: 'turn.started' }, toolStart('browser')), ...by(CODEX_1, toolStart('terminal'))), // Claude 2 browses, Codex 1 in the terminal
    step(4500, message(CLAUDE_1, CODEX_1)), // Claude 1 and Codex 1 talk
    step(4000, ...by(AGENT_1, { type: 'agent.online' }, { type: 'turn.started' }, toolStart('file'), usage(15_000, 12_000)), ...by(CLAUDE_2, toolDone('browser'), { type: 'turn.succeeded' })), // 에이전트 1 files; Claude 2 is done (cheers)
    step(4000, ...by(CODEX_2, { type: 'agent.online' }, { type: 'turn.started' }, usage(150_000, 172_000)), ...by(CLAUDE_2, { type: 'agent.idle' })), // Codex 2 comes in tired and cross; Claude 2 idles → lounge
    step(4000, ...by(CODEX_1, toolDone('terminal'), { type: 'approval.requested' }, usage(50_000, 70_000))), // Codex 1 waves for approval
    step(4000, ...by(CLAUDE_3, { type: 'agent.online' }, { type: 'turn.started' }, toolStart('terminal'))), // Claude 3 comes in
    step(4000, ...by(CODEX_1, { type: 'approval.resolved' }, toolStart('terminal'))), // resolved, back to work
    step(4000, ...by(AGENT_1, toolDone('file'), { type: 'delegation.started' }, usage(40_000, 90_000))), // 에이전트 1 hands work to a helper bot
    step(4000, ...by(CODEX_2, toolStart('code'))), // Codex 2 codes
    step(4000, ...by(CLAUDE_2, { type: 'turn.started' }, toolStart('code'))), // Claude 2 leaves the lounge for its desk
    step(4000, ...by(CLAUDE_3, toolDone('terminal', 'error'), { type: 'turn.failed' })), // Claude 3 fails
    step(3500, message(CLAUDE_1)), // Claude 1 sends a letter to someone not in the office
    step(4000, ...by(AGENT_1, { type: 'delegation.finished' }, { type: 'turn.succeeded' }, usage(55_000, 100_000))), // 에이전트 1 is done (cheers)
    step(4000, ...by(CODEX_1, toolDone('terminal'), { type: 'turn.succeeded' }, usage(70_000, 92_000))), // Codex 1 is done (cheers)
    step(4000, ...by(CLAUDE_3, { type: 'agent.offline' })), // Claude 3 leaves
    step(4000, ...by(CODEX_2, toolDone('code'), { type: 'turn.succeeded' }), ...by(CLAUDE_1, toolDone('code'), { type: 'turn.succeeded' })), // two more done
    step(4000, ...by(CODEX_1, { type: 'agent.offline' })), // Codex 1 leaves
    step(4000, ...by(AGENT_1, { type: 'agent.offline' }), ...by(CLAUDE_2, toolDone('code'), { type: 'turn.succeeded' })), // 에이전트 1 leaves; Claude 2 is done
    step(4000, ...by(CODEX_2, { type: 'agent.offline' })), // Codex 2 leaves
    step(4000, ...by(CLAUDE_2, { type: 'agent.offline' })), // Claude 2 leaves
    step(6000, ...by(CLAUDE_1, { type: 'agent.offline' })), // Claude 1 leaves last: the office empties and its lights go out
  ],
};

export const DEMO_SCRIPTS = { office, core, tour, life } as const satisfies Record<string, DemoScript>;
export type DemoScriptId = keyof typeof DEMO_SCRIPTS;
export const DEMO_SCRIPT_IDS = Object.keys(DEMO_SCRIPTS) as DemoScriptId[];

/** The session an event belongs to: its own, or the script's demo session. */
export function demoEventSource(spec: DemoEventSpec, session: string): AgentEventSource {
  return spec.source ?? { kind: 'demo', session };
}

/** Turns a spec into a raw protocol object. It still goes through normalizeAgentEvent like any provider event. */
export function demoEvent(
  spec: DemoEventSpec,
  meta: { readonly session: string; readonly seq: number; readonly at: number },
): Record<string, unknown> {
  const source = demoEventSource(spec, meta.session);
  return {
    ...spec,
    schema: AGENT_EVENT_SCHEMA,
    version: AGENT_EVENT_VERSION,
    id: `${source.session}-${String(meta.seq).padStart(4, '0')}`,
    seq: meta.seq,
    at: meta.at,
    source,
  };
}
