import { afterEach, describe, expect, it, vi } from 'vitest';

const tauriWindow = {
  startDragging: vi.fn(() => Promise.resolve()),
  setAlwaysOnTop: vi.fn<(on: boolean) => Promise<void>>(() => Promise.resolve()),
  setAlwaysOnBottom: vi.fn<(on: boolean) => Promise<void>>(() => Promise.resolve()),
  setSize: vi.fn<(size: unknown) => Promise<void>>(() => Promise.resolve()),
  close: vi.fn(() => Promise.resolve()),
};
const isTauri = vi.fn(() => false);

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => isTauri() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => tauriWindow,
  LogicalSize: class {
    constructor(
      public width: number,
      public height: number,
    ) {}
  },
}));

const { createWindowControls, noopWindowControls } = await import('./windowControls');

afterEach(() => {
  vi.clearAllMocks();
});

describe('createWindowControls (T27)', () => {
  it('uses no-op controls outside the Tauri runtime (browser, tests)', async () => {
    isTauri.mockReturnValue(false);
    const controls = createWindowControls();
    expect(controls).toBe(noopWindowControls);
    await expect(controls.setSize(1, 1)).resolves.toBeUndefined();
    expect(tauriWindow.setSize).not.toHaveBeenCalled();
  });

  it('maps every action to the current Tauri window inside the runtime', async () => {
    isTauri.mockReturnValue(true);
    const controls = createWindowControls();

    await controls.startDragging();
    await controls.setAlwaysOnTop(false);
    await controls.setAlwaysOnBottom(true);
    await controls.setSize(416, 364);
    await controls.close();

    expect(tauriWindow.startDragging).toHaveBeenCalledTimes(1);
    expect(tauriWindow.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(tauriWindow.setAlwaysOnBottom).toHaveBeenCalledWith(true);
    expect(tauriWindow.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 416, height: 364 }));
    expect(tauriWindow.close).toHaveBeenCalledTimes(1);
  });

  it('never throws when the native call fails and logs only the action name', async () => {
    isTauri.mockReturnValue(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    tauriWindow.setSize.mockRejectedValueOnce(new Error('denied: SECRET detail'));

    await expect(createWindowControls().setSize(10, 10)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('[deskling] window action failed: setSize');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('SECRET');
  });
});
