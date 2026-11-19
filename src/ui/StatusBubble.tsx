import type { Ref } from 'react';
import type { OfficeCounts } from '../core/roomState';
import { describeOffice, officeLook } from './activityText';
import { StateIcon } from './icons';

export interface StatusBubbleProps {
  readonly counts: OfficeCounts;
  /** Whether the activity panel it opens is open. */
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly ref?: Ref<HTMLButtonElement>;
}

/**
 * The office summary above the scene (ADR-025 §5): who is working, waiting, failing or resting, in fixed copy.
 * It is also the button that opens the activity panel (FR-P1); the text is announced politely when it changes.
 */
export function StatusBubble({ counts, expanded, onToggle, ref }: StatusBubbleProps) {
  const look = officeLook(counts);
  return (
    <button
      ref={ref}
      type="button"
      className="status-bubble"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onToggle}
      data-state={look.state}
      data-tone={look.tone}
      data-no-drag=""
      title="최근 활동 보기"
    >
      <StateIcon icon={look.icon} className="status-bubble__icon" />
      <span className="status-bubble__label" aria-live="polite" aria-atomic="true">
        {describeOffice(counts)}
      </span>
    </button>
  );
}
