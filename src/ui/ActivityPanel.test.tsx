import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RecentEntry } from '../core/agentState';
import { EVENT_TYPES, TOOL_CATEGORIES } from '../core/agentEvent';
import type { Vitals } from '../core/mood';
import type { RoomEntry } from '../core/roomState';
import type { PanelSession } from './ActivityPanel';
import { ActivityPanel } from './ActivityPanel';
import { describeActivity, describeRoomActivity, formatTokens } from './activityText';

const HERMES = { sessionKey: 'demo:d', kind: 'demo', ordinal: 0 } as const;
const CLAUDE_1 = { sessionKey: 'claude-code:a', kind: 'claude-code', ordinal: 1 } as const;

const entries: RoomEntry[] = [
  { key: 3, seq: 3, at: 3000, type: 'tool.finished', tool: 'terminal', outcome: 'error', ...HERMES },
  { key: 2, seq: 2, at: 2000, type: 'tool.started', tool: 'terminal', ...HERMES },
  { key: 1, seq: 1, at: 1000, type: 'turn.started', ...HERMES },
];

const formatTime = (at: number) => `t${at}`;

describe('describeActivity (FR-P4)', () => {
  it.each([...EVENT_TYPES])('has fixed copy for %s', (type) => {
    const entry = { key: 1, seq: 1, at: 0, type, tool: 'code', outcome: 'ok' } as RecentEntry;
    expect(describeActivity(entry).trim()).not.toBe('');
  });

  it.each([...TOOL_CATEGORIES])('names the %s tool category', (tool) => {
    const started = describeActivity({ key: 1, seq: 1, at: 0, type: 'tool.started', tool });
    const failed = describeActivity({ key: 1, seq: 1, at: 0, type: 'tool.finished', tool, outcome: 'error' });
    expect(started).not.toBe(failed);
  });

  it('ignores anything that is not a protocol enum', () => {
    const sneaky = { key: 1, seq: 1, at: 0, type: 'turn.started', note: 'SECRET' } as unknown as RecentEntry;
    expect(describeActivity(sneaky)).not.toContain('SECRET');
  });
});

describe('describeRoomActivity (FR-MS6, FR-P4)', () => {
  const base = { key: 1, seq: 1, at: 0 } as const;

  it('names the session an entry belongs to', () => {
    expect(describeRoomActivity({ ...base, type: 'tool.started', tool: 'code', ...CLAUDE_1 })).toBe('Claude 1 · 코드 편집 시작');
    expect(describeRoomActivity({ ...base, type: 'turn.started', ...HERMES })).toBe('헤르메스 · 작업 시작');
    expect(describeRoomActivity({ ...base, type: 'approval.requested', sessionKey: 'codex:x', kind: 'codex', ordinal: 2 })).toBe('Codex 2 · 승인 요청됨');
  });

  it('says who wrote to whom, never what', () => {
    const message = { ...base, type: 'session.message', ...CLAUDE_1 } as const;
    expect(describeRoomActivity({ ...message, toKey: 'codex:x', receiver: { kind: 'codex', ordinal: 1 } })).toBe('Claude 1 → Codex 1 메시지');
    expect(describeRoomActivity({ ...message, toKey: 'hermes:h', receiver: { kind: 'hermes', ordinal: 0 } })).toBe('Claude 1 → 헤르메스 메시지');
    expect(describeRoomActivity({ ...message, toKey: null, receiver: null })).toBe('Claude 1 메시지 보냄');
    expect(describeRoomActivity({ ...message, toKey: 'codex:gone', receiver: null })).toBe('Claude 1 메시지 보냄');
  });

  it('ignores anything that is not a protocol enum', () => {
    const sneaky = { ...base, type: 'session.message', ...CLAUDE_1, toKey: 'SECRET', body: 'SECRET' } as unknown as RoomEntry;
    expect(describeRoomActivity(sneaky)).toBe('Claude 1 메시지 보냄');
  });
});

