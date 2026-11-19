import { afterEach, describe, expect, it } from 'vitest';
import type {
  AgentEvent,
  AgentEventSource,
  AgentEventType,
  SourceKind,
  ToolCategory,
  ToolOutcome,
  UsageReport,
  VisualState,
} from './agentEvent';
import { SOURCE_KINDS, VISUAL_STATES } from './agentEvent';
import { RECENT_LIMIT } from './agentState';
import type { OfficeCounts, RoomViewState } from './roomState';
import {
  CONVERSATION_LIMIT,
  ENDED_CURSOR_LIMIT,
  initialRoomState,
  officeCounts,
  reduceRoom,
  sessionKey,
  sessionLabel,
} from './roomState';

const HERMES = { kind: 'hermes', session: 'h-1' } as const;
const DEMO = { kind: 'demo', session: 'demo-1' } as const;
const CUSTOM = { kind: 'custom', session: 'c-1' } as const;
const of = (kind: SourceKind, session: string): AgentEventSource => ({ kind, session });
const claude = (session: string): AgentEventSource => of('claude-code', session);
const codex = (session: string): AgentEventSource => of('codex', session);

let clock = 0;
const seqs = new Map<string, number>();

interface Extra {
  readonly seq?: number;
  readonly at?: number;
  readonly tool?: ToolCategory;
  readonly outcome?: ToolOutcome;
  readonly to?: AgentEventSource;
  readonly usage?: UsageReport;
}

/** A valid v3 event. Each session counts its own seq unless the test pins one. */
function ev(source: AgentEventSource, type: AgentEventType, extra: Extra = {}): AgentEvent {
  const key = `${source.kind}:${source.session}`;
  const last = seqs.get(key) ?? 0;
  const seq = extra.seq ?? last + 1;
  seqs.set(key, Math.max(seq, last));
  clock += 1_000;
  const common = {
    schema: 'deskling.agent-event',
    version: 3,
    id: `e-${clock}`,
    seq,
    at: extra.at ?? clock,
    source,
  } as const;
  switch (type) {
    case 'tool.started':
      return { ...common, type, tool: extra.tool ?? 'code' };
    case 'tool.finished':
      return { ...common, type, tool: extra.tool ?? 'code', outcome: extra.outcome ?? 'ok' };
    case 'usage.reported':
      return { ...common, type, usage: extra.usage ?? { tokens: { used: 1 } } };
    case 'session.message':
      return extra.to ? { ...common, type, to: extra.to } : { ...common, type };
    default:
      return { ...common, type };
  }
}

function run(...events: AgentEvent[]): RoomViewState {
  return events.reduce(reduceRoom, initialRoomState);
}

