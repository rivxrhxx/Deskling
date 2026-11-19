// The socket every Deskling agent hook writes to (ADR-024 §3, ADR-026). Pure: reads only the given env.
import path from 'node:path';

/**
 * Socket Deskling listens on. DESKLING_SOCKET overrides it for tests.
 * @param {Record<string, string | undefined>} env
 * @param {string} home fallback when HOME is unset
 */
export function resolveSocketPath(env, home) {
  if (env.DESKLING_SOCKET) return env.DESKLING_SOCKET;
  return path.join(env.HOME || home, 'Library', 'Application Support', 'com.deskling.desktop', 'agent-events.sock');
}
