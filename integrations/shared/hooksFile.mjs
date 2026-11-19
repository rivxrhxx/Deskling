// Shared by the Deskling hook installers (ADR-024 §8, ADR-026 §3): Claude Code settings.json and Codex hooks.json
// use the same `{"hooks": {"<Event>": [{"matcher"?, "hooks": [handler, …]}]}}` shape. Node >= 18, no dependencies.
// Deskling's handlers are recognised by the absolute hook script path in their command. Everything else in the
// file is left as it is, and never printed: hook commands can hold secrets, so callers only count them.
// JSONC is not supported: a file JSON.parse rejects is left untouched.
import {
  chmodSync,
  closeSync,
  existsSync,
  fchmodSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

/** A refusal whose message is safe to print: it names paths and keys, never file contents. */
export class SettingsError extends Error {}

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

/** Single-quotes a value for sh; an embedded ' becomes '\''. */
export function shellQuote(value) {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

export function hookCommand(nodePath, hookPath) {
  return `${shellQuote(nodePath)} ${shellQuote(hookPath)}`;
}

/**
 * The `hooks` object an installer adds: one matcher group per `[event, matcher?]`, running `command`
 * synchronously (no `async`, so records arrive in order) with a 2-second timeout.
 */
export function hooksBlock(events, command) {
  return Object.fromEntries(
    events.map(([event, matcher]) => {
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
export function installedEvents(settings, hookPath) {
  const hooks = hooksOf(settings);
  return Object.keys(hooks).filter((event) =>
    groupsOf(hooks[event]).some((group) => group.hooks.some((handler) => isOurs(handler, hookPath))),
  );
}

export function countOtherHandlers(settings, hookPath) {
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

/** Appends `block`'s groups to every event that lacks a Deskling handler. Mutates `settings`. */
export function addHooks(settings, block, hookPath, settingsPath) {
  if (settings.hooks !== undefined && !isObject(settings.hooks)) throw shapeError(settingsPath, 'hooks', '객체여야 함');
  const installed = new Set(installedEvents(settings, hookPath));
  const added = [];
  for (const [event, groups] of Object.entries(block)) {
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
export function removeHooks(settings, hookPath) {
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
export function load(settingsPath) {
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

export const serialize = (settings) => `${JSON.stringify(settings, null, 2)}\n`;

/** Temp file in the same directory + rename, so readers see the old file or the new one, never half. */
export function writeAtomic(file, text, mode) {
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

/** Copies the original bytes to <file>.deskling-backup-<YYYYMMDD-HHMMSS>[-n], same mode. */
export function backup(settingsPath, bytes, mode, date) {
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

export function socketState(socketPath) {
  try {
    return lstatSync(socketPath).isSocket() ? '있음' : '소켓이 아닌 파일이 있음 (Deskling 앱이 연결을 받지 못함)';
  } catch {
    return '없음 (Deskling 앱이 꺼져 있으면 정상)';
  }
}
