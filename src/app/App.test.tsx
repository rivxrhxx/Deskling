import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoSource } from '../adapters/demo/demoSource';
import { DEMO_SCRIPTS } from '../adapters/demo/scripts';
import type { AgentEventSource, SourceMode } from '../adapters/types';
import { VISUAL_STATES } from '../core/agentEvent';
import { mockReducedMotion } from '../test/matchMedia';
import { App } from './App';
import { memberId } from './officeProgress';

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

/** A v1 event from one custom session ("에이전트 1"). */
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

const seqs = new Map<string, number>();
/** A v3 event from a given session, each session counting its own seq. */
const from = (source: { kind: string; session: string }, type: string, extra: Record<string, unknown> = {}) => {
  const key = `${source.kind}:${source.session}`;
  const seq = (seqs.get(key) ?? 0) + 1;
  seqs.set(key, seq);
  return { ...raw(seq, type, extra), version: 3, id: `${key}-${seq}`, source };
};
const claude = (session: string) => ({ kind: 'claude-code', session });
const codex = (session: string) => ({ kind: 'codex', session });
const agent = (session: string) => ({ kind: 'custom', session });

/** The office summary: the button that opens the activity panel (ADR-025 §5). */
const bubble = () => screen.getByRole('button', { description: '최근 활동 보기' });
const summaryText = () => bubble().textContent;
const scene = () => screen.getByRole('img', { name: /^사무실/ });
const members = () => [...scene().querySelectorAll('[data-part="member"]')];
const memberOf = (kind: string, ordinal: number) =>
  scene().querySelector(`[data-part="member"][data-session-kind="${kind}"][data-ordinal="${ordinal}"]`);
const who = () => members().map((m) => `${m.getAttribute('data-session-kind')} ${m.getAttribute('data-ordinal')}`).sort();
const attention = () => document.querySelector('[data-part="attention-line"]');
const openPanel = () => fireEvent.click(bubble());

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

/** Renders the app on a manual live source with test controls and storage. */
function renderLive(storage = fakeStorage()) {
  const live = manualSource('live');
  const controls = fakeControls();
  render(<App source={live.source} controls={controls} storage={storage} />);
  return { live, controls, storage };
}

beforeEach(() => {
  mockReducedMotion(false);
  seqs.clear();
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
  it('plays the core scenario as one member, 데모 1: idle → thinking → coding → terminal → success → idle', () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    render(<App source={createDemoSource({ script: DEMO_SCRIPTS.core, now: () => 0 })} storage={fakeStorage()} />);

    const visuals: Array<string | null | undefined> = [];
    const texts: Array<string | null> = [];
    for (const step of DEMO_SCRIPTS.core.steps) {
      visuals.push(memberOf('demo', 1)?.getAttribute('data-visual'));
      texts.push(summaryText());
      act(() => vi.advanceTimersByTime(step.dwellMs));
    }

    expect(visuals).toEqual(['idle', 'thinking', 'coding', 'terminal', 'success', 'idle']);
    expect(texts).toEqual(['1명 쉬는 중', '1명 일하는 중', '1명 일하는 중', '1명 일하는 중', '1명 쉬는 중', '1명 쉬는 중']);
  });

  it('shows the DEMO badge in every state of the tour', () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    render(<App source={createDemoSource({ script: DEMO_SCRIPTS.tour, now: () => 0 })} storage={fakeStorage()} />);

    const seen: string[] = [];
    for (const step of DEMO_SCRIPTS.tour.steps) {
      seen.push(memberOf('demo', 1)?.getAttribute('data-visual') ?? 'offline');
      expect(screen.getByText('DEMO')).toBeVisible();
      act(() => vi.advanceTimersByTime(step.dwellMs));
    }
    expect(seen).toEqual([...VISUAL_STATES]);
  });

  it('plays the 사무실 하루 demo by default (DEMO badge shown)', () => {
    render(<App controls={fakeControls()} storage={fakeStorage()} />);
    expect(summaryText()).toBe('1명 일하는 중');
    expect(screen.getByText('DEMO')).toBeVisible();
  });
});

