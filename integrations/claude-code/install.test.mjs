// @vitest-environment node
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
import { toHookRecord } from './hookRecord.mjs';
import { desklingHooks, HOOK_SCRIPT, hookCommand, run, shellQuote, stableNodePath, TOOL_MATCHER } from './install.mjs';

// FR-CC5, ADR-024 §8: opt-in install/uninstall of the Deskling hooks, with a backup, touching nothing else.
// Every test works inside a temporary HOME. The real ~/.claude/ is never read or written.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const INSTALLER = path.join(HERE, 'install.mjs');
const REAL_HOOK = realpathSync.native(path.join(HERE, 'deskling-hook.mjs'));
const DOC = path.join(HERE, '..', '..', 'docs', 'integrations', 'CLAUDE_CODE.md');
const NOW = new Date(2026, 10, 19, 14, 30, 5); // local time → 20261119-143005
const LATER = new Date(2026, 10, 19, 15, 0, 0);
const NODE = stableNodePath(process.execPath);
const COMMAND = hookCommand(NODE, REAL_HOOK);
const BLOCK = desklingHooks(COMMAND);
const EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionRequest',
  'Stop',
  'StopFailure',
  'SubagentStop',
];

/** Settings a real user might have; the secrets must survive untouched and never be printed. */
const USER_SETTINGS = {
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  model: 'opus',
  permissions: { allow: ['Bash(npm run test:*)'], deny: ['Read(./.env)'] },
  env: { API_TOKEN: 'sk-env-SECRET-1' },
  hooks: {
    PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command', command: '/usr/local/bin/guard --token sk-hook-SECRET-2', timeout: 5 }] },
    ],
    Notification: [{ hooks: [{ type: 'command', command: 'say done # sk-notify-SECRET-3' }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'afplay ~/done.aiff # SECRET-4' }, { type: 'prompt', prompt: 'SECRET-5' }] }],
  },
  statusLine: { type: 'command', command: '~/.claude/statusline.sh SECRET-6' },
  alwaysThinkingEnabled: true,
};

let home;
let dir;
let settingsPath;
let socketPath;