describe('ActivityPanel (FR-P1–P4)', () => {
  it('is a labelled dialog listing entries newest first with time and fixed copy', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} />);
    const dialog = screen.getByRole('dialog', { name: '최근 활동' });
    const items = within(dialog).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      `t3000${describeRoomActivity(entries[0]!)}`,
      `t2000${describeRoomActivity(entries[1]!)}`,
      `t1000${describeRoomActivity(entries[2]!)}`,
    ]);
    expect(items[0]).toHaveTextContent('헤르메스 · 터미널 실패');
  });

  it('marks failures and approvals so they stand out beyond colour', () => {
    render(
      <ActivityPanel
        entries={[...entries, { key: 0, seq: 0, at: 0, type: 'approval.requested', ...CLAUDE_1 }]}
        onClose={vi.fn()}
        formatTime={formatTime}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-kind', 'error');
    expect(items[3]).toHaveAttribute('data-kind', 'attention');
    expect(items[1]).toHaveAttribute('data-kind', 'info');
  });

  it('shows an empty state', () => {
    render(<ActivityPanel entries={[]} onClose={vi.fn()} formatTime={formatTime} />);
    expect(screen.getByText('아직 기록된 활동이 없습니다.')).toBeInTheDocument();
  });

  it('reminds the user that Deskling only observes', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} />);
    expect(screen.getByRole('dialog')).toHaveTextContent('관찰 전용');
  });

  it('focuses the close button when it opens', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} />);
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
  });

  it('closes with the close button', async () => {
    const onClose = vi.fn();
    render(<ActivityPanel entries={entries} onClose={onClose} formatTime={formatTime} />);
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes with Escape', async () => {
    const onClose = vi.fn();
    render(<ActivityPanel entries={entries} onClose={onClose} formatTime={formatTime} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('formats times as 24-hour HH:MM:SS by default', () => {
    render(<ActivityPanel entries={[entries[2]!]} onClose={vi.fn()} />);
    expect(screen.getByRole('listitem').querySelector('time')?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe('ActivityPanel demo scenario picker (FR-D3)', () => {
  const options = [
    { value: 'tour', label: '전체 상태', selected: true },
    { value: 'core', label: '기본 흐름', selected: false },
  ];

  it('is hidden unless demo options are given', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} />);
    expect(screen.queryByRole('group', { name: '데모 시나리오' })).toBeNull();
  });

  it('shows the scenarios with the current one pressed and reports a selection', async () => {
    const onSelect = vi.fn();
    render(
      <ActivityPanel
        entries={entries}
        onClose={vi.fn()}
        formatTime={formatTime}
        demo={{ options, onSelect }}
      />,
    );
    const group = screen.getByRole('group', { name: '데모 시나리오' });
    expect(within(group).getByRole('button', { name: '전체 상태' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(group).getByRole('button', { name: '기본 흐름' }));
    expect(onSelect).toHaveBeenCalledWith('core');
  });
});

describe('formatTokens', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1_500, '1.5k'],
    [80_000, '80k'],
    [156_400, '156.4k'],
    [1_000_000, '1M'],
    [2_250_000, '2.3M'],
  ])('%d → %s', (value, text) => {
    expect(formatTokens(value)).toBe(text);
  });
});

describe('ActivityPanel vitals (FR-V5, FR-V6)', () => {
  const vitals: Vitals = {
    energy: { level: 'ok', used: 120_000, remaining: 80_000, budget: 200_000, ratio: 0.4 },
    anger: { level: 'angry', used: 156_000, limit: 200_000, ratio: 0.78 },
  };
  const budget = { value: 200_000, options: [50_000, 100_000, 200_000, 500_000, 1_000_000], onChange: vi.fn() };

  it('shows nothing about vitals unless they are given', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} />);
    expect(screen.queryByRole('group', { name: '에너지와 컨텍스트' })).toBeNull();
  });

  it('shows remaining tokens against the budget and the context fill as numbers', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} vitals={vitals} budget={budget} />);
    const group = screen.getByRole('group', { name: '에너지와 컨텍스트' });
    expect(group).toHaveTextContent('남은 토큰 80k / 200k');
    expect(group).toHaveTextContent('보통');
    expect(group).toHaveTextContent('156k / 200k · 78%');
    expect(group).toHaveTextContent('화남');
    expect(within(group).getByRole('meter', { name: '남은 에너지' })).toHaveAttribute('aria-valuenow', '40');
    expect(within(group).getByRole('meter', { name: '컨텍스트 사용량' })).toHaveAttribute('aria-valuenow', '78');
  });

  it('says when nothing has been reported', () => {
    const unknown: Vitals = {
      energy: { level: 'unknown', used: null, remaining: null, budget: 200_000, ratio: null },
      anger: { level: 'unknown', used: null, limit: null, ratio: null },
    };
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} vitals={unknown} budget={budget} />);
    const group = screen.getByRole('group', { name: '에너지와 컨텍스트' });
    expect(within(group).getAllByText('보고 없음')).toHaveLength(2);
    expect(within(group).queryByRole('meter')).toBeNull();
  });

  it('lets the user pick the token budget', async () => {
    const onChange = vi.fn();
    render(
      <ActivityPanel
        entries={entries}
        onClose={vi.fn()}
        formatTime={formatTime}
        vitals={vitals}
        budget={{ ...budget, onChange }}
      />,
    );
    const select = screen.getByRole('combobox', { name: '토큰 예산' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['50k', '100k', '200k', '500k', '1M']);
    await userEvent.selectOptions(select, '500k');
    expect(onChange).toHaveBeenCalledWith(500_000);
  });
});

