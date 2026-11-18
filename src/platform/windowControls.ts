import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

/**
 * The only frontend boundary to the native window (ARCHITECTURE §3.7, ADR-011).
 * Every action resolves, even if the native call fails, so UI code never has to handle rejections.
 * Failures log the action name only.
 */
export interface WindowControls {
  startDragging(): Promise<void>;
  setAlwaysOnTop(on: boolean): Promise<void>;
  /** Keeps the window below every other window, on the desktop (ADR-021). */
  setAlwaysOnBottom(on: boolean): Promise<void>;
  /** Logical pixels. */
  setSize(width: number, height: number): Promise<void>;
  close(): Promise<void>;
}

const resolved = () => Promise.resolve();

export const noopWindowControls: WindowControls = Object.freeze({
  startDragging: resolved,
  setAlwaysOnTop: resolved,
  setAlwaysOnBottom: resolved,
  setSize: resolved,
  close: resolved,
});

function guarded(action: keyof WindowControls, run: () => Promise<void>): Promise<void> {
  return run().catch(() => {
    console.warn(`[deskling] window action failed: ${action}`);
  });
}

function createTauriWindowControls(): WindowControls {
  const win = getCurrentWindow();
  return {
    startDragging: () => guarded('startDragging', () => win.startDragging()),
    setAlwaysOnTop: (on) => guarded('setAlwaysOnTop', () => win.setAlwaysOnTop(on)),
    setAlwaysOnBottom: (on) => guarded('setAlwaysOnBottom', () => win.setAlwaysOnBottom(on)),
    setSize: (width, height) => guarded('setSize', () => win.setSize(new LogicalSize(width, height))),
    close: () => guarded('close', () => win.close()),
  };
}

export function createWindowControls(): WindowControls {
  return isTauri() ? createTauriWindowControls() : noopWindowControls;
}
