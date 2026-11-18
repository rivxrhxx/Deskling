import type { ReactNode } from 'react';
import { Component } from 'react';

interface ErrorBoundaryState {
  readonly failed: boolean;
}

/**
 * Last line of defence: a render failure shows a small notice instead of an invisible overlay.
 * Error details are never rendered or logged — they could contain data from an event (SEC-2, SEC-3).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(): void {
    console.warn('[deskling] render failed');
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="deskling-fallback" role="alert">
          Deskling을 표시할 수 없습니다. 앱을 다시 시작하세요.
        </div>
      );
    }
    return this.props.children;
  }
}
