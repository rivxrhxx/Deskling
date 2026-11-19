// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveSocketPath as claudeSocketPath } from '../claude-code/hookRecord.mjs';
import { resolveSocketPath, toCodexRecord } from './codexRecord.mjs';

// ADR-026 §1–2: Codex hook stdin JSON → hook record v1 (agent "codex"). Only these fields may leave the hook.
const NOW = 1_763_500_000_000;
const SESSION = '019a8f2c-7d3e-7b41-9c5a-3e2f1d0c9b8a';
const hook = (fields) => ({ session_id: SESSION, ...fields });

describe('toCodexRecord: event mapping (ADR-026 §1)', () => {
  it.each([
    ['SessionStart', {}, { event: 'session-start' }],
    ['SessionEnd', {}, { event: 'session-end' }],
    ['UserPromptSubmit', {}, { event: 'prompt' }],
    ['PreToolUse', { tool_name: 'apply_patch' }, { event: 'tool-start', tool: 'code' }],
    ['PostToolUse', { tool_name: 'exec_command' }, { event: 'tool-end', tool: 'terminal', ok: true }],
    ['PermissionRequest', { tool_name: 'Bash' }, { event: 'approval' }],
    ['PermissionRequest', { tool_name: 'mcp__github__get_issue' }, { event: 'approval' }],
    ['PermissionRequest', {}, { event: 'approval' }],
    ['Stop', {}, { event: 'stop' }],
    ['Interrupt', {}, { event: 'interrupt' }],
  ])('%s %j → %j', (name, extra, expected) => {
    expect(toCodexRecord(hook({ hook_event_name: name, ...extra }), NOW)).toEqual({
      v: 1,
      agent: 'codex',
      session: SESSION,
      ...expected,
      at: NOW,
    });
  });

  it('serializes keys in schema order: v, agent, session, event, tool, ok, at', () => {
    const record = toCodexRecord(hook({ hook_event_name: 'PostToolUse', tool_name: 'apply_patch' }), NOW);
    expect(Object.keys(record)).toEqual(['v', 'agent', 'session', 'event', 'tool', 'ok', 'at']);
  });

  it.each([
    'PreModelRequest',
    'PostModelRequest',
    'PreCompact',
    'PostCompact',
    'SubagentStart',
    'SubagentStop',
    // Claude Code names that Codex does not send: never guessed into a record.
    'PostToolUseFailure',
    'StopFailure',
    'Notification',
    'NotARealEvent',
    'interrupt',
    'constructor',
    '__proto__',
    'toString',
    '',
  ])('unknown or unmapped event %j → null', (name) => {
    expect(toCodexRecord(hook({ hook_event_name: name, tool_name: 'Bash' }), NOW)).toBeNull();
  });

  it('a non-string event name → null', () => {
    expect(toCodexRecord(hook({ hook_event_name: 42 }), NOW)).toBeNull();
    expect(toCodexRecord(hook({}), NOW)).toBeNull();
  });
});

describe('toCodexRecord: tool categories (ADR-026 §1)', () => {
  it.each([
    ['Bash', 'terminal'],
    ['exec_command', 'terminal'],
    ['apply_patch', 'code'],
    ['Edit', 'code'],
    ['Write', 'code'],
    ['spawn_agent', 'delegate'],
    ['Agent', 'delegate'],
  ])('%s → %s', (toolName, category) => {
    for (const name of ['PreToolUse', 'PostToolUse']) {
      expect(toCodexRecord(hook({ hook_event_name: name, tool_name: toolName }), NOW)?.tool).toBe(category);
    }
  });

  it.each([
    'update_plan',
    'view_image',
    'write_stdin',
    'mcp__github__get_issue',
    'mcp__filesystem__read_file',
    'web_search',
    // Claude Code tools Codex does not map (no guessing across agents).
    'Read',
    'WebFetch',
    'SendMessage',
    'bash',
    'Exec_command',
    'constructor',
    '__proto__',
    'hasOwnProperty',
    '',
    undefined,
    null,
    3,
  ])('tool %j outside the categories → no record at all', (toolName) => {
    for (const name of ['PreToolUse', 'PostToolUse']) {
      expect(toCodexRecord(hook({ hook_event_name: name, tool_name: toolName }), NOW)).toBeNull();
    }
  });

  it('tool and ok never appear on events other than tool-start / tool-end', () => {
    for (const name of ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PermissionRequest', 'Stop', 'Interrupt']) {
      const record = toCodexRecord(hook({ hook_event_name: name, tool_name: 'Bash' }), NOW);
      expect(record).not.toBeNull();
      expect(record).not.toHaveProperty('tool');
      expect(record).not.toHaveProperty('ok');
    }
    expect(toCodexRecord(hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash' }), NOW)).not.toHaveProperty('ok');
  });
});

describe('toCodexRecord: session id (EVENT_PROTOCOL identifier rule)', () => {
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
    expect(toCodexRecord({ session_id: session, hook_event_name: 'Stop' }, NOW)).toBeNull();
  });

  it('accepts the full identifier alphabet at the 64-char limit', () => {
    const id = 'Az09._:-'.repeat(8);
    expect(toCodexRecord({ session_id: id, hook_event_name: 'Stop' }, NOW)?.session).toBe(id);
  });
});

