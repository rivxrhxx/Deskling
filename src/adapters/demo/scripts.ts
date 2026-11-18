import type { PlainEventType, ToolCategory, ToolOutcome } from '../../core/agentEvent';
import { AGENT_EVENT_SCHEMA, AGENT_EVENT_VERSION } from '../../core/agentEvent';

/**
 * Deterministic demo scripts (ADR-005). Pure data: what happens, in which order, for how long.
 * The demo never claims to be a real agent — the app always shows a DEMO badge while it runs.
 */

export type DemoEventSpec =
  | { readonly type: PlainEventType }
  | { readonly type: 'tool.started'; readonly tool: ToolCategory }
  | { readonly type: 'tool.finished'; readonly tool: ToolCategory; readonly outcome: ToolOutcome };

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

/** The first vertical slice: idle → thinking → coding → terminal → success → idle (FR-D2). */
const core: DemoScript = {
  id: 'core',
  session: 'demo-core',
  steps: [
    step(2400, { type: 'agent.online' }),
    step(2400, { type: 'turn.started' }),
    step(3600, toolStart('code')),
    step(3600, toolDone('code'), toolStart('terminal')),
    step(2800, toolDone('terminal'), { type: 'turn.succeeded' }),
    step(1600, { type: 'agent.idle' }),
  ],
};

export const DEMO_SCRIPTS = { core } as const satisfies Record<string, DemoScript>;

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