beforeEach(() => {
  // Short base path: macOS limits Unix socket paths to 104 bytes.
  home = mkdtempSync(path.join(tmpdir(), 'dki-'));
  dir = path.join(home, '.claude');
  settingsPath = path.join(dir, 'settings.json');
  socketPath = path.join(home, 'd.sock');
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

/** Runs the installer in-process against the temporary settings path only. */
function cli(command, { now = NOW, settings = settingsPath, ...options } = {}) {
  let stdout = '';
  let stderr = '';
  const code = run([command, '--settings', settings], {
    env: { HOME: home, DESKLING_SOCKET: socketPath },
    now: () => now,
    stdout: { write: (text) => (stdout += text) },
    stderr: { write: (text) => (stderr += text) },
    ...options,
  });
  return { code, stdout, stderr, output: stdout + stderr };
}

/** Runs the real CLI process with HOME pointing at the temporary directory. */
function spawnCli(args) {
  const result = spawnSync(process.execPath, [INSTALLER, ...args], {
    env: { PATH: process.env.PATH, HOME: home, DESKLING_SOCKET: socketPath },
    encoding: 'utf8',
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr, output: result.stdout + result.stderr };
}

const writeSettings = (text, mode = 0o644) => {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(settingsPath, text);
  chmodSync(settingsPath, mode);
};
const readSettings = () => JSON.parse(readFileSync(settingsPath, 'utf8'));
const backups = () => readdirSync(dir).filter((name) => name.startsWith('settings.json.deskling-backup-'));
const modeOf = (file) => statSync(file).mode & 0o777;
const snapshot = () =>
  Object.fromEntries(
    readdirSync(dir).map((name) => {
      const file = path.join(dir, name);
      return [name, { bytes: readFileSync(file, 'utf8'), mtime: statSync(file).mtimeMs, mode: modeOf(file) }];
    }),
  );

/** USER_SETTINGS with the Deskling groups appended to each event, the way install must produce it. */
function expectedMerge(original) {
  const expected = structuredClone(original);
  expected.hooks ??= {};
  for (const [event, groups] of Object.entries(BLOCK)) (expected.hooks[event] ??= []).push(...groups);
  return expected;
}

const SECRETS = /SECRET|sk-|guard|afplay|statusline/;

describe('Deskling hook block (CLAUDE_CODE.md §7)', () => {
  it('is exactly the draft in CLAUDE_CODE.md §7 with <NODE> and <HOOK> filled in', () => {
    const doc = readFileSync(DOC, 'utf8');
    const section = doc.slice(doc.indexOf('## 7.'));
    const draft = section.slice(section.indexOf('```json') + '```json'.length, section.indexOf('```', section.indexOf('```json') + 7));
    expect({ hooks: desklingHooks(hookCommand('<NODE>', '<HOOK>')) }).toEqual(JSON.parse(draft));
  });

  it('registers only events and tools that the hook turns into a record', () => {
    for (const event of Object.keys(BLOCK)) {
      expect(toHookRecord({ session_id: 's', hook_event_name: event, tool_name: 'Bash' }, 1), event).not.toBeNull();
    }
    for (const tool of TOOL_MATCHER.split('|')) {
      expect(toHookRecord({ session_id: 's', hook_event_name: 'PreToolUse', tool_name: tool }, 1), tool).not.toBeNull();
    }
    expect(Object.keys(BLOCK)).toEqual(EVENTS);
  });

  it('runs the current node binary on the real hook script, with timeout 2', () => {
    expect(HOOK_SCRIPT).toBe(REAL_HOOK);
    expect(existsSync(HOOK_SCRIPT)).toBe(true);
    expect(COMMAND).toBe(`${shellQuote(NODE)} ${shellQuote(REAL_HOOK)}`);
    for (const groups of Object.values(BLOCK)) {
      expect(groups).toHaveLength(1);
      expect(groups[0].hooks).toEqual([{ type: 'command', command: COMMAND, timeout: 2 }]);
    }
  });

  it('single-quotes paths for sh, escaping embedded single quotes', () => {
    expect(shellQuote('/a b/c')).toBe(`'/a b/c'`);
    expect(shellQuote(`/it's/x`)).toBe(`'/it'\\''s/x'`);
    expect(hookCommand('/n o/node', `/h's/hook.mjs`)).toBe(`'/n o/node' '/h'\\''s/hook.mjs'`);
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
  it('creates a missing settings file (and its 0700 directory) holding only the hooks block', () => {
    const result = cli('install');
    expect(result.code).toBe(0);
    const text = readFileSync(settingsPath, 'utf8');
    expect(JSON.parse(text)).toEqual({ hooks: BLOCK });
    expect(text).toBe(`${JSON.stringify({ hooks: BLOCK }, null, 2)}\n`);
    expect(modeOf(dir)).toBe(0o700);
    expect(modeOf(settingsPath)).toBe(0o600);
    expect(backups()).toEqual([]);
    expect(result.output).toContain(settingsPath);
  });

  it('adds the hooks block to an empty object, after backing it up', () => {
    writeSettings('{}');
    expect(cli('install').code).toBe(0);
    expect(readSettings()).toEqual({ hooks: BLOCK });
    expect(backups()).toHaveLength(1);
  });

  it('appends to existing hooks and keeps every other setting and hook exactly, in order', () => {
    writeSettings(JSON.stringify(USER_SETTINGS, null, 2));
    const result = cli('install');
    expect(result.code).toBe(0);

    const after = readSettings();
    expect(after).toEqual(expectedMerge(USER_SETTINGS));
    expect(Object.keys(after)).toEqual(Object.keys(USER_SETTINGS));
    expect(Object.keys(after.hooks)).toEqual([
      'PreToolUse',
      'Notification',
      'Stop',
      ...EVENTS.filter((event) => !['PreToolUse', 'Stop'].includes(event)),
    ]);
    // The user's groups stay first and unchanged; Deskling's group comes after them.
    expect(after.hooks.PreToolUse).toEqual([...USER_SETTINGS.hooks.PreToolUse, ...BLOCK.PreToolUse]);
    expect(after.hooks.Stop).toEqual([...USER_SETTINGS.hooks.Stop, ...BLOCK.Stop]);
    expect(readFileSync(settingsPath, 'utf8')).toBe(`${JSON.stringify(after, null, 2)}\n`);
  });

  it('never prints other hooks or settings, only counts and paths', () => {
    writeSettings(JSON.stringify(USER_SETTINGS));
    const install = cli('install');
    const status = cli('status');
    const uninstall = cli('uninstall', { now: LATER });
    for (const result of [install, status, uninstall]) {
      expect(result.output).not.toMatch(SECRETS);
      expect(result.output).toContain(settingsPath);
    }
  });

  it('is idempotent: a second install changes nothing and makes no new backup', () => {
    writeSettings(JSON.stringify(USER_SETTINGS));
    cli('install');
    const before = snapshot();
    const again = cli('install', { now: LATER });
    expect(again.code).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(backups()).toHaveLength(1);
    expect(readSettings()).toEqual(expectedMerge(USER_SETTINGS));
  });

  it('re-adds only the events whose Deskling entry is missing', () => {
    writeSettings(JSON.stringify({ hooks: { ...BLOCK, Stop: [] } }));
    expect(cli('install').code).toBe(0);
    expect(readSettings()).toEqual({ hooks: BLOCK });
  });

  it('writes a timestamped backup next to the file with the original bytes and mode', () => {
    const original = '{\n    "model": "opus",\n    "hooks": {}\n}';
    writeSettings(original, 0o640);
    expect(cli('install').code).toBe(0);
    const backup = path.join(dir, 'settings.json.deskling-backup-20261119-143005');
    expect(backups()).toEqual([path.basename(backup)]);
    expect(readFileSync(backup, 'utf8')).toBe(original);
    expect(modeOf(backup)).toBe(0o640);
  });

  it('keeps the original file mode and leaves no temporary files behind', () => {
    writeSettings('{"model":"opus"}', 0o640);
    expect(cli('install').code).toBe(0);
    expect(modeOf(settingsPath)).toBe(0o640);
    expect(readdirSync(dir).sort()).toEqual(['settings.json', 'settings.json.deskling-backup-20261119-143005']);
    expect(cli('uninstall', { now: LATER }).code).toBe(0);
    expect(modeOf(settingsPath)).toBe(0o640);
    expect(readdirSync(dir)).toHaveLength(3);
  });

  it('writes through a symlinked settings file and keeps the link', () => {
    const real = path.join(home, 'dotfiles', 'claude-settings.json');
    mkdirSync(path.dirname(real));
    writeFileSync(real, '{"model":"opus"}');
    mkdirSync(dir);
    symlinkSync(real, settingsPath);
    expect(cli('install').code).toBe(0);
    expect(lstatSync(settingsPath).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(real, 'utf8'))).toEqual({ model: 'opus', hooks: BLOCK });
    expect(readdirSync(path.dirname(real))).toEqual(['claude-settings.json']);
  });

  it.each([
    ['JSONC with a comment', '{\n  // my settings\n  "model": "opus", "env": {"T": "sk-SECRET"}\n}'],
    ['a trailing comma', '{"model": "opus", "env": {"T": "sk-SECRET"},}'],
    ['an empty file', ''],
    ['a top-level array', '["sk-SECRET"]'],
    ['hooks that is not an object', '{"hooks": ["sk-SECRET"]}'],
    ['an event that is not an array', '{"hooks": {"Stop": {"command": "sk-SECRET"}}}'],
  ])('aborts on %s: nothing changes, no backup, contents not printed', (_label, text) => {
    writeSettings(text);
    const before = snapshot();
    const result = cli('install');
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(settingsPath);
    expect(result.output).not.toMatch(SECRETS);
    expect(snapshot()).toEqual(before);
    expect(backups()).toEqual([]);
  });

  it('says JSONC is not supported when the file is not plain JSON', () => {
    writeSettings('{ /* c */ }');
    expect(cli('install').stderr).toMatch(/JSONC/);
  });
});

describe('uninstall', () => {
  it('restores the exact pre-install structure, after backing up the installed file', () => {
    writeSettings(JSON.stringify(USER_SETTINGS, null, 2));
    cli('install');
    const installed = readFileSync(settingsPath, 'utf8');
    const result = cli('uninstall', { now: LATER });
    expect(result.code).toBe(0);
    const after = readSettings();
    expect(after).toEqual(USER_SETTINGS);
    expect(Object.keys(after)).toEqual(Object.keys(USER_SETTINGS));
    expect(Object.keys(after.hooks)).toEqual(Object.keys(USER_SETTINGS.hooks));
    expect(readFileSync(path.join(dir, 'settings.json.deskling-backup-20261119-150000'), 'utf8')).toBe(installed);
  });

  it('drops the hooks object Deskling created, leaving the rest of the file', () => {
    writeSettings('{"model":"opus"}');
    cli('install');
    expect(cli('uninstall', { now: LATER }).code).toBe(0);
    expect(readSettings()).toEqual({ model: 'opus' });
  });

  it('leaves {} after removing from a file that install created', () => {
    cli('install');
    expect(cli('uninstall').code).toBe(0);
    expect(readFileSync(settingsPath, 'utf8')).toBe('{}\n');
  });

  it('removes only Deskling handlers from a group the user added handlers to', () => {
    writeSettings(JSON.stringify(USER_SETTINGS));
    cli('install');
    const edited = readSettings();
    const mine = { type: 'command', command: 'echo SECRET-7' };
    edited.hooks.SessionStart[0].hooks.push(mine);
    edited.hooks.SubagentStop.push({ hooks: [] });
    writeFileSync(settingsPath, JSON.stringify(edited));
    expect(cli('uninstall', { now: LATER }).code).toBe(0);
    expect(readSettings()).toEqual({
      ...USER_SETTINGS,
      hooks: { ...USER_SETTINGS.hooks, SessionStart: [{ hooks: [mine] }], SubagentStop: [{ hooks: [] }] },
    });
  });

  it('recognises its entries when the hook path has spaces and single quotes', () => {
    const hookPath = `/Users/x/Desk ling's "app"/deskling-hook.mjs`;
    writeSettings(JSON.stringify(USER_SETTINGS));
    cli('install', { hookPath });
    const installed = readSettings();
    expect(installed.hooks.Stop.at(-1).hooks[0].command).toBe(`'${NODE}' '/Users/x/Desk ling'\\''s "app"/deskling-hook.mjs'`);
    expect(cli('install', { hookPath, now: LATER }).stdout).toContain('이미');
    expect(cli('uninstall', { hookPath, now: LATER }).code).toBe(0);
    expect(readSettings()).toEqual(USER_SETTINGS);
  });

  it('uses a distinct backup name when two backups share a second', () => {
    writeSettings('{}');
    cli('install');
    const first = readFileSync(path.join(dir, 'settings.json.deskling-backup-20261119-143005'), 'utf8');
    expect(cli('uninstall').code).toBe(0);
    expect(backups().sort()).toEqual([
      'settings.json.deskling-backup-20261119-143005',
      'settings.json.deskling-backup-20261119-143005-2',
    ]);
    expect(readFileSync(path.join(dir, 'settings.json.deskling-backup-20261119-143005'), 'utf8')).toBe(first);
  });

  it('is idempotent: nothing to remove → nothing written, no backup', () => {
    writeSettings(JSON.stringify(USER_SETTINGS));
    const before = snapshot();
    const result = cli('uninstall');
    expect(result.code).toBe(0);
    expect(snapshot()).toEqual(before);
    expect(backups()).toEqual([]);
  });

  it('does not create a settings file that does not exist', () => {
    expect(cli('uninstall').code).toBe(0);
    expect(existsSync(dir)).toBe(false);
  });

  it('aborts on invalid JSON without a backup', () => {
    writeSettings('{"hooks": {}, // x\n}');
    const before = snapshot();
    expect(cli('uninstall').code).toBe(1);
    expect(snapshot()).toEqual(before);
  });
});

describe('print and status change nothing', () => {
  it('print writes the hooks block to stdout as JSON and touches no file', () => {
    writeSettings(JSON.stringify(USER_SETTINGS));
    const before = snapshot();
    const result = cli('print');
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ hooks: BLOCK });
    expect(result.stdout).toContain(JSON.stringify(REAL_HOOK).slice(1, -1));
    expect(result.output).not.toMatch(SECRETS);
    expect(snapshot()).toEqual(before);
  });

  it('print does not create a missing settings file', () => {
    expect(cli('print').code).toBe(0);
    expect(existsSync(dir)).toBe(false);
  });

  it('status reports not installed, without creating anything', () => {
    const result = cli('status');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('설치 안 됨');
    expect(result.stdout).toContain(settingsPath);
    expect(existsSync(dir)).toBe(false);
  });

  it('status lists the installed events and counts other handlers', () => {
    writeSettings(JSON.stringify(USER_SETTINGS));
    cli('install');
    const before = snapshot();
    const result = cli('status');
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('설치됨 (10/10');
    for (const event of EVENTS) expect(result.stdout).toContain(event);
    expect(result.stdout).toMatch(/다른 훅 핸들러 4개/);
    expect(snapshot()).toEqual(before);
  });

  it('status names the missing events of a partial install', () => {
    writeSettings(JSON.stringify({ hooks: { SessionStart: BLOCK.SessionStart } }));
    const result = cli('status');
    expect(result.stdout).toContain('일부만 설치됨 (1/10');
    expect(result.stdout).toMatch(/빠진 이벤트.*SubagentStop/);
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

  it('status fails on invalid JSON without changing it', () => {
    writeSettings('{,}');
    const before = snapshot();
    expect(cli('status').code).toBe(1);
    expect(snapshot()).toEqual(before);
  });
});

describe('CLI process', () => {
  it('defaults to $HOME/.claude/settings.json', () => {
    const status = spawnCli(['status']);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain(settingsPath);
    const install = spawnCli(['install']);
    expect(install.code).toBe(0);
    expect(readSettings()).toEqual({ hooks: BLOCK });
  });

  it('accepts --settings <path>', () => {
    const other = path.join(home, 'other', 'settings.json');
    expect(spawnCli(['install', '--settings', other]).code).toBe(0);
    expect(JSON.parse(readFileSync(other, 'utf8'))).toEqual({ hooks: BLOCK });
    expect(existsSync(dir)).toBe(false);
  });

  it.each([[[]], [['bogus']], [['install', '--settings']], [['install', '--force']]])(
    'prints usage and exits 2 for %j without touching anything',
    (args) => {
      const result = spawnCli(args);
      expect(result.code).toBe(2);
      expect(result.stderr).toMatch(/print\|install\|uninstall\|status/);
      expect(existsSync(dir)).toBe(false);
    },
  );

  it('is wired to npm scripts', () => {
    const { scripts } = JSON.parse(readFileSync(path.join(HERE, '..', '..', 'package.json'), 'utf8'));
    for (const command of ['print', 'install', 'uninstall', 'status']) {
      expect(scripts[`hooks:${command}`]).toBe(`node integrations/claude-code/install.mjs ${command}`);
    }
  });
});

describe('stableNodePath — survive brew upgrade', () => {
  const opt = '/opt/homebrew/opt/node@24/bin/node';
  it('swaps a versioned Homebrew Cellar path for the stable opt link when it exists', () => {
    expect(stableNodePath('/opt/homebrew/Cellar/node@24/24.22.1/bin/node', (p) => p === opt)).toBe(opt);
    expect(stableNodePath('/usr/local/Cellar/node/25.1.0/bin/node', (p) => p === '/usr/local/opt/node/bin/node')).toBe('/usr/local/opt/node/bin/node');
  });
  it('keeps the path when there is no stable link or it is not a Cellar path', () => {
    expect(stableNodePath('/opt/homebrew/Cellar/node@24/24.22.1/bin/node', () => false)).toBe('/opt/homebrew/Cellar/node@24/24.22.1/bin/node');
    expect(stableNodePath('/usr/bin/node', () => true)).toBe('/usr/bin/node');
  });
});
