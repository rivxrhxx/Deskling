import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../core/agentEvent';
import { normalizeAgentEvent } from '../../core/normalize';
import type { RoomViewState } from '../../core/roomState';
import { initialRoomState, reduceRoom } from '../../core/roomState';
import type { TranslatorState } from './translate';
import { initialTranslatorState, translateHookRecord } from './translate';

const T0 = 1_767_225_600_000;
const A = 'b5c1f0de-1111-4a2b-9c3d-00000000000a';
const B = 'b5c1f0de-1111-4a2b-9c3d-00000000000b';
const SECRET = 'rm -rf ~/secret-project && cat /Users/me/.env';
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,64}$/;
const EVENT_KEYS = new Set(['schema', 'version', 'id', 'seq', 'at', 'source', 'type', 'tool', 'outcome']);

function rec(event: string, extra: Record<string, unknown> = {}, session = A, at = T0): Record<string, unknown> {
  return { v: 1, agent: 'claude-code', session, event, at, ...extra };
}

function omit(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

function feed(records: readonly unknown[], state: TranslatorState = initialTranslatorState) {
  const events: AgentEvent[] = [];
  let current = state;
  for (const raw of records) {
    const result = translateHookRecord(current, raw);
    current = result.state;
    events.push(...result.events);
  }
  return { state: current, events };
}

/** What `record` emits once `before` has been translated. */
function after(before: readonly unknown[], record: unknown): readonly AgentEvent[] {
  return translateHookRecord(feed(before).state, record).events;
}

/** The event without its envelope: type plus type-specific fields. */
function body(event: AgentEvent): Record<string, unknown> {
  const { schema, version, id, seq, at, source, ...rest } = event;
  void [schema, version, id, seq, at, source];
  return rest;
}

const types = (events: readonly AgentEvent[]) => events.map((e) => e.type);
const started = [rec('session-start')];

function fold(events: readonly unknown[], state: RoomViewState = initialRoomState): RoomViewState {
  return events.reduce<RoomViewState>((room, raw) => {
    const result = normalizeAgentEvent(raw);
    if (!result.ok) throw new Error(`normalize failed: ${result.error}`);
    return reduceRoom(room, result.event);
  }, state);
}

const keyOf = (session: string) => `claude-code:${session}`;

describe('translateHookRecord — envelope', () => {
  it('session-start on an unseen session emits agent.online as a v3 claude-code event', () => {
    const { events } = feed([rec('session-start', {}, A, T0)]);
    expect(events).toHaveLength(1);
    const [online] = events;
    expect(online).toMatchObject({
      schema: 'deskling.agent-event',
      version: 3,
      seq: 1,
      at: T0,
      source: { kind: 'claude-code', session: A },
      type: 'agent.online',
    });
    expect(online?.id).toMatch(IDENTIFIER);
  });

  it('stamps every event with the record time', () => {
    const { events } = feed([rec('session-start', {}, A, T0), rec('prompt', {}, A, T0 + 5)]);
    expect(events.map((e) => e.at)).toEqual([T0, T0 + 5]);
  });

  it('accepts the boundary timestamps 0 and 8.64e15', () => {
    expect(types(feed([rec('session-start', {}, A, 0)]).events)).toEqual(['agent.online']);
    expect(types(feed([rec('session-start', {}, A, 8.64e15)]).events)).toEqual(['agent.online']);
  });

  it('accepts a null-prototype record', () => {
    const raw = Object.assign(Object.create(null) as Record<string, unknown>, rec('session-start'));
    expect(types(translateHookRecord(initialTranslatorState, raw).events)).toEqual(['agent.online']);
  });

  it('keeps ids valid and unique even for 64-character sessions', () => {
    const long = 'x'.repeat(64);
    const { events } = feed([
      rec('session-start', {}, long),
      ...Array.from({ length: 30 }, () => rec('prompt', {}, long)),
      rec('session-start', {}, A),
      rec('prompt', {}, A),
    ]);
    for (const event of events) expect(event.id).toMatch(IDENTIFIER);
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
  });
});

describe('translateHookRecord — mapping (ADR-024 §5)', () => {
  const ROWS: [string, Record<string, unknown>, Record<string, unknown>[]][] = [
    ['session-start', {}, []],
    ['prompt', {}, [{ type: 'turn.started' }]],
    ['tool-start', { tool: 'code' }, [{ type: 'tool.started', tool: 'code' }]],
    ['tool-start', { tool: 'browser' }, [{ type: 'tool.started', tool: 'browser' }]],
    ['tool-start', { tool: 'terminal' }, [{ type: 'tool.started', tool: 'terminal' }]],
    ['tool-start', { tool: 'file' }, [{ type: 'tool.started', tool: 'file' }]],
    ['tool-start', { tool: 'delegate' }, [{ type: 'delegation.started' }]],
    ['tool-start', { tool: 'message' }, [{ type: 'session.message' }]],
    ['tool-end', { tool: 'code', ok: true }, [{ type: 'tool.finished', tool: 'code', outcome: 'ok' }]],
    ['tool-end', { tool: 'browser', ok: false }, [{ type: 'tool.finished', tool: 'browser', outcome: 'error' }]],
    ['tool-end', { tool: 'terminal', ok: true }, [{ type: 'tool.finished', tool: 'terminal', outcome: 'ok' }]],
    ['tool-end', { tool: 'file', ok: false }, [{ type: 'tool.finished', tool: 'file', outcome: 'error' }]],
    ['tool-end', { tool: 'message', ok: true }, []],
    ['approval', {}, [{ type: 'approval.requested' }]],
    ['stop', {}, [{ type: 'turn.succeeded' }]],
    ['stop-failure', {}, [{ type: 'turn.failed' }]],
    ['subagent-stop', {}, []],
    ['session-end', {}, [{ type: 'agent.offline' }]],
  ];

  it.each(ROWS)('%s %o on a known session → %o', (event, extra, expected) => {
    expect(after(started, rec(event, extra)).map(body)).toStrictEqual(expected);
  });

  it('session.message carries no `to` (the receiver is unknown, ADR-023)', () => {
    const [message] = after(started, rec('tool-start', { tool: 'message' }));
    expect(message?.type).toBe('session.message');
    expect(message).not.toHaveProperty('to');
  });

  it('delegate tool-end finishes an open delegation', () => {
    const before = [...started, rec('tool-start', { tool: 'delegate' })];
    expect(after(before, rec('tool-end', { tool: 'delegate', ok: true })).map(body)).toStrictEqual([
      { type: 'delegation.finished' },
    ]);
    expect(after(before, rec('tool-end', { tool: 'delegate', ok: false })).map(body)).toStrictEqual([
      { type: 'delegation.finished' },
    ]);
  });

  it('delegate tool-end finishes each open delegation once and nothing more', () => {
    const { events } = feed([
      ...started,
      rec('tool-start', { tool: 'delegate' }),
      rec('tool-start', { tool: 'delegate' }),
      rec('tool-end', { tool: 'delegate', ok: true }),
      rec('tool-end', { tool: 'delegate', ok: true }),
      rec('tool-end', { tool: 'delegate', ok: true }),
    ]);
    expect(types(events)).toEqual([
      'agent.online',
      'delegation.started',
      'delegation.started',
      'delegation.finished',
      'delegation.finished',
    ]);
  });

  it('delegate tool-end without an open delegation emits nothing', () => {
    expect(after(started, rec('tool-end', { tool: 'delegate', ok: true }))).toEqual([]);
  });

  it('a turn end closes open delegations (the reducer clears them too)', () => {
    for (const end of ['stop', 'stop-failure']) {
      const before = [...started, rec('tool-start', { tool: 'delegate' }), rec(end)];
      expect(after(before, rec('tool-end', { tool: 'delegate', ok: true }))).toEqual([]);
    }
  });

  it('subagent-stop never finishes a delegation (the Agent/Task tool-end does)', () => {
    const { events } = feed([
      ...started,
      rec('tool-start', { tool: 'delegate' }),
      rec('subagent-stop'),
      rec('tool-end', { tool: 'delegate', ok: true }),
    ]);
    expect(types(events)).toEqual(['agent.online', 'delegation.started', 'delegation.finished']);
  });

  it('a repeated session-start for a known session emits nothing', () => {
    expect(feed([rec('session-start'), rec('session-start'), rec('session-start')]).events).toHaveLength(1);
  });

  it('never emits usage.reported (FR-CC6)', () => {
    const { events } = feed(
      [
        'session-start',
        'prompt',
        'tool-start',
        'tool-end',
        'approval',
        'stop',
        'stop-failure',
        'subagent-stop',
        'session-end',
      ].map((event) =>
        rec(event, event === 'tool-start' ? { tool: 'code' } : event === 'tool-end' ? { tool: 'code', ok: true } : {}),
      ),
    );
    expect(types(events)).not.toContain('usage.reported');
    for (const event of events) expect(event).not.toHaveProperty('usage');
  });
});

describe('translateHookRecord — implicit agent.online', () => {
  const FIRST: [string, Record<string, unknown>, string[]][] = [
    ['prompt', {}, ['agent.online', 'turn.started']],
    ['tool-start', { tool: 'code' }, ['agent.online', 'tool.started']],
    ['tool-start', { tool: 'delegate' }, ['agent.online', 'delegation.started']],
    ['tool-start', { tool: 'message' }, ['agent.online', 'session.message']],
    ['tool-end', { tool: 'terminal', ok: true }, ['agent.online', 'tool.finished']],
    ['tool-end', { tool: 'delegate', ok: true }, ['agent.online']],
    ['tool-end', { tool: 'message', ok: true }, ['agent.online']],
    ['approval', {}, ['agent.online', 'approval.requested']],
    ['stop', {}, ['agent.online', 'turn.succeeded']],
    ['stop-failure', {}, ['agent.online', 'turn.failed']],
    ['subagent-stop', {}, ['agent.online']],
  ];

  it.each(FIRST)('%s %o as the first record of a session → %o', (event, extra, expected) => {
    const { events } = feed([rec(event, extra)]);
    expect(types(events)).toEqual(expected);
    expect(events.map((e) => e.seq)).toEqual(expected.map((_, i) => i + 1));
  });

  it('only the first record brings the friend online', () => {
    const { events } = feed([rec('prompt'), rec('prompt')]);
    expect(types(events)).toEqual(['agent.online', 'turn.started', 'turn.started']);
  });

  it('session-end for a session never seen emits nothing and remembers nothing', () => {
    const result = translateHookRecord(initialTranslatorState, rec('session-end'));
    expect(result.events).toEqual([]);
    expect(result.state.live.size).toBe(0);
  });
});

describe('translateHookRecord — approvals', () => {
  const pending = [...started, rec('tool-start', { tool: 'delegate' }), rec('approval')];
  const RESOLVING: [string, Record<string, unknown>, string[]][] = [
    ['prompt', {}, ['approval.resolved', 'turn.started']],
    ['tool-end', { tool: 'code', ok: true }, ['approval.resolved', 'tool.finished']],
    ['tool-end', { tool: 'file', ok: false }, ['approval.resolved', 'tool.finished']],
    ['tool-end', { tool: 'delegate', ok: true }, ['approval.resolved', 'delegation.finished']],
    ['tool-end', { tool: 'message', ok: true }, ['approval.resolved']],
    ['stop', {}, ['approval.resolved', 'turn.succeeded']],
    ['stop-failure', {}, ['approval.resolved', 'turn.failed']],
    ['session-end', {}, ['approval.resolved', 'agent.offline']],
  ];

  it.each(RESOLVING)('%s %o resolves a pending approval first → %o', (event, extra, expected) => {
    expect(types(after(pending, rec(event, extra)))).toEqual(expected);
  });

  it.each(RESOLVING)('%s %o resolves only once', (event, extra) => {
    const { state } = feed([...pending, rec(event, extra)]);
    expect(types(translateHookRecord(state, rec('stop')).events)).not.toContain('approval.resolved');
  });

  const KEEPING: [string, Record<string, unknown>][] = [
    ['tool-start', { tool: 'terminal' }],
    ['tool-start', { tool: 'message' }],
    ['subagent-stop', {}],
    ['session-start', {}],
    ['approval', {}],
  ];

  it.each(KEEPING)('%s %o leaves the approval pending', (event, extra) => {
    const { state, events } = feed([...pending, rec(event, extra)]);
    expect(types(events)).not.toContain('approval.resolved');
    expect(types(translateHookRecord(state, rec('stop')).events)).toEqual(['approval.resolved', 'turn.succeeded']);
  });

  it('a second approval while one is pending emits nothing (one prompt at a time)', () => {
    expect(after(pending, rec('approval'))).toEqual([]);
  });

  it('a new approval after resolution is requested again', () => {
    const { events } = feed([...started, rec('approval'), rec('prompt'), rec('approval')]);
    expect(types(events)).toEqual([
      'agent.online',
      'approval.requested',
      'approval.resolved',
      'turn.started',
      'approval.requested',
    ]);
  });

  it('approvals are tracked per session', () => {
    const { events } = feed([rec('session-start', {}, A), rec('approval', {}, A), rec('approval', {}, B), rec('stop', {}, B)]);
    const ofB = events.filter((e) => e.source.session === B);
    expect(types(ofB)).toEqual(['agent.online', 'approval.requested', 'approval.resolved', 'turn.succeeded']);
    const ofA = events.filter((e) => e.source.session === A);
    expect(types(ofA)).toEqual(['agent.online', 'approval.requested']);
  });
});

describe('translateHookRecord — seq', () => {
  const SCRIPT = [
    'session-start',
    'prompt',
    'tool-start',
    'approval',
    'tool-end',
    'tool-start',
    'tool-end',
    'stop',
    'prompt',
    'stop-failure',
  ];
  const extraFor = (event: string) =>
    event === 'tool-start' ? { tool: 'code' } : event === 'tool-end' ? { tool: 'code', ok: true } : {};

  it('increases strictly by one within a session, starting at 1', () => {
    const { events } = feed(SCRIPT.map((event) => rec(event, extraFor(event))));
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
  });

  it('is independent across interleaved sessions', () => {
    const records = SCRIPT.flatMap((event) => [rec(event, extraFor(event), A), rec(event, extraFor(event), B)]);
    const { events } = feed(records);
    const seqsOf = (session: string) => events.filter((e) => e.source.session === session).map((e) => e.seq);
    expect(seqsOf(A)).toEqual(seqsOf(A).map((_, i) => i + 1));
    expect(seqsOf(B)).toEqual(seqsOf(B).map((_, i) => i + 1));
    expect(seqsOf(A).length).toBeGreaterThan(5);
  });

  it('continues after session-end when the session starts again', () => {
    const first = feed([...started, rec('prompt'), rec('stop'), rec('session-end')]);
    expect(first.events.map((e) => [e.type, e.seq])).toEqual([
      ['agent.online', 1],
      ['turn.started', 2],
      ['turn.succeeded', 3],
      ['agent.offline', 4],
    ]);
    expect(first.state.live.has(A)).toBe(false);

    const restarted = feed([rec('session-start'), rec('prompt')], first.state);
    expect(restarted.events.map((e) => [e.type, e.seq])).toEqual([
      ['agent.online', 5],
      ['turn.started', 6],
    ]);

    const implicit = feed([rec('tool-start', { tool: 'file' })], first.state);
    expect(implicit.events.map((e) => [e.type, e.seq])).toEqual([
      ['agent.online', 5],
      ['tool.started', 6],
    ]);
  });

  it('forgets pending approvals and delegations when a session ends', () => {
    const ended = feed([...started, rec('approval'), rec('tool-start', { tool: 'delegate' }), rec('session-end')]);
    const again = feed([rec('session-start'), rec('tool-end', { tool: 'delegate', ok: true }), rec('stop')], ended.state);
    expect(types(again.events)).toEqual(['agent.online', 'turn.succeeded']);
  });
});

describe('translateHookRecord — malformed records are ignored', () => {
  const BAD: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['a string', JSON.stringify(rec('prompt'))],
    ['a number', 1],
    ['an array', [rec('prompt')]],
    ['a Date', new Date(T0)],
    ['v 2', rec('prompt', { v: 2 })],
    ['v "1"', rec('prompt', { v: '1' })],
    ['no v', omit(rec('prompt'), 'v')],
    ['agent codex', rec('prompt', { agent: 'codex' })],
    ['no agent', omit(rec('prompt'), 'agent')],
    ['unknown event', rec('bogus')],
    ['a raw hook name', rec('PreToolUse', { tool: 'code' })],
    ['no event', omit(rec('prompt'), 'event')],
    ['empty session', rec('prompt', {}, '')],
    ['session with a space', rec('prompt', {}, 'a b')],
    ['session with a slash', rec('prompt', {}, '../etc')],
    ['65-character session', rec('prompt', {}, 'x'.repeat(65))],
    ['numeric session', rec('prompt', { session: 12 })],
    ['no session', omit(rec('prompt'), 'session')],
    ['tool on session-start', rec('session-start', { tool: 'code' })],
    ['tool on prompt', rec('prompt', { tool: 'code' })],
    ['tool on approval', rec('approval', { tool: 'terminal' })],
    ['tool on stop', rec('stop', { tool: 'file' })],
    ['tool on stop-failure', rec('stop-failure', { tool: 'file' })],
    ['tool on subagent-stop', rec('subagent-stop', { tool: 'delegate' })],
    ['tool on session-end', rec('session-end', { tool: 'code' })],
    ['tool-start without tool', rec('tool-start')],
    ['tool-end without tool', rec('tool-end', { ok: true })],
    ['unknown tool', rec('tool-start', { tool: 'mcp' })],
    ['raw tool name', rec('tool-start', { tool: 'Bash' })],
    ['null tool', rec('tool-start', { tool: null })],
    ['ok on tool-start', rec('tool-start', { tool: 'code', ok: true })],
    ['tool-end without ok', rec('tool-end', { tool: 'code' })],
    ['string ok', rec('tool-end', { tool: 'code', ok: 'true' })],
    ['null ok', rec('tool-end', { tool: 'code', ok: null })],
    ['ok on stop', rec('stop', { ok: true })],
    ['NaN at', rec('prompt', {}, A, Number.NaN)],
    ['negative at', rec('prompt', {}, A, -1)],
    ['fractional at', rec('prompt', {}, A, T0 + 0.5)],
    ['too-large at', rec('prompt', {}, A, 8.64e15 + 1)],
    ['infinite at', rec('prompt', {}, A, Number.POSITIVE_INFINITY)],
    ['string at', rec('prompt', { at: String(T0) })],
    ['no at', omit(rec('prompt'), 'at')],
    ['extra prompt field', rec('prompt', { prompt: SECRET })],
    ['extra tool_input field', rec('tool-start', { tool: 'terminal', tool_input: { command: SECRET } })],
    ['extra command field', rec('tool-start', { tool: 'terminal', command: SECRET })],
    ['extra transcript_path field', rec('stop', { transcript_path: SECRET })],
    ['extra cwd field', rec('session-start', { cwd: SECRET })],
  ];

  it.each(BAD)('ignores %s on an unseen session', (_, raw) => {
    const result = translateHookRecord(initialTranslatorState, raw);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(initialTranslatorState);
  });

  it.each(BAD)('ignores %s on a known session', (_, raw) => {
    const { state } = feed([...started, rec('approval')]);
    const result = translateHookRecord(state, raw);
    expect(result.events).toEqual([]);
    expect(result.state).toBe(state);
  });

  it('a malformed record does not make its session known', () => {
    const { events } = feed([rec('prompt', { prompt: SECRET }), rec('prompt')]);
    expect(types(events)).toEqual(['agent.online', 'turn.started']);
  });

  it('survives hostile getters and proxies without throwing', () => {
    const throwingGetter = rec('prompt');
    Object.defineProperty(throwingGetter, 'at', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    const proxy = new Proxy(rec('prompt'), {
      ownKeys() {
        throw new Error('boom');
      },
    });
    for (const raw of [throwingGetter, proxy]) {
      const result = translateHookRecord(initialTranslatorState, raw);
      expect(result.events).toEqual([]);
      expect(result.state).toBe(initialTranslatorState);
    }
  });

  it('never lets forbidden content reach any emitted event', () => {
    const { events } = feed([
      rec('session-start', { cwd: SECRET }),
      rec('prompt', { prompt: SECRET }),
      rec('session-start'),
      rec('tool-start', { tool: 'terminal', tool_input: { command: SECRET } }),
      rec('tool-start', { tool: 'terminal' }),
      rec('tool-end', { tool: 'terminal', ok: true, tool_response: SECRET }),
      rec('tool-end', { tool: 'terminal', ok: true }),
      rec('stop', { transcript_path: SECRET }),
      rec('stop'),
    ]);
    expect(types(events)).toEqual(['agent.online', 'tool.started', 'tool.finished', 'turn.succeeded']);
    expect(JSON.stringify(events)).not.toContain('secret');
    for (const event of events) {
      for (const key of Object.keys(event)) expect(EVENT_KEYS.has(key)).toBe(true);
    }
  });
});

describe('translateHookRecord — memory bounds', () => {
  const session = (i: number) => `s-${i}`;
  const startAll = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => rec('session-start', {}, session(from + i)));

  it('tracks at most 64 live sessions, dropping the least recently seen', () => {
    const { state } = feed(startAll(0, 65));
    expect(state.live.size).toBe(64);
    expect(state.live.has(session(0))).toBe(false);
    expect(state.live.has(session(64))).toBe(true);
  });

  it('a record refreshes recency', () => {
    const { state } = feed([...startAll(0, 64), rec('prompt', {}, session(0)), ...startAll(64, 65)]);
    expect(state.live.has(session(0))).toBe(true);
    expect(state.live.has(session(1))).toBe(false);
  });

  it('a dropped session that comes back continues its seq', () => {
    const { state } = feed([rec('session-start', {}, session(0)), rec('prompt', {}, session(0)), ...startAll(1, 65)]);
    const { events } = translateHookRecord(state, rec('stop', {}, session(0)));
    expect(events.map((e) => [e.type, e.seq])).toEqual([
      ['agent.online', 3],
      ['turn.succeeded', 4],
    ]);
  });

  it('remembers at most 64 ended sessions', () => {
    const records = Array.from({ length: 65 }, (_, i) => [
      rec('session-start', {}, session(i)),
      rec('session-end', {}, session(i)),
    ]).flat();
    const { state } = feed(records);
    expect(state.live.size).toBe(0);
    expect(state.ended.size).toBe(64);
    expect(state.ended.has(session(0))).toBe(false);
    expect(state.ended.has(session(64))).toBe(true);
  });

  it('stays bounded under many sessions', () => {
    const { state } = feed(startAll(0, 300));
    expect(state.live.size).toBe(64);
    expect(state.ended.size).toBeLessThanOrEqual(64);
  });

  it('handles prototype-shaped session ids as plain data', () => {
    const { events, state } = feed([rec('session-start', {}, '__proto__'), rec('prompt', {}, 'constructor')]);
    expect(types(events)).toEqual(['agent.online', 'agent.online', 'turn.started']);
    expect(state.live.size).toBe(2);
  });
});

