// @vitest-environment node
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// FR-CC1, ADR-024 §1: the hook prints nothing, always exits 0, finishes within 300 ms and sends one line.
const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'deskling-hook.mjs');
const SESSION = '0f4c9a3e-6c1d-4f3e-9b8a-2d7e5c1a9b00';
const HARD_CAP_MS = 300;

let dir;
let socketPath;
let server;

beforeEach(() => {
  // Short base path: macOS limits Unix socket paths to 104 bytes.
  dir = mkdtempSync(path.join(tmpdir(), 'dkl-'));
  socketPath = path.join(dir, 'h.sock');
});

afterEach(async () => {
  if (server) {
    await new Promise((resolve) => server.close(() => resolve()));
    server = undefined;
  }
  rmSync(dir, { recursive: true, force: true });
});

/** Starts a socket server that records what each connection sent. `hold` keeps connections open. */
async function listen({ hold = false } = {}) {
  const connections = [];
  const sockets = new Set();
  server = createServer((socket) => {
    sockets.add(socket);
    const entry = { data: '' };
    connections.push(entry);
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      entry.data += chunk;
    });
    socket.on('end', () => {
      if (!hold) socket.end();
    });
    socket.on('close', () => sockets.delete(socket));
  });
  const close = server.close.bind(server);
  server.close = (cb) => {
    for (const socket of sockets) socket.destroy();
    return close(cb);
  };
  await new Promise((resolve) => server.listen(socketPath, resolve));
  return connections;
}

/** Runs the hook; `stdin` undefined leaves stdin open (never closed). */
function runHook(stdin, env = {}) {
  return new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(process.execPath, [SCRIPT], {
      env: { PATH: process.env.PATH, HOME: dir, DESKLING_SOCKET: socketPath, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c));
    child.stderr.on('data', (c) => (stderr += c));
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr, elapsed: performance.now() - started });
    });
    if (stdin !== undefined) child.stdin.end(stdin);
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

const payload = (fields) =>
  JSON.stringify({
    session_id: SESSION,
    transcript_path: '/Users/someone/.claude/projects/x/TRANSCRIPT.jsonl',
    cwd: '/Users/someone/secret-project',
    permission_mode: 'default',
    ...fields,
  });

describe('deskling-hook CLI (FR-CC1)', () => {
  it('sends exactly one valid hook record line to the socket, and prints nothing', async () => {
    const connections = await listen();
    const result = await runHook(
      payload({
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'cat ~/.ssh/id_rsa', description: 'SECRET' },
        tool_response: { stdout: 'SECRET-OUTPUT' },
      }),
    );
    await settle();

    expect(result).toMatchObject({ code: 0, signal: null, stdout: '', stderr: '' });
    expect(connections).toHaveLength(1);
    const data = connections[0].data;
    expect(data.endsWith('\n')).toBe(true);
    expect(data.indexOf('\n')).toBe(data.length - 1);
    const record = JSON.parse(data);
    expect(record).toEqual({
      v: 1,
      agent: 'claude-code',
      session: SESSION,
      event: 'tool-end',
      tool: 'terminal',
      ok: true,
      at: expect.any(Number),
    });
    expect(Number.isSafeInteger(record.at)).toBe(true);
    expect(data).not.toMatch(/SECRET|ssh|command|secret-project|TRANSCRIPT/);
  });

  it('exits 0 within 300 ms with empty stdout/stderr when no Deskling socket exists', async () => {
    const result = await runHook(payload({ hook_event_name: 'Stop' }));
    expect(result).toMatchObject({ code: 0, signal: null, stdout: '', stderr: '' });
    expect(result.elapsed).toBeLessThan(HARD_CAP_MS);
  });

  it('exits 0 silently when the socket path refuses connections (stale file)', async () => {
    writeFileSync(socketPath, '');
    const result = await runHook(payload({ hook_event_name: 'Stop' }));
    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(result.elapsed).toBeLessThan(HARD_CAP_MS);
  });

  it('does not keep waiting on a server that never answers', async () => {
    const connections = await listen({ hold: true });
    const result = await runHook(payload({ hook_event_name: 'UserPromptSubmit', prompt: 'SECRET PROMPT' }));
    await settle();
    expect(result).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(result.elapsed).toBeLessThan(HARD_CAP_MS);
    expect(connections).toHaveLength(1);
    expect(JSON.parse(connections[0].data)).toMatchObject({ event: 'prompt', session: SESSION });
  });

  it('gives up at the hard cap when stdin never closes', async () => {
    const connections = await listen();
    const result = await runHook(undefined);
    expect(result).toMatchObject({ code: 0, signal: null, stdout: '', stderr: '' });
    // The hook stops itself ~260 ms after its own process start; the extra 50 ms absorbs this
    // test's spawn and pipe latency when the suite runs in parallel. Measured alone: ~280 ms.
    expect(result.elapsed).toBeLessThan(HARD_CAP_MS + 50);
    expect(connections).toHaveLength(0);
  });

  it.each([
    ['an unmapped event', payload({ hook_event_name: 'PreCompact' })],
    ['an uncategorized tool', payload({ hook_event_name: 'PreToolUse', tool_name: 'mcp__github__get_issue' })],
    ['a bad session id', payload({ hook_event_name: 'Stop', session_id: '../../etc' })],
    ['invalid JSON', '{"session_id": "abc", '],
    ['empty stdin', ''],
  ])('sends nothing and prints nothing for %s', async (_label, stdin) => {
    const connections = await listen();
    const result = await runHook(stdin);
    await settle();
    expect(result).toMatchObject({ code: 0, signal: null, stdout: '', stderr: '' });
    expect(connections).toHaveLength(0);
  });
});