describe('toCodexRecord: malformed input', () => {
  it.each([null, undefined, 'Stop', 7, true, [], [hook({ hook_event_name: 'Stop' })]])('%j → null', (input) => {
    expect(toCodexRecord(input, NOW)).toBeNull();
  });

  it.each([Number.NaN, -1, 1.5, Number.MAX_SAFE_INTEGER + 2, '1763500000000'])('clock value %j → null', (now) => {
    expect(toCodexRecord(hook({ hook_event_name: 'Stop' }), now)).toBeNull();
  });
});

describe('toCodexRecord: forbidden data never leaves the hook (ADR-026 §1, EVENT_PROTOCOL §7)', () => {
  const SECRETS = [
    'PROMPT-SECRET-please-refactor-auth',
    'CMD-SECRET-rm-rf',
    '/Users/someone/SECRET-PATH/.env',
    'PATCH-SECRET-content',
    'RESPONSE-SECRET',
    'Bearer AUTH-SECRET-token',
    'sk-OPENAI-API-KEY-SECRET',
    'ENV-SECRET-value',
    '/Users/someone/.codex/sessions/TRANSCRIPT-SECRET.jsonl',
    '/Users/someone/CWD-SECRET',
    'LAST-MESSAGE-SECRET',
    'TURN-ID-SECRET',
    'MODEL-SECRET-gpt',
    'PERMISSION-MODE-SECRET',
    'SOURCE-SECRET-resume',
    'REASON-SECRET-exit',
  ];
  const loaded = (name, toolName) => ({
    session_id: SESSION,
    hook_event_name: name,
    tool_name: toolName,
    turn_id: SECRETS[11],
    cwd: SECRETS[9],
    transcript_path: SECRETS[8],
    model: SECRETS[12],
    permission_mode: SECRETS[13],
    prompt: SECRETS[0],
    tool_input: {
      command: SECRETS[1],
      cmd: [SECRETS[1]],
      workdir: SECRETS[2],
      input: SECRETS[3],
      env: { OPENAI_API_KEY: SECRETS[6], OTHER: SECRETS[7] },
      headers: { Authorization: SECRETS[5] },
    },
    tool_response: { output: SECRETS[4], path: SECRETS[2] },
    last_assistant_message: SECRETS[10],
    source: SECRETS[14],
    reason: SECRETS[15],
    env: { HOME: SECRETS[7] },
    Authorization: SECRETS[5],
    apiKey: SECRETS[6],
  });

  it.each([
    ['SessionStart', undefined],
    ['SessionEnd', undefined],
    ['UserPromptSubmit', undefined],
    ['PreToolUse', 'exec_command'],
    ['PostToolUse', 'apply_patch'],
    ['PermissionRequest', 'Bash'],
    ['Stop', undefined],
    ['Interrupt', undefined],
  ])('%s: the serialized record carries none of the payload values', (name, toolName) => {
    const record = toCodexRecord(loaded(name, toolName), NOW);
    expect(record).not.toBeNull();
    const line = JSON.stringify(record);
    for (const secret of SECRETS) {
      expect(line).not.toContain(secret);
    }
    // ("prompt" is a legitimate event value, so it is not in this list.)
    for (const word of ['SECRET', 'command', 'path', 'Authorization', 'Bearer', 'env', 'cwd', 'transcript', 'model']) {
      expect(line).not.toContain(word);
    }
    expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(1024);
  });

  it('reads only session_id, hook_event_name and tool_name from the input', () => {
    const touched = new Set();
    const spy = (target) =>
      new Proxy(target, {
        get(obj, key, receiver) {
          touched.add(String(key));
          return Reflect.get(obj, key, receiver);
        },
      });
    for (const [name, toolName] of [
      ['SessionStart', undefined],
      ['SessionEnd', undefined],
      ['UserPromptSubmit', undefined],
      ['PreToolUse', 'exec_command'],
      ['PostToolUse', 'apply_patch'],
      ['PostToolUse', 'update_plan'],
      ['PermissionRequest', 'Bash'],
      ['Stop', undefined],
      ['Interrupt', undefined],
      ['PostModelRequest', undefined],
    ]) {
      toCodexRecord(spy(loaded(name, toolName)), NOW);
    }
    expect([...touched].sort()).toEqual(['hook_event_name', 'session_id', 'tool_name']);
  });
});

describe('resolveSocketPath (ADR-026: the same socket as Claude Code)', () => {
  it.each([
    [{ HOME: '/Users/someone' }, '/ignored'],
    [{}, '/Users/fallback'],
    [{ HOME: '/Users/someone', DESKLING_SOCKET: '/tmp/x.sock' }, '/h'],
  ])('%j, %s resolves exactly like the Claude Code hook', (env, home) => {
    expect(resolveSocketPath(env, home)).toBe(claudeSocketPath(env, home));
  });

  it('defaults to the app data directory under HOME', () => {
    expect(resolveSocketPath({ HOME: '/Users/someone' }, '/ignored')).toBe(
      '/Users/someone/Library/Application Support/com.deskling.desktop/agent-events.sock',
    );
  });
});