describe('translateHookRecord — output passes core normalization and drives the room', () => {
  const EVERYTHING = [
    rec('session-start', {}, A),
    rec('session-start', {}, B),
    rec('prompt', {}, A),
    rec('tool-start', { tool: 'code' }, A),
    rec('approval', {}, A),
    rec('tool-end', { tool: 'code', ok: true }, A),
    rec('tool-start', { tool: 'browser' }, B),
    rec('tool-end', { tool: 'browser', ok: false }, B),
    rec('tool-start', { tool: 'terminal' }, A),
    rec('tool-end', { tool: 'terminal', ok: true }, A),
    rec('tool-start', { tool: 'file' }, A),
    rec('tool-end', { tool: 'file', ok: false }, A),
    rec('tool-start', { tool: 'delegate' }, A),
    rec('subagent-stop', {}, A),
    rec('tool-end', { tool: 'delegate', ok: true }, A),
    rec('tool-start', { tool: 'message' }, A),
    rec('tool-end', { tool: 'message', ok: true }, A),
    rec('stop', {}, A),
    rec('prompt', {}, B),
    rec('stop-failure', {}, B),
    rec('approval', {}, B),
    rec('session-end', {}, B),
    rec('session-start', {}, B),
    rec('session-end', {}, A),
  ];

  it('every emitted object normalizes with ok:true and loses nothing', () => {
    const { events } = feed(EVERYTHING);
    expect(new Set(types(events)).size).toBeGreaterThanOrEqual(12);
    for (const raw of events) {
      const result = normalizeAgentEvent(raw);
      expect(result).toMatchObject({ ok: true });
      if (result.ok) expect(result.event).toEqual(raw);
    }
  });

  it('every emitted event is accepted by the room reducer (no stale seq)', () => {
    const { events } = feed(EVERYTHING);
    let room = initialRoomState;
    for (const raw of events) {
      const result = normalizeAgentEvent(raw);
      if (!result.ok) throw new Error(result.error);
      const next = reduceRoom(room, result.event);
      expect(next).not.toBe(room);
      room = next;
    }
  });

  it('two Claude sessions become two guests numbered 1 and 2', () => {
    const room = fold(feed([rec('session-start', {}, A), rec('prompt', {}, B)]).events);
    expect(room.guestKeys).toEqual([keyOf(A), keyOf(B)]);
    expect(room.sessions[keyOf(A)]?.ordinal).toBe(1);
    expect(room.sessions[keyOf(B)]?.ordinal).toBe(2);
    expect(room.residentKey).toBeNull();
  });

  it("a code tool-start sets that guest's visual to coding and leaves the other alone", () => {
    const room = fold(feed([...started, rec('session-start', {}, B), rec('tool-start', { tool: 'code' }, A)]).events);
    expect(room.sessions[keyOf(A)]?.visual).toBe('coding');
    expect(room.sessions[keyOf(B)]?.visual).toBe('idle');
  });

  it('a first record of tool-start brings the friend in already working', () => {
    const room = fold(feed([rec('tool-start', { tool: 'terminal' })]).events);
    expect(room.guestKeys).toEqual([keyOf(A)]);
    expect(room.sessions[keyOf(A)]?.visual).toBe('terminal');
  });

  it('walks a turn through thinking, tool, approval, success', () => {
    const visuals: string[] = [];
    let state = initialTranslatorState;
    let room = initialRoomState;
    for (const raw of [
      rec('session-start'),
      rec('prompt'),
      rec('tool-start', { tool: 'terminal' }),
      rec('approval'),
      rec('tool-end', { tool: 'terminal', ok: true }),
      rec('tool-start', { tool: 'delegate' }),
      rec('tool-end', { tool: 'delegate', ok: true }),
      rec('stop'),
    ]) {
      const result = translateHookRecord(state, raw);
      state = result.state;
      room = fold(result.events, room);
      visuals.push(room.sessions[keyOf(A)]?.visual ?? 'gone');
    }
    expect(visuals).toEqual([
      'idle',
      'thinking',
      'terminal',
      'waiting-approval',
      'thinking',
      'delegated',
      'thinking',
      'success',
    ]);
    expect(room.completedTurns).toBe(1);
  });

  it('stop-failure shows error', () => {
    const room = fold(feed([...started, rec('prompt'), rec('stop-failure')]).events);
    expect(room.sessions[keyOf(A)]?.visual).toBe('error');
  });

  it('a message tool-start records a conversation with an unknown receiver', () => {
    const room = fold(feed([...started, rec('tool-start', { tool: 'message' })]).events);
    expect(room.conversations).toEqual([{ key: 1, from: keyOf(A), to: null }]);
  });

  it('session-end makes the guest leave; a re-start brings it back', () => {
    const first = feed([rec('session-start', {}, A), rec('session-start', {}, B), rec('session-end', {}, A)]);
    let room = fold(first.events);
    expect(room.sessions[keyOf(A)]).toBeUndefined();
    expect(room.guestKeys).toEqual([keyOf(B)]);
    expect(room.sessions[keyOf(B)]?.ordinal).toBe(2);
    expect(room.endedCursors[keyOf(A)]).toBeDefined();

    room = fold(feed([rec('session-start', {}, A), rec('tool-start', { tool: 'code' }, A)], first.state).events, room);
    expect(room.guestKeys).toEqual([keyOf(B), keyOf(A)]);
    expect(room.sessions[keyOf(A)]?.ordinal).toBe(1);
    expect(room.sessions[keyOf(A)]?.visual).toBe('coding');
  });

  it('Claude friends never report usage (FR-CC6)', () => {
    const room = fold(feed(EVERYTHING.slice(0, -1)).events);
    expect(room.sessions[keyOf(A)]?.usage).toEqual({ tokens: null, context: null });
  });
});
