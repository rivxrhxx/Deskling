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

  it.each(EVENT_TYPES.filter((t) => !t.startsWith('tool.')))('accepts %s', (type) => {
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

  it('accepts objects without a prototype (e.g. parsed by a strict decoder)', () => {
    const input = Object.assign(Object.create(null) as Record<string, unknown>, { ...base, type: 'agent.idle' });
    input.source = Object.assign(Object.create(null) as Record<string, unknown>, base.source);
    expect(expectOk(input).type).toBe('agent.idle');
  });
});
