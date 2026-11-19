import { describe, expect, it } from 'vitest';
import { GLYPHS, textMap } from './pixelText';

describe('pixel text (ADR-028 §3–§4): a tiny original 3×5 font for the level badge and the level-up sign', () => {
  it('has the digits and the letters of "Lv" and "LEVEL UP"', () => {
    expect(Object.keys(GLYPHS).sort()).toEqual([' ', '!', ...'0123456789', 'E', 'L', 'P', 'U', 'V', 'v'].sort());
  });

  it.each(Object.entries(GLYPHS))('%j is five rows of equal width, ink or blank only', (_char, glyph) => {
    expect(glyph).toHaveLength(5);
    expect(new Set(glyph.map((row) => row.length)).size).toBe(1);
    expect(glyph.join('')).toMatch(/^[t.]+$/);
  });

  it('draws every digit differently', () => {
    const digits = [...'0123456789'].map((d) => GLYPHS[d]?.join('/'));
    expect(new Set(digits).size).toBe(10);
  });

  it('sets glyphs side by side with one blank column between them', () => {
    const map = textMap('Lv1');
    expect(map).toHaveLength(5);
    expect(map[0]).toHaveLength(3 + 1 + 3 + 1 + 3);
    expect(map.every((row) => row[3] === '.' && row[7] === '.')).toBe(true);
    expect(map.map((row) => row.slice(0, 3))).toEqual(GLYPHS.L);
  });

  it('inks with the given palette key', () => {
    expect(textMap('7', 'g').join('')).toMatch(/^[g.]+$/);
  });

  it('refuses a character it has no glyph for, so free text can never be drawn', () => {
    expect(() => textMap('Lv x')).toThrow();
  });
});
