import { describe, expect, it } from 'vitest';
import designDoc from '../../docs/DESIGN.md?raw';
import { VISUAL_SPEC } from '../ui/visualSpec';
import appCss from './app.css?raw';
import tokensCss from './tokens.css?raw';
import miniroomCss from './miniroom.css?raw';

const allCss = [tokensCss, appCss, miniroomCss].join('\n');

describe('design tokens (DESIGN.md §2)', () => {
  const rows = designDoc
    .split('\n')
    .map((line) => line.match(/^\|\s*`(--[a-z-]+)`\s*\|\s*`(#[0-9a-f]{6})`/i))
    .filter((match): match is RegExpMatchArray => match !== null);

  it('documents a palette', () => {
    expect(rows.length).toBeGreaterThanOrEqual(10);
  });

  it.each(rows.map((match) => [match[1], match[2]] as const))('defines %s as %s', (token, value) => {
    expect(tokensCss).toMatch(new RegExp(`${token}:\\s*${value};`, 'i'));
  });
});

describe('stylesheet contract', () => {
  it('keeps the window background transparent (FR-W1, NFR-5)', () => {
    expect(appCss).toMatch(/html,\s*body[^{]*\{[^}]*background:\s*transparent/);
  });

  it('maps every tone used by the visual spec to a colour token', () => {
    const tones = new Set(Object.values(VISUAL_SPEC).map((spec) => spec.tone));
    for (const tone of tones) {
      expect(miniroomCss).toMatch(new RegExp(`\\[data-tone="${tone}"\\][^{]*\\{[^}]*--tone:\\s*var\\(--tone-${tone}\\)`));
    }
  });

  it('switches every animation and transition off under data-motion="reduced" (FR-M1, FR-M3)', () => {
    expect(appCss).toMatch(
      /\[data-motion="reduced"\] \*[^{]*\{[^}]*animation:\s*none\s*!important;[^}]*transition:\s*none\s*!important;/,
    );
  });

  it('also honours the OS preference before the app decides (unless the user forced full motion)', () => {
    expect(appCss).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*:not\(\[data-motion="full"\]\)/);
  });

  it('glides the hotspot at the same pace as the life tick (FR-V7)', async () => {
    const { LIFE_TICK_MS } = await import('../app/useLife');
    expect(tokensCss).toMatch(new RegExp(`--life-tick:\\s*${LIFE_TICK_MS}ms;`));
    expect(miniroomCss).toMatch(/\.character-hotspot\s*\{[^}]*var\(--hx[^}]*var\(--hy/);
  });

  it('shows the toolbar only on hover or keyboard focus (FR-W7)', () => {
    expect(appCss).toMatch(/\.window-toolbar\s*\{[^}]*opacity:\s*0;/);
    expect(appCss).toMatch(/\.deskling:hover \.window-toolbar,\s*\.deskling:focus-within \.window-toolbar\s*\{[^}]*opacity:\s*1;/);
  });

  it('loads nothing from the network: no imports, fonts or remote urls (NFR-2)', () => {
    expect(allCss).not.toMatch(/@import|@font-face|https?:\/\//);
    const urls = allCss.match(/url\(([^)]*)\)/g) ?? [];
    for (const url of urls) {
      expect(url).toMatch(/^url\(#/);
    }
  });
});
