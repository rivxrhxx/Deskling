import type { AgentEvent } from './agentEvent';
import type { NormalizeError } from './normalize';
import { normalizeAgentEvent } from './normalize';

export type RejectReporter = (error: NormalizeError) => void;

/** Default reporter: the error code and nothing else (ADR-009, SEC-3). */
export const warnRejected: RejectReporter = (error) => {
  console.warn(`[deskling] rejected agent event: ${error}`);
};

/**
 * The single path from untrusted adapter output to the reducer (FR-E2).
 * Raw input is normalized; only the normalized event is dispatched.
 */
export function createIngest(
  dispatch: (event: AgentEvent) => void,
  onReject: RejectReporter = warnRejected,
): (raw: unknown) => void {
  return (raw) => {
    const result = normalizeAgentEvent(raw);
    if (result.ok) {
      dispatch(result.event);
    } else {
      onReject(result.error);
    }
  };
}
