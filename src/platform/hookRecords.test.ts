import { afterEach, describe, expect, it, vi } from 'vitest';

type Handler = (event: { event: string; id: number; payload: unknown }) => void;

const unlisten = vi.fn();
const listen = vi.fn<(event: string, handler: Handler) => Promise<() => void>>(() => Promise.resolve(unlisten));
const isTauri = vi.fn(() => false);

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => isTauri() }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (event: string, handler: Handler) => listen(event, handler),
}));

const { HOOK_RECORD_EVENT, listenHookRecords } = await import('./hookRecords');

afterEach(() => {
  vi.clearAllMocks();
});

describe('listenHookRecords (ADR-024 §5, FR-CC2)', () => {
  it('listens to the Rust bridge event name', () => {
    expect(HOOK_RECORD_EVENT).toBe('deskling://hook-record');
  });

  it('resolves to a no-op unlisten outside the Tauri runtime (browser, tests)', async () => {
    isTauri.mockReturnValue(false);
    const onRecord = vi.fn();
    const stop = await listenHookRecords(onRecord);
    expect(listen).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
    expect(onRecord).not.toHaveBeenCalled();
  });

  it('passes each payload through untouched, as unknown, for the adapter to validate', async () => {
    isTauri.mockReturnValue(true);
    const onRecord = vi.fn<(raw: unknown) => void>();
    const stop = await listenHookRecords(onRecord);

    expect(listen).toHaveBeenCalledWith('deskling://hook-record', expect.any(Function));
    const handler = listen.mock.calls[0]?.[1];
    const record = { v: 1, agent: 'claude-code', session: 's1', event: 'stop', at: 1 };
    handler?.({ event: 'deskling://hook-record', id: 1, payload: record });
    handler?.({ event: 'deskling://hook-record', id: 2, payload: 'not a record' });

    expect(onRecord).toHaveBeenNthCalledWith(1, record);
    expect(onRecord).toHaveBeenNthCalledWith(2, 'not a record');
    stop();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('never rejects when listening fails and logs no detail', async () => {
    isTauri.mockReturnValue(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    listen.mockRejectedValueOnce(new Error('event.listen not allowed: SECRET detail'));

    const stop = await listenHookRecords(vi.fn());
    expect(() => stop()).not.toThrow();
    expect(warn).toHaveBeenCalledWith('[deskling] hook record listen failed');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET');
  });
});
