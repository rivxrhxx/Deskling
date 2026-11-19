import { describe, expect, it, vi } from 'vitest';
import { createClaudeCodeSource } from './source';

const T0 = 1_767_225_600_000;
const A = 'b5c1f0de-1111-4a2b-9c3d-00000000000a';

type Raw = { type: string; seq: number };

function rec(event: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { v: 1, agent: 'claude-code', session: A, event, at: T0, ...extra };
}

/** A fake `listen` whose promise the test resolves (or rejects) by hand. */
function fakeListen() {
  const unlisten = vi.fn();
  let deliver: ((raw: unknown) => void) | null = null;
  let resolve: (fn: () => void) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const listen = vi.fn((onRecord: (raw: unknown) => void) => {
    deliver = onRecord;
    return new Promise<() => void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  });
  return {
    listen,
    unlisten,
    send: (raw: unknown) => deliver?.(raw),
    resolve: () => resolve(unlisten),
    reject: (reason: unknown) => reject(reason),
  };
}

const flush = () => new Promise<void>((res) => setTimeout(res, 0));

function collect() {
  const events: Raw[] = [];
  return { events, emit: vi.fn((raw: unknown) => events.push(raw as Raw)) };
}

describe('createClaudeCodeSource (ADR-024 §5)', () => {
  it('is a live source', () => {
    expect(createClaudeCodeSource(fakeListen().listen).mode).toBe('live');
  });

  it('starts listening on start and emits each translated event', async () => {
    const fake = fakeListen();
    const { events, emit } = collect();
    createClaudeCodeSource(fake.listen).start(emit);
    expect(fake.listen).toHaveBeenCalledTimes(1);
    fake.resolve();
    await flush();

    fake.send(rec('prompt'));
    fake.send(rec('tool-start', { tool: 'code' }));
    expect(events.map((e) => [e.type, e.seq])).toEqual([
      ['agent.online', 1],
      ['turn.started', 2],
      ['tool.started', 3],
    ]);
  });

  it('translates Claude Code and Codex records from the same listener independently (ADR-026)', async () => {
    const fake = fakeListen();
    const events: { type: string; seq: number; source: { kind: string } }[] = [];
    createClaudeCodeSource(fake.listen).start((raw) => events.push(raw as (typeof events)[number]));
    fake.resolve();
    await flush();

    fake.send(rec('prompt'));
    fake.send(rec('prompt', { agent: 'codex' }));
    fake.send(rec('interrupt', { agent: 'codex' }));
    expect(fake.listen).toHaveBeenCalledTimes(1);
    expect(events.map((e) => [e.source.kind, e.type, e.seq])).toEqual([
      ['claude-code', 'agent.online', 1],
      ['claude-code', 'turn.started', 2],
      ['codex', 'agent.online', 1],
      ['codex', 'turn.started', 2],
      ['codex', 'agent.idle', 3],
    ]);
  });

  it('ignores malformed records', async () => {
    const fake = fakeListen();
    const { emit } = collect();
    createClaudeCodeSource(fake.listen).start(emit);
    fake.resolve();
    await flush();
    fake.send({ ...rec('prompt'), prompt: 'secret' });
    fake.send(null);
    expect(emit).not.toHaveBeenCalled();
  });

  it('stop after listen resolved unlistens once and emits nothing more', async () => {
    const fake = fakeListen();
    const { emit } = collect();
    const stop = createClaudeCodeSource(fake.listen).start(emit);
    fake.resolve();
    await flush();
    stop();
    stop();
    expect(fake.unlisten).toHaveBeenCalledTimes(1);
    fake.send(rec('prompt'));
    expect(emit).not.toHaveBeenCalled();
  });

  it('stop before listen resolves unlistens as soon as it resolves and never emits', async () => {
    const fake = fakeListen();
    const { emit } = collect();
    const stop = createClaudeCodeSource(fake.listen).start(emit);
    stop();
    expect(fake.unlisten).not.toHaveBeenCalled();
    fake.send(rec('prompt'));
    fake.resolve();
    await flush();
    expect(fake.unlisten).toHaveBeenCalledTimes(1);
    fake.send(rec('prompt'));
    stop();
    expect(fake.unlisten).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits records that arrive before listen resolves while still running', () => {
    const fake = fakeListen();
    const { events, emit } = collect();
    createClaudeCodeSource(fake.listen).start(emit);
    fake.send(rec('session-start'));
    expect(events.map((e) => e.type)).toEqual(['agent.online']);
  });

  it('honours stop() called from inside emit', async () => {
    const fake = fakeListen();
    const events: Raw[] = [];
    let stop: () => void = () => undefined;
    stop = createClaudeCodeSource(fake.listen).start((raw) => {
      events.push(raw as Raw);
      stop();
    });
    fake.resolve();
    await flush();
    fake.send(rec('prompt'));
    expect(events.map((e) => e.type)).toEqual(['agent.online']);
    expect(fake.unlisten).toHaveBeenCalledTimes(1);
  });

  it('keeps translator state across stop/start so seq keeps increasing', async () => {
    const first = fakeListen();
    const second = fakeListen();
    let calls = 0;
    const listen = (onRecord: (raw: unknown) => void) => (++calls === 1 ? first : second).listen(onRecord);
    const source = createClaudeCodeSource(listen);
    const { events, emit } = collect();

    const stop = source.start(emit);
    first.resolve();
    await flush();
    first.send(rec('session-start'));
    first.send(rec('prompt'));
    stop();

    source.start(emit);
    second.resolve();
    await flush();
    second.send(rec('session-start'));
    second.send(rec('stop'));
    expect(events.map((e) => [e.type, e.seq])).toEqual([
      ['agent.online', 1],
      ['turn.started', 2],
      ['turn.succeeded', 3],
    ]);
  });

  it('a rejected listen is swallowed and stop stays safe', async () => {
    const fake = fakeListen();
    const { emit } = collect();
    const stop = createClaudeCodeSource(fake.listen).start(emit);
    fake.reject(new Error('no bridge'));
    await flush();
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
    expect(fake.unlisten).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
