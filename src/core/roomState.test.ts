import { afterEach, describe, expect, it } from 'vitest';
import type {
  AgentEvent,
  AgentEventSource,
  AgentEventType,
  ToolCategory,
  ToolOutcome,
  UsageReport,
} from './agentEvent';
import { RECENT_LIMIT } from './agentState';
import type { RoomViewState } from './roomState';
import {
  CONVERSATION_LIMIT,
  ENDED_CURSOR_LIMIT,
  initialRoomState,
  reduceRoom,
  residentView,
  sessionKey,
  sessionLabel,
} from './roomState';

const HERMES = { kind: 'hermes', session: 'h-1' } as const;
const DEMO = { kind: 'demo', session: 'demo-life' } as const;
const claude = (session: string): AgentEventSource => ({ kind: 'claude-code', session });
const codex = (session: string): AgentEventSource => ({ kind: 'codex', session });

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
  it('starts with an empty, frozen room', () => {
    expect(initialRoomState).toEqual({
      sessions: {},
      residentKey: null,
      guestKeys: [],
      recent: [],
      entryCount: 0,
      completedTurns: 0,
      conversations: [],
      conversationCount: 0,
      endedCursors: {},
    });
    expect(Object.isFrozen(initialRoomState)).toBe(true);
    expect(Object.isFrozen(initialRoomState.sessions)).toBe(true);
    expect(Object.isFrozen(initialRoomState.recent)).toBe(true);
  });

  it('keys a session by kind and session id, so equal ids of different kinds are different sessions', () => {
    expect(sessionKey({ kind: 'codex', session: 'a-1' })).toBe('codex:a-1');
    const state = run(ev(claude('same'), 'turn.started'), ev(codex('same'), 'agent.online'));
    expect(Object.keys(state.sessions)).toEqual(['claude-code:same', 'codex:same']);
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

  it("accepts a low seq from another session — cursors are not shared", () => {
    const state = run(ev(claude('a'), 'agent.online', { seq: 90 }), ev(HERMES, 'turn.started', { seq: 1 }));
    expect(view(state, HERMES).visual).toBe('thinking');
    const next = reduceRoom(state, ev(codex('x'), 'agent.online', { seq: 0 }));
    expect(next).not.toBe(state);
    expect(next.guestKeys).toEqual(['claude-code:a', 'codex:x']);
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
    ].map(deepFreeze);
    expect(() => events.reduce(reduceRoom, before)).not.toThrow();
  });
});