describe('App with a live source', () => {
  it('starts with an empty, dark office and shows no DEMO badge', () => {
    renderLive();
    expect(summaryText()).toBe('아무도 없음');
    expect(bubble()).toHaveAttribute('data-tone', 'dim');
    expect(scene()).toHaveAccessibleName('사무실 — 아무도 없음');
    expect(scene().querySelector('[data-part="night"]')).not.toBeNull();
    expect(screen.queryByText('DEMO')).toBeNull();
  });

  it('renders only normalized facts — secrets in raw events never reach the DOM (SEC-1, SEC-2)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const live = manualSource('live');
    const { container } = render(<App source={live.source} storage={fakeStorage()} />);

    live.emit(raw(1, 'turn.started', { reasoning: 'SECRET-COT', prompt: 'SECRET-PROMPT' }));
    live.emit(raw(2, 'tool.started', { tool: 'terminal', command: 'SECRET-CMD', path: '/SECRET/path' }));
    live.emit({ ...raw(3, 'tool.started'), tool: 'SECRET-TOOL' });
    openPanel();

    expect(summaryText()).toBe('1명 일하는 중');
    expect(screen.getByRole('dialog')).toHaveTextContent('에이전트 1 · 터미널 시작');
    expect(container.innerHTML).not.toMatch(/SECRET/);
    expect(warn).toHaveBeenCalledWith('[deskling] rejected agent event: bad-tool');
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/SECRET/);
  });

  it('resets to the new source facts when the source changes', () => {
    const first = manualSource('live');
    const { rerender } = render(<App source={first.source} storage={fakeStorage()} />);
    first.emit(raw(1, 'turn.started'));
    expect(summaryText()).toBe('1명 일하는 중');

    const second = manualSource('live');
    rerender(<App source={second.source} storage={fakeStorage()} />);
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(summaryText()).toBe('아무도 없음');
  });

  it('stops the source on unmount', () => {
    const live = manualSource('live');
    const { unmount } = render(<App source={live.source} storage={fakeStorage()} />);
    unmount();
    expect(live.stop).toHaveBeenCalledTimes(1);
  });
});

describe('App motion (FR-M1, FR-M3)', () => {
  it('marks the root as reduced when the OS prefers reduced motion', () => {
    mockReducedMotion(true);
    render(<App source={manualSource().source} storage={fakeStorage()} />);
    expect(screen.getByRole('region', { name: 'Deskling' })).toHaveAttribute('data-motion', 'reduced');
  });

  it('marks the root as full motion otherwise, keeping pose, icon and text either way', () => {
    mockReducedMotion(true);
    const { live } = renderLive();
    live.emit(raw(1, 'turn.started'));
    expect(screen.getByRole('region', { name: 'Deskling' })).toHaveAttribute('data-motion', 'reduced');
    expect(memberOf('custom', 1)).toHaveAttribute('data-pose');
    expect(bubble().querySelector('[data-icon]')).not.toBeNull();
    expect(summaryText()).toBe('1명 일하는 중');
  });
});

describe('App activity panel: the summary opens it (FR-P1, FR-P3, ADR-025 §5)', () => {
  it('opens from the office summary, lists recent activity and closes with Escape, returning focus', async () => {
    const user = userEvent.setup();
    const live = manualSource('demo');
    render(<App source={live.source} storage={fakeStorage()} />);
    live.emit(raw(1, 'agent.online'));
    live.emit(raw(2, 'turn.started'));

    const summary = bubble();
    expect(summary).toHaveAttribute('aria-haspopup', 'dialog');
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    await user.click(summary);

    const dialog = screen.getByRole('dialog', { name: '최근 활동' });
    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(dialog).toHaveTextContent('에이전트 1 · 작업 시작');
    expect(dialog).toHaveTextContent('에이전트 1 · 에이전트 연결됨');
    expect(screen.getByRole('note', { name: /데모 모드/ })).toBeVisible();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(summary).toHaveFocus();
  });

  it('toggles: a second press closes it', async () => {
    const user = userEvent.setup();
    renderLive();
    await user.click(bubble());
    expect(screen.getByRole('dialog', { name: '최근 활동' })).toBeInTheDocument();
    await user.click(bubble());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens from the keyboard', async () => {
    const user = userEvent.setup();
    renderLive();
    bubble().focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: '최근 활동' })).toBeInTheDocument();
  });

  it('has no character hotspot: the summary is the only way in', () => {
    renderLive();
    expect(document.querySelector('.character-hotspot')).toBeNull();
    expect(screen.queryByRole('button', { name: '최근 활동 보기' })).toBeNull();
  });
});

