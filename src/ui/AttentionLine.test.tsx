import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AttentionSession } from './AttentionLine';
import { AttentionLine } from './AttentionLine';

const claude = (ordinal: number, visual: AttentionSession['visual']): AttentionSession => ({
  key: `claude-code:${ordinal}`,
  kind: 'claude-code',
  ordinal,
  visual,
});
const codex = (ordinal: number, visual: AttentionSession['visual']): AttentionSession => ({
  key: `codex:${ordinal}`,
  kind: 'codex',
  ordinal,
  visual,
});

const line = () => document.querySelector('[data-part="attention-line"]') as HTMLElement;

describe('AttentionLine (FR-MS6)', () => {
  it('is an empty polite live region while no friend needs the user', () => {
    render(<AttentionLine sessions={[claude(1, 'coding'), codex(1, 'success')]} />);
    expect(line()).toHaveAttribute('aria-live', 'polite');
    expect(line()).toBeEmptyDOMElement();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('names a friend waiting for approval, in amber', () => {
    render(<AttentionLine sessions={[claude(1, 'coding'), claude(2, 'waiting-approval')]} />);
    const pill = line().querySelector('.attention-pill');
    expect(pill).toHaveTextContent('Claude 2 · 승인 대기 중');
    expect(pill).toHaveAttribute('data-tone', 'amber');
    expect(pill?.querySelector('[data-icon="hand"]')).not.toBeNull();
  });

  it('names a friend whose work failed, in ember', () => {
    render(<AttentionLine sessions={[codex(1, 'error')]} />);
    const pill = line().querySelector('.attention-pill');
    expect(pill).toHaveTextContent('Codex 1 · 오류');
    expect(pill).toHaveAttribute('data-tone', 'ember');
    expect(pill?.querySelector('[data-icon="alert"]')).not.toBeNull();
  });

  it('shows one pill, approval before error, and counts the rest', () => {
    render(<AttentionLine sessions={[codex(1, 'error'), claude(1, 'idle'), claude(3, 'waiting-approval'), codex(2, 'waiting-approval')]} />);
    expect(line().querySelectorAll('.attention-pill')).toHaveLength(1);
    expect(line()).toHaveTextContent('Claude 3 · 승인 대기 중+2');
  });
});
