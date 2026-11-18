import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from './agentEvent';
import { createIngest } from './ingest';

const raw = {
  schema: 'deskling.agent-event',
  version: 1,
  id: 'evt-1',
  seq: 1,
  at: 1000,
  source: { kind: 'demo', session: 'demo-core' },
  type: 'turn.started',
  prompt: 'SECRET prompt text',
};

describe('createIngest (FR-E2, SEC-3)', () => {
  it('dispatches the normalized event, not the raw object', () => {
    const dispatch = vi.fn<(event: AgentEvent) => void>();
    const onReject = vi.fn();
    createIngest(dispatch, onReject)(raw);

    expect(onReject).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
    const event = dispatch.mock.calls[0]?.[0];
    expect(event).not.toBe(raw);
    expect(event).toMatchObject({ id: 'evt-1', type: 'turn.started' });
    expect(event).not.toHaveProperty('prompt');
  });

  it('does not dispatch rejected input and reports only the error code', () => {
    const dispatch = vi.fn();
    const onReject = vi.fn();
    createIngest(dispatch, onReject)({ ...raw, id: 'has spaces SECRET' });

    expect(dispatch).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith('bad-id');
    expect(JSON.stringify(onReject.mock.calls)).not.toContain('SECRET');
  });

  it('logs a code-only warning by default', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    createIngest(vi.fn())({ token: 'SECRET', type: 'agent.idle' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('[deskling] rejected agent event: bad-schema');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET');
  });
});
