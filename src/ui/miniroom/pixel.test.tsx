import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PixelSprite } from './PixelSprite';
import { pixelPaths } from './pixelMap';
import { EMOTES, FRIEND_PALETTES, HERMES_PALETTE, SPRITES, overlay } from './sprites';

describe('pixelPaths (ADR-019)', () => {
  it('merges horizontal runs of the same colour into one path per colour', () => {
    expect(pixelPaths(['aab', '.bb'], { a: '#111', b: '#222' })).toEqual([
      { fill: '#111', d: 'M0 0h2v1h-2z' },
      { fill: '#222', d: 'M2 0h1v1h-1zM1 1h2v1h-2z' },
    ]);
  });

  it('skips transparent pixels', () => {
    expect(pixelPaths(['...'], { a: '#111' })).toEqual([]);
  });

  it('refuses a colour key that is not in the palette', () => {
    expect(() => pixelPaths(['x'], { a: '#111' })).toThrow(/x/);
  });
});

describe('overlay', () => {
  it('replaces only the non-transparent pixels of the patch', () => {
    expect(overlay(['aaa', 'aaa'], ['.b.', '...'])).toEqual(['aba', 'aaa']);
  });
});

describe('PixelSprite', () => {
  it('renders crisp paths scaled at a position, optionally mirrored', () => {
    const { container, rerender } = render(
      <svg>
        <PixelSprite map={['ab']} palette={{ a: '#111', b: '#222' }} x={10} y={20} scale={2} />
      </svg>,
    );
    const group = container.querySelector('g');
    expect(group).toHaveAttribute('shape-rendering', 'crispEdges');
    expect(group).toHaveAttribute('transform', 'translate(10 20) scale(2 2)');
    expect(container.querySelectorAll('path')).toHaveLength(2);
    rerender(
      <svg>
        <PixelSprite map={['ab']} palette={{ a: '#111', b: '#222' }} x={10} y={20} scale={2} flip />
      </svg>,
    );
    expect(container.querySelector('g')).toHaveAttribute('transform', 'translate(14 20) scale(-2 2)');
  });
});

describe('sprite sheets are well-formed', () => {
  const sheets = { ...SPRITES, ...Object.fromEntries(Object.entries(EMOTES).map(([k, v]) => [`emote:${k}`, v.map])) };

  it.each(Object.entries(sheets))('%s has rows of equal width', (_name, map) => {
    const widths = new Set(map.map((row) => row.length));
    expect(widths.size).toBe(1);
  });

  it.each(Object.entries(SPRITES))('%s only uses Hermes palette keys', (_name, map) => {
    expect(() => pixelPaths(map, HERMES_PALETTE)).not.toThrow();
  });

  it.each(FRIEND_PALETTES.map((palette, index) => [index, palette] as const))('friend palette %d covers every sprite', (_i, palette) => {
    for (const map of Object.values(SPRITES)) expect(() => pixelPaths(map, palette)).not.toThrow();
  });

  it.each(Object.entries(EMOTES))('emote %s only uses its own palette', (_name, emote) => {
    expect(() => pixelPaths(emote.map, emote.palette)).not.toThrow();
  });

  it('has the poses the room needs', () => {
    for (const pose of ['front', 'front-walk-a', 'front-walk-b', 'back', 'back-walk-a', 'back-walk-b', 'sit-back', 'sit-back-type', 'sit-front', 'sleep', 'shower', 'friend-a-front', 'friend-b-front', 'friend-a-sit-front', 'friend-b-sit-front']) {
      expect(SPRITES, pose).toHaveProperty(pose);
    }
  });
});
