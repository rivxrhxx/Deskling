import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoSource } from '../adapters/demo/demoSource';
import { DEMO_SCRIPTS } from '../adapters/demo/scripts';
import type { AgentEventSource, SourceMode } from '../adapters/types';
import { VISUAL_STATES } from '../core/agentEvent';
import { SPOTS, toScreen } from '../core/room';
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
const sceneState = () => screen.getByRole('img', { name: /헤르메스의 방/ }).getAttribute('data-state');

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

  it('plays the 방 친구들 demo by default (DEMO badge shown)', () => {
    render(<App controls={fakeControls()} storage={fakeStorage()} />);
    expect(sceneState()).toBe('coding');
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
    expect(screen.getByRole('note', { name: /데모 모드/ })).toBeVisible();

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
    setAlwaysOnBottom: vi.fn<(on: boolean) => Promise<void>>(() => Promise.resolve()),
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
    const storage = fakeStorage({ size: 'l', opacity: 0.6, floatOnTop: false, motion: 'reduced', demoScript: 'tour' });
    render(<App source={manualSource().source} controls={controls} storage={storage} />);

    expect(controls.setSize).toHaveBeenCalledWith(624, 442);
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
    expect(controls.setSize).toHaveBeenLastCalledWith(384, 272);

    await user.click(screen.getByRole('button', { name: '위에 띄우기' }));
    expect(controls.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
    expect(controls.setAlwaysOnBottom).toHaveBeenLastCalledWith(false);

    fireEvent.change(screen.getByRole('slider', { name: '불투명도' }), { target: { value: '50' } });
    expect(screen.getByRole('region', { name: 'Deskling' }).style.getPropertyValue('--scene-opacity')).toBe('0.5');

    await user.click(screen.getByRole('button', { name: '모션: 시스템 설정' }));
    expect(screen.getByRole('region', { name: 'Deskling' })).toHaveAttribute('data-motion', 'reduced');

    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toEqual({
      size: 's',
      opacity: 0.5,
      floatOnTop: true,
      motion: 'reduced',
      demoScript: 'friends',
      tokenBudget: 200_000,
      sourceChoice: 'auto',
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
    fireEvent.mouseDown(screen.getByRole('img', { name: /헤르메스의 방/ }), { button: 0 });
    expect(controls.startDragging).toHaveBeenCalledTimes(1);
  });

  it('does not drag on secondary clicks', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const controls = fakeControls();
    render(<App source={manualSource().source} controls={controls} storage={fakeStorage()} />);
    fireEvent.mouseDown(screen.getByRole('img', { name: /헤르메스의 방/ }), { button: 2 });
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

  it('starts the tour from offline when it is chosen', () => {
    vi.useFakeTimers();
    render(<App controls={fakeControls()} storage={fakeStorage({ demoScript: 'tour', sourceChoice: 'auto' })} />);
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
      fireEvent.click(screen.getByRole('button', { name: '위에 띄우기' }));
    });

    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toMatchObject({ size: 's', floatOnTop: true });
    expect(controls.setSize).toHaveBeenLastCalledWith(384, 272);
    expect(controls.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
  });
});

describe('App: Hermes lives in the room (FR-R2–R6, FR-V7)', () => {
  const scene = () => screen.getByRole('img', { name: /헤르메스의 방/ });
  const hermes = () => scene().querySelector('[data-part="hermes"]');

  it('sleeps until the agent connects, then goes to the desk when a task starts — and the hotspot follows', () => {
    vi.useFakeTimers();
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    const hotspot = screen.getByRole('button', { name: '최근 활동 보기' });
    expect(hermes()).toHaveAttribute('data-activity', 'sleep');

    live.emit(raw(1, 'agent.online'));
    live.emit(raw(2, 'turn.started'));
    expect(hermes()).toHaveAttribute('data-activity', 'ponder');
    act(() => vi.advanceTimersByTime(10_000));

    expect(hermes()).toHaveAttribute('data-walking', 'false');
    const desk = toScreen(SPOTS.desk.at);
    expect(hotspot.style.getPropertyValue('--hx')).toBe(String(desk.x));
    expect(hotspot.style.getPropertyValue('--hy')).toBe(String(desk.y));
  });

  it('has nobody over at random and no invite button (ADR-022 §5)', async () => {
    const { fireEvent } = await import('@testing-library/react');
    vi.useFakeTimers();
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    live.emit(raw(1, 'agent.online'));
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(scene().querySelector('[data-part="friend"], [data-part="guest"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '최근 활동 보기' }));
    expect(screen.queryByRole('button', { name: '친구 초대' })).toBeNull();
  });
});

describe('App: session friends (FR-MS1–MS7, ADR-022, ADR-023)', () => {
  const scene = () => screen.getByRole('img', { name: /헤르메스의 방/ });
  const guests = () => [...scene().querySelectorAll('[data-part="guest"]')];
  const guestOf = (kind: string, ordinal: number) => scene().querySelector(`[data-part="guest"][data-session-kind="${kind}"][data-ordinal="${ordinal}"]`);
  const attention = () => document.querySelector('[data-part="attention-line"]');
  const HERMES = { kind: 'hermes', session: 'h' };
  const claude = (session: string) => ({ kind: 'claude-code', session });
  const codex = (session: string) => ({ kind: 'codex', session });
  const seqs = new Map<string, number>();
  /** A v3 event from a given session, each session counting its own seq. */
  const from = (source: { kind: string; session: string }, type: string, extra: Record<string, unknown> = {}) => {
    const key = `${source.kind}:${source.session}`;
    const seq = (seqs.get(key) ?? 0) + 1;
    seqs.set(key, seq);
    return { ...raw(seq, type, extra), version: 3, id: `${key}-${seq}`, source };
  };

  beforeEach(() => {
    seqs.clear();
    vi.useFakeTimers();
  });

  it('a Claude Code session walks in as a friend and works at its laptop', () => {
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    live.emit(from(claude('a'), 'agent.online'));
    live.emit(from(claude('a'), 'tool.started', { tool: 'code' }));
    act(() => vi.advanceTimersByTime(300));
    // Still outside the door: not drawn yet, but the door is open for it.
    expect(guests()).toHaveLength(0);
    expect(scene().querySelector('[data-part="door"]')).toHaveAttribute('data-open', 'true');
    act(() => vi.advanceTimersByTime(1_200));
    expect(guestOf('claude-code', 1)).toHaveAttribute('data-walking', 'true');
    act(() => vi.advanceTimersByTime(12_000));
    expect(guestOf('claude-code', 1)).toHaveAttribute('data-walking', 'false');
    expect(guestOf('claude-code', 1)).toHaveAttribute('data-visual', 'coding');
    expect(scene().querySelector('[data-part="guest-laptop"]')).toHaveAttribute('data-open', 'true');
    // Hermes' own state is untouched: no resident session yet, so he sleeps.
    expect(scene()).toHaveAttribute('data-state', 'offline');
    expect(statusText()).toBe(VISUAL_SPEC.offline.label);
  });

  it('a friend leaves through the door when its session ends', () => {
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    live.emit(from(codex('x'), 'agent.online'));
    act(() => vi.advanceTimersByTime(12_000));
    expect(guests()).toHaveLength(1);
    live.emit(from(codex('x'), 'agent.offline'));
    act(() => vi.advanceTimersByTime(600));
    expect(guestOf('codex', 1)).toHaveAttribute('data-walking', 'true');
    act(() => vi.advanceTimersByTime(12_000));
    expect(guests()).toHaveLength(0);
  });

  it('keeps the bubble on Hermes and names a friend who needs the user in the attention line', () => {
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    live.emit(from(HERMES, 'turn.started'));
    live.emit(from(claude('a'), 'agent.online'));
    live.emit(from(claude('b'), 'agent.online'));
    expect(attention()).toBeEmptyDOMElement();

    live.emit(from(claude('b'), 'turn.failed'));
    expect(attention()).toHaveTextContent('Claude 2 · 오류');
    live.emit(from(claude('a'), 'approval.requested'));
    expect(attention()).toHaveTextContent('Claude 1 · 승인 대기 중+1');
    expect(attention()?.querySelector('[data-tone="amber"]')).not.toBeNull();
    expect(statusText()).toBe(VISUAL_SPEC.thinking.label);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('two friends who message each other turn to talk; a message to nobody in the room is a letter', () => {
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    live.emit(from(HERMES, 'turn.started'));
    live.emit(from(claude('a'), 'agent.online'));
    live.emit(from(codex('x'), 'agent.online'));
    act(() => vi.advanceTimersByTime(12_000));

    live.emit(from(claude('a'), 'session.message', { to: codex('x') }));
    act(() => vi.advanceTimersByTime(600));
    expect(guestOf('claude-code', 1)).toHaveAttribute('data-chat', 'talk');
    expect(guestOf('codex', 1)).toHaveAttribute('data-chat', 'talk');
    act(() => vi.advanceTimersByTime(4_000));
    expect(guests().map((g) => g.getAttribute('data-chat'))).toEqual([null, null]);

    live.emit(from(codex('x'), 'session.message', { to: HERMES }));
    act(() => vi.advanceTimersByTime(600));
    expect(scene().querySelector('[data-part="hermes"]')).toHaveAttribute('data-chat', 'talk');

    act(() => vi.advanceTimersByTime(4_000));
    live.emit(from(codex('x'), 'session.message'));
    act(() => vi.advanceTimersByTime(600));
    expect(guestOf('codex', 1)).toHaveAttribute('data-chat', 'letter');
  });

  it('lists who is in the room and names sessions in the recent activity', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    live.emit(from(HERMES, 'turn.started'));
    for (const session of ['a', 'b', 'c', 'd', 'e']) live.emit(from(claude(session), 'agent.online'));
    live.emit(from(claude('a'), 'tool.started', { tool: 'code' }));
    live.emit(from(claude('b'), 'session.message', { to: HERMES }));
    live.emit(from(claude('c'), 'session.message'));
    fireEvent.click(screen.getByRole('button', { name: '최근 활동 보기' }));

    const sessions = within(screen.getByRole('group', { name: '방에 있는 세션' })).getAllByRole('listitem');
    expect(sessions.map((row) => row.textContent)).toEqual([
      '헤르메스생각 중',
      'Claude 1코딩 중',
      'Claude 2대기 중',
      'Claude 3대기 중',
      'Claude 4대기 중',
      'Claude 5대기 중(자리 없음)',
    ]);
    const recent = within(screen.getByRole('list', { name: '최근 활동 목록' }));
    expect(recent.getByText('Claude 3 메시지 보냄')).toBeInTheDocument();
    expect(recent.getByText('Claude 2 → 헤르메스 메시지')).toBeInTheDocument();
    expect(recent.getByText('Claude 1 · 코드 편집 시작')).toBeInTheDocument();
    expect(recent.getByText('헤르메스 · 작업 시작')).toBeInTheDocument();
  });

  it('draws at most four friends; the fifth waits in the panel only', () => {
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    for (const session of ['a', 'b', 'c', 'd', 'e']) live.emit(from(claude(session), 'agent.online'));
    act(() => vi.advanceTimersByTime(12_000));
    expect(guests().map((g) => g.getAttribute('data-ordinal')).sort()).toEqual(['1', '2', '3', '4']);
  });

  it("grows the pet from friends' finished work too (ADR-022 §7)", () => {
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    for (let i = 0; i < 5; i += 1) {
      live.emit(from(codex('x'), 'turn.started'));
      live.emit(from(codex('x'), 'turn.succeeded'));
    }
    expect(scene().querySelector('[data-part="hermes"]')).toHaveAttribute('data-stage', 'kid');
  });

  it('plays the "방 친구들" demo: Hermes works while friends come in (FR-MS7)', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const storage = fakeStorage();
    render(<App controls={fakeControls()} storage={storage} />);
    fireEvent.click(screen.getByRole('button', { name: '최근 활동 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '방 친구들' }));
    expect(screen.getByRole('button', { name: '방 친구들' })).toHaveAttribute('aria-pressed', 'true');
    expect(sceneState()).toBe('coding');
    expect(screen.getByRole('note', { name: /데모 모드/ })).toBeVisible();

    // Step by step, so the room re-renders between beats as it does in real time.
    for (const step of DEMO_SCRIPTS.friends.steps.slice(0, 5)) {
      for (let elapsed = 0; elapsed < step.dwellMs; elapsed += 500) act(() => vi.advanceTimersByTime(500));
    }
    expect(guests().map((g) => `${g.getAttribute('data-session-kind')} ${g.getAttribute('data-ordinal')}`).sort()).toEqual([
      'claude-code 1',
      'claude-code 2',
      'codex 1',
    ]);
    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toMatchObject({ demoScript: 'friends' });
  });
});

describe('App vitals: usage → energy/anger → scene and panel (FR-V2–V6)', () => {
  const usageRaw = (seq: number, usage: object) => ({ ...raw(seq, 'usage.reported'), version: 2, usage });
  const scene = () => screen.getByRole('img', { name: /헤르메스의 방/ });

  it('turns reported usage into scene moods without numbers in the scene', () => {
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    live.emit(raw(1, 'turn.started'));
    expect(scene()).toHaveAttribute('data-energy', 'unknown');

    live.emit(usageRaw(2, { tokens: { used: 150_000 }, context: { used: 185_000, limit: 200_000 } }));
    expect(scene()).toHaveAttribute('data-energy', 'low');
    expect(scene()).toHaveAttribute('data-anger', 'furious');
    expect(scene().textContent).not.toMatch(/\d/);
  });

  it('shows the numbers in the panel and keeps usage out of the activity list', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const live = manualSource('live');
    render(<App source={live.source} controls={fakeControls()} storage={fakeStorage()} />);
    live.emit(raw(1, 'turn.started'));
    live.emit(usageRaw(2, { tokens: { used: 120_000 }, context: { used: 156_000, limit: 200_000 } }));
    fireEvent.click(screen.getByRole('button', { name: '최근 활동 보기' }));

    const dialog = screen.getByRole('dialog', { name: '최근 활동' });
    expect(dialog).toHaveTextContent('남은 토큰 80k / 200k');
    expect(dialog).toHaveTextContent('156k / 200k · 78%');
    expect(dialog).not.toHaveTextContent('사용량 보고');
  });

  it('re-reads energy when the user changes the token budget, and remembers it', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const live = manualSource('live');
    const storage = fakeStorage();
    render(<App source={live.source} controls={fakeControls()} storage={storage} />);
    live.emit(usageRaw(1, { tokens: { used: 150_000 } }));
    expect(scene()).toHaveAttribute('data-energy', 'low');

    fireEvent.click(screen.getByRole('button', { name: '최근 활동 보기' }));
    fireEvent.change(screen.getByRole('combobox', { name: '토큰 예산' }), { target: { value: '1000000' } });

    expect(scene()).toHaveAttribute('data-energy', 'full');
    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toMatchObject({ tokenBudget: 1_000_000 });
  });
});

describe('App growing the desktop pet (FR-G1–G6, ADR-018)', () => {
  const scene = () => screen.getByRole('img', { name: /헤르메스의 방/ });
  const stage = () => scene().querySelector('[data-part="hermes"]')?.getAttribute('data-stage');

  function completeTurns(live: ReturnType<typeof manualSource>, count: number, startSeq = 1) {
    let seq = startSeq;
    for (let i = 0; i < count; i += 1) {
      live.emit(raw(seq++, 'turn.started'));
      live.emit(raw(seq++, 'turn.succeeded'));
    }
    return seq;
  }

  it('grows from completed tasks and saves the live profile', () => {
    const live = manualSource('live');
    const storage = fakeStorage();
    render(<App source={live.source} controls={fakeControls()} storage={storage} />);
    expect(stage()).toBe('baby');

    completeTurns(live, 5);

    expect(stage()).toBe('kid');
    expect(scene().querySelector('[data-part="decor-poster"]')).not.toBeNull();
    expect(scene().querySelector('[data-part="decor-desk-plant"]')).not.toBeNull();
    const book = JSON.parse(storage.data.get('deskling.pet.v1') ?? '{}');
    expect(book.live.xp).toBe(5);
    expect(book.demo.xp).toBe(0);
  });

  it('remembers growth across restarts', () => {
    const storage = fakeStorage();
    storage.data.set('deskling.pet.v1', JSON.stringify({ live: { name: '콩이', xp: 30 } }));
    render(<App source={manualSource('live').source} controls={fakeControls()} storage={storage} />);
    expect(stage()).toBe('adult');
    expect(scene().querySelector('[data-part="decor-trophy"]')).not.toBeNull();
  });

  it('lets the user name, pet and feed the pet without touching the agent state', async () => {
    const { fireEvent } = await import('@testing-library/react');
    vi.useFakeTimers();
    const live = manualSource('live');
    const storage = fakeStorage();
    render(<App source={live.source} controls={fakeControls()} storage={storage} />);
    live.emit(raw(1, 'turn.started'));
    live.emit({ ...raw(2, 'usage.reported'), version: 2, usage: { tokens: { used: 150_000 } } });
    fireEvent.click(screen.getByRole('button', { name: '최근 활동 보기' }));

    const nameField = screen.getByRole('textbox', { name: '이름' });
    fireEvent.change(nameField, { target: { value: '콩이' } });
    fireEvent.keyDown(nameField, { key: 'Enter' });
    expect(JSON.parse(storage.data.get('deskling.pet.v1') ?? '{}').live.name).toBe('콩이');

    fireEvent.click(screen.getByRole('button', { name: '쓰다듬기' }));
    expect(scene().querySelector('[data-emote="heart"]')).not.toBeNull();
    expect(scene()).toHaveAttribute('data-state', 'thinking');
    expect(scene()).toHaveAttribute('data-energy', 'low');

    act(() => vi.advanceTimersByTime(2200));
    expect(scene().querySelector('[data-emote="heart"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '간식 주기, 오늘 3개 남음' }));
    expect(scene().querySelector('[data-part="cookie"]')).not.toBeNull();
    expect(screen.getByRole('img', { name: '애정도 하트 5개 중 1개' })).toBeInTheDocument();
  });

  it('marks the demo profile as DEMO in the pet card', async () => {
    const { fireEvent } = await import('@testing-library/react');
    render(<App source={manualSource('demo').source} controls={fakeControls()} storage={fakeStorage()} />);
    fireEvent.click(screen.getByRole('button', { name: '최근 활동 보기' }));
    expect(within(screen.getByRole('group', { name: '펫' })).getByText('DEMO')).toBeInTheDocument();
  });
});

describe('App window layer (FR-R7, ADR-021)', () => {
  it('embeds the window in the desktop by default', () => {
    const controls = fakeControls();
    render(<App source={manualSource().source} controls={controls} storage={fakeStorage()} />);
    expect(controls.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(controls.setAlwaysOnBottom).toHaveBeenLastCalledWith(true);
  });

  it('floats above other windows when the user asks for it', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const controls = fakeControls();
    render(<App source={manualSource().source} controls={controls} storage={fakeStorage()} />);
    fireEvent.click(screen.getByRole('button', { name: '위에 띄우기' }));
    expect(controls.setAlwaysOnBottom).toHaveBeenLastCalledWith(false);
    expect(controls.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
  });
});

describe('App source choice: real Claude Code sessions vs the demo (FR-CC4, ADR-024)', () => {
  function fakeLive() {
    let deliver: ((raw: unknown) => void) | null = null;
    const unlisten = vi.fn();
    const listen = vi.fn((onRecord: (raw: unknown) => void) => {
      deliver = onRecord;
      return Promise.resolve(unlisten);
    });
    const record = (event: string, extra: Record<string, unknown> = {}) =>
      act(() => deliver?.({ v: 1, agent: 'claude-code', session: 'cc-session-1', event, at: 1_000, ...extra }));
    return { listen, unlisten, record };
  }
  const guests = () => [...document.querySelectorAll('[data-part="guest"]')];

  it('auto: plays the demo until a real session speaks, then shows the real room without the DEMO badge', async () => {
    vi.useFakeTimers();
    const live = fakeLive();
    render(<App controls={fakeControls()} storage={fakeStorage()} liveListen={live.listen} />);
    await act(async () => {});
    expect(screen.getByText('DEMO')).toBeVisible();

    live.record('tool-start', { tool: 'code' });
    act(() => vi.advanceTimersByTime(8_000));

    expect(screen.queryByText('DEMO')).toBeNull();
    expect(sceneState()).toBe('offline');
    expect(guests().map((g) => g.getAttribute('data-session-kind'))).toEqual(['claude-code']);
    expect(guests()[0]).toHaveAttribute('data-visual', 'coding');
  });

  it('demo: stays on the demo even when real sessions speak', async () => {
    const live = fakeLive();
    render(<App controls={fakeControls()} storage={fakeStorage({ sourceChoice: 'demo' })} liveListen={live.listen} />);
    await act(async () => {});
    live.record('session-start');
    expect(screen.getByText('DEMO')).toBeVisible();
  });

  it('live: shows the real room from the start — Hermes asleep when nobody is connected', async () => {
    const live = fakeLive();
    render(<App controls={fakeControls()} storage={fakeStorage({ sourceChoice: 'live' })} liveListen={live.listen} />);
    await act(async () => {});
    expect(screen.queryByText('DEMO')).toBeNull();
    expect(sceneState()).toBe('offline');
  });

  it('switches from the panel, remembers the choice and hides the demo picker while showing real sessions', async () => {
    const { fireEvent } = await import('@testing-library/react');
    const live = fakeLive();
    const storage = fakeStorage();
    render(<App controls={fakeControls()} storage={storage} liveListen={live.listen} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: '최근 활동 보기' }));
    const view = screen.getByRole('group', { name: '보기' });
    expect(view).toHaveTextContent('지금: 데모');
    expect(screen.getByRole('group', { name: '데모 시나리오' })).toBeInTheDocument();

    fireEvent.click(within(view).getByRole('button', { name: '실제' }));
    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toMatchObject({ sourceChoice: 'live' });
    expect(screen.getByRole('group', { name: '보기' })).toHaveTextContent('지금: 실제 세션');
    expect(screen.queryByRole('group', { name: '데모 시나리오' })).toBeNull();
    expect(screen.queryByText('DEMO')).toBeNull();
  });

  it('listens to the bridge once and stops on unmount', async () => {
    const live = fakeLive();
    const { unmount } = render(<App controls={fakeControls()} storage={fakeStorage()} liveListen={live.listen} />);
    await act(async () => {});
    unmount();
    await act(async () => {});
    expect(live.unlisten).toHaveBeenCalled();
  });
});
