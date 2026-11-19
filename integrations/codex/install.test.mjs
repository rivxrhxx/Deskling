// @vitest-environment node
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { toCodexRecord } from './codexRecord.mjs';
import { desklingHooks, HOOK_SCRIPT, hookCommand, run, shellQuote, stableNodePath, TOOL_MATCHER } from './install.mjs';

// ADR-026 §3: opt-in install/uninstall of the Deskling Codex hooks, with a backup, touching nothing else.
// Every test works inside a temporary HOME with explicit paths. The real ~/.codex/ is never read or written.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const DOC = path.join(ROOT, 'docs', 'integrations', 'CODEX.md');
const NOW = new Date(2026, 10, 19, 14, 30, 5); // local time → 20261119-143005
const LATER = new Date(2026, 10, 19, 15, 0, 0);
const NODE = stableNodePath(process.execPath);
const EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
  'Stop',
  'Interrupt',
];
const TOOLS = ['Bash', 'exec_command', 'apply_patch', 'Edit', 'Write', 'spawn_agent', 'Agent'];
const HOOK_NAME = 'deskling-codex-hook.mjs';

/** A hooks.json a real user might have: other tools' hooks on many events; the secrets must survive and never be printed. */
const USER_HOOKS = {
  description: 'my hooks',
  hooks: {
    SessionStart: [
      { matcher: 'startup|resume', hooks: [{ type: 'command', command: '~/bin/notify --token sk-start-SECRET-1', timeout: 5 }] },
    ],
    PreToolUse: [
      {
        matcher: '^Bash$',
        hooks: [{ type: 'command', command: '/usr/local/bin/guard --key sk-hook-SECRET-2', statusMessage: 'Checking SECRET-3' }],
      },
    ],
    PostToolUse: [{ matcher: '.*', hooks: [{ type: 'command', command: 'logger SECRET-4', async: true }] }],
    Stop: [
      {
        hooks: [
          { type: 'command', command: 'afplay ~/done.aiff # SECRET-5' },
          { type: 'mcp_tool', server: 'srv', tool: 'SECRET-6', input: {} },
        ],
      },
    ],
    PreCompact: [{ hooks: [{ type: 'command', command: 'echo SECRET-7' }] }],
    SubagentStop: [{ hooks: [{ type: 'command', command: 'echo SECRET-8' }] }],
  },
  'x-other-tool': { keep: ['SECRET-9'] },
};
const OTHER_HANDLERS = 7;

const SECRETS = /SECRET|sk-|guard|afplay|logger|notify/;

let home;
let dir;
let hooksPath;
let configPath;
let socketPath;
let hook;
let BLOCK;

