import type { SourceKind, VisualState } from '../core/agentEvent';
import { sessionLabel } from '../core/roomState';
import { StateIcon } from './icons';
import { VISUAL_SPEC } from './visualSpec';

export interface AttentionSession {
  readonly key: string;
  readonly kind: SourceKind;
  readonly ordinal: number;
  readonly visual: VisualState;
}

/** What a member can need from the user, most urgent first (FR-MS6). */
const NEEDS: readonly VisualState[] = ['waiting-approval', 'error'];

/**
 * A small line under the office summary when a member needs the user: one pill for the most urgent
 * member ("Claude 2 · 승인 대기 중"), plus how many more (ADR-025 §5). The summary only counts; this names.
 * The live region is always there, so screen readers hear the pill appear.
 */
export function AttentionLine({ sessions }: { sessions: readonly AttentionSession[] }) {
  const needing = NEEDS.flatMap((need) => sessions.filter((session) => session.visual === need));
  const first = needing[0];
  return (
    <div className="attention-line" aria-live="polite" data-part="attention-line">
      {first && (
        <span className="attention-pill" data-tone={VISUAL_SPEC[first.visual].tone} data-visual={first.visual}>
          <StateIcon icon={VISUAL_SPEC[first.visual].icon} className="attention-pill__icon" />
          <span>{`${sessionLabel(first)} · ${VISUAL_SPEC[first.visual].label}`}</span>
          {needing.length > 1 && <span className="attention-pill__more">{`+${needing.length - 1}`}</span>}
        </span>
      )}
    </div>
  );
}
