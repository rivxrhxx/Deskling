import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OfficeCounts } from '../core/roomState';
import { describeOffice } from './activityText';
import { StatusBubble } from './StatusBubble';

const counts = (parts: Partial<Omit<OfficeCounts, 'total'>> = {}): OfficeCounts => {
  const all = { working: 0, waiting: 0, failing: 0, resting: 0, ...parts };
  return { ...all, total: all.working + all.waiting + all.failing + all.resting };
};

const bubble = () => screen.getByRole('button');

describe('describeOffice: the office summary copy (ADR-025 §5)', () => {
  it.each([
    ['아무도 없음', counts()],
    ['3명 일하는 중', counts({ working: 3 })],
    ['3명 일하는 중 · 1명 승인 대기', counts({ working: 3, waiting: 1 })],
    ['1명 일하는 중 · 1명 승인 대기 · 2명 오류 · 4명 쉬는 중', counts({ working: 1, waiting: 1, failing: 2, resting: 4 })],
    ['1명 오류 · 2명 쉬는 중', counts({ failing: 1, resting: 2 })],
    ['5명 쉬는 중', counts({ resting: 5 })],
  ])('says "%s"', (text, value) => {
    expect(describeOffice(value)).toBe(text);
  });
});

describe('StatusBubble: the office summary (ADR-025 §5, FR-S4, FR-P1)', () => {
  it('is a button that opens the activity dialog and says whether it is open', () => {
    render(<StatusBubble counts={counts({ working: 2 })} expanded={false} onToggle={vi.fn()} />);
    expect(bubble()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(bubble()).toHaveAttribute('aria-expanded', 'false');
    expect(bubble()).toHaveAccessibleName('2명 일하는 중');
  });

  it('reports a press', async () => {
    const onToggle = vi.fn();
    render(<StatusBubble counts={counts()} expanded onToggle={onToggle} />);
    expect(bubble()).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(bubble());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('announces the summary politely', () => {
    const { rerender } = render(<StatusBubble counts={counts({ working: 1 })} expanded={false} onToggle={vi.fn()} />);
    const live = bubble().querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent('1명 일하는 중');
    rerender(<StatusBubble counts={counts({ working: 1, waiting: 1 })} expanded={false} onToggle={vi.fn()} />);
    expect(live).toHaveTextContent('1명 일하는 중 · 1명 승인 대기');
  });

  it.each([
    ['waiting', 'amber', 'hand', counts({ working: 2, waiting: 1, failing: 1 })],
    ['failing', 'ember', 'alert', counts({ working: 2, failing: 1, resting: 1 })],
    ['working', 'cool', 'brackets', counts({ working: 2, resting: 3 })],
    ['resting', 'mint', 'cup', counts({ resting: 3 })],
    ['empty', 'dim', 'plug', counts()],
  ] as const)('%s: tone %s with the %s icon', (state, tone, icon, value) => {
    render(<StatusBubble counts={value} expanded={false} onToggle={vi.fn()} />);
    expect(bubble()).toHaveAttribute('data-state', state);
    expect(bubble()).toHaveAttribute('data-tone', tone);
    const svg = bubble().querySelector(`svg[data-icon="${icon}"]`);
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('never starts a window drag', () => {
    render(<StatusBubble counts={counts()} expanded={false} onToggle={vi.fn()} />);
    expect(bubble()).toHaveAttribute('data-no-drag');
  });
});
