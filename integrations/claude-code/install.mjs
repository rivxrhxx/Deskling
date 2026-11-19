#!/usr/bin/env node
// Opt-in installer for the Deskling Claude Code hooks (ADR-024 §8, FR-CC5). Node >= 18, no dependencies.
// The file handling (parse-first, backup, append-only merge, atomic write) lives in ../shared/hooksFile.mjs.
// Usage: node integrations/claude-code/install.mjs <print|install|uninstall|status> [--settings <path>]
// install/uninstall back up the settings file first, then add or remove only Deskling's hook entries,
// recognised by the absolute path of deskling-hook.mjs in their command. Every other setting and hook is
// left as it is, and never printed: hook commands can hold secrets, so output only counts them.
// JSONC is not supported: a file JSON.parse rejects is left untouched.
import { mkdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addHooks,
  backup,
  countOtherHandlers,
  hookCommand,
  hooksBlock,
  installedEvents,
  load,
  removeHooks,
  serialize,
  SettingsError,
  socketState,
  stableNodePath,
  writeAtomic,
} from '../shared/hooksFile.mjs';
import { resolveSocketPath } from './hookRecord.mjs';

export { hookCommand, shellQuote, stableNodePath } from '../shared/hooksFile.mjs';

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

/** The `hooks` object Deskling adds: one matcher group per event. */
export function desklingHooks(command) {
  return hooksBlock(EVENTS, command);
}

function print({ settingsPath, command, out, err }) {
  out(JSON.stringify({ hooks: desklingHooks(command) }, null, 2));
  err(`install은 위 hooks 블록을 ${settingsPath}의 이벤트별 배열 끝에 덧붙입니다. 아무것도 바꾸지 않았습니다.`);
  return 0;
}

function install({ settingsPath, command, hookPath, now, out }) {
  const current = load(settingsPath);
  const settings = current?.settings ?? {};
  const added = addHooks(settings, desklingHooks(command), hookPath, settingsPath);
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
