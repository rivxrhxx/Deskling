import type { PlainEventType, ToolCategory, ToolOutcome, UsageReport } from '../../core/agentEvent';
import { AGENT_EVENT_SCHEMA, AGENT_EVENT_VERSION } from '../../core/agentEvent';

/**
 * Deterministic demo scripts (ADR-005). Pure data: what happens, in which order, for how long.
 * The demo never claims to be a real agent — the app always shows a DEMO badge while it runs.
 */

export type DemoEventSpec =
  | { readonly type: PlainEventType }
  | { readonly type: 'tool.started'; readonly tool: ToolCategory }
  | { readonly type: 'tool.finished'; readonly tool: ToolCategory; readonly outcome: ToolOutcome }
  | { readonly type: 'usage.reported'; readonly usage: UsageReport };

export interface DemoStep {
  /** Events emitted together at the start of the step. */
  readonly events: readonly DemoEventSpec[];
  /** How long the step is shown before the next one starts. */
  readonly dwellMs: number;
}

export interface DemoScript {
  readonly id: string;
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
 * "하루 일과": a day in the room (ADR-016, ADR-017). Hermes' own routine around the room, a working turn that burns through the
 * token budget while the context window fills up (calm → annoyed → angry → furious), back to his routine, exhausted
 * after the context is compacted, then lights out (offline: asleep in bed). With the default 200k budget it visits every energy level.
 */
const life: DemoScript = {
  id: 'life',
  session: 'demo-life',
  steps: [
    step(4200, { type: 'agent.online' }, usage(10_000, 8_000)), // idle (own routine around the room) — full, calm
    step(3000, { type: 'turn.started' }, usage(30_000, 60_000)), // thinking — full, calm
    step(3600, toolStart('code'), usage(70_000, 110_000)), // coding — full, annoyed
    step(3600, toolDone('code'), toolStart('terminal'), usage(115_000, 160_000)), // terminal — ok, angry
    step(3600, toolDone('terminal'), toolStart('browser'), usage(150_000, 185_000)), // browsing — low, furious
    step(3000, toolDone('browser'), { type: 'turn.succeeded' }, usage(185_000, 192_000)), // success — empty, furious
    step(4200, { type: 'agent.idle' }, contextOnly(20_000)), // idle again (routine) — empty, calm again
    step(4200, { type: 'agent.offline' }), // lights out
  ],
};

export const DEMO_SCRIPTS = { core, tour, life } as const satisfies Record<string, DemoScript>;
export type DemoScriptId = keyof typeof DEMO_SCRIPTS;
export const DEMO_SCRIPT_IDS = Object.keys(DEMO_SCRIPTS) as DemoScriptId[];

/** Turns a spec into a raw protocol object. It still goes through normalizeAgentEvent like any provider event. */
export function demoEvent(
  spec: DemoEventSpec,
  meta: { readonly session: string; readonly seq: number; readonly at: number },
): Record<string, unknown> {
  return {
    schema: AGENT_EVENT_SCHEMA,
    version: AGENT_EVENT_VERSION,
    id: `${meta.session}-${String(meta.seq).padStart(4, '0')}`,
    seq: meta.seq,
    at: meta.at,
    source: { kind: 'demo', session: meta.session },
    ...spec,
  };
}
