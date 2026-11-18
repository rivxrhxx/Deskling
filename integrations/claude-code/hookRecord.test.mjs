// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveSocketPath, toHookRecord } from './hookRecord.mjs';

// FR-CC1, ADR-024: Claude Code hook stdin JSON → hook record v1. Only these fields may leave the hook.
const NOW = 1_763_500_000_000;
const SESSION = '0f4c9a3e-6c1d-4f3e-9b8a-2d7e5c1a9b00';
const hook = (fields) => ({ session_id: SESSION, ...fields });

describe('toHookRecord: event mapping (ADR-024 §2)', () => {
  it.each([
    ['SessionStart', {}, { event: 'session-start' }],
    ['SessionEnd', {}, { event: 'session-end' }],
    ['UserPromptSubmit', {}, { event: 'prompt' }],
    ['PreToolUse', { tool_name: 'Edit' }, { event: 'tool-start', tool: 'code' }],
    ['PostToolUse', { tool_name: 'Bash' }, { event: 'tool-end', tool: 'terminal', ok: true }],
    ['PostToolUseFailure', { tool_name: 'Read' }, { event: 'tool-end', tool: 'file', ok: false }],
    ['PermissionRequest', { tool_name: 'Bash' }, { event: 'approval' }],
    ['PermissionRequest', { tool_name: 'mcp__github__get_issue' }, { event: 'approval' }],
    ['Notification', { notification_type: 'permission_prompt' }, { event: 'approval' }],
    ['Stop', {}, { event: 'stop' }],
    ['StopFailure', {}, { event: 'stop-failure' }],
    ['SubagentStop', {}, { event: 'subagent-stop' }],
  ])('%s %j → %j', (name, extra, expected) => {
    expect(toHookRecord(hook({ hook_event_name: name, ...extra }), NOW)).toEqual({
      v: 1,
      agent: 'claude-code',
      session: SESSION,
      ...expected,
      at: NOW,
    });
  });

  it('serializes keys in schema order: v, agent, session, event, tool, ok, at', () => {
    const record = toHookRecord(hook({ hook_event_name: 'PostToolUse', tool_name: 'Write' }), NOW);
    expect(Object.keys(record)).toEqual(['v', 'agent', 'session', 'event', 'tool', 'ok', 'at']);
  });

  it.each([
    'SubagentStart',
    'PreCompact',
    'PostCompact',
    'PermissionDenied',
    'PostToolBatch',
    'TaskCreated',
    'CwdChanged',
    'FileChanged',
    'Setup',
    'MessageDisplay',
    'NotARealEvent',
    'constructor',
    '__proto__',
    'toString',
    '',
  ])('unknown or unmapped event %j → null', (name) => {
    expect(toHookRecord(hook({ hook_event_name: name, tool_name: 'Bash' }), NOW)).toBeNull();
  });

  it.each(['idle_prompt', 'auth_success', 'elicitation_dialog', 'agent_needs_input', undefined, 7])(
    'Notification of type %j is not an approval → null',
    (notificationType) => {
      expect(toHookRecord(hook({ hook_event_name: 'Notification', notification_type: notificationType }), NOW)).toBeNull();
    },
  );

  it('a non-string event name → null', () => {
    expect(toHookRecord(hook({ hook_event_name: 42 }), NOW)).toBeNull();
    expect(toHookRecord(hook({}), NOW)).toBeNull();
  });
});

