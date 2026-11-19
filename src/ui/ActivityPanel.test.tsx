import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RecentEntry } from '../core/agentState';
import { EVENT_TYPES, TOOL_CATEGORIES } from '../core/agentEvent';
import { memberLevel } from '../core/growth';
import { deriveVitals } from '../core/mood';
import type { RoomEntry } from '../core/roomState';
import type { PanelSession } from './ActivityPanel';
import { ActivityPanel } from './ActivityPanel';
import { describeActivity, describeRoomActivity, formatTokens } from './activityText';

const DEMO_1 = { sessionKey: 'demo:d', kind: 'demo', ordinal: 1 } as const;
const CLAUDE_1 = { sessionKey: 'claude-code:a', kind: 'claude-code', ordinal: 1 } as const;

const entries: RoomEntry[] = [
  { key: 3, seq: 3, at: 3000, type: 'tool.finished', tool: 'terminal', outcome: 'error', ...DEMO_1 },
  { key: 2, seq: 2, at: 2000, type: 'tool.started', tool: 'terminal', ...DEMO_1 },
  { key: 1, seq: 1, at: 1000, type: 'turn.started', ...DEMO_1 },
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
    expect(describeRoomActivity({ ...base, type: 'turn.started', ...DEMO_1 })).toBe('데모 1 · 작업 시작');
    expect(describeRoomActivity({ ...base, type: 'turn.started', sessionKey: 'custom:z', kind: 'custom', ordinal: 2 })).toBe('에이전트 2 · 작업 시작');
    expect(describeRoomActivity({ ...base, type: 'approval.requested', sessionKey: 'codex:x', kind: 'codex', ordinal: 2 })).toBe('Codex 2 · 승인 요청됨');
  });

  it('says who wrote to whom, never what', () => {
    const message = { ...base, type: 'session.message', ...CLAUDE_1 } as const;
    expect(describeRoomActivity({ ...message, toKey: 'codex:x', receiver: { kind: 'codex', ordinal: 1 } })).toBe('Claude 1 → Codex 1 메시지');
    expect(describeRoomActivity({ ...message, toKey: 'hermes:h', receiver: { kind: 'hermes', ordinal: 1 } })).toBe('Claude 1 → Hermes 1 메시지');
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
    expect(items[0]).toHaveTextContent('데모 1 · 터미널 실패');
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

describe('ActivityPanel office growth (ADR-025 §7, FR-G1, FR-G3, FR-G6)', () => {
  it('is absent unless office details are given', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} />);
    expect(screen.queryByRole('group', { name: '사무실' })).toBeNull();
  });

  it('shows the XP, how many props are unlocked and the next one', () => {
    render(
      <ActivityPanel
        entries={entries}
        onClose={vi.fn()}
        formatTime={formatTime}
        office={{ xp: 5, decor: ['poster', 'desk-plants'], next: { id: 'string-lights', xp: 7 }, demo: false }}
      />,
    );
    const group = screen.getByRole('group', { name: '사무실' });
    expect(group).toHaveTextContent('경험치 5');
    expect(group).toHaveTextContent('소품 2/6');
    expect(group).toHaveTextContent('다음: 줄 조명 · 7');
    expect(within(group).queryByText('DEMO')).toBeNull();
  });

  it('says when everything is unlocked and marks the demo office', () => {
    render(
      <ActivityPanel
        entries={entries}
        onClose={vi.fn()}
        formatTime={formatTime}
        office={{
          xp: 30,
          decor: ['poster', 'desk-plants', 'string-lights', 'lounge-rug', 'full-bookshelf', 'trophy-shelf'],
          next: null,
          demo: true,
        }}
      />,
    );
    const group = screen.getByRole('group', { name: '사무실' });
    expect(group).toHaveTextContent('소품 6/6');
    expect(group).toHaveTextContent('모두 해금');
    expect(within(group).getByText('DEMO')).toBeInTheDocument();
  });

  it('has no pet: no name, petting, snacks or hearts (ADR-025 §7)', () => {
    render(
      <ActivityPanel
        entries={entries}
        onClose={vi.fn()}
        formatTime={formatTime}
        office={{ xp: 0, decor: [], next: { id: 'poster', xp: 2 }, demo: false }}
      />,
    );
    expect(screen.queryByRole('group', { name: '펫' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: '쓰다듬기' })).toBeNull();
    expect(screen.queryByRole('group', { name: '에너지와 컨텍스트' })).toBeNull();
  });
});