describe('App window settings (FR-W2, FR-W4–W6, FR-W8, FR-M2)', () => {
  it('applies stored settings to the native window and the scene on start', () => {
    const controls = fakeControls();
    const storage = fakeStorage({ size: 'l', opacity: 0.6, floatOnTop: false, motion: 'reduced', demoScript: 'tour' });
    render(<App source={manualSource().source} controls={controls} storage={storage} />);

    expect(controls.setSize).toHaveBeenCalledWith(832, 572);
    expect(controls.setAlwaysOnTop).toHaveBeenCalledWith(false);
    const root = screen.getByRole('region', { name: 'Deskling' });
    expect(root.style.getPropertyValue('--scene-opacity')).toBe('0.6');
    expect(root).toHaveAttribute('data-motion', 'reduced');
  });

  it('changes size, pin, opacity and motion from the toolbar and persists them', async () => {
    const user = userEvent.setup();
    const { controls, storage } = renderLive();

    await user.click(screen.getByRole('button', { name: '작게' }));
    expect(controls.setSize).toHaveBeenLastCalledWith(512, 352);

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
      demoScript: 'office',
      tokenBudget: 200_000,
      sourceChoice: 'auto',
    });
  });

  it('closes the native window from the toolbar', async () => {
    const { controls } = renderLive();
    await userEvent.click(screen.getByRole('button', { name: 'Deskling 닫기' }));
    expect(controls.close).toHaveBeenCalledTimes(1);
  });
});

describe('App window dragging (FR-W3, ADR-008)', () => {
  it('starts a native drag from empty scene areas with the primary button', () => {
    const { controls } = renderLive();
    fireEvent.mouseDown(scene(), { button: 0 });
    expect(controls.startDragging).toHaveBeenCalledTimes(1);
  });

  it('does not drag on secondary clicks', () => {
    const { controls } = renderLive();
    fireEvent.mouseDown(scene(), { button: 2 });
    expect(controls.startDragging).not.toHaveBeenCalled();
  });

  it('does not drag from the summary, the toolbar or the panel', async () => {
    const { controls } = renderLive();
    fireEvent.mouseDown(bubble(), { button: 0 });
    fireEvent.mouseDown(screen.getByRole('slider', { name: '불투명도' }), { button: 0 });
    fireEvent.mouseDown(screen.getByRole('toolbar', { name: '창 설정' }), { button: 0 });
    await userEvent.click(bubble());
    fireEvent.mouseDown(screen.getByRole('dialog', { name: '최근 활동' }), { button: 0 });
    expect(controls.startDragging).not.toHaveBeenCalled();
  });
});

