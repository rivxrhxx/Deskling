import type { AgentEventSource } from '../types';
import { initialTranslatorState, translateHookRecord } from './translate';

/** Subscribes to hook records; resolves to an unsubscribe function. Injected by the app (src/platform owns Tauri). */
export type ListenHookRecords = (onRecord: (raw: unknown) => void) => Promise<() => void>;

/**
 * Live Claude Code and Codex sessions (ADR-024 §5, ADR-026 §2). Both hooks write to the same bridge, so one
 * listener carries both agents; each hook record is translated into AgentEvent v3 objects, which the app
 * normalizes again. Translator state belongs to the source instance, so a stop/start cycle (React StrictMode)
 * keeps every session's seq increasing.
 */
export function createClaudeCodeSource(listen: ListenHookRecords): AgentEventSource {
  let state = initialTranslatorState;

  return {
    mode: 'live',
    start(emit) {
      let stopped = false;
      let unlisten: (() => void) | null = null;

      const onRecord = (raw: unknown) => {
        if (stopped) return;
        const result = translateHookRecord(state, raw);
        state = result.state;
        for (const event of result.events) {
          // stop() may be called from inside emit(); honour it immediately.
          if (stopped) return;
          emit(event);
        }
      };

      void listen(onRecord).then(
        (fn) => {
          if (stopped) fn();
          else unlisten = fn;
        },
        // Nothing was subscribed, so there is nothing to undo or report.
        () => undefined,
      );

      return () => {
        if (stopped) return;
        stopped = true;
        unlisten?.();
        unlisten = null;
      };
    },
  };
}
