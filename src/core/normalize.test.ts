import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, TOOL_CATEGORIES } from './agentEvent';
import { normalizeAgentEvent } from './normalize';

const base = {
  schema: 'deskling.agent-event',
  version: 1,
  id: 'evt-0001',
  seq: 1,
  at: 1767225600000,
  source: { kind: 'demo', session: 'demo-core' },
} as const;

function expectOk(input: unknown) {
  const result = normalizeAgentEvent(input);
  if (!result.ok) {
    throw new Error(`expected ok, got ${result.error}`);
  }
  return result.event;
}

describe('normalizeAgentEvent — valid input (FR-E1, FR-E3)', () => {
  it('accepts a minimal agent.online event', () => {
    expect(normalizeAgentEvent({ ...base, type: 'agent.online' })).toEqual({
      ok: true,
      event: { ...base, type: 'agent.online' },
    });
  });

  it.each(EVENT_TYPES.filter((t) => !t.startsWith('tool.') && t !== 'usage.reported'))('accepts %s', (type) => {
    expect(expectOk({ ...base, type })).toEqual({ ...base, type });
  });

  it.each(TOOL_CATEGORIES)('accepts tool.started with tool=%s', (tool) => {
    expect(expectOk({ ...base, type: 'tool.started', tool })).toEqual({
      ...base,
      type: 'tool.started',
      tool,
    });
  });

  it.each(['ok', 'error'] as const)('accepts tool.finished with outcome=%s', (outcome) => {
    expect(expectOk({ ...base, type: 'tool.finished', tool: 'terminal', outcome })).toEqual({
      ...base,
      type: 'tool.finished',
      tool: 'terminal',
      outcome,
    });
  });

  it('accepts seq 0 and at 0', () => {
    expect(expectOk({ ...base, seq: 0, at: 0, type: 'agent.idle' })).toMatchObject({ seq: 0, at: 0 });
  });

  it('accepts the hermes and custom source kinds', () => {
    expect(expectOk({ ...base, source: { kind: 'hermes', session: 'h-1' }, type: 'agent.idle' }).source).toEqual({
      kind: 'hermes',
      session: 'h-1',
    });
    expect(expectOk({ ...base, source: { kind: 'custom', session: 'c-1' }, type: 'agent.idle' }).source.kind).toBe(
      'custom',
    );
  });

  it('returns a new deeply frozen object instead of the input', () => {
    const input = { ...base, source: { ...base.source }, type: 'agent.online' };
    const event = expectOk(input);
    expect(event).not.toBe(input);
    expect(event.source).not.toBe(input.source);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.source)).toBe(true);
  });

  it('copies only protocol fields from the top level and from source', () => {
    const event = expectOk({
      ...base,
      source: { ...base.source, extra: 'dropped' },
      type: 'tool.started',
      tool: 'code',
      extra: 'dropped',
    });
    expect(Object.keys(event).sort()).toEqual(['at', 'id', 'schema', 'seq', 'source', 'tool', 'type', 'version']);
    expect(Object.keys(event.source).sort()).toEqual(['kind', 'session']);
  });

  it('drops tool and outcome on event types that do not carry them', () => {
    const event = expectOk({ ...base, type: 'turn.started', tool: 'code', outcome: 'ok' });
    expect(event).not.toHaveProperty('tool');
    expect(event).not.toHaveProperty('outcome');
  });

  it('drops outcome on tool.started', () => {
    const event = expectOk({ ...base, type: 'tool.started', tool: 'file', outcome: 'ok' });
    expect(event).not.toHaveProperty('outcome');
  });

  it('accepts the largest safe integer for seq', () => {
    expect(expectOk({ ...base, seq: Number.MAX_SAFE_INTEGER, type: 'agent.idle' }).seq).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('accepts the largest timestamp a Date can represent', () => {
    expect(expectOk({ ...base, at: 8_640_000_000_000_000, type: 'agent.idle' }).at).toBe(8_640_000_000_000_000);
  });

  it('accepts objects without a prototype (e.g. parsed by a strict decoder)', () => {
    const input = Object.assign(Object.create(null) as Record<string, unknown>, { ...base, type: 'agent.idle' });
    input.source = Object.assign(Object.create(null) as Record<string, unknown>, base.source);
    expect(expectOk(input).type).toBe('agent.idle');
  });
});

