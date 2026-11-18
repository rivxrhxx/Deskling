#!/usr/bin/env node
// Runs a command with ~/.cargo/bin appended to PATH when cargo lives there (ADR-010).
// Usage: node scripts/with-cargo.mjs <command> [...args]
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param {string | undefined} envPath
 * @param {{ home: string, exists: (p: string) => boolean, delimiter?: string }} options
 * @returns {string}
 */
export function augmentPath(envPath, { home, exists, delimiter = path.delimiter }) {
  const current = envPath ?? '';
  const cargoBin = `${home}/.cargo/bin`;
  const parts = current.split(delimiter).filter(Boolean);
  if (parts.includes(cargoBin) || !exists(`${cargoBin}/cargo`)) {
    return current;
  }
  // Appended, not prepended: a cargo that is already on PATH keeps precedence.
  return [...parts, cargoBin].join(delimiter);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error('usage: node scripts/with-cargo.mjs <command> [...args]');
    process.exit(2);
  }
  const env = {
    ...process.env,
    PATH: augmentPath(process.env.PATH, { home: homedir(), exists: existsSync }),
  };
  const child = spawn(command, args, { stdio: 'inherit', env });
  child.on('error', (error) => {
    console.error(`with-cargo: failed to start "${command}": ${error.message}`);
    process.exit(127);
  });
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
