#!/usr/bin/env node
// Opt-in installer for the Deskling Claude Code hooks (ADR-024 §8, FR-CC5). Node >= 18, no dependencies.
// Usage: node integrations/claude-code/install.mjs <print|install|uninstall|status> [--settings <path>]
// install/uninstall back up the settings file first, then add or remove only Deskling's hook entries,
// recognised by the absolute path of deskling-hook.mjs in their command. Every other setting and hook is
// left as it is, and never printed: hook commands can hold secrets, so output only counts them.
// JSONC is not supported: a file JSON.parse rejects is left untouched.
import {
  chmodSync,
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSocketPath } from './hookRecord.mjs';

/** Absolute path of the hook script. `.native` also fixes letter case, which macOS paths ignore. */
export const HOOK_SCRIPT = realpathSync.native(fileURLToPath(new URL('./deskling-hook.mjs', import.meta.url)));

/** Exact names of the tools hookRecord.mjs maps to a category (CLAUDE_CODE.md §4, §7). */
export const TOOL_MATCHER =
  'Edit|Write|MultiEdit|NotebookEdit|Read|Glob|Grep|LS|Bash|BashOutput|KillShell|WebFetch|WebSearch|Task|Agent|SendMessage';

/** Hook events Deskling registers, in CLAUDE_CODE.md §7 order, with the tool matcher where it applies. */
const EVENTS = [
  ['SessionStart'],
  ['SessionEnd'],
  ['UserPromptSubmit'],
  ['PreToolUse', TOOL_MATCHER],
  ['PostToolUse', TOOL_MATCHER],
  ['PostToolUseFailure', TOOL_MATCHER],
  ['PermissionRequest'],
  ['Stop'],
  ['StopFailure'],
  ['SubagentStop'],
];

const USAGE = [
  '사용법: node integrations/claude-code/install.mjs <print|install|uninstall|status> [--settings <경로>]',
  '  print      추가할 hooks 블록을 출력만 합니다 (아무것도 바꾸지 않음)',
  '  install    백업을 만든 뒤 Deskling 훅을 덧붙입니다 (다른 설정·훅은 그대로)',
  '  uninstall  백업을 만든 뒤 Deskling 훅만 제거합니다',
  '  status     설치 여부와 Deskling 소켓이 있는지 보여 줍니다 (아무것도 바꾸지 않음)',
  '  --settings 기본값: $HOME/.claude/settings.json',
].join('\n');

/** A refusal whose message is safe to print: it names paths and keys, never file contents. */
class SettingsError extends Error {}

/** Single-quotes a value for sh; an embedded ' becomes '\''. */
/**
 * Homebrew's node binary lives in a versioned Cellar folder that disappears on `brew upgrade`.
 * Prefer the stable `<prefix>/opt/<formula>/bin/node` link when it exists, so installed hooks keep working.
 */
export function stableNodePath(execPath, exists = existsSync) {
  const match = /^(.+)\/Cellar\/([^/]+)\/[^/]+\/bin\/node$/.exec(execPath);
  if (!match) return execPath;
  const stable = `${match[1]}/opt/${match[2]}/bin/node`;
  return exists(stable) ? stable : execPath;
}

export function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function hookCommand(nodePath, hookPath) {
  return `${shellQuote(nodePath)} ${shellQuote(hookPath)}`;
}

