// Claude Code hook stdin JSON → Deskling hook record v1 (ADR-024 §2, FR-CC1).
// Pure: no I/O, no clock. Reads only session_id, hook_event_name, tool_name and notification_type.
// Prompts, tool input/response, paths, commands, cwd and transcript_path are never read or forwarded.
// Mapping table: docs/integrations/CLAUDE_CODE.md.
import path from 'node:path';

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,64}$/;

/** Hook event names that map without looking at any other field. */
const EVENTS = new Map([
  ['SessionStart', 'session-start'],
  ['SessionEnd', 'session-end'],
  ['UserPromptSubmit', 'prompt'],
  ['PermissionRequest', 'approval'],
  ['Stop', 'stop'],
  ['StopFailure', 'stop-failure'],
  ['SubagentStop', 'subagent-stop'],
]);

/** Tool events: record event and, for tool-end, the outcome. */
const TOOL_EVENTS = new Map([
  ['PreToolUse', { event: 'tool-start' }],
  ['PostToolUse', { event: 'tool-end', ok: true }],
  ['PostToolUseFailure', { event: 'tool-end', ok: false }],
]);

/** Tool name → category. Anything else (including every mcp__* tool) sends no record. */
const TOOL_CATEGORIES = new Map([
  ['Edit', 'code'],
  ['Write', 'code'],
  ['MultiEdit', 'code'],
  ['NotebookEdit', 'code'],
  ['Read', 'file'],
  ['Glob', 'file'],
  ['Grep', 'file'],
  ['LS', 'file'],
  ['Bash', 'terminal'],
  ['BashOutput', 'terminal'],
  ['KillShell', 'terminal'],
  ['WebFetch', 'browser'],
  ['WebSearch', 'browser'],
  ['Task', 'delegate'],
  ['Agent', 'delegate'],
  ['SendMessage', 'message'],
]);

/**
 * @typedef {'session-start' | 'session-end' | 'prompt' | 'tool-start' | 'tool-end' | 'approval' | 'stop' | 'stop-failure' | 'subagent-stop'} HookRecordEvent
 * @typedef {'code' | 'browser' | 'terminal' | 'file' | 'delegate' | 'message'} ToolCategory
 * @typedef {{ v: 1, agent: 'claude-code', session: string, event: HookRecordEvent, tool?: ToolCategory, ok?: boolean, at: number }} HookRecord
 */

/**
 * @param {unknown} hookJson parsed stdin of a Claude Code command hook
 * @param {number} now epoch milliseconds
 * @returns {HookRecord | null} null means "send nothing"
 */
export function toHookRecord(hookJson, now) {
  if (typeof hookJson !== 'object' || hookJson === null || Array.isArray(hookJson)) return null;
  if (!Number.isSafeInteger(now) || now < 0) return null;

  const session = hookJson.session_id;
  if (typeof session !== 'string' || !IDENTIFIER.test(session)) return null;

  const name = hookJson.hook_event_name;
  if (typeof name !== 'string') return null;
  const base = { v: 1, agent: 'claude-code', session };

  const simple = EVENTS.get(name);
  if (simple) return { ...base, event: simple, at: now };

  if (name === 'Notification') {
    return hookJson.notification_type === 'permission_prompt' ? { ...base, event: 'approval', at: now } : null;
  }

  const toolEvent = TOOL_EVENTS.get(name);
  if (!toolEvent) return null;
  const toolName = hookJson.tool_name;
  const tool = typeof toolName === 'string' ? TOOL_CATEGORIES.get(toolName) : undefined;
  if (!tool) return null;
  return toolEvent.ok === undefined
    ? { ...base, event: toolEvent.event, tool, at: now }
    : { ...base, event: toolEvent.event, tool, ok: toolEvent.ok, at: now };
}

/**
 * Socket Deskling listens on (ADR-024 §3). DESKLING_SOCKET overrides it for tests.
 * @param {Record<string, string | undefined>} env
 * @param {string} home fallback when HOME is unset
 */
export function resolveSocketPath(env, home) {
  if (env.DESKLING_SOCKET) return env.DESKLING_SOCKET;
  return path.join(env.HOME || home, 'Library', 'Application Support', 'com.deskling.desktop', 'agent-events.sock');
}