describe('reduceRoom — the resident, Hermes (FR-MS1, ADR-022)', () => {
  it('has no resident at first: Hermes sleeps with no usage', () => {
    expect(residentView(initialRoomState)).toEqual({
      visual: 'offline',
      usage: { tokens: null, context: null },
      key: null,
    });
  });

  it.each(['demo', 'hermes', 'custom'] as const)('makes a %s session the resident with ordinal 0', (kind) => {
    const state = run(ev({ kind, session: 'r-1' }, 'turn.started'));
    expect(state.residentKey).toBe(`${kind}:r-1`);
    expect(state.guestKeys).toEqual([]);
    expect(view(state, { kind, session: 'r-1' }).ordinal).toBe(0);
    expect(residentView(state)).toEqual({
      visual: 'thinking',
      usage: { tokens: null, context: null },
      key: `${kind}:r-1`,
    });
  });

  it('lets the most recently updated resident session drive Hermes, each keeping its own facts', () => {
    let state = run(ev(HERMES, 'tool.started', { tool: 'file' }), ev(DEMO, 'turn.started'));
    expect(state.residentKey).toBe('demo:demo-life');
    expect(residentView(state).visual).toBe('thinking');

    state = reduceRoom(state, ev(HERMES, 'usage.reported', { usage: { tokens: { used: 3 } } }));
    expect(state.residentKey).toBe('hermes:h-1');
    expect(residentView(state)).toEqual({
      visual: 'file-work',
      usage: { tokens: { used: 3 }, context: null },
      key: 'hermes:h-1',
    });
    expect(view(state, DEMO).visual).toBe('thinking');
  });

  it('does not let a guest take over Hermes', () => {
    const state = run(ev(HERMES, 'turn.started'), ev(claude('a'), 'tool.started'));
    expect(state.residentKey).toBe('hermes:h-1');
    expect(residentView(state).visual).toBe('thinking');
  });

  it('keeps an offline resident in the room as the resident: Hermes sleeps', () => {
    const state = run(ev(HERMES, 'turn.started'), ev(HERMES, 'agent.offline', { seq: 9 }));
    expect(state.residentKey).toBe('hermes:h-1');
    expect(view(state, HERMES)).toMatchObject({ visual: 'offline', lastSeq: 9 });
    expect(residentView(state)).toMatchObject({ visual: 'offline', key: 'hermes:h-1' });
    expect(state.endedCursors).toEqual({});
    expect(reduceRoom(state, ev(HERMES, 'turn.started', { seq: 9 }))).toBe(state);
  });

  it('wakes the same resident on a later event of its session', () => {
    const state = run(ev(HERMES, 'agent.offline'), ev(HERMES, 'agent.online'));
    expect(residentView(state).visual).toBe('idle');
  });

  it('lets an offline resident leave once another resident session takes over, remembering its cursor', () => {
    let state = run(ev(HERMES, 'turn.started'), ev(HERMES, 'agent.offline', { seq: 4 }), ev(DEMO, 'agent.online'));
    expect(state.residentKey).toBe('demo:demo-life');
    expect(Object.keys(state.sessions)).toEqual(['demo:demo-life']);
    expect(state.endedCursors).toEqual({ 'hermes:h-1': 4 });

    expect(reduceRoom(state, ev(HERMES, 'turn.started', { seq: 4 }))).toBe(state);

    state = reduceRoom(state, ev(HERMES, 'agent.online', { seq: 5 }));
    expect(state.residentKey).toBe('hermes:h-1');
    expect(view(state, HERMES).visual).toBe('idle');
    expect(state.endedCursors).toEqual({});
    expect(Object.keys(state.sessions).sort()).toEqual(['demo:demo-life', 'hermes:h-1']);
  });

  it('keeps an online resident that is no longer the most recent one', () => {
    const state = run(ev(HERMES, 'turn.started'), ev(DEMO, 'agent.online'), ev(DEMO, 'agent.offline'));
    expect(state.residentKey).toBe('demo:demo-life');
    expect(residentView(state).visual).toBe('offline');
    expect(view(state, HERMES).visual).toBe('thinking');
  });
});