describe('ActivityPanel pet section (FR-G4–G6)', () => {
  const pet = (overrides: object = {}) => ({
    name: '',
    hearts: 3,
    snacksLeft: 2,
    demo: true,
    onPet: vi.fn(),
    onFeed: vi.fn(),
    onRename: vi.fn(),
    ...overrides,
  });

  it('is absent unless pet details are given', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} />);
    expect(screen.queryByRole('group', { name: '펫' })).toBeNull();
  });

  it('shows hearts for affection and marks the demo profile', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} pet={pet()} />);
    const group = screen.getByRole('group', { name: '펫' });
    expect(within(group).getByRole('img', { name: '애정도 하트 5개 중 3개' })).toBeInTheDocument();
    expect(group.querySelectorAll('[data-filled="true"]')).toHaveLength(3);
    expect(within(group).getByText('DEMO')).toBeInTheDocument();
  });

  it('has no DEMO mark for a real agent profile', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} pet={pet({ demo: false })} />);
    expect(within(screen.getByRole('group', { name: '펫' })).queryByText('DEMO')).toBeNull();
  });

  it('names the pet on Enter', async () => {
    const onRename = vi.fn();
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} pet={pet({ onRename })} />);
    const input = screen.getByRole('textbox', { name: '이름' });
    expect(input).toHaveAttribute('placeholder', '헤르메스');
    expect(input).toHaveAttribute('maxLength', '12');
    await userEvent.type(input, '콩이{Enter}');
    expect(onRename).toHaveBeenCalledWith('콩이');
  });

  it('also saves the name when focus leaves the field', async () => {
    const onRename = vi.fn();
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} pet={pet({ name: '콩', onRename })} />);
    const input = screen.getByRole('textbox', { name: '이름' });
    expect(input).toHaveValue('콩');
    await userEvent.type(input, '이');
    await userEvent.tab();
    expect(onRename).toHaveBeenCalledWith('콩이');
  });

  it('has no invite button: friends are real sessions (ADR-022 §5)', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} pet={pet()} />);
    expect(within(screen.getByRole('group', { name: '펫' })).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '쓰다듬기',
      '간식 주기 · 2',
    ]);
    expect(screen.queryByRole('button', { name: '친구 초대' })).toBeNull();
  });

  it('suggests Hermes as the name (ADR-019)', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} pet={pet()} />);
    expect(screen.getByRole('textbox', { name: '이름' })).toHaveAttribute('placeholder', '헤르메스');
  });

  it('pets and feeds', async () => {
    const onPet = vi.fn();
    const onFeed = vi.fn();
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} pet={pet({ onPet, onFeed })} />);
    await userEvent.click(screen.getByRole('button', { name: '쓰다듬기' }));
    await userEvent.click(screen.getByRole('button', { name: '간식 주기, 오늘 2개 남음' }));
    expect(onPet).toHaveBeenCalledTimes(1);
    expect(onFeed).toHaveBeenCalledTimes(1);
  });

  it('disables snacks when none are left today', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} pet={pet({ snacksLeft: 0 })} />);
    expect(screen.getByRole('button', { name: '간식 주기, 오늘 0개 남음' })).toBeDisabled();
  });
});

describe('ActivityPanel sessions in the room (FR-MS6)', () => {
  const sessions: PanelSession[] = [
    { key: 'demo:d', kind: 'demo', ordinal: 0, visual: 'coding', seated: true },
    { key: 'claude-code:a', kind: 'claude-code', ordinal: 1, visual: 'waiting-approval', seated: true },
    { key: 'codex:x', kind: 'codex', ordinal: 1, visual: 'error', seated: true },
    { key: 'claude-code:e', kind: 'claude-code', ordinal: 5, visual: 'idle', seated: false },
  ];

  it('is absent unless sessions are given', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} />);
    expect(screen.queryByRole('group', { name: '방에 있는 세션' })).toBeNull();
  });

  it('lists Hermes and every friend with its state, marking friends who found no seat', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} sessions={sessions} />);
    const group = screen.getByRole('group', { name: '방에 있는 세션' });
    const rows = within(group).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      '헤르메스코딩 중',
      'Claude 1승인 대기 중',
      'Codex 1오류',
      'Claude 5대기 중(자리 없음)',
    ]);
    expect(rows.map((row) => row.getAttribute('data-tone'))).toEqual(['cool', 'amber', 'ember', 'cool']);
    expect(rows[3]).toHaveAttribute('data-seated', 'false');
    for (const row of rows) expect(row.querySelector('.session__dot')).not.toBeNull();
  });

  it('keeps the recent list separate from the session list', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} sessions={sessions} />);
    const list = screen.getByRole('list', { name: '최근 활동 목록' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(entries.length);
  });
});

describe('ActivityPanel source choice (FR-CC4)', () => {
  it('offers 자동 / 실제 / 데모, says what is showing, and reports the choice', async () => {
    const onSelect = vi.fn();
    const view = {
      options: [
        { value: 'auto', label: '자동', selected: true },
        { value: 'live', label: '실제', selected: false },
        { value: 'demo', label: '데모', selected: false },
      ],
      onSelect,
      showing: '지금: 실제 세션',
    };
    render(<ActivityPanel entries={[]} onClose={vi.fn()} formatTime={(at) => `t${at}`} view={view} />);
    const group = screen.getByRole('group', { name: '보기' });
    expect(within(group).getByRole('button', { name: '자동' })).toHaveAttribute('aria-pressed', 'true');
    expect(group).toHaveTextContent('지금: 실제 세션');
    await userEvent.click(within(group).getByRole('button', { name: '실제' }));
    expect(onSelect).toHaveBeenCalledWith('live');
  });
});