describe('App demo scenario (FR-D2, FR-D3)', () => {
  it('plays the stored demo scenario when no source is given', () => {
    vi.useFakeTimers();
    render(<App controls={fakeControls()} storage={fakeStorage({ demoScript: 'core' })} />);
    expect(summaryText()).toBe('1명 쉬는 중');
    act(() => vi.advanceTimersByTime(DEMO_SCRIPTS.core.steps[0]!.dwellMs));
    expect(summaryText()).toBe('1명 일하는 중');
  });

  it('starts the tour from an empty office when it is chosen', () => {
    vi.useFakeTimers();
    render(<App controls={fakeControls()} storage={fakeStorage({ demoScript: 'tour', sourceChoice: 'auto' })} />);
    expect(summaryText()).toBe('아무도 없음');
  });

  it('offers the four scenarios, 사무실 하루 first and chosen by default', () => {
    render(<App controls={fakeControls()} storage={fakeStorage()} />);
    openPanel();
    const picker = screen.getByRole('group', { name: '데모 시나리오' });
    expect(within(picker).getAllByRole('button').map((b) => b.textContent)).toEqual(['사무실 하루', '기본 흐름', '전체 상태', '하루 일과']);
    expect(within(picker).getByRole('button', { name: '사무실 하루' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches scenario from the panel, restarts the feed and remembers the choice', () => {
    const storage = fakeStorage();
    render(<App controls={fakeControls()} storage={storage} />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: '기본 흐름' }));

    expect(summaryText()).toBe('1명 쉬는 중');
    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toMatchObject({ demoScript: 'core' });
    expect(screen.getByRole('button', { name: '기본 흐름' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers no scenario picker for a live source', () => {
    renderLive();
    openPanel();
    expect(screen.queryByRole('group', { name: '데모 시나리오' })).toBeNull();
  });
});

describe('App resilience (review T34a)', () => {
  it('opens the panel safely even after the largest accepted timestamp', () => {
    const { live } = renderLive();
    live.emit({ ...raw(1, 'agent.online'), at: 8_640_000_000_000_000 });
    live.emit({ ...raw(2, 'turn.started'), at: Number.MAX_SAFE_INTEGER });
    openPanel();
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
    expect(summaryText()).toBe('1명 일하는 중');

    first.emit(raw(99, 'agent.offline'));
    first.emit({ broken: true });
    expect(summaryText()).toBe('1명 일하는 중');
    expect(warn).not.toHaveBeenCalled();

    second.emit(raw(2, 'tool.started', { tool: 'code' }));
    second.emit(raw(3, 'tool.finished', { tool: 'code', outcome: 'ok' }));
    expect(summaryText()).toBe('1명 일하는 중');
  });
});

describe('App settings updates (review T34g)', () => {
  it('keeps both changes when two settings change before a re-render', () => {
    const { controls, storage } = renderLive();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '작게' }));
      fireEvent.click(screen.getByRole('button', { name: '위에 띄우기' }));
    });

    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toMatchObject({ size: 's', floatOnTop: true });
    expect(controls.setSize).toHaveBeenLastCalledWith(512, 352);
    expect(controls.setAlwaysOnTop).toHaveBeenLastCalledWith(true);
  });
});

