import { isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * Receives hook records the Rust bridge has already validated and re-serialized (ADR-024 §4–5).
 * The payload stays `unknown`: the Claude Code adapter validates it again before translating.
 * Outside Tauri, or when listening fails, this resolves to a no-op unlisten and never rejects.
 */
export const HOOK_RECORD_EVENT = 'deskling://hook-record';

const noop = () => undefined;

export async function listenHookRecords(onRecord: (raw: unknown) => void): Promise<() => void> {
  if (!isTauri()) return noop;
  try {
    return await listen<unknown>(HOOK_RECORD_EVENT, (event) => onRecord(event.payload));
  } catch {
    console.warn('[deskling] hook record listen failed');
    return noop;
  }
}
