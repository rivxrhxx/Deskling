#!/usr/bin/env node
// Opt-in installer for the Deskling Codex hooks (ADR-026 §3). Node >= 18, no dependencies.
// Usage: node integrations/codex/install.mjs <print|install|uninstall|status> [--hooks <path>] [--config <path>]
// Same rules as the Claude Code installer (file handling in ../shared/hooksFile.mjs): install/uninstall back up
// hooks.json first, then add or remove only Deskling's entries, recognised by the absolute path of
// deskling-codex-hook.mjs in their command. Other hooks and keys are left as they are and never printed.
// Codex runs a newly added hook only after the user trusts it in /hooks; install says so.
// status reads one key of config.toml, `[features] hooks`, with a line scan, and prints nothing else from it.
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
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
import { resolveSocketPath } from '../shared/socketPath.mjs';

export { hookCommand, shellQuote, stableNodePath } from '../shared/hooksFile.mjs';

const HOOK_FILE = fileURLToPath(new URL('./deskling-codex-hook.mjs', import.meta.url));

/**
 * Absolute path of the hook script, resolved through its folder (`.native` also fixes letter case),
 * so it is known, and old entries can be removed, even while the script itself is missing.
 */
export const HOOK_SCRIPT = path.join(realpathSync.native(path.dirname(HOOK_FILE)), path.basename(HOOK_FILE));

/** Exact names of the tools the Codex hook maps to a category (ADR-026 §1). Codex matchers are regexes. */
export const TOOL_MATCHER = '^(Bash|exec_command|apply_patch|Edit|Write|spawn_agent|Agent)$';

/** Hook events Deskling registers, in ADR-026 order, with the tool matcher where it applies. */
const EVENTS = [
  ['SessionStart'],
  ['SessionEnd'],
  ['UserPromptSubmit'],
  ['PreToolUse', TOOL_MATCHER],
  ['PostToolUse', TOOL_MATCHER],
  ['PermissionRequest'],
  ['Stop'],
  ['Interrupt'],
];

const USAGE = [
  '사용법: node integrations/codex/install.mjs <print|install|uninstall|status> [--hooks <경로>] [--config <경로>]',
  '  print      추가할 hooks 블록을 출력만 합니다 (아무것도 바꾸지 않음)',
  '  install    백업을 만든 뒤 Deskling 훅을 덧붙입니다 (다른 훅·키는 그대로)',
  '  uninstall  백업을 만든 뒤 Deskling 훅만 제거합니다',
  '  status     설치 여부, Deskling 소켓, Codex의 [features] hooks 설정을 보여 줍니다 (아무것도 바꾸지 않음)',
  '  --hooks    기본값: $CODEX_HOME/hooks.json ($CODEX_HOME이 없으면 $HOME/.codex)',
  '  --config   status가 읽는 config.toml. 기본값: $CODEX_HOME/config.toml',
].join('\n');

const TRUST = [
  '중요: Codex는 새로 추가된 훅을 사용자가 신뢰(trust)한 뒤에만 실행합니다.',
  '  Codex를 열고 /hooks를 실행해 Deskling 훅을 검토하고 신뢰하세요.',
  '  이미 열려 있는 Codex 세션은 다시 시작해야 반영될 수 있습니다.',
];

/** The `hooks` object Deskling adds: one matcher group per event. */
export function desklingHooks(command) {
  return hooksBlock(EVENTS, command);
}