describe('App: the office — one member per session (ADR-025 §1–§5, FR-MS*)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('every session walks in as a member, numbered within its kind, and works at the lowest free desk', () => {
    const { live } = renderLive();
    live.emit(from(claude('a'), 'agent.online'));
    live.emit(from(claude('a'), 'tool.started', { tool: 'code' }));
    live.emit(from(codex('x'), 'agent.online'));
    live.emit(from(agent('z'), 'turn.started'));
    act(() => vi.advanceTimersByTime(15_000));

    expect(who()).toEqual(['claude-code 1', 'codex 1', 'custom 1']);
    expect(memberOf('claude-code', 1)).toHaveAttribute('data-walking', 'false');
    expect(memberOf('claude-code', 1)).toHaveAttribute('data-visual', 'coding');
    expect(memberOf('claude-code', 1)).toHaveAttribute('data-desk', 'desk-1');
    expect(memberOf('codex', 1)).toHaveAttribute('data-desk', 'desk-2');
    expect(memberOf('custom', 1)).toHaveAttribute('data-visual', 'thinking');
    expect(scene()).toHaveAccessibleName('사무실 — 3명');
    expect(scene().querySelector('[data-part="night"]')).toBeNull();
  });

  it('a member leaves through the door when its session ends', () => {
    const { live } = renderLive();
    live.emit(from(codex('x'), 'agent.online'));
    act(() => vi.advanceTimersByTime(15_000));
    expect(members()).toHaveLength(1);
    live.emit(from(codex('x'), 'agent.offline'));
    act(() => vi.advanceTimersByTime(600));
    expect(memberOf('codex', 1)).toHaveAttribute('data-walking', 'true');
    act(() => vi.advanceTimersByTime(15_000));
    expect(members()).toHaveLength(0);
    expect(summaryText()).toBe('아무도 없음');
  });

  it('the summary counts the office and takes the most urgent tone; the attention line names who', () => {
    const { live } = renderLive();
    live.emit(from(claude('a'), 'tool.started', { tool: 'code' }));
    expect([summaryText(), bubble().getAttribute('data-tone')]).toEqual(['1명 일하는 중', 'cool']);
    expect(bubble()).toHaveAttribute('data-state', 'working');

    live.emit(from(claude('b'), 'agent.online'));
    expect([summaryText(), bubble().getAttribute('data-tone')]).toEqual(['1명 일하는 중 · 1명 쉬는 중', 'cool']);

    live.emit(from(claude('c'), 'turn.started'));
    live.emit(from(claude('c'), 'turn.failed'));
    expect([summaryText(), bubble().getAttribute('data-tone')]).toEqual(['1명 일하는 중 · 1명 오류 · 1명 쉬는 중', 'ember']);
    expect(attention()).toHaveTextContent('Claude 3 · 오류');

    live.emit(from(codex('x'), 'approval.requested'));
    expect([summaryText(), bubble().getAttribute('data-tone')]).toEqual([
      '1명 일하는 중 · 1명 승인 대기 · 1명 오류 · 1명 쉬는 중',
      'amber',
    ]);
    expect(bubble().querySelector('[data-icon="hand"]')).not.toBeNull();
    expect(attention()).toHaveTextContent('Codex 1 · 승인 대기 중+1');

    for (const source of [claude('a'), claude('c'), codex('x')]) live.emit(from(source, 'agent.offline'));
    expect([summaryText(), bubble().getAttribute('data-tone')]).toEqual(['1명 쉬는 중', 'mint']);
    expect(attention()).toBeEmptyDOMElement();

    live.emit(from(claude('b'), 'agent.offline'));
    expect([summaryText(), bubble().getAttribute('data-state')]).toEqual(['아무도 없음', 'empty']);
  });

  it('two members who message each other turn to talk; a message to nobody in the office is a letter', () => {
    const { live } = renderLive();
    live.emit(from(claude('a'), 'agent.online'));
    live.emit(from(codex('x'), 'agent.online'));
    act(() => vi.advanceTimersByTime(15_000));

    live.emit(from(claude('a'), 'session.message', { to: codex('x') }));
    act(() => vi.advanceTimersByTime(600));
    expect(memberOf('claude-code', 1)).toHaveAttribute('data-chat', 'talk');
    expect(memberOf('codex', 1)).toHaveAttribute('data-chat', 'talk');
    act(() => vi.advanceTimersByTime(4_000));
    expect(members().map((m) => m.getAttribute('data-chat'))).toEqual([null, null]);

    live.emit(from(codex('x'), 'session.message'));
    act(() => vi.advanceTimersByTime(600));
    expect(memberOf('codex', 1)).toHaveAttribute('data-chat', 'letter');
  });

  it('lists who is in the office and names sessions in the recent activity', () => {
    const { live } = renderLive();
    for (const session of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) live.emit(from(claude(session), 'agent.online'));
    live.emit(from(claude('a'), 'tool.started', { tool: 'code' }));
    live.emit(from(claude('b'), 'session.message', { to: claude('a') }));
    live.emit(from(claude('c'), 'session.message'));
    openPanel();

    const rows = within(screen.getByRole('group', { name: '사무실에 있는 세션' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Claude 1코딩 중',
      ...[2, 3, 4, 5, 6, 7, 8].map((n) => `Claude ${n}대기 중`),
      'Claude 9대기 중(자리 없음)',
    ]);
    const recent = within(screen.getByRole('list', { name: '최근 활동 목록' }));
    expect(recent.getByText('Claude 3 메시지 보냄')).toBeInTheDocument();
    expect(recent.getByText('Claude 2 → Claude 1 메시지')).toBeInTheDocument();
    expect(recent.getByText('Claude 1 · 코드 편집 시작')).toBeInTheDocument();
  });

  it('draws at most eight members, one per desk; the ninth waits in the panel only', () => {
    const { live } = renderLive();
    for (const session of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']) live.emit(from(claude(session), 'agent.online'));
    act(() => vi.advanceTimersByTime(20_000));
    expect(members().map((m) => m.getAttribute('data-ordinal')).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(new Set(members().map((m) => m.getAttribute('data-desk'))).size).toBe(8);
  });

  it('draws the helper bot beside a member whose work is delegated', () => {
    mockReducedMotion(true);
    const { live } = renderLive();
    live.emit(from(agent('z'), 'turn.started'));
    expect(scene().querySelector('[data-part="helper-bot"]')).toBeNull();
    live.emit(from(agent('z'), 'delegation.started'));
    expect(memberOf('custom', 1)).toHaveAttribute('data-visual', 'delegated');
    expect(scene().querySelector('[data-part="helper-bot"]')).not.toBeNull();
  });

  it('plays the 사무실 하루 demo: people come in, work, rest, talk, need the user and leave (FR-MS7)', () => {
    mockReducedMotion(true);
    const storage = fakeStorage();
    render(<App controls={fakeControls()} storage={storage} />);
    expect(screen.getByRole('note', { name: /데모 모드/ })).toBeVisible();

    const seen = new Set<string>();
    const texts = new Set<string>();
    // Step by step, so the office re-renders between beats as it does in real time.
    for (const step of DEMO_SCRIPTS.office.steps) {
      for (let elapsed = 0; elapsed < step.dwellMs; elapsed += 500) {
        act(() => vi.advanceTimersByTime(500));
        for (const m of members()) seen.add(`${m.getAttribute('data-session-kind')} ${m.getAttribute('data-ordinal')}`);
        texts.add(summaryText() ?? '');
      }
    }
    expect([...seen].sort()).toEqual(['claude-code 1', 'claude-code 2', 'claude-code 3', 'codex 1', 'codex 2', 'custom 1']);
    expect([...texts].some((text) => text.includes('승인 대기'))).toBe(true);
    expect([...texts].some((text) => text.includes('오류'))).toBe(true);
    expect([...texts].some((text) => text.includes('쉬는 중'))).toBe(true);
    expect(texts).toContain('아무도 없음');
  });
});

describe('App vitals: each member’s usage → energy/anger → its desk and the panel (FR-V2–V6, ADR-025 §6)', () => {
  const usage = (source: { kind: string; session: string }, report: object) => ({ ...from(source, 'usage.reported'), usage: report });
  const cansAt = (desk: string) => scene().querySelectorAll(`[data-part="energy-can"][data-desk="${desk}"]`).length;

  beforeEach(() => {
    mockReducedMotion(true);
  });

  it("reads each member's reported usage on its own, with no numbers in the scene", () => {
    const { live } = renderLive();
    live.emit(from(claude('a'), 'turn.started'));
    live.emit(from(codex('x'), 'turn.started'));
    expect(cansAt('desk-2')).toBe(0);

    live.emit(usage(codex('x'), { tokens: { used: 150_000 }, context: { used: 185_000, limit: 200_000 } }));
    expect(cansAt('desk-2')).toBeGreaterThan(0);
    expect(cansAt('desk-1')).toBe(0);
    expect(scene().textContent).not.toMatch(/150|185|50k|%/);
  });

  it('shows the numbers on the member’s row in the panel and keeps usage out of the activity list', () => {
    const { live } = renderLive();
    live.emit(from(codex('x'), 'turn.started'));
    live.emit(usage(codex('x'), { tokens: { used: 120_000 }, context: { used: 156_000, limit: 200_000 } }));
    live.emit(from(claude('a'), 'turn.started'));
    openPanel();

    const rows = within(screen.getByRole('group', { name: '사무실에 있는 세션' })).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Codex 1생각 중남은 80k · 컨텍스트 78%');
    expect(rows[1]?.textContent).toBe('Claude 1생각 중');
    expect(screen.getByRole('dialog')).not.toHaveTextContent('사용량 보고');
  });

  it('re-reads every member’s energy when the user changes the token budget, and remembers it', () => {
    const { live, storage } = renderLive();
    live.emit(usage(codex('x'), { tokens: { used: 150_000 } }));
    expect(cansAt('desk-1')).toBeGreaterThan(0);

    openPanel();
    fireEvent.change(screen.getByRole('combobox', { name: '토큰 예산' }), { target: { value: '1000000' } });

    expect(cansAt('desk-1')).toBe(0);
    expect(screen.getByRole('dialog')).toHaveTextContent('남은 850k');
    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toMatchObject({ tokenBudget: 1_000_000 });
  });
});

describe('App growing the office (ADR-025 §7, FR-G1, FR-G3, FR-G6)', () => {
  function completeTurns(live: ReturnType<typeof manualSource>, sources: ReadonlyArray<{ kind: string; session: string }>) {
    for (const source of sources) {
      live.emit(from(source, 'turn.started'));
      live.emit(from(source, 'turn.succeeded'));
    }
  }
  const office = () => screen.getByRole('group', { name: '사무실' });

  it("grows from every member's completed tasks and saves the live XP", () => {
    const { live, storage } = renderLive();
    expect(scene().querySelector('[data-part^="decor-"]')).toBeNull();

    completeTurns(live, [claude('a'), codex('x'), claude('a'), agent('z')]);

    expect(scene().querySelector('[data-part="decor-poster"]')).not.toBeNull();
    expect(scene().querySelector('[data-part="decor-desk-plants"]')).not.toBeNull();
    expect(scene().querySelector('[data-part="decor-string-lights"]')).toBeNull();
    const book = JSON.parse(storage.data.get('deskling.office.v1') ?? '{}');
    expect(book).toEqual({
      demo: { xp: 0, members: {} },
      live: {
        xp: 4,
        // Every member grows on its own, under an opaque id (ADR-028 §2).
        members: { [memberId('claude-code:a')]: 2, [memberId('codex:x')]: 1, [memberId('custom:z')]: 1 },
      },
    });

    openPanel();
    expect(office()).toHaveTextContent('경험치 4');
    expect(office()).toHaveTextContent('소품 2/6');
    expect(office()).toHaveTextContent('다음: 줄 조명 · 7');
    expect(within(office()).queryByText('DEMO')).toBeNull();
  });

  it("remembers growth across restarts, carrying the pet era's XP over (and nothing else)", () => {
    const storage = fakeStorage();
    storage.data.set('deskling.pet.v1', JSON.stringify({ live: { name: '콩이', xp: 30 } }));
    renderLive(storage);
    expect(scene().querySelector('[data-part="decor-trophy-shelf"]')).not.toBeNull();
    openPanel();
    expect(office()).toHaveTextContent('경험치 30');
    expect(office()).toHaveTextContent('모두 해금');
    expect(document.body).not.toHaveTextContent('콩이');
  });

  it('marks the demo office as DEMO', () => {
    render(<App source={manualSource('demo').source} controls={fakeControls()} storage={fakeStorage()} />);
    openPanel();
    expect(within(office()).getByText('DEMO')).toBeInTheDocument();
  });

  it('has no pet: no name, petting, snacks or hearts anywhere', () => {
    renderLive();
    openPanel();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: '쓰다듬기' })).toBeNull();
    expect(screen.queryByRole('button', { name: /간식/ })).toBeNull();
    expect(screen.queryByRole('group', { name: '펫' })).toBeNull();
    expect(screen.queryByRole('img', { name: /애정도/ })).toBeNull();
    expect(document.body).not.toHaveTextContent(/헤르메스|Hermes/);
  });
});