describe('normalizeAgentEvent — invalid input (EVENT_PROTOCOL §8)', () => {
  const valid = { ...base, type: 'agent.idle' };

  it.each<[string, unknown, string]>([
    ['null', null, 'not-object'],
    ['a number', 42, 'not-object'],
    ['a string', '{"type":"agent.idle"}', 'not-object'],
    ['an array', [valid], 'not-object'],
    ['a class instance', new Date(0), 'not-object'],
    ['a missing schema', { ...valid, schema: undefined }, 'bad-schema'],
    ['a foreign schema', { ...valid, schema: 'other.event' }, 'bad-schema'],
    ['a future version', { ...valid, version: 3 }, 'bad-version'],
    ['a string version', { ...valid, version: '1' }, 'bad-version'],
    ['an empty id', { ...valid, id: '' }, 'bad-id'],
    ['a 65 character id', { ...valid, id: 'a'.repeat(65) }, 'bad-id'],
    ['an id with spaces', { ...valid, id: 'evt 1' }, 'bad-id'],
    ['an id shaped like a path', { ...valid, id: '/Users/me/.ssh/id_rsa' }, 'bad-id'],
    ['a numeric id', { ...valid, id: 7 }, 'bad-id'],
    ['a negative seq', { ...valid, seq: -1 }, 'bad-seq'],
    ['a fractional seq', { ...valid, seq: 1.5 }, 'bad-seq'],
    ['a string seq', { ...valid, seq: '1' }, 'bad-seq'],
    ['an unsafe seq', { ...valid, seq: Number.MAX_SAFE_INTEGER + 1 }, 'bad-seq'],
    ['a negative timestamp', { ...valid, at: -1 }, 'bad-timestamp'],
    ['a NaN timestamp', { ...valid, at: Number.NaN }, 'bad-timestamp'],
    ['an infinite timestamp', { ...valid, at: Number.POSITIVE_INFINITY }, 'bad-timestamp'],
    ['a fractional timestamp', { ...valid, at: 1.5 }, 'bad-timestamp'],
    ['an ISO string timestamp', { ...valid, at: '2026-01-01T00:00:00Z' }, 'bad-timestamp'],
    ['a timestamp beyond the Date range', { ...valid, at: 8_640_000_000_000_001 }, 'bad-timestamp'],
    ['the largest safe integer as a timestamp', { ...valid, at: Number.MAX_SAFE_INTEGER }, 'bad-timestamp'],
    ['a missing source', { ...valid, source: undefined }, 'bad-source'],
    ['an array source', { ...valid, source: ['demo', 's'] }, 'bad-source'],
    ['an unknown source kind', { ...valid, source: { kind: 'evil', session: 's-1' } }, 'bad-source'],
    ['a source without session', { ...valid, source: { kind: 'demo' } }, 'bad-source'],
    ['a session with spaces', { ...valid, source: { kind: 'demo', session: 'my session' } }, 'bad-source'],
    ['a missing type', { ...valid, type: undefined }, 'bad-type'],
    ['an unknown type', { ...valid, type: 'tool.exploded' }, 'bad-type'],
    ['tool.started without tool', { ...valid, type: 'tool.started' }, 'bad-tool'],
    ['tool.started with an unknown tool', { ...valid, type: 'tool.started', tool: 'shell' }, 'bad-tool'],
    ['tool.finished without tool', { ...valid, type: 'tool.finished', outcome: 'ok' }, 'bad-tool'],
    ['tool.finished without outcome', { ...valid, type: 'tool.finished', tool: 'code' }, 'bad-outcome'],
    ['tool.finished with an unknown outcome', { ...valid, type: 'tool.finished', tool: 'code', outcome: 'maybe' }, 'bad-outcome'],
  ])('rejects %s', (_label, input, error) => {
    expect(normalizeAgentEvent(input)).toEqual({ ok: false, error });
  });

  it('rejects fields that are only inherited, not own properties', () => {
    const inherited = Object.create({ ...valid }) as object;
    expect(normalizeAgentEvent(inherited)).toEqual({ ok: false, error: 'not-object' });
  });

  it('returns only the error code, never part of the input (SEC-3)', () => {
    const result = normalizeAgentEvent({ ...valid, id: 'sk-live secret value' });
    expect(result).toEqual({ ok: false, error: 'bad-id' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });

  it('does not throw on hostile getters', () => {
    const hostile = { ...valid };
    Object.defineProperty(hostile, 'schema', {
      enumerable: true,
      get() {
        throw new Error('boom');
      },
    });
    expect(normalizeAgentEvent(hostile)).toEqual({ ok: false, error: 'not-object' });
  });
});

describe('normalizeAgentEvent — sensitive data never propagates (SEC-1, SEC-2)', () => {
  const SECRET = 'TOPSECRET-7f3a';
  const sensitive = {
    reasoning: `${SECRET} chain of thought`,
    chainOfThought: SECRET,
    thinking: SECRET,
    prompt: `${SECRET} full prompt`,
    messages: [{ role: 'user', content: SECRET }],
    content: SECRET,
    args: { command: `rm -rf ${SECRET}` },
    arguments: SECRET,
    input: SECRET,
    output: SECRET,
    result: SECRET,
    path: `/Users/me/${SECRET}.ts`,
    filePath: `/Users/me/${SECRET}.ts`,
    cwd: `/Users/me/${SECRET}`,
    command: `curl -H "Authorization: Bearer ${SECRET}"`,
    cmd: SECRET,
    env: { OPENAI_API_KEY: SECRET },
    apiKey: SECRET,
    api_key: SECRET,
    token: SECRET,
    authorization: `Bearer ${SECRET}`,
    headers: { Authorization: `Bearer ${SECRET}`, Cookie: SECRET },
    diff: SECRET,
  };

  it.each(['agent.online', 'turn.started', 'approval.requested'] as const)('strips everything from %s', (type) => {
    const event = expectOk({ ...base, ...sensitive, type });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain(SECRET);
    for (const key of Object.keys(sensitive)) {
      expect(event).not.toHaveProperty(key);
    }
  });

  it('strips everything from tool events', () => {
    const event = expectOk({ ...base, ...sensitive, type: 'tool.finished', tool: 'terminal', outcome: 'error' });
    expect(JSON.stringify(event)).not.toContain(SECRET);
  });

  it('strips sensitive data nested inside source', () => {
    const event = expectOk({
      ...base,
      source: { ...base.source, token: SECRET, headers: { Authorization: SECRET } },
      type: 'agent.idle',
    });
    expect(JSON.stringify(event)).not.toContain(SECRET);
  });

  it('cannot be tricked into prototype pollution via __proto__', () => {
    const input: unknown = JSON.parse(
      `{"__proto__":{"polluted":"${SECRET}"},"schema":"deskling.agent-event","version":1,"id":"e","seq":1,"at":1,"source":{"kind":"demo","session":"s"},"type":"agent.idle"}`,
    );
    const event = expectOk(input);
    expect(JSON.stringify(event)).not.toContain(SECRET);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('normalizeAgentEvent — usage.reported (v2, FR-V1, ADR-016)', () => {
  const v2 = { ...base, version: 2 } as const;
  const usageEvent = (usage: unknown) => ({ ...v2, type: 'usage.reported', usage });

  it('keeps the version of the input event', () => {
    expect(expectOk({ ...base, type: 'turn.started' }).version).toBe(1);
    expect(expectOk({ ...v2, type: 'turn.started' }).version).toBe(2);
  });

  it('accepts token and context usage', () => {
    expect(expectOk(usageEvent({ tokens: { used: 120000 }, context: { used: 156000, limit: 200000 } }))).toEqual({
      ...v2,
      type: 'usage.reported',
      usage: { tokens: { used: 120000 }, context: { used: 156000, limit: 200000 } },
    });
  });

  it('accepts tokens only and context only', () => {
    expect(expectOk(usageEvent({ tokens: { used: 0 } }))).toMatchObject({ usage: { tokens: { used: 0 } } });
    expect(expectOk(usageEvent({ context: { used: 5, limit: 10 } }))).toMatchObject({ usage: { context: { used: 5, limit: 10 } } });
    expect(expectOk(usageEvent({ tokens: { used: 1 } }))).not.toHaveProperty('usage.context');
  });

  it('copies only the numbers — model names, costs or prompts are dropped', () => {
    const event = expectOk(
      usageEvent({ tokens: { used: 7, model: 'SECRET-MODEL' }, context: { used: 1, limit: 2, prompt: 'SECRET' }, cost: 'SECRET' }),
    );
    expect(JSON.stringify(event)).not.toContain('SECRET');
    expect(event).toEqual({ ...v2, type: 'usage.reported', usage: { tokens: { used: 7 }, context: { used: 1, limit: 2 } } });
  });

  it('returns a deeply frozen usage object', () => {
    const event = expectOk(usageEvent({ tokens: { used: 7 }, context: { used: 1, limit: 2 } }));
    if (event.type !== 'usage.reported') throw new Error('wrong type');
    expect(Object.isFrozen(event.usage)).toBe(true);
    expect(Object.isFrozen(event.usage.tokens)).toBe(true);
    expect(Object.isFrozen(event.usage.context)).toBe(true);
  });

  it.each<[string, unknown]>([
    ['a missing usage', undefined],
    ['a non-object usage', 42],
    ['an empty usage', {}],
    ['a non-object tokens', { tokens: 5 }],
    ['tokens without used', { tokens: {} }],
    ['negative tokens', { tokens: { used: -1 } }],
    ['fractional tokens', { tokens: { used: 1.5 } }],
    ['string tokens', { tokens: { used: '10' } }],
    ['context without limit', { context: { used: 1 } }],
    ['context with a zero limit', { context: { used: 0, limit: 0 } }],
    ['context with a negative used', { context: { used: -3, limit: 10 } }],
    ['unsafe context numbers', { context: { used: 1, limit: Number.MAX_SAFE_INTEGER + 1 } }],
  ])('rejects %s as bad-usage', (_label, usage) => {
    expect(normalizeAgentEvent(usageEvent(usage))).toEqual({ ok: false, error: 'bad-usage' });
  });

  it('rejects usage.reported in a v1 event', () => {
    expect(normalizeAgentEvent({ ...base, type: 'usage.reported', usage: { tokens: { used: 1 } } })).toEqual({
      ok: false,
      error: 'bad-type',
    });
  });

  it('ignores usage on other event types', () => {
    expect(expectOk({ ...v2, type: 'turn.started', usage: { tokens: { used: 1 } } })).not.toHaveProperty('usage');
  });
});
