import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AgentEvent, AgentEventType, ToolCategory, ToolOutcome } from './agentEvent';
import type { AgentViewState } from './agentState';
import { initialAgentState, reduceAgentState } from './agentState';

let seq = 0;

/** Builds a valid event. Tests talk in facts, not in raw objects. */
function ev(
  type: AgentEventType,
  extra: { tool?: ToolCategory; outcome?: ToolOutcome; session?: string; seq?: number; at?: number } = {},
): AgentEvent {
  seq = extra.seq ?? seq + 1;
  const common = {
    schema: 'deskling.agent-event',
    version: 1,
    id: `e-${seq}`,
    seq,
    at: extra.at ?? 1_000 * seq,
    source: { kind: 'demo', session: extra.session ?? 's-1' },
  } as const;
  if (type === 'tool.started') return { ...common, type, tool: extra.tool ?? 'code' };
  if (type === 'tool.finished') return { ...common, type, tool: extra.tool ?? 'code', outcome: extra.outcome ?? 'ok' };
  return { ...common, type };
}

function run(...events: AgentEvent[]): AgentViewState {
  return events.reduce(reduceAgentState, initialAgentState);
}

function visuals(...events: AgentEvent[]): string[] {
  const out: string[] = [];
  events.reduce((state, event) => {
    const next = reduceAgentState(state, event);
    out.push(next.visual);
    return next;
  }, initialAgentState);
  return out;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

afterEach(() => {
  seq = 0;
  vi.useRealTimers();
});

describe('reduceAgentState — connection, turns and outcomes (FR-E4, FR-E6)', () => {
  it('starts offline with nothing known', () => {
    expect(initialAgentState.visual).toBe('offline');
    expect(initialAgentState.facts.connection).toBe('offline');
    expect(initialAgentState.session).toBeNull();
    expect(initialAgentState.updatedAt).toBeNull();
  });

  it('goes idle when the agent comes online', () => {
    const state = run(ev('agent.online'));
    expect(state.visual).toBe('idle');
    expect(state.facts.connection).toBe('online');
  });

  it('plays the core turn: online → thinking → success → idle', () => {
    expect(visuals(ev('agent.online'), ev('turn.started'), ev('turn.succeeded'), ev('agent.idle'))).toEqual([
      'idle',
      'thinking',
      'success',
      'idle',
    ]);
  });

  it('shows error when a turn fails and keeps it until the next event', () => {
    const state = run(ev('agent.online'), ev('turn.started'), ev('turn.failed'));
    expect(state.visual).toBe('error');
    expect(state.facts.turnActive).toBe(false);
  });

  it('clears the previous outcome when a new turn starts', () => {
    expect(run(ev('agent.online'), ev('turn.started'), ev('turn.failed'), ev('turn.started')).visual).toBe('thinking');
  });

  it('goes offline from any state', () => {
    const state = run(ev('agent.online'), ev('turn.started'), ev('agent.offline'));
    expect(state.visual).toBe('offline');
    expect(state.facts.turnActive).toBe(false);
  });

  it('treats any accepted event as proof of connection', () => {
    expect(run(ev('turn.started')).facts.connection).toBe('online');
  });

  it('remembers the session, source kind, last seq and observed time', () => {
    const state = run(ev('agent.online', { at: 42 }));
    expect(state).toMatchObject({ session: 's-1', sourceKind: 'demo', lastSeq: 1, updatedAt: 42 });
  });

  it('is pure: same input gives the same output and inputs are not mutated', () => {
    const events = deepFreeze([ev('agent.online'), ev('turn.started'), ev('turn.succeeded')]);
    const frozenStart = deepFreeze(structuredClone(initialAgentState));
    const a = events.reduce(reduceAgentState, frozenStart);
    const b = events.reduce(reduceAgentState, frozenStart);
    expect(a).toEqual(b);
  });

  it('does not depend on wall-clock time', () => {
    vi.useFakeTimers();
    const events = [ev('agent.online'), ev('turn.started'), ev('turn.succeeded')];
    vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
    const early = events.reduce(reduceAgentState, initialAgentState);
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    const late = events.reduce(reduceAgentState, initialAgentState);
    expect(late).toEqual(early);
  });
});
