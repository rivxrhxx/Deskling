import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentEventSource } from '../adapters/types';
import { initialRoomState } from '../core/roomState';
import { useAgentFeed } from './useAgentFeed';

function manualSource() {
  let emitter: ((raw: unknown) => void) | null = null;
  const source: AgentEventSource = {
    mode: 'live',
    start(emit) {
      emitter = emit;
      return () => {
        emitter = null;
      };
    },
  };
  return { source, emit: (raw: unknown) => act(() => emitter?.(raw)) };
}

const raw = (seq: number, type: string, source: { kind: string; session: string }, extra: object = {}) => ({
  schema: 'deskling.agent-event',
  version: 3,
  id: `e-${source.session}-${seq}`,
  seq,
  at: 1_000 * seq,
  source,
  type,
  ...extra,
});

const HERMES = { kind: 'hermes', session: 'h' };
const CLAUDE = { kind: 'claude-code', session: 'c' };

describe('useAgentFeed (FR-E2, ADR-025)', () => {
  it('folds every session into the room state', () => {
    const live = manualSource();
    const onReject = vi.fn();
    const { result } = renderHook(() => useAgentFeed(live.source, onReject));
    expect(result.current).toBe(initialRoomState);

    live.emit(raw(1, 'turn.started', HERMES));
    live.emit(raw(1, 'tool.started', CLAUDE, { tool: 'code' }));
    live.emit(raw(2, 'session.message', CLAUDE, { to: HERMES }));

    expect(result.current.memberKeys).toEqual(['hermes:h', 'claude-code:c']);
    expect(result.current.sessions['hermes:h']).toMatchObject({ visual: 'thinking', ordinal: 1 });
    expect(result.current.sessions['claude-code:c']).toMatchObject({ visual: 'coding', ordinal: 1 });
    expect(result.current.conversations).toEqual([{ key: 1, from: 'claude-code:c', to: 'hermes:h' }]);
    expect(result.current.recent.map((entry) => entry.type)).toEqual(['session.message', 'tool.started', 'turn.started']);
  });

  it('rejects invalid input before the reducer and reports only the error code', () => {
    const live = manualSource();
    const onReject = vi.fn();
    const { result } = renderHook(() => useAgentFeed(live.source, onReject));
    live.emit({ ...raw(1, 'tool.started', CLAUDE), tool: 'SECRET' });
    expect(result.current).toBe(initialRoomState);
    expect(onReject).toHaveBeenCalledWith('bad-tool');
  });

  it('starts from an empty room when the source changes', () => {
    const first = manualSource();
    const second = manualSource();
    const onReject = vi.fn();
    const { result, rerender } = renderHook(({ source }) => useAgentFeed(source, onReject), {
      initialProps: { source: first.source },
    });
    first.emit(raw(1, 'agent.online', CLAUDE));
    expect(result.current.memberKeys).toHaveLength(1);
    rerender({ source: second.source });
    expect(result.current).toBe(initialRoomState);
  });
});
