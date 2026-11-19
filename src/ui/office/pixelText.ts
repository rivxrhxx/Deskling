import type { PixelMap } from './pixelMap';

/**
 * A tiny original 3×5 pixel font (ADR-028 §3–§4): only what the level badge ("Lv 12") and the level-up sign ("LEVEL UP!") need.
 * `t` is ink, `.` is blank. There is no glyph for anything else, so free text can never be drawn into the scene.
 */
export const GLYPHS: Readonly<Record<string, PixelMap>> = {
  '0': ['ttt', 't.t', 't.t', 't.t', 'ttt'],
  '1': ['.t.', 'tt.', '.t.', '.t.', 'ttt'],
  '2': ['ttt', '..t', 'ttt', 't..', 'ttt'],
  '3': ['ttt', '..t', '.tt', '..t', 'ttt'],
  '4': ['t.t', 't.t', 'ttt', '..t', '..t'],
  '5': ['ttt', 't..', 'ttt', '..t', 'ttt'],
  '6': ['ttt', 't..', 'ttt', 't.t', 'ttt'],
  '7': ['ttt', '..t', '..t', '.t.', '.t.'],
  '8': ['ttt', 't.t', 'ttt', 't.t', 'ttt'],
  '9': ['ttt', 't.t', 'ttt', '..t', 'ttt'],
  L: ['t..', 't..', 't..', 't..', 'ttt'],
  v: ['...', '...', 't.t', 't.t', '.t.'],
  E: ['ttt', 't..', 'tt.', 't..', 'ttt'],
  V: ['t.t', 't.t', 't.t', 't.t', '.t.'],
  U: ['t.t', 't.t', 't.t', 't.t', 'ttt'],
  P: ['tt.', 't.t', 'tt.', 't..', 't..'],
  '!': ['t', 't', 't', '.', 't'],
  ' ': ['..', '..', '..', '..', '..'],
};

/** The pixel map of a fixed text, glyphs one blank column apart, inked with palette key `ink`. Throws on a character with no glyph. */
export function textMap(text: string, ink = 't'): string[] {
  const glyphs = [...text].map((char) => {
    const glyph = GLYPHS[char];
    if (!glyph) throw new Error('pixelText: no glyph');
    return glyph;
  });
  return Array.from({ length: 5 }, (_, row) =>
    glyphs
      .map((glyph) => glyph[row] ?? '')
      .join('.')
      .replaceAll('t', ink),
  );
}