beforeEach(() => {
  // Short base path: macOS limits Unix socket paths to 104 bytes.
  home = mkdtempSync(path.join(tmpdir(), 'dkx-'));
  dir = path.join(home, '.codex');
  hooksPath = path.join(dir, 'hooks.json');
  configPath = path.join(dir, 'config.toml');
  socketPath = path.join(home, 'd.sock');
  mkdirSync(path.join(home, 'repo'));
  hook = path.join(realpathSync.native(path.join(home, 'repo')), HOOK_NAME);
  writeFileSync(hook, '');
  BLOCK = desklingHooks(hookCommand(NODE, hook));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** Runs the installer in-process against the temporary paths only. */
function cli(command, { now = NOW, hooks = hooksPath, config = configPath, hookPath = hook, ...options } = {}) {
  let stdout = '';
  let stderr = '';
  const code = run([command, '--hooks', hooks, '--config', config], {
    env: { HOME: home, DESKLING_SOCKET: socketPath },
    hookPath,
    now: () => now,
    stdout: { write: (text) => (stdout += text) },
    stderr: { write: (text) => (stderr += text) },
    ...options,
  });
  return { code, stdout, stderr, output: stdout + stderr };
}

/**
 * A copy of integrations/ inside the temporary HOME, so the real CLI process runs with a hook script we
 * control (present or missing) whatever state the repository's own hook script is in.
 */
function copyRepo({ withHook }) {
  const target = path.join(home, 'r', 'integrations');
  cpSync(path.join(ROOT, 'integrations'), target, { recursive: true, filter: (src) => path.basename(src) !== HOOK_NAME });
  const codexDir = realpathSync.native(path.join(target, 'codex'));
  if (withHook) writeFileSync(path.join(codexDir, HOOK_NAME), '');
  return { installer: path.join(codexDir, 'install.mjs'), hook: path.join(codexDir, HOOK_NAME) };
}

/** Runs the real CLI process with HOME pointing at the temporary directory (and no CODEX_HOME). */
function spawnCli(installer, args, env = {}) {
  const result = spawnSync(process.execPath, [installer, ...args], {
    env: { PATH: process.env.PATH, HOME: home, DESKLING_SOCKET: socketPath, ...env },
    encoding: 'utf8',
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr };
}

const writeHooks = (text, mode = 0o644) => {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(hooksPath, text);
  chmodSync(hooksPath, mode);
};
const writeConfig = (text) => {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(configPath, text);
};
const readHooks = () => JSON.parse(readFileSync(hooksPath, 'utf8'));
const backups = () => readdirSync(dir).filter((name) => name.startsWith('hooks.json.deskling-backup-'));
const modeOf = (file) => statSync(file).mode & 0o777;
const snapshot = () =>
  Object.fromEntries(
    readdirSync(dir).map((name) => {
      const file = path.join(dir, name);
      return [name, { bytes: readFileSync(file, 'utf8'), mtime: statSync(file).mtimeMs, mode: modeOf(file) }];
    }),
  );

/** USER_HOOKS with the Deskling groups appended to each event, the way install must produce it. */
function expectedMerge(original) {
  const expected = structuredClone(original);
  expected.hooks ??= {};
  for (const [event, groups] of Object.entries(BLOCK)) (expected.hooks[event] ??= []).push(...groups);
  return expected;
}

describe('Deskling Codex hook block (CODEX.md §4)', () => {
  it('is exactly the draft in CODEX.md §4 with <NODE> and <HOOK> filled in', () => {
    const doc = readFileSync(DOC, 'utf8');
    const section = doc.slice(doc.indexOf('## 4.'));
    const start = section.indexOf('```json') + '```json'.length;
    const draft = section.slice(start, section.indexOf('```', start));
    expect({ hooks: desklingHooks(hookCommand('<NODE>', '<HOOK>')) }).toEqual(JSON.parse(draft));
  });

  it('registers the ADR-026 events in order, the tool matcher only on the tool events, and no async', () => {
    expect(Object.keys(BLOCK)).toEqual(EVENTS);
    for (const [event, groups] of Object.entries(BLOCK)) {
      expect(groups, event).toHaveLength(1);
      const expected = { hooks: [{ type: 'command', command: hookCommand(NODE, hook), timeout: 2 }] };
      expect(groups[0], event).toEqual(
        ['PreToolUse', 'PostToolUse'].includes(event) ? { matcher: TOOL_MATCHER, ...expected } : expected,
      );
    }
    expect(JSON.stringify(BLOCK)).not.toContain('async');
  });

  it('registers only events and tools that the Codex hook turns into a record', () => {
    for (const event of Object.keys(BLOCK)) {
      expect(toCodexRecord({ session_id: 's', hook_event_name: event, tool_name: 'Bash' }, 1), event).not.toBeNull();
    }
    for (const tool of TOOLS) {
      expect(toCodexRecord({ session_id: 's', hook_event_name: 'PreToolUse', tool_name: tool }, 1), tool).not.toBeNull();
    }
  });

  it('matches exactly the tools the Codex hook maps to a category, as a regex', () => {
    expect(TOOL_MATCHER).toBe('^(Bash|exec_command|apply_patch|Edit|Write|spawn_agent|Agent)$');
    const matcher = new RegExp(TOOL_MATCHER);
    for (const tool of TOOLS) expect(matcher.test(tool), tool).toBe(true);
    for (const tool of ['update_plan', 'mcp__srv__Bash', 'Bash2', 'xBash', 'web_search', 'view_image', 'write_stdin', '']) {
      expect(matcher.test(tool), tool).toBe(false);
    }
  });

  it('points at the real path of integrations/codex/deskling-codex-hook.mjs by default', () => {
    expect(HOOK_SCRIPT).toBe(path.join(realpathSync.native(HERE), HOOK_NAME));
  });

  it('runs the stable node binary on the hook script, both single-quoted for sh', () => {
    expect(hookCommand('/n o/node', `/h's/hook.mjs`)).toBe(`'/n o/node' '/h'\\''s/hook.mjs'`);
    expect(hookCommand(NODE, hook)).toBe(`${shellQuote(NODE)} ${shellQuote(hook)}`);
  });

  it('builds a command that sh runs correctly for paths with spaces, quotes and $', () => {
    const weird = path.join(home, `Desk "ling's" $HOME \`x\``);
    mkdirSync(weird);
    const node = path.join(weird, `no de's`);
    symlinkSync(process.execPath, node);
    const script = path.join(weird, `hook's file.mjs`);
    writeFileSync(script, 'process.stdout.write(process.argv[1]);');
    const result = spawnSync('/bin/sh', ['-c', hookCommand(node, script)], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(script);
  });
});

describe('install', () => {
  it('creates a missing hooks.json (and its 0700 directory) holding only the hooks block', () => {
    const result = cli('install');
    expect(result.code).toBe(0);
    const text = readFileSync(hooksPath, 'utf8');
    expect(text).toBe(`${JSON.stringify({ hooks: BLOCK }, null, 2)}\n`);
    expect(modeOf(dir)).toBe(0o700);
    expect(modeOf(hooksPath)).toBe(0o600);
    expect(backups()).toEqual([]);
    expect(result.output).toContain(hooksPath);
  });

  it('tells the user to trust the new hooks in Codex with /hooks, and that open sessions may need a restart', () => {
    const result = cli('install');
    expect(result.stdout).toContain('/hooks');
    expect(result.stdout).toMatch(/신뢰/);
    expect(result.stdout).toMatch(/다시 시작/);
  });

  it('adds the hooks block to an empty object, after backing it up', () => {
    writeHooks('{}');
    expect(cli('install').code).toBe(0);
    expect(readHooks()).toEqual({ hooks: BLOCK });
    expect(backups()).toHaveLength(1);
  });

  it("appends to other tools' hooks and keeps every other key and hook exactly, in order", () => {
    writeHooks(JSON.stringify(USER_HOOKS, null, 2));
    const result = cli('install');
    expect(result.code).toBe(0);

    const after = readHooks();
    expect(after).toEqual(expectedMerge(USER_HOOKS));
    expect(Object.keys(after)).toEqual(Object.keys(USER_HOOKS));
    expect(Object.keys(after.hooks)).toEqual([
      ...Object.keys(USER_HOOKS.hooks),
      ...EVENTS.filter((event) => !Object.hasOwn(USER_HOOKS.hooks, event)),
    ]);
    // The user's groups stay first and unchanged; Deskling's group comes after them.
    expect(after.hooks.PreToolUse).toEqual([...USER_HOOKS.hooks.PreToolUse, ...BLOCK.PreToolUse]);
    expect(after.hooks.Stop).toEqual([...USER_HOOKS.hooks.Stop, ...BLOCK.Stop]);
    expect(after.hooks.PreCompact).toEqual(USER_HOOKS.hooks.PreCompact);
    expect(readFileSync(hooksPath, 'utf8')).toBe(`${JSON.stringify(after, null, 2)}\n`);
  });

  it('never prints other hooks or keys, only counts and paths', () => {
    writeHooks(JSON.stringify(USER_HOOKS));
    writeConfig('model = "gpt-5"\napi_key = "sk-cfg-SECRET-10"\n[features]\nhooks = false\n');
    const install = cli('install');
    const status = cli('status');
    const uninstall = cli('uninstall', { now: LATER });
    for (const result of [install, status, uninstall]) {
      expect(result.output).not.toMatch(SECRETS);
      expect(result.output).not.toContain('gpt-5');
      expect(result.output).toContain(hooksPath);
    }
    expect(install.stdout).toContain(`다른 훅 핸들러 ${OTHER_HANDLERS}개`);
  });

  it('is idempotent: a second install changes nothing and makes no new backup', () => {
    writeHooks(JSON.stringify(USER_HOOKS));
    cli('install');
    const before = snapshot();
    const again = cli('install', { now: LATER });
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('이미');
    expect(snapshot()).toEqual(before);
    expect(backups()).toHaveLength(1);
    expect(readHooks()).toEqual(expectedMerge(USER_HOOKS));
  });

  it('re-adds only the events whose Deskling entry is missing', () => {
    writeHooks(JSON.stringify({ hooks: { ...BLOCK, Interrupt: [] } }));
    expect(cli('install').code).toBe(0);
    expect(readHooks()).toEqual({ hooks: BLOCK });
  });

  it('writes a timestamped backup next to the file with the original bytes and mode', () => {
    const original = '{\n    "description": "x",\n    "hooks": {}\n}';
    writeHooks(original, 0o640);
    expect(cli('install').code).toBe(0);
    const backup = path.join(dir, 'hooks.json.deskling-backup-20261119-143005');
    expect(backups()).toEqual([path.basename(backup)]);
    expect(readFileSync(backup, 'utf8')).toBe(original);
    expect(modeOf(backup)).toBe(0o640);
  });

  it('keeps the original file mode and leaves no temporary files behind', () => {
    writeHooks('{"description":"x"}', 0o640);
    expect(cli('install').code).toBe(0);
    expect(modeOf(hooksPath)).toBe(0o640);
    expect(readdirSync(dir).sort()).toEqual(['hooks.json', 'hooks.json.deskling-backup-20261119-143005']);
    expect(cli('uninstall', { now: LATER }).code).toBe(0);
    expect(modeOf(hooksPath)).toBe(0o640);
    expect(readdirSync(dir)).toHaveLength(3);
  });

  it('writes through a symlinked hooks.json and keeps the link', () => {
    const real = path.join(home, 'dotfiles', 'codex-hooks.json');
    mkdirSync(path.dirname(real));
    writeFileSync(real, '{"description":"x"}');
    mkdirSync(dir);
    symlinkSync(real, hooksPath);
    expect(cli('install').code).toBe(0);
    expect(lstatSync(hooksPath).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(real, 'utf8'))).toEqual({ description: 'x', hooks: BLOCK });
    expect(readdirSync(path.dirname(real))).toEqual(['codex-hooks.json']);
  });

  it.each([
    ['JSONC with a comment', '{\n  // my hooks\n  "hooks": {"Stop": []}, "x": "sk-SECRET"\n}'],
    ['a trailing comma', '{"hooks": {}, "x": "sk-SECRET",}'],
    ['an empty file', ''],
    ['a top-level array', '["sk-SECRET"]'],
    ['hooks that is not an object', '{"hooks": ["sk-SECRET"]}'],
    ['an event that is not an array', '{"hooks": {"Stop": {"command": "sk-SECRET"}}}'],
  ])('aborts on %s: nothing changes, no backup, contents not printed', (_label, text) => {
    writeHooks(text);
    const before = snapshot();
    const result = cli('install');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(hooksPath);
    expect(result.output).not.toMatch(SECRETS);
    expect(snapshot()).toEqual(before);
    expect(backups()).toEqual([]);
  });

  it('refuses when the hook script is missing: nothing created, nothing changed', () => {
    const missing = path.join(home, 'gone', HOOK_NAME);
    const created = cli('install', { hookPath: missing });
    expect(created.code).toBe(1);
    expect(created.stderr).toContain(missing);
    expect(existsSync(dir)).toBe(false);

    writeHooks(JSON.stringify(USER_HOOKS));
    const before = snapshot();
    expect(cli('install', { hookPath: missing }).code).toBe(1);
    expect(snapshot()).toEqual(before);
  });
});

describe('uninstall', () => {
  it('restores the exact pre-install object, after backing up the installed file', () => {
    writeHooks(JSON.stringify(USER_HOOKS, null, 2));
    cli('install');
    const installed = readFileSync(hooksPath, 'utf8');
    const result = cli('uninstall', { now: LATER });
    expect(result.code).toBe(0);
    const after = readHooks();
    expect(after).toEqual(USER_HOOKS);
    expect(Object.keys(after)).toEqual(Object.keys(USER_HOOKS));
    expect(Object.keys(after.hooks)).toEqual(Object.keys(USER_HOOKS.hooks));
    expect(readFileSync(path.join(dir, 'hooks.json.deskling-backup-20261119-150000'), 'utf8')).toBe(installed);
  });

  it('drops the hooks object Deskling created, leaving the rest of the file', () => {
    writeHooks('{"description":"x"}');
    cli('install');
    expect(cli('uninstall', { now: LATER }).code).toBe(0);
    expect(readHooks()).toEqual({ description: 'x' });
  });

  it('leaves {} after removing from a file that install created', () => {
    cli('install');
    expect(cli('uninstall').code).toBe(0);
    expect(readFileSync(hooksPath, 'utf8')).toBe('{}\n');
  });

  it('removes only Deskling handlers from a group the user added handlers to', () => {
    writeHooks(JSON.stringify(USER_HOOKS));
    cli('install');
    const edited = readHooks();
    const mine = { type: 'command', command: 'echo SECRET-11' };
    edited.hooks.SessionEnd[0].hooks.push(mine);
    edited.hooks.Interrupt.push({ hooks: [] });
    writeFileSync(hooksPath, JSON.stringify(edited));
    expect(cli('uninstall', { now: LATER }).code).toBe(0);
    expect(readHooks()).toEqual({
      ...USER_HOOKS,
      hooks: { ...USER_HOOKS.hooks, SessionEnd: [{ hooks: [mine] }], Interrupt: [{ hooks: [] }] },
    });
  });

  it('recognises its entries when the hook path has spaces and quotes', () => {
    const weird = path.join(home, `Desk ling's "app"`);
    mkdirSync(weird);
    const hookPath = path.join(weird, HOOK_NAME);
    writeFileSync(hookPath, '');
    writeHooks(JSON.stringify(USER_HOOKS));
    cli('install', { hookPath });
    expect(readHooks().hooks.Stop.at(-1).hooks[0].command).toBe(`${shellQuote(NODE)} ${shellQuote(hookPath)}`);
    expect(readHooks().hooks.Stop.at(-1).hooks[0].command).toContain(`'\\''`);
    expect(cli('install', { hookPath, now: LATER }).stdout).toContain('이미');
    expect(cli('uninstall', { hookPath, now: LATER }).code).toBe(0);
    expect(readHooks()).toEqual(USER_HOOKS);
  });

  it('recognises an entry that holds the raw (unquoted) hook path', () => {
    const raw = { hooks: [{ type: 'command', command: `node ${hook}`, timeout: 2 }] };
    writeHooks(JSON.stringify({ hooks: { Stop: [raw], PreCompact: USER_HOOKS.hooks.PreCompact } }));
    expect(cli('uninstall').code).toBe(0);
    expect(readHooks()).toEqual({ hooks: { PreCompact: USER_HOOKS.hooks.PreCompact } });
  });

  it('still removes its entries when the hook script has been deleted', () => {
    writeHooks(JSON.stringify(USER_HOOKS));
    cli('install');
    rmSync(hook);
    expect(cli('uninstall', { now: LATER }).code).toBe(0);
    expect(readHooks()).toEqual(USER_HOOKS);
  });

  it('uses a distinct backup name when two backups share a second', () => {
    writeHooks('{}');
    cli('install');
    const first = readFileSync(path.join(dir, 'hooks.json.deskling-backup-20261119-143005'), 'utf8');
    expect(cli('uninstall').code).toBe(0);
    expect(backups().sort()).toEqual(['hooks.json.deskling-backup-20261119-143005', 'hooks.json.deskling-backup-20261119-143005-2']);
    expect(readFileSync(path.join(dir, 'hooks.json.deskling-backup-20261119-143005'), 'utf8')).toBe(first);
  });

  it('is idempotent: nothing to remove → nothing written, no backup', () => {
    writeHooks(JSON.stringify(USER_HOOKS));
    const before = snapshot();
    const result = cli('uninstall');
    expect(result.code).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(backups()).toEqual([]);
  });

  it('does not create a hooks.json that does not exist', () => {
    expect(cli('uninstall').code).toBe(0);
    expect(existsSync(dir)).toBe(false);
  });

  it('aborts on invalid JSON without a backup', () => {
    writeHooks('{"hooks": {}, // x\n}');
    const before = snapshot();
    expect(cli('uninstall').code).toBe(1);
    expect(snapshot()).toEqual(before);
  });
});

describe('print and status change nothing', () => {
  it('print writes the hooks block to stdout as JSON and touches no file', () => {
    writeHooks(JSON.stringify(USER_HOOKS));
    writeConfig('[features]\nhooks = false\n');
    const before = snapshot();
    const result = cli('print');
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ hooks: BLOCK });
    expect(result.stdout).toContain(JSON.stringify(hook).slice(1, -1));
    expect(result.output).not.toMatch(SECRETS);
    expect(snapshot()).toEqual(before);
  });

  it('print does not create a missing hooks.json', () => {
    expect(cli('print').code).toBe(0);
    expect(existsSync(dir)).toBe(false);
  });

  it('status reports not installed, without creating anything', () => {
    const result = cli('status');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('설치 안 됨');
    expect(result.stdout).toContain(hooksPath);
    expect(existsSync(dir)).toBe(false);
  });

  it('status lists the installed events, counts other handlers and points at /hooks for trust', () => {
    writeHooks(JSON.stringify(USER_HOOKS));
    cli('install');
    const before = snapshot();
    const result = cli('status');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('설치됨 (8/8');
    for (const event of EVENTS) expect(result.stdout).toContain(event);
    expect(result.stdout).toContain(`다른 훅 핸들러 ${OTHER_HANDLERS}개`);
    expect(result.stdout).toContain('/hooks');
    expect(snapshot()).toEqual(before);
  });

  it('status names the missing events of a partial install', () => {
    writeHooks(JSON.stringify({ hooks: { SessionStart: BLOCK.SessionStart } }));
    const result = cli('status');
    expect(result.stdout).toContain('일부만 설치됨 (1/8');
    expect(result.stdout).toMatch(/빠진 이벤트.*Interrupt/);
  });

  it('status reports whether the hook script exists', () => {
    const line = (result) => result.stdout.split('\n').find((text) => text.includes('훅 스크립트'));
    expect(line(cli('status'))).toContain('있음');
    const missing = path.join(home, 'gone', HOOK_NAME);
    const result = cli('status', { hookPath: missing });
    expect(result.code).toBe(0);
    expect(line(result)).toContain(missing);
    expect(line(result)).toContain('없음');
  });

  it('status reports whether the Deskling socket exists', async () => {
    const socketLine = () => cli('status').stdout.split('\n').find((line) => line.includes(socketPath));
    expect(socketLine()).toContain('없음');
    writeFileSync(socketPath, '');
    expect(socketLine()).toContain('소켓이 아닌 파일');
    rmSync(socketPath);
    const server = createServer();
    await new Promise((resolve) => server.listen(socketPath, resolve));
    try {
      expect(socketLine()).toContain('있음');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  const featureLine = (result) => result.stdout.split('\n').find((line) => line.startsWith('Codex 훅 기능'));

  it('status says hooks are on by default when config.toml is missing', () => {
    const line = featureLine(cli('status'));
    expect(line).toContain('켜짐');
    expect(line).toContain(configPath);
    expect(existsSync(dir)).toBe(false);
  });

  it.each([
    ['[features] hooks = false', '[features]\nhooks = false\n', '꺼짐'],
    ['a trailing comment', 'model = "gpt-5"\n\n[features]\nother = true\nhooks = false # off for now\n', '꺼짐'],
    ['spaces around the header and =', '[ features ]\n  hooks=false\n', '꺼짐'],
    ['the deprecated codex_hooks alias', '[features]\ncodex_hooks = false\n', '꺼짐'],
    ['a dotted root key', 'features.hooks = false\n[tui]\nx = 1\n', '꺼짐'],
    ['hooks = true', '[features]\nhooks = true\n', '켜짐'],
    ['hooks over the alias', '[features]\ncodex_hooks = false\nhooks = true\n', '켜짐'],
    ['hooks = false in another table', '[profiles.work]\nhooks = false\n[features.extra]\nhooks = false\n', '켜짐'],
    ['a commented-out line', '[features]\n# hooks = false\n', '켜짐'],
    ['a later table', '[features]\nweb_search = true\n[tui]\nhooks = false\n', '켜짐'],
    ['no [features] table', 'model = "gpt-5"\n', '켜짐'],
  ])('status reads [features] hooks from config.toml: %s', (_label, text, expected) => {
    writeConfig(`${text}api_key = "sk-cfg-SECRET-12"\n`);
    const before = snapshot();
    const result = cli('status');
    expect(result.code).toBe(0);
    expect(featureLine(result)).toContain(expected);
    expect(featureLine(result)).not.toContain(expected === '켜짐' ? '꺼짐' : '켜짐');
    expect(result.output).not.toMatch(SECRETS);
    expect(result.output).not.toContain('gpt-5');
    expect(snapshot()).toEqual(before);
  });

  it('status still reports the rest when config.toml cannot be read', () => {
    mkdirSync(configPath, { recursive: true });
    const result = cli('status');
    expect(result.code).toBe(0);
    expect(featureLine(result)).toContain('확인할 수 없음');
    expect(result.stdout).toContain('설치 안 됨');
  });

  it('status fails on invalid JSON without changing it', () => {
    writeHooks('{,}');
    const before = snapshot();
    expect(cli('status').code).toBe(1);
    expect(snapshot()).toEqual(before);
  });
});

describe('CLI process', () => {
  it('defaults to $HOME/.codex/hooks.json and $HOME/.codex/config.toml', () => {
    const repo = copyRepo({ withHook: true });
    const status = spawnCli(repo.installer, ['status']);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain(hooksPath);
    expect(status.stdout).toContain(configPath);
    const install = spawnCli(repo.installer, ['install']);
    expect(install.code).toBe(0);
    expect(readHooks()).toEqual({ hooks: desklingHooks(hookCommand(NODE, repo.hook)) });
  });

  it('uses $CODEX_HOME when it is set', () => {
    const repo = copyRepo({ withHook: true });
    const codexHome = path.join(home, 'ch');
    expect(spawnCli(repo.installer, ['install'], { CODEX_HOME: codexHome }).code).toBe(0);
    expect(JSON.parse(readFileSync(path.join(codexHome, 'hooks.json'), 'utf8'))).toEqual({
      hooks: desklingHooks(hookCommand(NODE, repo.hook)),
    });
    expect(spawnCli(repo.installer, ['status'], { CODEX_HOME: codexHome }).stdout).toContain(path.join(codexHome, 'config.toml'));
    expect(existsSync(dir)).toBe(false);
  });

  it('accepts --hooks <path> and --config <path>', () => {
    const repo = copyRepo({ withHook: true });
    const other = path.join(home, 'other', 'hooks.json');
    const config = path.join(home, 'other', 'config.toml');
    expect(spawnCli(repo.installer, ['install', '--hooks', other]).code).toBe(0);
    expect(JSON.parse(readFileSync(other, 'utf8'))).toEqual({ hooks: desklingHooks(hookCommand(NODE, repo.hook)) });
    writeFileSync(config, '[features]\nhooks = false\n');
    const status = spawnCli(repo.installer, ['status', '--config', config, '--hooks', other]);
    expect(status.stdout).toContain('설치됨 (8/8');
    expect(status.stdout).toMatch(/Codex 훅 기능.*꺼짐/);
    expect(existsSync(dir)).toBe(false);
  });

  it('refuses to install when deskling-codex-hook.mjs is missing, with a clear message', () => {
    const repo = copyRepo({ withHook: false });
    const result = spawnCli(repo.installer, ['install']);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(repo.hook);
    expect(result.stderr).toMatch(/훅 스크립트.*없/);
    expect(existsSync(dir)).toBe(false);
  });

  it.each([
    [[]],
    [['bogus']],
    [['install', '--hooks']],
    [['install', '--force']],
    [['install', '--settings', 'x.json']],
    [['install', '--hooks', 'a.json', '--hooks', 'b.json']],
    [['status', '--config']],
  ])('prints usage and exits 2 for %j without touching anything', (args) => {
    const repo = copyRepo({ withHook: true });
    const result = spawnCli(repo.installer, args);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/print\|install\|uninstall\|status/);
    expect(existsSync(dir)).toBe(false);
  });

  it('is wired to npm scripts', () => {
    const { scripts } = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    for (const command of ['print', 'install', 'uninstall', 'status']) {
      expect(scripts[`hooks:codex:${command}`]).toBe(`node integrations/codex/install.mjs ${command}`);
    }
  });
});
