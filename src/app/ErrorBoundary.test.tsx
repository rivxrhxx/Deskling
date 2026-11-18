import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

function Boom(): never {
  throw new Error('SECRET render failure details');
}

describe('ErrorBoundary (review T34a)', () => {
  it('replaces a crashed tree with a small notice instead of a blank overlay', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Deskling을 표시할 수 없습니다');
    expect(document.body.innerHTML).not.toContain('SECRET');
    expect(warn).toHaveBeenCalledWith('[deskling] render failed');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET');
  });

  it('renders children when nothing fails', () => {
    render(
      <ErrorBoundary>
        <p>ok</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});
