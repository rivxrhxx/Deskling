/** `demo` sources always force the DEMO badge on (FR-D5). */
export type SourceMode = 'demo' | 'live';

/**
 * Anything that can feed Deskling: the demo player today, a Hermes adapter later.
 * Sources emit raw, untrusted objects; the app normalizes every one of them (ARCHITECTURE §3.5).
 * Deskling only observes — a source has no way to send anything back to the agent.
 */
export interface AgentEventSource {
  readonly mode: SourceMode;
  /** Starts emitting. Returns a stop function that is safe to call more than once. */
  start(emit: (raw: unknown) => void): () => void;
}