function view(state: RoomViewState, source: AgentEventSource) {
  const found = state.sessions[sessionKey(source)];
  if (!found) throw new Error(`no session ${sessionKey(source)}`);
  return found;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

afterEach(() => {
  clock = 0;
  seqs.clear();
});

describe('reduceRoom — per-session cursors, facts and usage (FR-MS4, EVENT_PROTOCOL §6)', () => {
  it('starts with an empty, frozen office and no resident', () => {
    expect(initialRoomState).toEqual({
      sessions: {},
      memberKeys: [],
      recent: [],
      entryCount: 0,
      completedTurns: 0,
      conversations: [],
      conversationCount: 0,
      endedCursors: {},
    });
    expect(Object.isFrozen(initialRoomState)).toBe(true);
    expect(Object.isFrozen(initialRoomState.sessions)).toBe(true);
    expect(Object.isFrozen(initialRoomState.memberKeys)).toBe(true);
    expect(Object.isFrozen(initialRoomState.recent)).toBe(true);
  });

  it('keys a session by kind and session id, so equal ids of different kinds are different sessions', () => {
    expect(sessionKey({ kind: 'codex', session: 'a-1' })).toBe('codex:a-1');
    const state = run(ev(claude('same'), 'turn.started'), ev(codex('same'), 'agent.online'), ev(of('hermes', 'same'), 'agent.online'));
    expect(Object.keys(state.sessions)).toEqual(['claude-code:same', 'codex:same', 'hermes:same']);
    expect(view(state, claude('same')).visual).toBe('thinking');
    expect(view(state, codex('same')).visual).toBe('idle');
  });

  it('does not reset a session when events of several sessions interleave', () => {
    const state = run(
      ev(HERMES, 'turn.started'),
      ev(claude('a'), 'turn.started'),
      ev(HERMES, 'tool.started', { tool: 'terminal' }),
      ev(claude('a'), 'tool.started', { tool: 'browser' }),
      ev(codex('x'), 'approval.requested'),
      ev(claude('a'), 'approval.requested'),
      ev(HERMES, 'delegation.started'),
      ev(claude('a'), 'approval.resolved'),
    );
    expect(view(state, HERMES).visual).toBe('terminal');
    expect(view(state, HERMES).facts).toEqual({
      connection: 'online',
      turnActive: true,
      activeTools: ['terminal'],
      pendingApprovals: 0,
      delegations: 1,
      lastOutcome: null,
    });
    expect(view(state, claude('a')).visual).toBe('browsing');
    expect(view(state, claude('a')).facts.activeTools).toEqual(['browser']);
    expect(view(state, codex('x')).visual).toBe('waiting-approval');
  });

  it("leaves every other session's view untouched (same object)", () => {
    const before = run(ev(HERMES, 'turn.started'), ev(claude('a'), 'tool.started'), ev(codex('x'), 'agent.online'));
    const after = reduceRoom(before, ev(claude('a'), 'tool.finished'));
    expect(after.sessions[sessionKey(HERMES)]).toBe(before.sessions[sessionKey(HERMES)]);
    expect(after.sessions[sessionKey(codex('x'))]).toBe(before.sessions[sessionKey(codex('x'))]);
    expect(after.sessions[sessionKey(claude('a'))]).not.toBe(before.sessions[sessionKey(claude('a'))]);
    expect(after.memberKeys).toBe(before.memberKeys);
  });

  it('tracks lastSeq and updatedAt per session', () => {
    const state = run(
      ev(claude('a'), 'agent.online', { seq: 40, at: 7_000 }),
      ev(codex('x'), 'agent.online', { seq: 2, at: 9_000 }),
    );
    expect(view(state, claude('a'))).toMatchObject({ lastSeq: 40, updatedAt: 7_000 });
    expect(view(state, codex('x'))).toMatchObject({ lastSeq: 2, updatedAt: 9_000 });
  });

  it('ignores duplicate and stale seq within a session and returns the same state object', () => {
    const state = run(ev(claude('a'), 'agent.online', { seq: 5 }), ev(claude('a'), 'turn.started', { seq: 6 }));
    expect(reduceRoom(state, ev(claude('a'), 'turn.failed', { seq: 6 }))).toBe(state);
    expect(reduceRoom(state, ev(claude('a'), 'turn.succeeded', { seq: 3 }))).toBe(state);
    expect(reduceRoom(state, ev(claude('a'), 'usage.reported', { seq: 1 }))).toBe(state);
  });

  it('accepts a low seq from another session — cursors are not shared', () => {
    const state = run(ev(claude('a'), 'agent.online', { seq: 90 }), ev(HERMES, 'turn.started', { seq: 1 }));
    expect(view(state, HERMES).visual).toBe('thinking');
    const next = reduceRoom(state, ev(codex('x'), 'agent.online', { seq: 0 }));
    expect(next).not.toBe(state);
    expect(next.memberKeys).toEqual(['claude-code:a', 'hermes:h-1', 'codex:x']);
  });

  it('keeps usage per session: reports update only their session and never the recent list', () => {
    const state = run(
      ev(HERMES, 'agent.online'),
      ev(HERMES, 'usage.reported', { usage: { tokens: { used: 100 }, context: { used: 5, limit: 10 } } }),
      ev(claude('a'), 'usage.reported', { usage: { tokens: { used: 7 } } }),
      ev(HERMES, 'usage.reported', { usage: { context: { used: 8, limit: 10 } } }),
    );
    expect(view(state, HERMES).usage).toEqual({ tokens: { used: 100 }, context: { used: 8, limit: 10 } });
    expect(view(state, claude('a')).usage).toEqual({ tokens: { used: 7 }, context: null });
    expect(state.recent.map((entry) => entry.type)).toEqual(['agent.online']);
    expect(state.entryCount).toBe(1);
  });

  it('does not mutate the previous state or the event', () => {
    const before = deepFreeze(run(ev(HERMES, 'turn.started'), ev(claude('a'), 'tool.started')));
    const events = [
      ev(claude('a'), 'tool.finished'),
      ev(claude('a'), 'session.message', { to: HERMES }),
      ev(claude('a'), 'agent.offline'),
      ev(HERMES, 'agent.offline'),
      ev(DEMO, 'agent.online'),
      ev(HERMES, 'agent.online'),
    ].map(deepFreeze);
    expect(() => events.reduce(reduceRoom, before)).not.toThrow();
  });
});

describe('reduceRoom — every session is one office member (FR-MS1, FR-MS2, ADR-025 §1)', () => {
  const FIRST_EVENTS = ['agent.online', 'turn.started', 'tool.finished', 'usage.reported', 'approval.resolved', 'session.message'] as const;

  it.each(SOURCE_KINDS.flatMap((kind) => FIRST_EVENTS.map((type) => [kind, type] as const)))(
    'lets a %s session join on its first accepted event (%s)',
    (kind, type) => {
      const state = run(ev(of(kind, 'a'), type));
      expect(state.memberKeys).toEqual([`${kind}:a`]);
      expect(view(state, of(kind, 'a'))).toMatchObject({ key: `${kind}:a`, kind, session: 'a', ordinal: 1 });
      expect(view(state, of(kind, 'a')).facts.connection).toBe('online');
    },
  );

  it('has no resident: no kind is treated differently and no session drives anyone else', () => {
    const state = run(ev(HERMES, 'turn.started'), ev(DEMO, 'tool.started'), ev(CUSTOM, 'agent.online'), ev(claude('a'), 'approval.requested'));
    expect(state).not.toHaveProperty('residentKey');
    expect(state).not.toHaveProperty('guestKeys');
    expect(state.memberKeys).toEqual(['hermes:h-1', 'demo:demo-1', 'custom:c-1', 'claude-code:a']);
    expect(Object.values(state.sessions).map((s) => s.visual)).toEqual(['thinking', 'coding', 'idle', 'waiting-approval']);
  });

  it('numbers members per kind in arrival order — every kind, including demo, hermes and custom', () => {
    const state = run(
      ev(claude('a'), 'agent.online'),
      ev(codex('x'), 'agent.online'),
      ev(HERMES, 'agent.online'),
      ev(DEMO, 'agent.online'),
      ev(claude('b'), 'turn.started'),
      ev(of('hermes', 'h-2'), 'agent.online'),
      ev(CUSTOM, 'agent.online'),
      ev(of('demo', 'demo-2'), 'agent.online'),
      ev(codex('y'), 'agent.online'),
      ev(of('custom', 'c-2'), 'agent.online'),
      ev(of('demo', 'demo-3'), 'agent.online'),
    );
    expect(state.memberKeys).toEqual([
      'claude-code:a',
      'codex:x',
      'hermes:h-1',
      'demo:demo-1',
      'claude-code:b',
      'hermes:h-2',
      'custom:c-1',
      'demo:demo-2',
      'codex:y',
      'custom:c-2',
      'demo:demo-3',
    ]);
    expect(state.memberKeys.map((key) => state.sessions[key]?.ordinal)).toEqual([1, 1, 1, 1, 2, 2, 1, 2, 2, 2, 3]);
  });

  it('keeps an ordinal for as long as the session is present', () => {
    const state = run(ev(DEMO, 'agent.online'), ev(of('demo', 'demo-2'), 'agent.online'), ev(DEMO, 'turn.started'));
    expect(view(state, DEMO).ordinal).toBe(1);
    expect(view(state, of('demo', 'demo-2')).ordinal).toBe(2);
  });

  it.each(SOURCE_KINDS)('gives a new %s member the smallest number no present session of its kind uses', (kind) => {
    const other: SourceKind = kind === 'codex' ? 'claude-code' : 'codex';
    let state = run(
      ev(of(kind, 'a'), 'agent.online'),
      ev(of(kind, 'b'), 'agent.online'),
      ev(of(kind, 'c'), 'agent.online'),
      ev(of(other, 'x'), 'agent.online'),
      ev(of(kind, 'b'), 'agent.offline'),
    );
    state = reduceRoom(state, ev(of(kind, 'd'), 'agent.online'));
    expect(view(state, of(kind, 'd')).ordinal).toBe(2);

    state = reduceRoom(state, ev(of(kind, 'a'), 'agent.offline'));
    state = reduceRoom(state, ev(of(kind, 'e'), 'agent.online'));
    expect(view(state, of(kind, 'e')).ordinal).toBe(1);
    expect(view(state, of(kind, 'c')).ordinal).toBe(3);

    state = reduceRoom(state, ev(of(kind, 'f'), 'agent.online'));
    expect(view(state, of(kind, 'f')).ordinal).toBe(4);
    expect(view(state, of(other, 'x')).ordinal).toBe(1);
  });

  it.each(SOURCE_KINDS)('lets a %s member leave on agent.offline and remembers its cursor; others are unaffected', (kind) => {
    const other: SourceKind = kind === 'codex' ? 'claude-code' : 'codex';
    const before = run(ev(of(other, 'x'), 'turn.started'), ev(of(kind, 'a'), 'turn.started'), ev(of(other, 'y'), 'agent.online'));
    const state = reduceRoom(before, ev(of(kind, 'a'), 'agent.offline', { seq: 12 }));
    expect(state.sessions).not.toHaveProperty(`${kind}:a`);
    expect(state.memberKeys).toEqual([`${other}:x`, `${other}:y`]);
    expect(state.endedCursors).toEqual({ [`${kind}:a`]: 12 });
    expect(state.sessions[`${other}:x`]).toBe(before.sessions[`${other}:x`]);
    expect(state.sessions[`${other}:y`]).toBe(before.sessions[`${other}:y`]);
    expect(state.recent[0]).toMatchObject({ type: 'agent.offline', sessionKey: `${kind}:a`, kind, ordinal: 1 });
  });

  it.each(SOURCE_KINDS)('ignores late events of an ended %s session and returns the same state object', (kind) => {
    const state = run(ev(of(kind, 'a'), 'turn.started', { seq: 3 }), ev(of(kind, 'a'), 'agent.offline', { seq: 4 }));
    expect(reduceRoom(state, ev(of(kind, 'a'), 'tool.started', { seq: 4 }))).toBe(state);
    expect(reduceRoom(state, ev(of(kind, 'a'), 'turn.succeeded', { seq: 2 }))).toBe(state);
    expect(reduceRoom(state, ev(of(kind, 'a'), 'session.message', { seq: 1 }))).toBe(state);
  });

  it.each(SOURCE_KINDS)('lets an ended %s session re-join as a new arrival when a larger seq arrives', (kind) => {
    let state = run(
      ev(of(kind, 'a'), 'tool.started', { seq: 3 }),
      ev(of(kind, 'b'), 'agent.online'),
      ev(of(kind, 'a'), 'agent.offline', { seq: 4 }),
      ev(of(kind, 'c'), 'agent.online'),
    );
    expect(view(state, of(kind, 'c')).ordinal).toBe(1);

    state = reduceRoom(state, ev(of(kind, 'a'), 'turn.started', { seq: 5 }));
    expect(view(state, of(kind, 'a'))).toMatchObject({ ordinal: 3, visual: 'thinking', lastSeq: 5 });
    expect(view(state, of(kind, 'a')).facts.activeTools).toEqual([]);
    expect(state.memberKeys).toEqual([`${kind}:b`, `${kind}:c`, `${kind}:a`]);
    expect(state.endedCursors).toEqual({});
  });

  it.each(SOURCE_KINDS)('records a %s session whose first event is agent.offline as ended without seating it', (kind) => {
    const state = run(ev(of(kind, 'x'), 'agent.offline', { seq: 8 }));
    expect(state.sessions).toEqual({});
    expect(state.memberKeys).toEqual([]);
    expect(state.endedCursors).toEqual({ [`${kind}:x`]: 8 });
    expect(state.recent).toHaveLength(1);
    expect(state.recent[0]).toMatchObject({ type: 'agent.offline', sessionKey: `${kind}:x`, ordinal: 1 });
  });

  it('empties the office when the last member leaves', () => {
    const state = run(ev(HERMES, 'turn.started'), ev(DEMO, 'agent.online'), ev(DEMO, 'agent.offline'), ev(HERMES, 'agent.offline'));
    expect(state.sessions).toEqual({});
    expect(state.memberKeys).toEqual([]);
    expect(Object.keys(state.endedCursors)).toEqual(['demo:demo-1', 'hermes:h-1']);
  });

  it(`remembers at most ${ENDED_CURSOR_LIMIT} ended sessions, dropping the oldest`, () => {
    expect(ENDED_CURSOR_LIMIT).toBe(64);
    const events: AgentEvent[] = [];
    for (let i = 0; i <= ENDED_CURSOR_LIMIT; i += 1) {
      events.push(ev(claude(`s-${i}`), 'agent.online'), ev(claude(`s-${i}`), 'agent.offline'));
    }
    const state = run(...events);
    const keys = Object.keys(state.endedCursors);
    expect(keys).toHaveLength(ENDED_CURSOR_LIMIT);
    expect(keys[0]).toBe('claude-code:s-1');
    expect(keys[keys.length - 1]).toBe(`claude-code:s-${ENDED_CURSOR_LIMIT}`);
    expect(state.endedCursors).not.toHaveProperty('claude-code:s-0');
    expect(state.endedCursors['claude-code:s-1']).toBe(2);

    // The forgotten session can no longer be told apart from a new one.
    expect(reduceRoom(state, ev(claude('s-0'), 'turn.started', { seq: 1 })).memberKeys).toEqual(['claude-code:s-0']);
    expect(reduceRoom(state, ev(claude('s-1'), 'turn.started', { seq: 1 }))).toBe(state);
  });

  it('moves a session that ends again to the newest end of the remembered cursors', () => {
    const state = run(
      ev(HERMES, 'agent.offline'),
      ev(claude('b'), 'agent.offline'),
      ev(HERMES, 'agent.online'),
      ev(HERMES, 'agent.offline'),
    );
    expect(Object.entries(state.endedCursors)).toEqual([
      ['claude-code:b', 1],
      ['hermes:h-1', 3],
    ]);
  });
});

describe('reduceRoom — merged recent activity (FR-MS6)', () => {
  it('merges every session newest first, each entry naming its session', () => {
    const state = run(
      ev(HERMES, 'turn.started', { seq: 1, at: 100 }),
      ev(claude('a'), 'tool.started', { seq: 7, at: 200, tool: 'terminal' }),
      ev(codex('x'), 'tool.finished', { seq: 2, at: 300, tool: 'file', outcome: 'error' }),
    );
    expect(state.recent).toEqual([
      {
        key: 3,
        seq: 2,
        at: 300,
        type: 'tool.finished',
        tool: 'file',
        outcome: 'error',
        sessionKey: 'codex:x',
        kind: 'codex',
        ordinal: 1,
      },
      { key: 2, seq: 7, at: 200, type: 'tool.started', tool: 'terminal', sessionKey: 'claude-code:a', kind: 'claude-code', ordinal: 1 },
      { key: 1, seq: 1, at: 100, type: 'turn.started', sessionKey: 'hermes:h-1', kind: 'hermes', ordinal: 1 },
    ]);
    expect(state.entryCount).toBe(3);
    for (const entry of state.recent) {
      expect(entry).not.toHaveProperty('toKey');
      expect(entry).not.toHaveProperty('receiver');
    }
  });

  it(`keeps at most ${RECENT_LIMIT} entries but keeps counting, with unique keys`, () => {
    const events: AgentEvent[] = [];
    for (let i = 0; i < 10; i += 1) {
      events.push(ev(HERMES, 'tool.started'), ev(claude('a'), 'tool.started'));
    }
    const state = run(...events);
    expect(state.recent).toHaveLength(RECENT_LIMIT);
    expect(state.entryCount).toBe(20);
    expect(state.recent[0]?.key).toBe(20);
    expect(new Set(state.recent.map((entry) => entry.key)).size).toBe(RECENT_LIMIT);
  });

  it('keeps the number an entry was recorded with after the session leaves', () => {
    const state = run(
      ev(DEMO, 'agent.online'),
      ev(of('demo', 'demo-2'), 'turn.started'),
      ev(DEMO, 'agent.offline'),
      ev(of('demo', 'demo-2'), 'agent.offline'),
      ev(of('demo', 'demo-3'), 'agent.online'),
    );
    expect(state.recent.map((entry) => [entry.sessionKey, entry.ordinal])).toEqual([
      ['demo:demo-3', 1],
      ['demo:demo-2', 2],
      ['demo:demo-1', 1],
      ['demo:demo-2', 2],
      ['demo:demo-1', 1],
    ]);
  });
});

describe('reduceRoom — conversations between sessions (FR-MS5, ADR-023)', () => {
  it('records a message as a recent entry with its target and as a conversation', () => {
    const state = run(
      ev(claude('a'), 'agent.online'),
      ev(codex('x'), 'agent.online'),
      ev(claude('a'), 'session.message', { seq: 2, at: 500, to: codex('x') }),
    );
    expect(state.recent[0]).toEqual({
      key: 3,
      seq: 2,
      at: 500,
      type: 'session.message',
      sessionKey: 'claude-code:a',
      kind: 'claude-code',
      ordinal: 1,
      toKey: 'codex:x',
      receiver: { kind: 'codex', ordinal: 1 },
    });
    expect(state.conversations).toEqual([{ key: 1, from: 'claude-code:a', to: 'codex:x' }]);
    expect(state.conversationCount).toBe(1);
  });

  it('records a message without a known receiver with a null target', () => {
    const state = run(ev(HERMES, 'session.message'));
    expect(state.recent[0]).toMatchObject({ type: 'session.message', sessionKey: 'hermes:h-1', toKey: null, receiver: null });
    expect(state.conversations).toEqual([{ key: 1, from: 'hermes:h-1', to: null }]);
  });

  it('names the receiver as it was in the office when the message was sent (FR-MS6)', () => {
    const toHermes = run(
      ev(HERMES, 'agent.online'),
      ev(claude('a'), 'agent.online'),
      ev(claude('b'), 'session.message', { to: HERMES }),
    );
    expect(toHermes.recent[0]).toMatchObject({ toKey: 'hermes:h-1', receiver: { kind: 'hermes', ordinal: 1 } });

    // Not in the office (never came, or already left): no receiver, like the letter in the scene.
    const absent = run(ev(codex('x'), 'agent.online'), ev(codex('x'), 'agent.offline'), ev(claude('a'), 'session.message', { to: codex('x') }));
    expect(absent.recent[0]).toMatchObject({ toKey: 'codex:x', receiver: null });

    // Later changes do not rewrite history.
    const later = reduceRoom(toHermes, ev(HERMES, 'agent.offline'));
    expect(later.recent[1]).toMatchObject({ sessionKey: 'claude-code:b', ordinal: 2, receiver: { kind: 'hermes', ordinal: 1 } });
  });

  it('a message to itself has no receiver', () => {
    const state = run(ev(claude('a'), 'agent.online'), ev(claude('a'), 'session.message', { to: claude('a') }));
    expect(state.recent[0]).toMatchObject({ toKey: 'claude-code:a', receiver: null });
  });

  it('does not seat the receiver of a message', () => {
    const state = run(ev(claude('a'), 'session.message', { to: codex('nobody') }));
    expect(state.memberKeys).toEqual(['claude-code:a']);
    expect(state.sessions).not.toHaveProperty('codex:nobody');
    expect(state.conversations[0]?.to).toBe('codex:nobody');
  });

  it("keeps the sender's activity: a message only proves the session is online", () => {
    const working = run(ev(claude('a'), 'turn.started'), ev(claude('a'), 'tool.started', { tool: 'code' }));
    const state = reduceRoom(working, ev(claude('a'), 'session.message', { to: HERMES }));
    expect(view(state, claude('a')).facts).toBe(view(working, claude('a')).facts);
    expect(view(state, claude('a')).visual).toBe('coding');

    // An ended session that sends a later message comes back in, idle.
    const back = run(ev(HERMES, 'agent.offline'), ev(HERMES, 'session.message'));
    expect(back.memberKeys).toEqual(['hermes:h-1']);
    expect(view(back, HERMES).visual).toBe('idle');
  });

  it(`keeps the newest ${CONVERSATION_LIMIT} conversations with strictly increasing keys`, () => {
    expect(CONVERSATION_LIMIT).toBe(8);
    const events: AgentEvent[] = [];
    for (let i = 0; i < 11; i += 1) {
      events.push(ev(i % 2 ? codex('x') : claude('a'), 'session.message', { to: i % 2 ? claude('a') : codex('x') }));
    }
    const state = run(...events);
    expect(state.conversations).toHaveLength(CONVERSATION_LIMIT);
    expect(state.conversationCount).toBe(11);
    expect(state.conversations.map((c) => c.key)).toEqual([11, 10, 9, 8, 7, 6, 5, 4]);
    expect(state.conversations[0]).toEqual({ key: 11, from: 'claude-code:a', to: 'codex:x' });
    expect(state.conversations[1]).toEqual({ key: 10, from: 'codex:x', to: 'claude-code:a' });
  });

  it('ignores a duplicate message', () => {
    const state = run(ev(claude('a'), 'session.message', { seq: 3, to: HERMES }));
    expect(reduceRoom(state, ev(claude('a'), 'session.message', { seq: 3, to: HERMES }))).toBe(state);
  });
});

describe('reduceRoom — office XP across sessions (ADR-025 §7)', () => {
  it('counts accepted turn.succeeded of every session of every kind, but not duplicates', () => {
    let state = run(
      ev(HERMES, 'turn.succeeded', { seq: 1 }),
      ev(DEMO, 'turn.succeeded', { seq: 1 }),
      ev(CUSTOM, 'turn.succeeded', { seq: 1 }),
      ev(claude('a'), 'turn.succeeded', { seq: 1 }),
      ev(codex('x'), 'turn.succeeded', { seq: 1 }),
      ev(claude('a'), 'turn.failed', { seq: 2 }),
      ev(claude('a'), 'agent.offline', { seq: 3 }),
    );
    expect(state.completedTurns).toBe(5);
    state = reduceRoom(state, ev(claude('a'), 'turn.succeeded', { seq: 3 }));
    state = reduceRoom(state, ev(HERMES, 'turn.succeeded', { seq: 1 }));
    expect(state.completedTurns).toBe(5);
  });
});

describe('sessionLabel (FR-MS1, FR-MS6, ADR-025 §1)', () => {
  it.each<[Parameters<typeof sessionLabel>[0], string]>([
    [{ kind: 'claude-code', ordinal: 1 }, 'Claude 1'],
    [{ kind: 'claude-code', ordinal: 2 }, 'Claude 2'],
    [{ kind: 'codex', ordinal: 1 }, 'Codex 1'],
    [{ kind: 'codex', ordinal: 3 }, 'Codex 3'],
    [{ kind: 'hermes', ordinal: 1 }, 'Hermes 1'],
    [{ kind: 'hermes', ordinal: 2 }, 'Hermes 2'],
    [{ kind: 'demo', ordinal: 1 }, '데모 1'],
    [{ kind: 'demo', ordinal: 4 }, '데모 4'],
    [{ kind: 'custom', ordinal: 1 }, '에이전트 1'],
    [{ kind: 'custom', ordinal: 8 }, '에이전트 8'],
  ])('names %o "%s"', (session, label) => {
    expect(sessionLabel(session)).toBe(label);
  });

  it.each(SOURCE_KINDS)('numbers every %s session — nobody is called 헤르메스', (kind) => {
    expect(sessionLabel({ kind, ordinal: 5 })).toMatch(/^\S+ 5$/);
    expect(sessionLabel({ kind, ordinal: 5 })).not.toContain('헤르메스');
  });

  it('labels members from the office state in arrival order', () => {
    const state = run(
      ev(DEMO, 'agent.online'),
      ev(HERMES, 'agent.online'),
      ev(CUSTOM, 'agent.online'),
      ev(claude('a'), 'agent.online'),
      ev(claude('b'), 'agent.online'),
      ev(codex('x'), 'agent.online'),
      ev(of('demo', 'demo-2'), 'agent.online'),
    );
    expect(state.memberKeys.map((key) => sessionLabel(state.sessions[key]!))).toEqual([
      '데모 1',
      'Hermes 1',
      '에이전트 1',
      'Claude 1',
      'Claude 2',
      'Codex 1',
      '데모 2',
    ]);
  });
});

describe('officeCounts — the office summary (ADR-025 §5)', () => {
  const ZERO: OfficeCounts = { total: 0, working: 0, waiting: 0, failing: 0, resting: 0 };

  /** An office whose members show exactly these visuals (built by the reducer, then pinned). */
  function officeWith(...visuals: VisualState[]): RoomViewState {
    const base = run(...visuals.map((_, i) => ev(claude(`s-${i}`), 'agent.online')));
    return {
      ...base,
      sessions: Object.fromEntries(base.memberKeys.map((key, i) => [key, { ...base.sessions[key]!, visual: visuals[i]! }])),
    };
  }

  it('counts nobody in an empty office', () => {
    expect(officeCounts(initialRoomState)).toEqual(ZERO);
  });

  const CATEGORY: readonly (readonly [VisualState, keyof OfficeCounts | null])[] = [
    ['thinking', 'working'],
    ['coding', 'working'],
    ['browsing', 'working'],
    ['terminal', 'working'],
    ['file-work', 'working'],
    ['delegated', 'working'],
    ['waiting-approval', 'waiting'],
    ['error', 'failing'],
    ['idle', 'resting'],
    ['success', 'resting'],
    ['offline', null],
  ];

  it('places every visual state in exactly one row of the table', () => {
    expect(CATEGORY.map(([visual]) => visual).sort()).toEqual([...VISUAL_STATES].sort());
  });

  it.each(CATEGORY)('counts a member who is %s as %s', (visual, category) => {
    const counts = officeCounts(officeWith(visual));
    expect(counts).toEqual(category === null ? ZERO : { ...ZERO, [category]: 1, total: 1 });
  });

  it('adds the categories up to the total', () => {
    const counts = officeCounts(officeWith('coding', 'thinking', 'idle', 'success', 'error', 'waiting-approval', 'offline', 'delegated'));
    expect(counts).toEqual({ total: 7, working: 3, waiting: 1, failing: 1, resting: 2 });
  });

  it('counts the members of a real office and not those who left', () => {
    const state = run(
      ev(claude('a'), 'turn.started'),
      ev(claude('a'), 'tool.started', { tool: 'code' }),
      ev(claude('b'), 'approval.requested'),
      ev(codex('x'), 'turn.failed'),
      ev(HERMES, 'turn.succeeded'),
      ev(DEMO, 'agent.online'),
      ev(CUSTOM, 'delegation.started'),
      ev(codex('y'), 'turn.started'),
      ev(codex('y'), 'agent.offline'),
    );
    expect(officeCounts(state)).toEqual({ total: 6, working: 2, waiting: 1, failing: 1, resting: 2 });
  });
});