/** The `hooks` object Deskling adds: one matcher group per event. */
export function desklingHooks(command) {
  return Object.fromEntries(
    EVENTS.map(([event, matcher]) => {
      const group = { hooks: [{ type: 'command', command, timeout: 2 }] };
      return [event, [matcher ? { matcher, ...group } : group]];
    }),
  );
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isOurs = (handler, hookPath) =>
  isObject(handler) &&
  typeof handler.command === 'string' &&
  (handler.command.includes(hookPath) || handler.command.includes(shellQuote(hookPath)));
/** Well-formed matcher groups of one event; anything else is someone else's and is skipped. */
const groupsOf = (groups) => (Array.isArray(groups) ? groups.filter((g) => isObject(g) && Array.isArray(g.hooks)) : []);
const hooksOf = (settings) => (isObject(settings.hooks) ? settings.hooks : {});

/** Events (in file order) that hold a Deskling handler. */
function installedEvents(settings, hookPath) {
  const hooks = hooksOf(settings);
  return Object.keys(hooks).filter((event) =>
    groupsOf(hooks[event]).some((group) => group.hooks.some((handler) => isOurs(handler, hookPath))),
  );
}

function countOtherHandlers(settings, hookPath) {
  let count = 0;
  for (const groups of Object.values(hooksOf(settings))) {
    for (const group of groupsOf(groups)) count += group.hooks.filter((handler) => !isOurs(handler, hookPath)).length;
  }
  return count;
}

const shapeError = (settingsPath, key, expected) =>
  new SettingsError(
    `오류: ${settingsPath}에서 ${key}의 형태가 예상과 다릅니다(${expected}). 아무것도 바꾸지 않았습니다(백업도 만들지 않음).`,
  );

/** Appends Deskling's group to every event that lacks a Deskling handler. Mutates `settings`. */
function addHooks(settings, command, hookPath, settingsPath) {
  if (settings.hooks !== undefined && !isObject(settings.hooks)) throw shapeError(settingsPath, 'hooks', '객체여야 함');
  const installed = new Set(installedEvents(settings, hookPath));
  const added = [];
  for (const [event, groups] of Object.entries(desklingHooks(command))) {
    if (installed.has(event)) continue;
    settings.hooks ??= {};
    const existing = settings.hooks[event];
    if (existing !== undefined && !Array.isArray(existing)) {
      throw shapeError(settingsPath, `hooks.${event}`, '배열이어야 함');
    }
    (settings.hooks[event] ??= []).push(...groups);
    added.push(event);
  }
  return added;
}

/**
 * Removes Deskling handlers, then the matcher groups, event arrays and `hooks` object that this left
 * empty. Groups and arrays that were already empty stay. Mutates `settings`.
 */
function removeHooks(settings, hookPath) {
  const hooks = settings.hooks;
  const removed = [];
  if (!isObject(hooks)) return removed;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    let touched = false;
    const kept = [];
    for (const group of groups) {
      if (!isObject(group) || !Array.isArray(group.hooks)) {
        kept.push(group);
        continue;
      }
      const handlers = group.hooks.filter((handler) => !isOurs(handler, hookPath));
      if (handlers.length === group.hooks.length) {
        kept.push(group);
        continue;
      }
      touched = true;
      group.hooks = handlers;
      if (handlers.length > 0) kept.push(group);
    }
    if (!touched) continue;
    removed.push(event);
    if (kept.length > 0) hooks[event] = kept;
    else delete hooks[event];
  }
  if (removed.length > 0 && Object.keys(hooks).length === 0) delete settings.hooks;
  return removed;
}

/** Reads and parses the settings file; undefined when it does not exist. */
function load(settingsPath) {
  if (!existsSync(settingsPath)) return undefined;
  // Write through a symlink (dotfile managers) instead of replacing it with a regular file.
  const file = realpathSync(settingsPath);
  const bytes = readFileSync(file);
  const mode = statSync(file).mode & 0o777;
  let settings;
  try {
    settings = JSON.parse(bytes.toString('utf8'));
  } catch {
    // The parse error is not printed: it quotes part of the file, which may hold secrets.
    throw new SettingsError(
      `오류: ${settingsPath}을(를) JSON으로 읽을 수 없습니다. 주석이나 끝 쉼표가 있는 JSONC는 지원하지 않습니다.\n` +
        '아무것도 바꾸지 않았습니다(백업도 만들지 않음). 파일을 순수 JSON으로 고치거나, print로 블록을 받아 직접 넣으세요.',
    );
  }
  if (!isObject(settings)) throw shapeError(settingsPath, '최상위 값', '객체여야 함');
  return { file, bytes, mode, settings };
}

const serialize = (settings) => `${JSON.stringify(settings, null, 2)}\n`;

