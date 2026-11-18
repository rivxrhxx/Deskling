import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoSource } from '../adapters/demo/demoSource';
import { DEMO_SCRIPTS } from '../adapters/demo/scripts';
import type { AgentEventSource, SourceMode } from '../adapters/types';
import { VISUAL_STATES } from '../core/agentEvent';
import { mockReducedMotion } from '../test/matchMedia';
import { VISUAL_SPEC } from '../ui/visualSpec';
import { App } from './App';

function manualSource(mode: SourceMode = 'live') {
  let emitter: ((raw: unknown) => void) | null = null;
  const stop = vi.fn();
  const source: AgentEventSource = {
    mode,
    start(emit) {
      emitter = emit;
      return stop;
    },
  };
  return { source, stop, emit: (raw: unknown) => act(() => emitter?.(raw)) };
}

const raw = (seq: number, type: string, extra: Record<string, unknown> = {}) => ({
  schema: 'deskling.agent-event',
  version: 1,
  id: `live-${seq}`,
  seq,
  at: 1_000 * seq,
  source: { kind: 'custom', session: 'live-1' },
  type,
  ...extra,
});

const statusText = () => screen.getByRole('status').textContent;
const sceneState = () => screen.getByRole('img', { name: /미니어처 작업실/ }).getAttribute('data-state');

beforeEach(() => {
  mockReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('App (smoke)', () => {
  it('renders the Deskling root region', () => {
    render(<App source={manualSource().source} />);
    expect(screen.getByRole('region', { name: 'Deskling' })).toBeInTheDocument();
  });
});

describe('App with the demo source (FR-D2, FR-D5, FR-D6)', () => {
  it('shows the core scenario in order: idle → thinking → coding → terminal → success → idle', () => {
    vi.useFakeTimers();
    render(<App source={createDemoSource({ script: DEMO_SCRIPTS.core, now: () => 0 })} />);

    const labels: Array<string | null> = [];
    const states: Array<string | null> = [];
    for (const step of DEMO_SCRIPTS.core.steps) {
      labels.push(statusText());
      states.push(sceneState());
      act(() => vi.advanceTimersByTime(step.dwellMs));
    }

    expect(states).toEqual(['idle', 'thinking', 'coding', 'terminal', 'success', 'idle']);
    expect(labels).toEqual(['대기 중', '생각 중', '코딩 중', '터미널 작업 중', '완료', '대기 중']);
  });

  it('shows the DEMO badge in every state of the tour', () => {
    vi.useFakeTimers();
    render(<App source={createDemoSource({ script: DEMO_SCRIPTS.tour, now: () => 0 })} />);

    const seen: string[] = [];
    for (const step of DEMO_SCRIPTS.tour.steps) {
      seen.push(sceneState() ?? '');
      expect(screen.getByText('DEMO')).toBeVisible();
      act(() => vi.advanceTimersByTime(step.dwellMs));
    }
    expect(seen).toEqual([...VISUAL_STATES]);
  });

  it('uses the demo tour by default', () => {
    render(<App />);
    expect(screen.getByText('DEMO')).toBeVisible();
  });
});

describe('App with a live source', () => {
  it('starts offline and shows no DEMO badge', () => {
    render(<App source={manualSource('live').source} />);
    expect(statusText()).toBe(VISUAL_SPEC.offline.label);
    expect(screen.queryByText('DEMO')).toBeNull();
  });

  it('renders only normalized facts — secrets in raw events never reach the DOM (SEC-1, SEC-2)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const live = manualSource('live');
    const { container } = render(<App source={live.source} />);

    live.emit(raw(1, 'turn.started', { reasoning: 'SECRET-COT', prompt: 'SECRET-PROMPT' }));
    live.emit(raw(2, 'tool.started', { tool: 'terminal', command: 'SECRET-CMD', path: '/SECRET/path' }));
    live.emit({ ...raw(3, 'tool.started'), tool: 'SECRET-TOOL' });

    expect(statusText()).toBe(VISUAL_SPEC.terminal.label);
    expect(container.innerHTML).not.toMatch(/SECRET/);
    expect(warn).toHaveBeenCalledWith('[deskling] rejected agent event: bad-tool');
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/SECRET/);
  });

  it('resets to the new source facts when the source changes', () => {
    const first = manualSource('live');
    const { rerender } = render(<App source={first.source} />);
    first.emit(raw(1, 'turn.started'));
    expect(statusText()).toBe(VISUAL_SPEC.thinking.label);

    const second = manualSource('live');
    rerender(<App source={second.source} />);
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(statusText()).toBe(VISUAL_SPEC.offline.label);
  });

  it('stops the source on unmount', () => {
    const live = manualSource('live');
    const { unmount } = render(<App source={live.source} />);
    unmount();
    expect(live.stop).toHaveBeenCalledTimes(1);
  });
});

describe('App motion (FR-M1, FR-M3)', () => {
  it('marks the root as reduced when the OS prefers reduced motion', () => {
    mockReducedMotion(true);
    render(<App source={manualSource().source} />);
    expect(screen.getByRole('region', { name: 'Deskling' })).toHaveAttribute('data-motion', 'reduced');
  });

  it('marks the root as full motion otherwise, keeping pose, icon and text either way', () => {
    render(<App source={manualSource().source} />);
    const root = screen.getByRole('region', { name: 'Deskling' });
    expect(root).toHaveAttribute('data-motion', 'full');
    expect(root.querySelector('[data-pose]')).not.toBeNull();
    expect(root.querySelector('[data-icon]')).not.toBeNull();
  });
});

describe('App activity panel (FR-P1, FR-P3)', () => {
  it('opens from the character, lists recent activity and closes with Escape', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const live = manualSource('demo');
    render(<App source={live.source} />);
    live.emit(raw(1, 'agent.online'));
    live.emit(raw(2, 'turn.started'));

    const hotspot = screen.getByRole('button', { name: '최근 활동 보기' });
    expect(hotspot).toHaveAttribute('aria-expanded', 'false');
    await user.click(hotspot);

    const dialog = screen.getByRole('dialog', { name: '최근 활동' });
    expect(hotspot).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveTextContent('작업 시작');
    expect(dialog).toHaveTextContent('에이전트 연결됨');
    expect(screen.getByText('DEMO')).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(hotspot).toHaveFocus();
  });

  it('opens from the keyboard', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<App source={manualSource().source} />);
    screen.getByRole('button', { name: '최근 활동 보기' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: '최근 활동' })).toBeInTheDocument();
  });
});
