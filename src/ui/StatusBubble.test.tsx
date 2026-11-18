import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VISUAL_STATES } from '../core/agentEvent';
import { StatusBubble } from './StatusBubble';
import { VISUAL_SPEC } from './visualSpec';

describe('StatusBubble (FR-S3, FR-S4)', () => {
  it('announces the current state politely', () => {
    render(<StatusBubble state="coding" />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('코딩 중');
  });

  it.each([...VISUAL_STATES])('shows the icon, label and tone for %s', (state) => {
    const spec = VISUAL_SPEC[state];
    render(<StatusBubble state={state} />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(spec.label);
    expect(status).toHaveAttribute('data-tone', spec.tone);
    const icon = status.querySelector(`svg[data-icon="${spec.icon}"]`);
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('offers the longer description as a tooltip', () => {
    render(<StatusBubble state="waiting-approval" />);
    expect(screen.getByRole('status')).toHaveAttribute('title', VISUAL_SPEC['waiting-approval'].description);
  });
});
