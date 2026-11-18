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

describe('reduceAgentState — tools, approvals and delegation (EVENT_PROTOCOL §5)', () => {
  it.each([
    ['code', 'coding'],
    ['browser', 'browsing'],
    ['terminal', 'terminal'],
    ['file', 'file-work'],
  ] as const)('shows tool %s as %s', (tool, visual) => {
    expect(run(ev('agent.online'), ev('turn.started'), ev('tool.started', { tool })).visual).toBe(visual);
  });

  it('returns to thinking when the only tool finishes during a turn', () => {
    expect(
      visuals(ev('agent.online'), ev('turn.started'), ev('tool.started', { tool: 'code' }), ev('tool.finished', { tool: 'code' })),
    ).toEqual(['idle', 'thinking', 'coding', 'thinking']);
  });

  it('also returns to thinking after a failed tool — a tool error is not a failed turn', () => {
    const state = run(
      ev('turn.started'),
      ev('tool.started', { tool: 'terminal' }),
      ev('tool.finished', { tool: 'terminal', outcome: 'error' }),
    );
    expect(state.visual).toBe('thinking');
  });

  it('shows the most recently started of overlapping tools', () => {
    expect(
      visuals(
        ev('turn.started'),
        ev('tool.started', { tool: 'code' }),
        ev('tool.started', { tool: 'terminal' }),
        ev('tool.finished', { tool: 'terminal' }),
        ev('tool.finished', { tool: 'code' }),
      ),
    ).toEqual(['thinking', 'coding', 'terminal', 'coding', 'thinking']);
  });

  it('removes the latest matching tool when the same category runs twice', () => {
    const state = run(
      ev('turn.started'),
      ev('tool.started', { tool: 'file' }),
      ev('tool.started', { tool: 'code' }),
      ev('tool.started', { tool: 'file' }),
      ev('tool.finished', { tool: 'file' }),
    );
    expect(state.facts.activeTools).toEqual(['file', 'code']);
    expect(state.visual).toBe('coding');
  });

  it('ignores a finish for a tool that is not running', () => {
    const state = run(ev('turn.started'), ev('tool.started', { tool: 'code' }), ev('tool.finished', { tool: 'browser' }));
    expect(state.facts.activeTools).toEqual(['code']);
    expect(state.visual).toBe('coding');
  });

  it('shows a tool even if no turn.started was observed, then idles when it ends', () => {
    expect(visuals(ev('agent.online'), ev('tool.started', { tool: 'browser' }), ev('tool.finished', { tool: 'browser' }))).toEqual([
      'idle',
      'browsing',
      'idle',
    ]);
  });

  it('puts a pending approval above any running tool', () => {
    expect(
      visuals(ev('turn.started'), ev('tool.started', { tool: 'terminal' }), ev('approval.requested'), ev('approval.resolved')),
    ).toEqual(['thinking', 'terminal', 'waiting-approval', 'terminal']);
  });

  it('keeps waiting while any approval is still pending', () => {
    const state = run(ev('turn.started'), ev('approval.requested'), ev('approval.requested'), ev('approval.resolved'));
    expect(state.facts.pendingApprovals).toBe(1);
    expect(state.visual).toBe('waiting-approval');
  });

  it('never lets counters go below zero', () => {
    const state = run(ev('turn.started'), ev('approval.resolved'), ev('delegation.finished'));
    expect(state.facts.pendingApprovals).toBe(0);
    expect(state.facts.delegations).toBe(0);
    expect(state.visual).toBe('thinking');
  });

  it('shows delegated while a sub-agent works, under any own tool', () => {
    expect(
      visuals(
        ev('turn.started'),
        ev('delegation.started'),
        ev('tool.started', { tool: 'file' }),
        ev('tool.finished', { tool: 'file' }),
        ev('delegation.finished'),
      ),
    ).toEqual(['thinking', 'delegated', 'file-work', 'delegated', 'thinking']);
  });

  it.each(['turn.succeeded', 'turn.failed', 'agent.idle', 'agent.offline'] as const)(
    '%s clears tools, approvals and delegations',
    (type) => {
      const state = run(
        ev('turn.started'),
        ev('tool.started', { tool: 'code' }),
        ev('approval.requested'),
        ev('delegation.started'),
        ev(type),
      );
      expect(state.facts).toMatchObject({ activeTools: [], pendingApprovals: 0, delegations: 0, turnActive: false });
    },
  );
});

