import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PixelSprite } from './PixelSprite';
import type { PixelMap } from './pixelMap';
import { pixelPaths } from './pixelMap';
import {
  EMOTES,
  FRIEND_PALETTES,
  GUEST_PALETTES,
  GUEST_POSES,
  GUEST_SPRITES,
  HERMES_PALETTE,
  SPRITES,
  guestPalette,
  overlay,
  underlay,
} from './sprites';
import type { GuestKind } from './sprites';

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

describe('underlay', () => {
  it('fills only the transparent pixels of the base, so the patch passes behind it', () => {
    expect(underlay(['a.a', '...'], ['bbb', '.b.'])).toEqual(['aba', '.b.']);
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

  const hermesFamily = Object.entries(SPRITES).filter(([name]) => !(name in GUEST_SPRITES));

  it.each(hermesFamily)('%s only uses Hermes palette keys', (_name, map) => {
    expect(() => pixelPaths(map, HERMES_PALETTE)).not.toThrow();
  });

  it.each(FRIEND_PALETTES.map((palette, index) => [index, palette] as const))('friend palette %d covers every sprite', (_i, palette) => {
    for (const [, map] of hermesFamily) expect(() => pixelPaths(map, palette)).not.toThrow();
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

describe('session friends (ADR-022)', () => {
  const KINDS: readonly GuestKind[] = ['claude', 'codex'];
  const sheet = (kind: GuestKind) => GUEST_POSES.map((pose) => [`${kind}-${pose}`, SPRITES[`${kind}-${pose}`]] as const);
  /** Pixels that are not transparent in the first `rows` rows. */
  const silhouette = (map: PixelMap, rows: number) =>
    new Set(map.slice(0, rows).flatMap((row, y) => Array.from(row, (pixel, x) => (pixel === '.' ? '' : `${x},${y}`)).filter(Boolean)));
  const hue = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    const h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (h * 60 + 360) % 360;
  };

  it.each(KINDS)('%s has every pose, each 12×16, all of them in SPRITES', (kind) => {
    for (const [name, map] of sheet(kind)) {
      expect(map, name).toBeDefined();
      expect(GUEST_SPRITES[name], name).toBe(map);
      expect(map, name).toHaveLength(16);
      for (const row of map ?? []) expect(row, name).toHaveLength(12);
    }
    expect(Object.keys(GUEST_SPRITES).filter((name) => name.startsWith(`${kind}-`))).toHaveLength(GUEST_POSES.length);
  });

  it.each(KINDS)('%s sprites only use keys that every palette of the kind has, and render', (kind) => {
    expect(GUEST_PALETTES[kind]).toHaveLength(4);
    for (const palette of GUEST_PALETTES[kind]) {
      for (const [name, map] of sheet(kind)) {
        expect(() => pixelPaths(map ?? [], palette), name).not.toThrow();
        const { container, unmount } = render(
          <svg>
            <PixelSprite map={map ?? []} palette={palette} x={0} y={0} scale={2} />
          </svg>,
        );
        expect(container.querySelectorAll('path').length, name).toBeGreaterThan(3);
        unmount();
      }
    }
  });

  it.each(KINDS)('%s variants differ only in the accent, in clearly different hues', (kind) => {
    const [first, ...rest] = GUEST_PALETTES[kind];
    for (const palette of rest) {
      expect(Object.keys(palette).sort()).toEqual(Object.keys(first ?? {}).sort());
      expect(Object.keys(palette).filter((key) => palette[key] !== first?.[key]).sort()).toEqual(['A', 'a']);
    }
    const hues = GUEST_PALETTES[kind].map((palette) => hue(palette.A ?? '#000000'));
    for (const [i, a] of hues.entries()) {
      for (const b of hues.slice(i + 1)) expect(Math.min(Math.abs(a - b), 360 - Math.abs(a - b))).toBeGreaterThanOrEqual(45);
    }
  });

  it('picks the accent of the n-th friend of a kind, repeating every four', () => {
    expect(guestPalette('claude', 1)).toBe(GUEST_PALETTES.claude[0]);
    expect(guestPalette('claude', 4)).toBe(GUEST_PALETTES.claude[3]);
    expect(guestPalette('codex', 5)).toBe(GUEST_PALETTES.codex[0]);
    expect(guestPalette('codex', 6)).toBe(GUEST_PALETTES.codex[1]);
  });

  it('tells a Claude friend from a Codex friend by silhouette, not colour alone', () => {
    const claude = silhouette(SPRITES['claude-front'] ?? [], 5);
    const codex = silhouette(SPRITES['codex-front'] ?? [], 5);
    const onlyOne = [...claude].filter((pixel) => !codex.has(pixel)).length + [...codex].filter((pixel) => !claude.has(pixel)).length;
    expect(onlyOne).toBeGreaterThanOrEqual(4);
  });

  it('has the talk and letter emotes for session messages (ADR-023), and they render', () => {
    for (const id of ['talk', 'letter']) {
      const emote = EMOTES[id];
      expect(emote, id).toBeDefined();
      const { container, unmount } = render(
        <svg>
          <PixelSprite map={emote?.map ?? []} palette={emote?.palette ?? {}} x={0} y={0} scale={2} />
        </svg>,
      );
      expect(container.querySelectorAll('path').length, id).toBeGreaterThan(1);
      unmount();
    }
  });
});
