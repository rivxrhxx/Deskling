// Codex hook stdin JSON → Deskling hook record v1 with agent "codex" (ADR-026 §1–2).
// Pure: no I/O, no clock. Reads only session_id, hook_event_name and tool_name.
// prompt, tool_input, tool_response, last_assistant_message, transcript_path, cwd, turn_id, model,
// permission_mode, source and reason are never read or forwarded. Mapping table: docs/integrations/CODEX.md.
// Socket path (ADR-024 §3): the same one the Claude Code hook writes to.
export { resolveSocketPath } from '../shared/socketPath.mjs';

const IDENTIFIER = /^[A-Za-z0-9._:-]{1,64}$/;

/** Hook event names that map without looking at any other field. */
const EVENTS = new Map([
  ['SessionStart', 'session-start'],
  ['SessionEnd', 'session-end'],
  ['UserPromptSubmit', 'prompt'],
  ['PermissionRequest', 'approval'],
  ['Stop', 'stop'],
  ['Interrupt', 'interrupt'],
]);

/** Tool events: record event and, for tool-end, the outcome. Codex has no failed-tool hook. */
const TOOL_EVENTS = new Map([
  ['PreToolUse', { event: 'tool-start' }],
  ['PostToolUse', { event: 'tool-end', ok: true }],
]);

/** Tool name → category. Anything else (update_plan, view_image, write_stdin, every mcp__* tool, …) sends no record. */
const TOOL_CATEGORIES = new Map([
  ['Bash', 'terminal'],
  ['exec_command', 'terminal'],
  ['apply_patch', 'code'],
  ['Edit', 'code'],
  ['Write', 'code'],
  ['spawn_agent', 'delegate'],
  ['Agent', 'delegate'],
]);

/**
 * @typedef {'session-start' | 'session-end' | 'prompt' | 'tool-start' | 'tool-end' | 'approval' | 'stop' | 'interrupt'} CodexRecordEvent
 * @typedef {'code' | 'terminal' | 'delegate'} CodexToolCategory
 * @typedef {{ v: 1, agent: 'codex', session: string, event: CodexRecordEvent, tool?: CodexToolCategory, ok?: boolean, at: number }} CodexRecord
 */

/**
 * @param {unknown} hookJson parsed stdin of a Codex command hook
 * @param {number} now epoch milliseconds
 * @returns {CodexRecord | null} null means "send nothing"
 */
export function toCodexRecord(hookJson, now) {
  if (typeof hookJson !== 'object' || hookJson === null || Array.isArray(hookJson)) return null;
  if (!Number.isSafeInteger(now) || now < 0) return null;

  const session = hookJson.session_id;
  if (typeof session !== 'string' || !IDENTIFIER.test(session)) return null;

  const name = hookJson.hook_event_name;
  if (typeof name !== 'string') return null;
  const base = { v: 1, agent: 'codex', session };

  const simple = EVENTS.get(name);
  if (simple) return { ...base, event: simple, at: now };

  const toolEvent = TOOL_EVENTS.get(name);
  if (!toolEvent) return null;
  const toolName = hookJson.tool_name;
  const tool = typeof toolName === 'string' ? TOOL_CATEGORIES.get(toolName) : undefined;
  if (!tool) return null;
  return toolEvent.ok === undefined
    ? { ...base, event: toolEvent.event, tool, at: now }
    : { ...base, event: toolEvent.event, tool, ok: toolEvent.ok, at: now };
}
