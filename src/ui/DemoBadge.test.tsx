import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DemoBadge } from './DemoBadge';

describe('DemoBadge (FR-D5)', () => {
  it('shows a visible DEMO label', () => {
    render(<DemoBadge />);
    expect(screen.getByText('DEMO')).toBeVisible();
  });

  it('explains to assistive tech that the data is not from a real agent', () => {
    render(<DemoBadge />);
    expect(screen.getByRole('note', { name: '데모 모드: 실제 에이전트 데이터가 아닙니다' })).toHaveTextContent('DEMO');
  });

  it('cannot be dismissed', () => {
    render(<DemoBadge />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