describe('toHookRecord: tool categories (ADR-024 §2)', () => {
  it.each([
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
  ])('%s → %s', (toolName, category) => {
    for (const name of ['PreToolUse', 'PostToolUse', 'PostToolUseFailure']) {
      expect(toHookRecord(hook({ hook_event_name: name, tool_name: toolName }), NOW)?.tool).toBe(category);
    }
  });

  it.each([
    'mcp__github__get_issue',
    'mcp__filesystem__read_file',
    'Skill',
    'TodoWrite',
    'AskUserQuestion',
    'ExitPlanMode',
    'PowerShell',
    'Monitor',
    'edit',
    'constructor',
    '__proto__',
    'hasOwnProperty',
    '',
    undefined,
    null,
    3,
  ])('tool %j outside the categories → no record at all', (toolName) => {
    for (const name of ['PreToolUse', 'PostToolUse', 'PostToolUseFailure']) {
      expect(toHookRecord(hook({ hook_event_name: name, tool_name: toolName }), NOW)).toBeNull();
    }
  });

  it('tool and ok never appear on events other than tool-start / tool-end', () => {
    for (const name of ['SessionStart', 'UserPromptSubmit', 'PermissionRequest', 'Stop', 'SubagentStop']) {
      const record = toHookRecord(hook({ hook_event_name: name, tool_name: 'Bash' }), NOW);
      expect(record).not.toBeNull();
      expect(record).not.toHaveProperty('tool');
      expect(record).not.toHaveProperty('ok');
    }
    expect(toHookRecord(hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash' }), NOW)).not.toHaveProperty('ok');
  });
});

describe('toHookRecord: session id (EVENT_PROTOCOL identifier rule)', () => {
  it.each([
    ['', 'empty'],
    ['a'.repeat(65), '65 chars'],
    ['has space', 'space'],
    ['../etc/passwd', 'slash'],
    ['abc\n', 'trailing newline'],
    ['sëssion', 'non-ascii'],
    ['a"b', 'quote'],
    [42, 'number'],
    [null, 'null'],
    [undefined, 'missing'],
    [{ id: 'x' }, 'object'],
  ])('%j (%s) → null', (session) => {
    expect(toHookRecord({ session_id: session, hook_event_name: 'Stop' }, NOW)).toBeNull();
  });

  it('accepts the full identifier alphabet at the 64-char limit', () => {
    const id = 'Az09._:-'.repeat(8);
    expect(toHookRecord({ session_id: id, hook_event_name: 'Stop' }, NOW)?.session).toBe(id);
  });
});

describe('toHookRecord: malformed input', () => {
  it.each([null, undefined, 'Stop', 7, true, [], [hook({ hook_event_name: 'Stop' })]])('%j → null', (input) => {
    expect(toHookRecord(input, NOW)).toBeNull();
  });

  it.each([Number.NaN, -1, 1.5, Number.MAX_SAFE_INTEGER + 2, '1763500000000'])('clock value %j → null', (now) => {
    expect(toHookRecord(hook({ hook_event_name: 'Stop' }), now)).toBeNull();
  });
});

describe('toHookRecord: forbidden data never leaves the hook (FR-CC1, EVENT_PROTOCOL §7)', () => {
  const SECRETS = [
    'PROMPT-SECRET-please-refactor-auth',
    'CMD-SECRET-rm-rf',
    '/Users/someone/SECRET-PATH/.env',
    'FILE-CONTENT-SECRET',
    'RESPONSE-SECRET',
    'Bearer AUTH-SECRET-token',
    'sk-ant-API-KEY-SECRET',
    'ENV-SECRET-value',
    '/Users/someone/.claude/projects/TRANSCRIPT-SECRET.jsonl',
    '/Users/someone/CWD-SECRET',
    'ERROR-SECRET-exit-1',
    'MESSAGE-SECRET-needs-permission',
    'LAST-MESSAGE-SECRET',
    'AGENT-TYPE-SECRET',
    'TOOL-USE-ID-SECRET',
  ];
  const loaded = (name, toolName) => ({
    session_id: SESSION,
    hook_event_name: name,
    tool_name: toolName,
    prompt: SECRETS[0],
    tool_input: {
      command: SECRETS[1],
      file_path: SECRETS[2],
      content: SECRETS[3],
      env: { ANTHROPIC_API_KEY: SECRETS[6], OTHER: SECRETS[7] },
      headers: { Authorization: SECRETS[5] },
    },
    tool_response: { stdout: SECRETS[4], filePath: SECRETS[2] },
    transcript_path: SECRETS[8],
    agent_transcript_path: SECRETS[8],
    cwd: SECRETS[9],
    error: SECRETS[10],
    message: SECRETS[11],
    title: SECRETS[11],
    notification_type: 'permission_prompt',
    last_assistant_message: SECRETS[12],
    agent_type: SECRETS[13],
    agent_id: SECRETS[13],
    tool_use_id: SECRETS[14],
    permission_suggestions: [{ rule: SECRETS[1] }],
    env: { HOME: SECRETS[7] },
    Authorization: SECRETS[5],
    apiKey: SECRETS[6],
  });

  it.each([
    ['UserPromptSubmit', undefined],
    ['PreToolUse', 'Bash'],
    ['PostToolUse', 'Write'],
    ['PostToolUseFailure', 'Bash'],
    ['PermissionRequest', 'Bash'],
    ['Notification', undefined],
    ['Stop', undefined],
    ['StopFailure', undefined],
    ['SubagentStop', undefined],
    ['SessionStart', undefined],
    ['SessionEnd', undefined],
  ])('%s: the serialized record carries none of the payload values', (name, toolName) => {
    const record = toHookRecord(loaded(name, toolName), NOW);
    expect(record).not.toBeNull();
    const line = JSON.stringify(record);
    for (const secret of SECRETS) {
      expect(line).not.toContain(secret);
    }
    // ("prompt" is a legitimate event value, so it is not in this list.)
    for (const word of ['SECRET', 'command', 'path', 'Authorization', 'Bearer', 'env', 'cwd', 'transcript']) {
      expect(line).not.toContain(word);
    }
    expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(1024);
  });

  it('reads only session_id, hook_event_name, tool_name and notification_type from the input', () => {
    const touched = new Set();
    const spy = (target) =>
      new Proxy(target, {
        get(obj, key, receiver) {
          touched.add(String(key));
          return Reflect.get(obj, key, receiver);
        },
      });
    for (const [name, toolName] of [
      ['UserPromptSubmit', undefined],
      ['PostToolUse', 'Bash'],
      ['PostToolUseFailure', 'Edit'],
      ['PermissionRequest', 'Bash'],
      ['Notification', undefined],
      ['Stop', undefined],
      ['SubagentStop', undefined],
    ]) {
      toHookRecord(spy(loaded(name, toolName)), NOW);
    }
    expect([...touched].sort()).toEqual(['hook_event_name', 'notification_type', 'session_id', 'tool_name']);
  });
});

describe('resolveSocketPath (ADR-024 §3)', () => {
  it('defaults to the app data directory under HOME', () => {
    expect(resolveSocketPath({ HOME: '/Users/someone' }, '/ignored')).toBe(
      '/Users/someone/Library/Application Support/com.deskling.desktop/agent-events.sock',
    );
  });

  it('falls back to the OS home directory when HOME is unset', () => {
    expect(resolveSocketPath({}, '/Users/fallback')).toBe(
      '/Users/fallback/Library/Application Support/com.deskling.desktop/agent-events.sock',
    );
  });

  it('honours DESKLING_SOCKET for tests', () => {
    expect(resolveSocketPath({ HOME: '/Users/someone', DESKLING_SOCKET: '/tmp/x.sock' }, '/h')).toBe('/tmp/x.sock');
  });
});
