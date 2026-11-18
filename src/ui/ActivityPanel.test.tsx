import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RecentEntry } from '../core/agentState';
import { EVENT_TYPES, TOOL_CATEGORIES } from '../core/agentEvent';
import { ActivityPanel } from './ActivityPanel';
import { describeActivity } from './activityText';

const entries: RecentEntry[] = [
  { key: 3, seq: 3, at: 3000, type: 'tool.finished', tool: 'terminal', outcome: 'error' },
  { key: 2, seq: 2, at: 2000, type: 'tool.started', tool: 'terminal' },
  { key: 1, seq: 1, at: 1000, type: 'turn.started' },
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

describe('ActivityPanel (FR-P1–P4)', () => {
  it('is a labelled dialog listing entries newest first with time and fixed copy', () => {
    render(<ActivityPanel entries={entries} onClose={vi.fn()} formatTime={formatTime} />);
    const dialog = screen.getByRole('dialog', { name: '최근 활동' });
    const items = within(dialog).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      `t3000${describeActivity(entries[0]!)}`,
      `t2000${describeActivity(entries[1]!)}`,
      `t1000${describeActivity(entries[2]!)}`,
    ]);
  });

  it('marks failures and approvals so they stand out beyond colour', () => {
    render(
      <ActivityPanel
        entries={[...entries, { key: 0, seq: 0, at: 0, type: 'approval.requested' }]}
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
