import type { VisualState } from '../core/agentEvent';
import { StateIcon } from './icons';
import { VISUAL_SPEC } from './visualSpec';

/** The one-line "what is the agent doing" readout above the workshop (FR-S4). */
export function StatusBubble({ state }: { state: VisualState }) {
  const spec = VISUAL_SPEC[state];
  return (
    <div
      className="status-bubble"
      role="status"
      aria-live="polite"
      data-state={state}
      data-tone={spec.tone}
      title={spec.description}
    >
      <StateIcon icon={spec.icon} className="status-bubble__icon" />
      <span className="status-bubble__label">{spec.label}</span>
    </div>
  );
}