const FEATURE_KEY = /^\s*(hooks|codex_hooks)\s*=\s*(true|false)\s*(?:#.*)?$/;
const ROOT_FEATURE_KEY = /^\s*features\s*\.\s*(hooks|codex_hooks)\s*=\s*(true|false)\s*(?:#.*)?$/;

/**
 * Codex's hooks switch (on by default): `hooks` under `[features]` (or `features.hooks` at the top),
 * with `codex_hooks` as its deprecated alias. A line scan that looks at no other key; an inline
 * `features = { … }` table or a key inside a multi-line string is not understood.
 */
function hooksFeature(configPath) {
  let text;
  try {
    text = readFileSync(configPath, 'utf8');
  } catch (error) {
    return error?.code === 'ENOENT' ? { state: 'missing' } : { state: 'unreadable', code: error?.code ?? '알 수 없음' };
  }
  const found = {};
  let table = '';
  for (const line of text.split(/\r?\n/)) {
    const header = /^\s*\[([^\]]*)\]/.exec(line);
    if (header) {
      table = header[1].trim();
      continue;
    }
    const match = table === 'features' ? FEATURE_KEY.exec(line) : table === '' ? ROOT_FEATURE_KEY.exec(line) : null;
    if (match) found[match[1]] = match[2] === 'true';
  }
  const key = ['hooks', 'codex_hooks'].find((name) => Object.hasOwn(found, name));
  if (!key) return { state: 'unset' };
  return { state: found[key] ? 'on' : 'off', key };
}

function featureLine(configPath) {
  const feature = hooksFeature(configPath);
  switch (feature.state) {
    case 'missing':
      return `Codex 훅 기능: 켜짐 (기본값, ${configPath} 없음)`;
    case 'unset':
      return `Codex 훅 기능: 켜짐 (기본값, ${configPath}에 [features] hooks 설정 없음)`;
    case 'on':
      return `Codex 훅 기능: 켜짐 (${configPath}의 [features] ${feature.key} = true)`;
    case 'off':
      return (
        `Codex 훅 기능: 꺼짐 (${configPath}의 [features] ${feature.key} = false) — ` +
        '이 줄을 지우거나 true로 바꾸기 전에는 Codex가 어떤 훅도 실행하지 않습니다'
      );
    default:
      return `Codex 훅 기능: 확인할 수 없음 (${configPath}을(를) 읽지 못함: ${feature.code})`;
  }
}

const missingHookError = (hookPath) =>
  new SettingsError(
    `오류: Deskling Codex 훅 스크립트가 없습니다: ${hookPath}\n` +
      '아무것도 바꾸지 않았습니다. 저장소에 integrations/codex/deskling-codex-hook.mjs가 있는지 확인한 뒤 다시 실행하세요.',
  );

function print({ hooksPath, command, hookPath, out, err }) {
  out(JSON.stringify({ hooks: desklingHooks(command) }, null, 2));
  if (!existsSync(hookPath)) err(`주의: 훅 스크립트가 아직 없습니다: ${hookPath} (지금은 install이 거부됩니다)`);
  err(`install은 위 hooks 블록을 ${hooksPath}의 이벤트별 배열 끝에 덧붙입니다. 아무것도 바꾸지 않았습니다.`);
  return 0;
}

function install({ hooksPath, command, hookPath, now, out }) {
  if (!existsSync(hookPath)) throw missingHookError(hookPath);
  const current = load(hooksPath);
  const file = current?.settings ?? {};
  const added = addHooks(file, desklingHooks(command), hookPath, hooksPath);
  out(`Codex 훅 파일: ${hooksPath}`);
  if (added.length === 0) {
    out('Deskling 훅이 이미 모든 이벤트에 설치되어 있습니다. 바꾼 것이 없습니다.');
    out('아직 신뢰하지 않았다면 Codex에서 /hooks를 실행해 Deskling 훅을 신뢰하세요.');
    return 0;
  }
  if (current) {
    out(`백업: ${backup(hooksPath, current.bytes, current.mode, now())}`);
    writeAtomic(current.file, serialize(file), current.mode);
  } else {
    mkdirSync(path.dirname(hooksPath), { recursive: true, mode: 0o700 });
    writeAtomic(hooksPath, serialize(file), 0o600);
    out('훅 파일이 없어서 새로 만들었습니다 (백업할 원본 없음).');
  }
  out(`추가한 이벤트 (${added.length}개): ${added.join(', ')}`);
  out(`훅 명령: ${command}`);
  out(`다른 훅 핸들러 ${countOtherHandlers(file, hookPath)}개와 나머지 내용은 그대로 두었습니다.`);
  for (const line of TRUST) out(line);
  out('확인: npm run hooks:codex:status');
  out('되돌리기: npm run hooks:codex:uninstall');
  return 0;
}

function uninstall({ hooksPath, hookPath, now, out }) {
  const current = load(hooksPath);
  out(`Codex 훅 파일: ${hooksPath}`);
  if (!current) {
    out('훅 파일이 없습니다. 바꾼 것이 없습니다.');
    return 0;
  }
  const removed = removeHooks(current.settings, hookPath);
  if (removed.length === 0) {
    out('Deskling 훅이 없습니다. 바꾼 것이 없습니다.');
    return 0;
  }
  out(`백업: ${backup(hooksPath, current.bytes, current.mode, now())}`);
  writeAtomic(current.file, serialize(current.settings), current.mode);
  out(`제거한 이벤트 (${removed.length}개): ${removed.join(', ')}`);
  out(`다른 훅 핸들러 ${countOtherHandlers(current.settings, hookPath)}개와 나머지 내용은 그대로 두었습니다.`);
  return 0;
}

function status({ hooksPath, configPath, hookPath, socketPath, out }) {
  const current = load(hooksPath);
  const file = current?.settings ?? {};
  out(`Codex 훅 파일: ${hooksPath}${current ? '' : ' (파일 없음)'}`);
  const installed = installedEvents(file, hookPath);
  const expected = EVENTS.map(([event]) => event);
  const missing = expected.filter((event) => !installed.includes(event));
  const ratio = `${expected.length - missing.length}/${expected.length}개 이벤트`;
  if (installed.length === 0) {
    out('Deskling 훅: 설치 안 됨 (설치: npm run hooks:codex:install)');
  } else if (missing.length === 0) {
    out(`Deskling 훅: 설치됨 (${ratio}): ${installed.join(', ')}`);
  } else {
    out(`Deskling 훅: 일부만 설치됨 (${ratio}): ${installed.join(', ')}`);
    out(`  빠진 이벤트: ${missing.join(', ')} (npm run hooks:codex:install로 채움)`);
  }
  if (installed.length > 0) out('신뢰 여부는 여기서 알 수 없습니다. Codex에서 /hooks로 Deskling 훅이 신뢰되었는지 확인하세요.');
  out(`다른 훅 핸들러 ${countOtherHandlers(file, hookPath)}개 (내용은 표시하지 않음)`);
  out(`Deskling 훅 스크립트: ${hookPath} — ${existsSync(hookPath) ? '있음' : '없음 (이대로는 install이 거부됨)'}`);
  out(featureLine(configPath));
  out(`Deskling 소켓: ${socketPath} — ${socketState(socketPath)}`);
  return 0;
}

const ACTIONS = { print, install, uninstall, status };
const FLAGS = { '--hooks': 'hooks', '--config': 'config' };

function parseArgs([command, ...rest]) {
  if (!Object.hasOwn(ACTIONS, command ?? '')) return undefined;
  const args = { command };
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]];
    if (!Object.hasOwn(FLAGS, flag) || Object.hasOwn(args, FLAGS[flag]) || !value) return undefined;
    args[FLAGS[flag]] = value;
  }
  return args;
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
  const codexHome = env.CODEX_HOME || path.join(env.HOME || homedir(), '.codex');
  const hooksPath = path.resolve(args.hooks ?? path.join(codexHome, 'hooks.json'));
  const context = {
    hooksPath,
    configPath: path.resolve(args.config ?? path.join(codexHome, 'config.toml')),
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
        : `오류: ${hooksPath} 처리에 실패했습니다 (${error?.code ?? '알 수 없음'}). 훅 파일은 바뀌지 않았습니다.`,
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