describe('App window layer (FR-R7, ADR-021)', () => {
  it('embeds the window in the desktop by default', () => {
    const { controls } = renderLive();
    expect(controls.setAlwaysOnTop).toHaveBeenLastCalledWith(false);
    expect(controls.setAlwaysOnBottom).toHaveBeenLastCalledWith(true);
  });

  it('floats above other windows when the user asks for it', () => {
    const { controls } = renderLive();
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

  it('auto: plays the demo until a real session speaks, then shows the real office without the DEMO badge', async () => {
    vi.useFakeTimers();
    const live = fakeLive();
    render(<App controls={fakeControls()} storage={fakeStorage()} liveListen={live.listen} />);
    await act(async () => {});
    expect(screen.getByText('DEMO')).toBeVisible();

    live.record('tool-start', { tool: 'code' });
    act(() => vi.advanceTimersByTime(15_000));

    expect(screen.queryByText('DEMO')).toBeNull();
    expect(summaryText()).toBe('1명 일하는 중');
    expect(who()).toEqual(['claude-code 1']);
    expect(memberOf('claude-code', 1)).toHaveAttribute('data-visual', 'coding');
  });

  it('auto: the real office is a new office, so a real message right after the switch still shows', async () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    const live = fakeLive();
    render(<App controls={fakeControls()} storage={fakeStorage()} liveListen={live.listen} />);
    await act(async () => {});
    // Past the demo's first conversation (Claude 1 → Codex 1).
    for (let elapsed = 0; elapsed < 14_000; elapsed += 1_000) act(() => vi.advanceTimersByTime(1_000));

    live.record('session-start');
    live.record('tool-start', { tool: 'message' });
    expect(memberOf('claude-code', 1)).toHaveAttribute('data-chat', 'letter');
  });

  it('demo: stays on the demo even when real sessions speak', async () => {
    const live = fakeLive();
    render(<App controls={fakeControls()} storage={fakeStorage({ sourceChoice: 'demo' })} liveListen={live.listen} />);
    await act(async () => {});
    live.record('session-start');
    expect(screen.getByText('DEMO')).toBeVisible();
  });

  it('live: shows the real office from the start — empty when nobody is connected', async () => {
    const live = fakeLive();
    render(<App controls={fakeControls()} storage={fakeStorage({ sourceChoice: 'live' })} liveListen={live.listen} />);
    await act(async () => {});
    expect(screen.queryByText('DEMO')).toBeNull();
    expect(summaryText()).toBe('아무도 없음');
  });

  it('switches from the panel, remembers the choice and hides the demo picker while showing real sessions', async () => {
    const live = fakeLive();
    const storage = fakeStorage();
    render(<App controls={fakeControls()} storage={storage} liveListen={live.listen} />);
    await act(async () => {});
    openPanel();
    const view = screen.getByRole('group', { name: '보기' });
    expect(view).toHaveTextContent('지금: 데모');
    expect(screen.getByRole('group', { name: '데모 시나리오' })).toBeInTheDocument();

    fireEvent.click(within(view).getByRole('button', { name: '실제' }));
    expect(JSON.parse(storage.data.get('deskling.settings.v1') ?? '{}')).toMatchObject({ sourceChoice: 'live' });
    expect(screen.getByRole('group', { name: '보기' })).toHaveTextContent('지금: 실제 세션');
    expect(screen.queryByRole('group', { name: '데모 시나리오' })).toBeNull();
    expect(screen.queryByText('DEMO')).toBeNull();
    expect(summaryText()).toBe('아무도 없음');
  });

  it('listens to the bridge once and stops on unmount', async () => {
    const live = fakeLive();
    const { unmount } = render(<App controls={fakeControls()} storage={fakeStorage()} liveListen={live.listen} />);
    await act(async () => {});
    expect(live.listen).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {});
    expect(live.unlisten).toHaveBeenCalled();
  });
});