/** Temp file in the same directory + rename, so readers see the old file or the new one, never half. */
function writeAtomic(file, text, mode) {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.deskling-${process.pid}-${Date.now()}.tmp`);
  let created = false;
  try {
    const fd = openSync(temp, 'wx', mode);
    created = true;
    try {
      writeFileSync(fd, text);
      fchmodSync(fd, mode); // undo the umask
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, file);
  } catch (error) {
    if (created) rmSync(temp, { force: true });
    throw error;
  }
}

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** Copies the original bytes to settings.json.deskling-backup-<YYYYMMDD-HHMMSS>[-n], same mode. */
function backup(settingsPath, bytes, mode, date) {
  const base = `${settingsPath}.deskling-backup-${stamp(date)}`;
  for (let n = 1; n <= 100; n += 1) {
    const name = n === 1 ? base : `${base}-${n}`;
    try {
      writeFileSync(name, bytes, { flag: 'wx', mode });
    } catch (error) {
      if (error.code === 'EEXIST') continue;
      throw error;
    }
    chmodSync(name, mode);
    return name;
  }
  throw new SettingsError(`오류: ${base} 백업 이름을 더 만들 수 없습니다. 아무것도 바꾸지 않았습니다.`);
}

function socketState(socketPath) {
  try {
    return lstatSync(socketPath).isSocket() ? '있음' : '소켓이 아닌 파일이 있음 (Deskling 앱이 연결을 받지 못함)';
  } catch {
    return '없음 (Deskling 앱이 꺼져 있으면 정상)';
  }
}

function print({ settingsPath, command, out, err }) {
  out(JSON.stringify({ hooks: desklingHooks(command) }, null, 2));
  err(`install은 위 hooks 블록을 ${settingsPath}의 이벤트별 배열 끝에 덧붙입니다. 아무것도 바꾸지 않았습니다.`);
  return 0;
}

function install({ settingsPath, command, hookPath, now, out }) {
  const current = load(settingsPath);
  const settings = current?.settings ?? {};
  const added = addHooks(settings, command, hookPath, settingsPath);
  out(`Claude Code 설정: ${settingsPath}`);
  if (added.length === 0) {
    out('Deskling 훅이 이미 모든 이벤트에 설치되어 있습니다. 바꾼 것이 없습니다.');
    return 0;
  }
  if (current) {
    out(`백업: ${backup(settingsPath, current.bytes, current.mode, now())}`);
    writeAtomic(current.file, serialize(settings), current.mode);
  } else {
    mkdirSync(path.dirname(settingsPath), { recursive: true, mode: 0o700 });
    writeAtomic(settingsPath, serialize(settings), 0o600);
    out('설정 파일이 없어서 새로 만들었습니다 (백업할 원본 없음).');
  }
  out(`추가한 이벤트 (${added.length}개): ${added.join(', ')}`);
  out(`훅 명령: ${command}`);
  out(`다른 훅 핸들러 ${countOtherHandlers(settings, hookPath)}개와 나머지 설정은 그대로 두었습니다.`);
  out('이미 열려 있는 Claude Code 세션에는 바로 반영되지 않을 수 있습니다. 새 세션을 시작하거나 /hooks에서 확인하세요.');
  out('되돌리기: npm run hooks:uninstall');
  return 0;
}

function uninstall({ settingsPath, hookPath, now, out }) {
  const current = load(settingsPath);
  out(`Claude Code 설정: ${settingsPath}`);
  if (!current) {
    out('설정 파일이 없습니다. 바꾼 것이 없습니다.');
    return 0;
  }
  const removed = removeHooks(current.settings, hookPath);
  if (removed.length === 0) {
    out('Deskling 훅이 없습니다. 바꾼 것이 없습니다.');
    return 0;
  }
  out(`백업: ${backup(settingsPath, current.bytes, current.mode, now())}`);
  writeAtomic(current.file, serialize(current.settings), current.mode);
  out(`제거한 이벤트 (${removed.length}개): ${removed.join(', ')}`);
  out(`다른 훅 핸들러 ${countOtherHandlers(current.settings, hookPath)}개와 나머지 설정은 그대로 두었습니다.`);
  return 0;
}

function status({ settingsPath, hookPath, socketPath, out }) {
  const current = load(settingsPath);
  const settings = current?.settings ?? {};
  out(`Claude Code 설정: ${settingsPath}${current ? '' : ' (파일 없음)'}`);
  const installed = installedEvents(settings, hookPath);
  const expected = EVENTS.map(([event]) => event);
  const missing = expected.filter((event) => !installed.includes(event));
  const ratio = `${expected.length - missing.length}/${expected.length}개 이벤트`;
  if (installed.length === 0) {
    out('Deskling 훅: 설치 안 됨 (설치: npm run hooks:install)');
  } else if (missing.length === 0) {
    out(`Deskling 훅: 설치됨 (${ratio}): ${installed.join(', ')}`);
  } else {
    out(`Deskling 훅: 일부만 설치됨 (${ratio}): ${installed.join(', ')}`);
    out(`  빠진 이벤트: ${missing.join(', ')} (npm run hooks:install로 채움)`);
  }
  out(`다른 훅 핸들러 ${countOtherHandlers(settings, hookPath)}개 (내용은 표시하지 않음)`);
  out(`Deskling 소켓: ${socketPath} — ${socketState(socketPath)}`);
  return 0;
}

const ACTIONS = { print, install, uninstall, status };

function parseArgs([command, ...rest]) {
  if (!Object.hasOwn(ACTIONS, command ?? '')) return undefined;
  if (rest.length === 0) return { command };
  if (rest.length === 2 && rest[0] === '--settings' && rest[1] !== '') return { command, settings: rest[1] };
  return undefined;
}

/**
 * @param {string[]} argv arguments after the script path
 * @returns {number} exit code: 0 done (or nothing to do), 1 refused or failed (file unchanged), 2 usage
 */
export function run(
  argv,
  {
    env = process.env,
    execPath = process.execPath,
    hookPath = HOOK_SCRIPT,
    now = () => new Date(),
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  const out = (line) => stdout.write(`${line}\n`);
  const err = (line) => stderr.write(`${line}\n`);
  const args = parseArgs(argv);
  if (!args) {
    err(USAGE);
    return 2;
  }
  const settingsPath = path.resolve(args.settings ?? path.join(env.HOME || homedir(), '.claude', 'settings.json'));
  const context = {
    settingsPath,
    command: hookCommand(stableNodePath(execPath), hookPath),
    hookPath,
    now,
    out,
    err,
    socketPath: resolveSocketPath(env, homedir()),
  };
  try {
    return ACTIONS[args.command](context);
  } catch (error) {
    // Only the error code: messages can carry more than this script means to show.
    err(
      error instanceof SettingsError
        ? error.message
        : `오류: ${settingsPath} 처리에 실패했습니다 (${error?.code ?? '알 수 없음'}). 설정 파일은 바뀌지 않았습니다.`,
    );
    return 1;
  }
}

const isMain = () => {
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (process.argv[1] && isMain()) {
  process.exitCode = run(process.argv.slice(2));
}
