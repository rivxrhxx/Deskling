import { describe, expect, it } from 'vitest';
import iconSvg from '../../src-tauri/icons/icon-source.svg?raw';
import tauriConf from '../../src-tauri/tauri.conf.json';

// NFR-3: the app icon is original vector art, generated into all sizes with `tauri icon`.
describe('app icon source (T35)', () => {
  it('is a self-contained SVG drawn from primitives', () => {
    expect(iconSvg).toMatch(/^<svg[^>]+viewBox="0 0 1024 1024"/);
    expect(iconSvg).not.toMatch(/<image|<text|<foreignObject|href="(https?:|data:)/);
  });

  it('draws the Deskling character (antenna bulb, body, scarf)', () => {
    for (const part of ['antenna', 'body', 'scarf', 'eyes']) {
      expect(iconSvg).toContain(`id="${part}"`);
    }
  });

  it('is referenced by the bundle configuration', () => {
    expect(tauriConf.bundle.icon).toEqual(
      expect.arrayContaining(['icons/32x32.png', 'icons/128x128.png', 'icons/128x128@2x.png', 'icons/icon.icns']),
    );
  });
});