describe('reduceRoom — session friends (FR-MS1, FR-MS2, ADR-022)', () => {
  it.each(['agent.online', 'tool.finished', 'usage.reported', 'approval.resolved', 'session.message'] as const)(
    'lets a guest join on its first accepted event (%s)',
    (type) => {
      const state = run(ev(claude('a'), type));
      expect(state.guestKeys).toEqual(['claude-code:a']);
      expect(view(state, claude('a'))).toMatchObject({
        key: 'claude-code:a',
        kind: 'claude-code',
        session: 'a',
        ordinal: 1,
      });
      expect(view(state, claude('a')).facts.connection).toBe('online');
      expect(state.residentKey).toBeNull();
    },
  );

  it('numbers guests per kind in arrival order', () => {
    const state = run(
      ev(claude('a'), 'agent.online'),
      ev(codex('x'), 'agent.online'),
      ev(HERMES, 'agent.online'),
      ev(claude('b'), 'turn.started'),
      ev(codex('y'), 'agent.online'),
      ev(claude('c'), 'agent.online'),
    );
    expect(state.guestKeys).toEqual(['claude-code:a', 'codex:x', 'claude-code:b', 'codex:y', 'claude-code:c']);
    expect(state.guestKeys.map((key) => state.sessions[key]?.ordinal)).toEqual([1, 1, 2, 2, 3]);
    expect(view(state, HERMES).ordinal).toBe(0);
  });

  it('keeps an ordinal for as long as the session is present', () => {
    const state = run(ev(claude('a'), 'agent.online'), ev(claude('b'), 'agent.online'), ev(claude('a'), 'turn.started'));
    expect(view(state, claude('a')).ordinal).toBe(1);
    expect(view(state, claude('b')).ordinal).toBe(2);
  });

  it('gives a new guest the smallest number no present session of its kind uses', () => {
    let state = run(
      ev(claude('a'), 'agent.online'),
      ev(claude('b'), 'agent.online'),
      ev(claude('c'), 'agent.online'),
      ev(codex('x'), 'agent.online'),
      ev(claude('b'), 'agent.offline'),
    );
    state = reduceRoom(state, ev(claude('d'), 'agent.online'));
    expect(view(state, claude('d')).ordinal).toBe(2);

    state = reduceRoom(state, ev(claude('a'), 'agent.offline'));
    state = reduceRoom(state, ev(claude('e'), 'agent.online'));
    expect(view(state, claude('e')).ordinal).toBe(1);
    expect(view(state, claude('c')).ordinal).toBe(3);

    state = reduceRoom(state, ev(claude('f'), 'agent.online'));
    expect(view(state, claude('f')).ordinal).toBe(4);
    expect(view(state, codex('x')).ordinal).toBe(1);
  });

  it('lets a guest leave on agent.offline and remembers its cursor; the resident is unaffected', () => {
    const before = run(ev(HERMES, 'turn.started'), ev(claude('a'), 'turn.started'), ev(claude('b'), 'agent.online'));
    const state = reduceRoom(before, ev(claude('a'), 'agent.offline', { seq: 12 }));
    expect(state.sessions).not.toHaveProperty('claude-code:a');
    expect(state.guestKeys).toEqual(['claude-code:b']);
    expect(state.endedCursors).toEqual({ 'claude-code:a': 12 });
    expect(state.residentKey).toBe('hermes:h-1');
    expect(state.sessions[sessionKey(HERMES)]).toBe(before.sessions[sessionKey(HERMES)]);
    expect(state.recent[0]).toMatchObject({
      type: 'agent.offline',
      sessionKey: 'claude-code:a',
      kind: 'claude-code',
      ordinal: 1,
    });
  });

  it('ignores late events of an ended guest and returns the same state object', () => {
    const state = run(ev(claude('a'), 'turn.started', { seq: 3 }), ev(claude('a'), 'agent.offline', { seq: 4 }));
    expect(reduceRoom(state, ev(claude('a'), 'tool.started', { seq: 4 }))).toBe(state);
    expect(reduceRoom(state, ev(claude('a'), 'turn.succeeded', { seq: 2 }))).toBe(state);
  });

  it('lets an ended guest re-join as a new arrival when a larger seq arrives', () => {
    let state = run(
      ev(claude('a'), 'tool.started', { seq: 3 }),
      ev(claude('b'), 'agent.online'),
      ev(claude('a'), 'agent.offline', { seq: 4 }),
      ev(claude('c'), 'agent.online'),
    );
    expect(view(state, claude('c')).ordinal).toBe(1);

    state = reduceRoom(state, ev(claude('a'), 'turn.started', { seq: 5 }));
    expect(view(state, claude('a'))).toMatchObject({ ordinal: 3, visual: 'thinking', lastSeq: 5 });
    expect(view(state, claude('a')).facts.activeTools).toEqual([]);
    expect(state.guestKeys).toEqual(['claude-code:b', 'claude-code:c', 'claude-code:a']);
    expect(state.endedCursors).toEqual({});
  });

  it('records a guest whose first event is agent.offline as ended without seating it', () => {
    const state = run(ev(codex('x'), 'agent.offline', { seq: 8 }));
    expect(state.sessions).toEqual({});
    expect(state.guestKeys).toEqual([]);
    expect(state.endedCursors).toEqual({ 'codex:x': 8 });
    expect(state.recent).toHaveLength(1);
    expect(state.recent[0]).toMatchObject({ type: 'agent.offline', sessionKey: 'codex:x', ordinal: 1 });
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
    expect(reduceRoom(state, ev(claude('s-0'), 'turn.started', { seq: 1 })).guestKeys).toEqual(['claude-code:s-0']);
    expect(reduceRoom(state, ev(claude('s-1'), 'turn.started', { seq: 1 }))).toBe(state);
  });

  it('moves a session that ends again to the newest end of the remembered cursors', () => {
    const state = run(
      ev(claude('a'), 'agent.offline'),
      ev(claude('b'), 'agent.offline'),
      ev(claude('a'), 'agent.online'),
      ev(claude('a'), 'agent.offline'),
    );
    expect(Object.entries(state.endedCursors)).toEqual([
      ['claude-code:b', 1],
      ['claude-code:a', 3],
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
      { key: 1, seq: 1, at: 100, type: 'turn.started', sessionKey: 'hermes:h-1', kind: 'hermes', ordinal: 0 },
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
      ev(claude('a'), 'agent.online'),
      ev(claude('b'), 'turn.started'),
      ev(claude('a'), 'agent.offline'),
      ev(claude('b'), 'agent.offline'),
      ev(claude('c'), 'agent.online'),
    );
    expect(state.recent.map((entry) => [entry.sessionKey, entry.ordinal])).toEqual([
      ['claude-code:c', 1],
      ['claude-code:b', 2],
      ['claude-code:a', 1],
      ['claude-code:b', 2],
      ['claude-code:a', 1],
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

  it('names the receiver as it was in the room when the message was sent (FR-MS6)', () => {
    const toHermes = run(ev(HERMES, 'agent.online'), ev(claude('a'), 'agent.online'), ev(claude('b'), 'session.message', { to: HERMES }));
    expect(toHermes.recent[0]).toMatchObject({ toKey: 'hermes:h-1', receiver: { kind: 'hermes', ordinal: 0 } });

    // Not in the room (never came, or already left): no receiver, like the letter in the scene.
    const absent = run(ev(codex('x'), 'agent.online'), ev(codex('x'), 'agent.offline'), ev(claude('a'), 'session.message', { to: codex('x') }));
    expect(absent.recent[0]).toMatchObject({ toKey: 'codex:x', receiver: null });

    // Later changes do not rewrite history.
    const later = reduceRoom(toHermes, ev(claude('a'), 'agent.offline'));
    expect(later.recent[1]).toMatchObject({ sessionKey: 'claude-code:b', ordinal: 2, receiver: { kind: 'hermes', ordinal: 0 } });
  });

  it('a message to itself has no receiver', () => {
    const state = run(ev(claude('a'), 'agent.online'), ev(claude('a'), 'session.message', { to: claude('a') }));
    expect(state.recent[0]).toMatchObject({ toKey: 'claude-code:a', receiver: null });
  });

  it('does not seat the receiver of a message', () => {
    const state = run(ev(claude('a'), 'session.message', { to: codex('nobody') }));
    expect(state.guestKeys).toEqual(['claude-code:a']);
    expect(state.sessions).not.toHaveProperty('codex:nobody');
    expect(state.conversations[0]?.to).toBe('codex:nobody');
  });

  it("keeps the sender's activity: a message only proves the session is online", () => {
    const working = run(ev(claude('a'), 'turn.started'), ev(claude('a'), 'tool.started', { tool: 'code' }));
    const state = reduceRoom(working, ev(claude('a'), 'session.message', { to: HERMES }));
    expect(view(state, claude('a')).facts).toBe(view(working, claude('a')).facts);
    expect(view(state, claude('a')).visual).toBe('coding');

    const woken = run(ev(HERMES, 'agent.offline'), ev(HERMES, 'session.message'));
    expect(residentView(woken).visual).toBe('idle');
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

describe('reduceRoom — growth across sessions (ADR-018, ADR-022 §7)', () => {
  it('counts accepted turn.succeeded of every session, but not duplicates', () => {
    let state = run(
      ev(HERMES, 'turn.succeeded', { seq: 1 }),
      ev(claude('a'), 'turn.succeeded', { seq: 1 }),
      ev(codex('x'), 'turn.succeeded', { seq: 1 }),
      ev(claude('a'), 'turn.failed', { seq: 2 }),
      ev(claude('a'), 'agent.offline', { seq: 3 }),
    );
    expect(state.completedTurns).toBe(3);
    state = reduceRoom(state, ev(claude('a'), 'turn.succeeded', { seq: 3 }));
    state = reduceRoom(state, ev(HERMES, 'turn.succeeded', { seq: 1 }));
    expect(state.completedTurns).toBe(3);
  });
});

describe('sessionLabel (FR-MS1, FR-MS6)', () => {
  it.each<[Parameters<typeof sessionLabel>[0], string]>([
    [{ kind: 'hermes', ordinal: 0 }, '헤르메스'],
    [{ kind: 'demo', ordinal: 0 }, '헤르메스'],
    [{ kind: 'custom', ordinal: 0 }, '헤르메스'],
    [{ kind: 'claude-code', ordinal: 1 }, 'Claude 1'],
    [{ kind: 'claude-code', ordinal: 2 }, 'Claude 2'],
    [{ kind: 'codex', ordinal: 1 }, 'Codex 1'],
  ])('names %o "%s"', (session, label) => {
    expect(sessionLabel(session)).toBe(label);
  });

  it('labels sessions from the room state', () => {
    const state = run(ev(HERMES, 'agent.online'), ev(claude('a'), 'agent.online'), ev(claude('b'), 'agent.online'));
    expect(Object.values(state.sessions).map(sessionLabel)).toEqual(['헤르메스', 'Claude 1', 'Claude 2']);
  });
});
