import { describe, expect, it } from 'vitest';
import designDoc from '../../docs/DESIGN.md?raw';
import { VISUAL_SPEC } from '../ui/visualSpec';
import appCss from './app.css?raw';
import tokensCss from './tokens.css?raw';
import officeCss from './office.css?raw';

const allCss = [tokensCss, appCss, officeCss].join('\n');

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
      expect(officeCss).toMatch(new RegExp(`\\[data-tone="${tone}"\\][^{]*\\{[^}]*--tone:\\s*var\\(--tone-${tone}\\)`));
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

  it('places the 640×420 office along the bottom of the window, 100vw wide', () => {
    const rule = officeCss.match(/\.office\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/bottom:\s*0/);
    expect(rule).toMatch(/width:\s*100%/);
  });

  it('dims the string lights with the office lights off', () => {
    expect(officeCss).toMatch(/\.office\[data-empty="true"\] \.string-bulb\s*\{[^}]*animation:\s*none/);
  });

  it('gives resting and thinking members a small loop each, offset by their beat (ADR-027 §3)', () => {
    const loops = {
      sofa: 'breathe',
      'idle-desk': 'breathe',
      coffee: 'sip',
      water: 'sip',
      window: 'sway',
      plant: 'sway',
      books: 'sway',
      think: 'nod',
    } as const;
    for (const [activity, name] of Object.entries(loops)) {
      const rule = new RegExp(`\\.member\\[data-activity="${activity}"\\] \\.member__body[^{]*\\{[^}]*animation:\\s*${name}\\b[^}]*animation-delay:\\s*calc\\(var\\(--beat`);
      expect(officeCss, activity).toMatch(rule);
    }
    for (const name of new Set(Object.values(loops))) expect(officeCss).toMatch(new RegExp(`@keyframes ${name}\\b`));
  });

  it('drifts the clouds and sways the plant leaves, slowly', () => {
    expect(officeCss).toMatch(/\.cloud-drift\s*\{[^}]*animation:\s*cloud-drift/);
    expect(officeCss).toMatch(/\.plant-sway\s*\{[^}]*animation:\s*leaf-sway/);
  });

  it('dims chips that are disabled or aria-disabled alike', () => {
    expect(appCss).toMatch(/\.chip:disabled,\s*\.chip\[aria-disabled='true'\]\s*\{[^}]*opacity:\s*0\.45/);
  });

  it('keeps session names and states on one line; the usage numbers wrap below instead (panel rows)', () => {
    expect(appCss).toMatch(/\.session\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(appCss).toMatch(/\.session__name,\s*\.session__state\s*\{[^}]*white-space:\s*nowrap/);
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
