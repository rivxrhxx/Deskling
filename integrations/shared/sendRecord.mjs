// I/O shared by Deskling's agent hooks (ADR-024 §1, §3; ADR-026 §1). Node >= 18, no dependencies.
// `runHook` reads the hook JSON from stdin, sends at most one hook record line to Deskling's Unix socket,
// and exits. It never writes to stdout/stderr (hook output can reach the agent's context), always exits 0,
// and stops within 300 ms. When Deskling is not running the socket is missing or refuses, and the hook just ends.
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { resolveSocketPath } from './socketPath.mjs';

const HARD_CAP_MS = 300;
// Room for process teardown inside the cap, measured from process start (Node startup counts too).
const EXIT_MARGIN_MS = 40;
// Hook payloads can carry large tool responses; past this we give up rather than buffer more.
const MAX_STDIN_BYTES = 8 * 1024 * 1024;

/**
 * Runs one hook invocation in this process and exits it.
 * @param {(hookJson: unknown, now: number) => object | null} toRecord pure mapping; null means "send nothing"
 */
export function runHook(toRecord) {
  const finish = () => process.exit(0);
  process.on('uncaughtException', finish);
  process.on('unhandledRejection', finish);

  const deadline = performance.now() + Math.max(0, HARD_CAP_MS - EXIT_MARGIN_MS - process.uptime() * 1000);
  setTimeout(finish, deadline - performance.now()).unref();

  function send(text) {
    let input;
    try {
      input = JSON.parse(text);
    } catch {
      finish();
      return;
    }
    const record = toRecord(input, Date.now());
    if (!record) {
      finish();
      return;
    }
    const socket = createConnection({ path: resolveSocketPath(process.env, homedir()) });
    socket.setTimeout(Math.max(1, deadline - performance.now()), finish);
    socket.on('error', finish);
    socket.on('connect', () => {
      // Unix sockets hand written bytes straight to the receiver, so exiting after the flush loses nothing.
      socket.end(`${JSON.stringify(record)}\n`, finish);
    });
  }

  const chunks = [];
  let size = 0;
  process.stdin.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_STDIN_BYTES) {
      finish();
      return;
    }
    chunks.push(chunk);
  });
  process.stdin.on('end', () => send(Buffer.concat(chunks).toString('utf8')));
  process.stdin.on('error', finish);
}
