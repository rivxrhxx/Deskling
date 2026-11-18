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

  it('uses the demo tour by default (starts offline, DEMO badge shown)', () => {
    render(<App controls={fakeControls()} storage={fakeStorage()} />);
    expect(sceneState()).toBe('offline');
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

function fakeControls() {
  return {
    startDragging: vi.fn(() => Promise.resolve()),
    setAlwaysOnTop: vi.fn<(on: boolean) => Promise<void>>(() => Promise.resolve()),
    setSize: vi.fn<(width: number, height: number) => Promise<void>>(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
}

function fakeStorage(initial?: object) {
  const data = new Map<string, string>(initial ? [['deskling.settings.v1', JSON.stringify(initial)]] : []);
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('App window settings (FR-W2, FR-W4–W6, FR-W8, FR-M2)', () => {
  it('applies stored settings to the native window and the scene on start', () => {
    const controls = fakeControls();
    const storage = fakeStorage({ size: 'l', opacity: 0.6, alwaysOnTop: false, motion: 'reduced', demoScript: 'tour' });
    render(<App source={manualSource().source} controls={controls} storage={storage} />);

    expect(controls.setSize).toHaveBeenCalledWith(416, 364);
    expect(controls.setAlwaysOnTop).toHaveBeenCalledWith(false);
    const root = screen.getByRole('region', { name: 'Deskling' });
    expect(root.style.getPropertyValue('--scene-opacity')).toBe('0.6');
    expect(root).toHaveAttribute('data-motion', 'reduced');
  });

  it('changes size, pin, opacity and motion from the toolbar and persists them', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const { fireEvent } = await import('@testing-library/react');
    const user = userEvent.setup();
    const controls = fakeControls();
    const storage = fakeStorage();
    render(<App source={manualSource().source} controls={controls} storage={storage} />);

    await user.click(screen.getByRole('button', { name: '작게' }));
    expect(controls.setSize).toHaveBeenLastCalledWith(256, 224);

    await user.click(screen.getByRole('button', { name: '항상 위에 표시' }));
    expect(controls.setAlwaysOnTop).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByRole('slider', { name: '불투명도' }), { target: { value: '50' } });
    expect(screen.getByRole('region', { name: 'Deskling' }).style.getPropertyValue('--scene-opacity')).toBe('0.5');

    await user.click(screen.getByRole('button', { name: '모션: 시스템 설정' }));
    expect(screen.getByRole('region', { name: 'Deskling' })).toHaveAttribute('data-motion', 'reduced');

    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toEqual({
      size: 's',
      opacity: 0.5,
      alwaysOnTop: false,
      motion: 'reduced',
      demoScript: 'tour',
      tokenBudget: 200_000,
    });
  });

  it('closes the native window from the toolbar', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const controls = fakeControls();
    render(<App source={manualSource().source} controls={controls} storage={fakeStorage()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Deskling 닫기' }));
    expect(controls.close).toHaveBeenCalledTimes(1);
  });
});

describe('App window dragging (FR-W3, ADR-008)', () => {
  it('starts a native drag from empty scene areas with the primary button', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const controls = fakeControls();
    render(<App source={manualSource().source} controls={controls} storage={fakeStorage()} />);
    fireEvent.mouseDown(screen.getByRole('img', { name: /미니어처 작업실/ }), { button: 0 });
    expect(controls.startDragging).toHaveBeenCalledTimes(1);
  });

  it('does not drag on secondary clicks', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const controls = fakeControls();
    render(<App source={manualSource().source} controls={controls} storage={fakeStorage()} />);
    fireEvent.mouseDown(screen.getByRole('img', { name: /미니어처 작업실/ }), { button: 2 });
    expect(controls.startDragging).not.toHaveBeenCalled();
  });

  it('does not drag from the character, the toolbar or the panel', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const { default: userEvent } = await import('@testing-library/user-event');
    const controls = fakeControls();
    render(<App source={manualSource().source} controls={controls} storage={fakeStorage()} />);

    const hotspot = screen.getByRole('button', { name: '최근 활동 보기' });
    fireEvent.mouseDown(hotspot, { button: 0 });
    fireEvent.mouseDown(screen.getByRole('slider', { name: '불투명도' }), { button: 0 });
    fireEvent.mouseDown(screen.getByRole('toolbar', { name: '창 설정' }), { button: 0 });
    await userEvent.click(hotspot);
    fireEvent.mouseDown(screen.getByRole('dialog', { name: '최근 활동' }), { button: 0 });

    expect(controls.startDragging).not.toHaveBeenCalled();
  });
});

describe('App demo scenario (FR-D2, FR-D3)', () => {
  it('plays the stored demo scenario when no source is given', () => {
    vi.useFakeTimers();
    render(<App controls={fakeControls()} storage={fakeStorage({ demoScript: 'core' })} />);
    expect(sceneState()).toBe('idle');
    act(() => vi.advanceTimersByTime(DEMO_SCRIPTS.core.steps[0]!.dwellMs));
    expect(sceneState()).toBe('thinking');
  });

  it('starts the tour from offline by default', () => {
    vi.useFakeTimers();
    render(<App controls={fakeControls()} storage={fakeStorage()} />);
    expect(sceneState()).toBe('offline');
  });

  it('switches scenario from the panel, restarts the feed and remembers the choice', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const storage = fakeStorage();
    render(<App controls={fakeControls()} storage={storage} />);

    fireEvent.click(screen.getByRole('button', { name: '최근 활동 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '기본 흐름' }));

    expect(sceneState()).toBe('idle');
    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toMatchObject({ demoScript: 'core' });
    expect(screen.getByRole('button', { name: '기본 흐름' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers no scenario picker for a live source', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(<App source={manualSource('live').source} controls={fakeControls()} storage={fakeStorage()} />);
    fireEvent.click(screen.getByRole('button', { name: '최근 활동 보기' }));
    expect(screen.queryByRole('group', { name: '데모 시나리오' })).toBeNull();
  });
});

describe('App resilience (review T34a)', () => {
  it('opens the panel safely even after the largest accepted timestamp', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    live.emit({ ...raw(1, 'agent.online'), at: 8_640_000_000_000_000 });
    live.emit({ ...raw(2, 'turn.started'), at: Number.MAX_SAFE_INTEGER });
    fireEvent.click(screen.getByRole('button', { name: '최근 활동 보기' }));
    expect(screen.getByRole('dialog', { name: '최근 활동' })).toHaveTextContent('에이전트 연결됨');
  });
});

describe('App source switching (review T34c)', () => {
  it('ignores late events from a source that was already stopped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const first = manualSource('live');
    const { rerender } = render(<App source={first.source} controls={fakeControls()} storage={fakeStorage()} />);
    const second = manualSource('live');
    rerender(<App source={second.source} controls={fakeControls()} storage={fakeStorage()} />);

    second.emit(raw(1, 'turn.started'));
    expect(statusText()).toBe(VISUAL_SPEC.thinking.label);

    first.emit(raw(99, 'agent.offline'));
    first.emit({ broken: true });
    expect(statusText()).toBe(VISUAL_SPEC.thinking.label);
    expect(warn).not.toHaveBeenCalled();

    second.emit(raw(2, 'tool.started', { tool: 'code' }));
    second.emit(raw(3, 'tool.finished', { tool: 'code', outcome: 'ok' }));
    expect(statusText()).toBe(VISUAL_SPEC.thinking.label);
  });
});

describe('App settings updates (review T34g)', () => {
  it('keeps both changes when two settings change before a re-render', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const controls = fakeControls();
    const storage = fakeStorage();
    render(<App source={manualSource().source} controls={controls} storage={storage} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '작게' }));
      fireEvent.click(screen.getByRole('button', { name: '항상 위에 표시' }));
    });

    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toMatchObject({ size: 's', alwaysOnTop: false });
    expect(controls.setSize).toHaveBeenLastCalledWith(256, 224);
    expect(controls.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
  });
});
