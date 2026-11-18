import { describe, expect, it } from 'vitest';
import cargoToml from '../../src-tauri/Cargo.toml?raw';
import capability from '../../src-tauri/capabilities/default.json';
import tauriConf from '../../src-tauri/tauri.conf.json';

const mainWindow = tauriConf.app.windows.find((w) => w.label === 'main');

describe('overlay window configuration (FR-W1, FR-W2, NFR-5)', () => {
  it('declares a single main window', () => {
    expect(tauriConf.app.windows).toHaveLength(1);
    expect(mainWindow).toBeDefined();
  });

  it('is transparent, frameless, shadowless and always on top', () => {
    expect(mainWindow).toMatchObject({
      transparent: true,
      decorations: false,
      shadow: false,
      alwaysOnTop: true,
      visibleOnAllWorkspaces: true,
      acceptFirstMouse: true,
    });
  });

  it('opens at the 320x280 base size and keeps its aspect via presets only (ADR-012)', () => {
    expect(mainWindow).toMatchObject({ width: 320, height: 280, resizable: false });
  });

  it('enables the macOS private API required for transparency (ADR-007)', () => {
    expect(tauriConf.app).toMatchObject({ macOSPrivateApi: true });
    expect(cargoToml).toMatch(/tauri\s*=\s*\{[^}]*features\s*=\s*\[[^\]]*"macos-private-api"/);
  });
});

describe('webview hardening (SEC-5)', () => {
  it('ships a content security policy without eval or remote origins', () => {
    const csp = (tauriConf.app.security as { csp?: unknown }).csp;
    expect(typeof csp).toBe('string');
    const policy = csp as string;
    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self'");
    expect(policy).not.toContain('unsafe-eval');
    expect(policy).not.toMatch(/https?:\/\/(?!ipc\.localhost)/);
  });
});

describe('capabilities (SEC-5)', () => {
  it('applies only to the main window', () => {
    expect(capability.windows).toEqual(['main']);
  });

  it('grants only the window permissions Deskling needs', () => {
    expect([...capability.permissions].sort()).toEqual(
      [
        'core:default',
        'core:window:allow-close',
        'core:window:allow-set-always-on-top',
        'core:window:allow-set-size',
        'core:window:allow-start-dragging',
      ].sort(),
    );
  });

  it('has no shell, filesystem, http or process plugin permissions', () => {
    for (const permission of capability.permissions) {
      expect(permission).not.toMatch(/^(shell|fs|http|process|opener):/);
    }
  });
});