describe('reduceAgentState — ordering and sessions (FR-E5)', () => {
  it('ignores a duplicate seq within a session and returns the same state', () => {
    const state = run(ev('agent.online', { seq: 1 }), ev('turn.started', { seq: 2 }));
    const replayed = reduceAgentState(state, ev('turn.succeeded', { seq: 2 }));
    expect(replayed).toBe(state);
  });

  it('ignores an out-of-order (older) seq within a session', () => {
    const state = run(ev('agent.online', { seq: 5 }), ev('turn.started', { seq: 6 }));
    expect(reduceAgentState(state, ev('agent.offline', { seq: 3 }))).toBe(state);
  });

  it('accepts gaps in seq', () => {
    expect(run(ev('agent.online', { seq: 1 }), ev('turn.started', { seq: 10 })).lastSeq).toBe(10);
  });

  it('accepts a new session even with a lower seq and resets the previous session facts', () => {
    const before = run(
      ev('agent.online', { session: 'a', seq: 50 }),
      ev('turn.started', { session: 'a', seq: 51 }),
      ev('tool.started', { session: 'a', seq: 52, tool: 'code' }),
      ev('approval.requested', { session: 'a', seq: 53 }),
    );
    expect(before.visual).toBe('waiting-approval');

    const after = reduceAgentState(before, ev('agent.online', { session: 'b', seq: 1 }));
    expect(after.session).toBe('b');
    expect(after.lastSeq).toBe(1);
    expect(after.facts).toMatchObject({ connection: 'online', activeTools: [], pendingApprovals: 0, turnActive: false });
    expect(after.visual).toBe('idle');
  });

  it('drops the previous session outcome on a session change', () => {
    const before = run(ev('turn.started', { session: 'a' }), ev('turn.succeeded', { session: 'a' }));
    expect(reduceAgentState(before, ev('agent.online', { session: 'b', seq: 1 })).visual).toBe('idle');
  });
});

describe('reduceAgentState — recent activity (FR-P2)', () => {
  it('records accepted events newest first with protocol enums only', () => {
    const state = run(
      ev('agent.online', { at: 10 }),
      ev('tool.started', { tool: 'terminal', at: 20 }),
      ev('tool.finished', { tool: 'terminal', outcome: 'error', at: 30 }),
    );
    expect(state.recent).toEqual([
      { id: 'e-3', seq: 3, at: 30, type: 'tool.finished', tool: 'terminal', outcome: 'error' },
      { id: 'e-2', seq: 2, at: 20, type: 'tool.started', tool: 'terminal' },
      { id: 'e-1', seq: 1, at: 10, type: 'agent.online' },
    ]);
  });

  it(`keeps at most ${12} entries`, () => {
    const events = [ev('agent.online')];
    for (let i = 0; i < 20; i += 1) events.push(ev(i % 2 === 0 ? 'turn.started' : 'turn.succeeded'));
    const state = run(...events);
    expect(state.recent).toHaveLength(12);
    expect(state.recent[0]?.seq).toBe(21);
    expect(state.recent[11]?.seq).toBe(10);
  });

  it('does not record ignored events', () => {
    const state = run(ev('agent.online', { seq: 4 }));
    expect(reduceAgentState(state, ev('turn.started', { seq: 4 })).recent).toHaveLength(1);
  });

  it('keeps recent activity across a session change', () => {
    const state = run(ev('agent.online', { session: 'a' }), ev('agent.online', { session: 'b', seq: 1 }));
    expect(state.recent.map((entry) => entry.type)).toEqual(['agent.online', 'agent.online']);
  });
});