describe('ActivityPanel sessions in the office (FR-MS6, FR-V5, FR-V6)', () => {
  const sessions: PanelSession[] = [
    { key: 'demo:d', kind: 'demo', ordinal: 1, visual: 'coding', seated: true },
    { key: 'claude-code:a', kind: 'claude-code', ordinal: 1, visual: 'waiting-approval', seated: true },
    { key: 'codex:x', kind: 'codex', ordinal: 1, visual: 'error', seated: true },
    { key: 'claude-code:i', kind: 'claude-code', ordinal: 9, visual: 'idle', seated: false },
  ];
  const budget = { value: 200_000, options: [50_000, 100_000, 200_000, 500_000, 1_000_000], onChange: vi.fn() };
  const group = () => screen.getByRole('group', { name: '사무실에 있는 세션' });

  it('is absent unless sessions are given', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} />);
    expect(screen.queryByRole('group', { name: '사무실에 있는 세션' })).toBeNull();
  });

  it('lists every member with its state and tone, marking those beyond the eight desks', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} sessions={sessions} />);
    const rows = within(group()).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      '데모 1코딩 중',
      'Claude 1승인 대기 중',
      'Codex 1오류',
      'Claude 9대기 중(자리 없음)',
    ]);
    expect(rows.map((row) => row.getAttribute('data-tone'))).toEqual(['cool', 'amber', 'ember', 'cool']);
    expect(rows[3]).toHaveAttribute('data-seated', 'false');
    for (const row of rows) expect(row.querySelector('.session__dot')).not.toBeNull();
  });

  it('says nobody is in when the office is empty', () => {
    render(<ActivityPanel entries={[]} onClose={vi.fn()} formatTime={formatTime} sessions={[]} />);
    expect(group()).toHaveTextContent('아무도 없음');
    expect(within(group()).queryByRole('listitem')).toBeNull();
  });

  it("shows each member's reported numbers in a fixed format, and nothing when unreported", () => {
    const reported: PanelSession[] = [
      { ...sessions[0]!, vitals: deriveVitals({ tokens: { used: 120_000 }, context: { used: 140_000, limit: 200_000 } }, 200_000) },
      { ...sessions[1]!, vitals: deriveVitals({ tokens: null, context: null }, 200_000) },
      { ...sessions[2]!, vitals: deriveVitals({ tokens: { used: 30_000 }, context: null }, 200_000) },
      { ...sessions[3]!, vitals: deriveVitals({ tokens: null, context: { used: 50_000, limit: 200_000 } }, 200_000) },
    ];
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} sessions={reported} />);
    const rows = within(group()).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.session__usage')?.textContent ?? null)).toEqual([
      '남은 80k · 컨텍스트 70%',
      null,
      '남은 170k',
      '컨텍스트 25%',
    ]);
  });

  it('lets the user pick the token budget each member’s energy is read against', async () => {
    const onChange = vi.fn();
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} sessions={sessions} budget={{ ...budget, onChange }} />);
    const select = within(group()).getByRole('combobox', { name: '토큰 예산' });
    expect(select).toHaveValue('200000');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['50k', '100k', '200k', '500k', '1M']);
    await userEvent.selectOptions(select, '500k');
    expect(onChange).toHaveBeenCalledWith(500_000);
  });

  it('shows each member’s level and how far the next one is, when given (ADR-028 §5)', () => {
    const levelled: PanelSession[] = [
      { ...sessions[0]!, level: memberLevel(0) },
      { ...sessions[1]!, level: memberLevel(4) },
      { ...sessions[2]!, level: memberLevel(4851) },
      sessions[3]!,
    ];
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} sessions={levelled} />);
    const rows = within(group()).getAllByRole('listitem');
    expect(rows.map((row) => row.querySelector('.session__level')?.textContent ?? null)).toEqual([
      'Lv 1 · 다음까지 1',
      'Lv 3 · 다음까지 2',
      'Lv 99 · 최고',
      null,
    ]);
    expect(rows[1]?.textContent).toBe('Claude 1Lv 3 · 다음까지 2승인 대기 중');
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
