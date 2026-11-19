import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PixelSprite } from './PixelSprite';
import type { PixelMap } from './pixelMap';
import { pixelPaths } from './pixelMap';
import {
  EMOTES,
  GUEST_LOOKS,
  GUEST_PALETTES,
  GUEST_POSES,
  GUEST_SPRITES,
  HELPER_BOT,
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

  it.each(Object.entries(EMOTES))('emote %s only uses its own palette', (_name, emote) => {
    expect(() => pixelPaths(emote.map, emote.palette)).not.toThrow();
  });

  it('holds only the members’ looks: every sprite is `${look}-${pose}`', () => {
    expect(Object.keys(SPRITES).sort()).toEqual(GUEST_LOOKS.flatMap((look) => GUEST_POSES.map((pose) => `${look}-${pose}`)).sort());
  });
});

describe('session friends (ADR-022) and office employees (ADR-025)', () => {
  const KINDS: readonly GuestKind[] = ['claude', 'codex', 'agent'];
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

  it('has three looks, each with four accent variants', () => {
    expect(GUEST_LOOKS).toEqual(KINDS);
    expect(Object.keys(GUEST_PALETTES).sort()).toEqual([...KINDS].sort());
  });

  it('has the office poses as well as the cushion ones (ADR-025)', () => {
    const office = ['sit-desk', 'sit-desk-type', 'sit-desk-front', 'sit-desk-front-type', 'sit-desk-think', 'sit-desk-back-think', 'hold-mug', 'sit-sofa'];
    const cushion = ['front', 'back', 'walk-a', 'walk-b', 'back-walk-a', 'back-walk-b', 'sit-front', 'sit-front-type', 'sit-think', 'wave', 'arms-up', 'hands-on-head'];
    expect([...GUEST_POSES].sort()).toEqual([...cushion, ...office].sort());
  });

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
    expect(guestPalette('agent', 3)).toBe(GUEST_PALETTES.agent[2]);
    expect(guestPalette('agent', 8)).toBe(GUEST_PALETTES.agent[3]);
  });

  it.each([
    ['claude', 'codex'],
    ['claude', 'agent'],
    ['codex', 'agent'],
  ] as const)('tells %s from %s by silhouette, not colour alone', (a, b) => {
    const first = silhouette(SPRITES[`${a}-front`] ?? [], 5);
    const second = silhouette(SPRITES[`${b}-front`] ?? [], 5);
    const onlyOne = [...first].filter((pixel) => !second.has(pixel)).length + [...second].filter((pixel) => !first.has(pixel)).length;
    expect(onlyOne).toBeGreaterThanOrEqual(4);
  });

  describe.each(KINDS)('%s at an office desk', (kind) => {
    const pose = (name: string) => SPRITES[`${kind}-${name}`] ?? [];

    it('shows the back of the head at a desk facing away, and the face at a desk facing the viewer', () => {
      for (const name of ['sit-desk', 'sit-desk-type']) expect(pose(name).slice(0, 8), name).toEqual(pose('back').slice(0, 8));
      expect(pose('sit-desk-back-think').slice(0, 3)).toEqual(pose('back').slice(0, 3));
      for (const name of ['sit-desk-front', 'sit-desk-front-type']) expect(pose(name).slice(0, 8), name).toEqual(pose('front').slice(0, 8));
    });

    it('types with frames that differ where they can be seen: above the desk edge, and at the elbows from behind', () => {
      expect(pose('sit-desk-front-type').slice(0, 11)).not.toEqual(pose('sit-desk-front').slice(0, 11));
      expect(pose('sit-desk-type').slice(8, 12)).not.toEqual(pose('sit-desk').slice(8, 12));
    });

    it('keeps the rows under the desk front plain: only trousers, shoes and outline on the chair', () => {
      for (const name of ['sit-desk-front', 'sit-desk-front-type', 'sit-desk-think']) {
        for (const row of pose(name).slice(13)) expect(row, name).toMatch(/^[.odf]+$/);
      }
    });

    it('thinks with a hand at the chin facing the viewer, and a hand on the head from behind', () => {
      expect(pose('sit-desk-think').slice(0, 11)).not.toEqual(pose('sit-desk-front').slice(0, 11));
      expect(pose('sit-desk-back-think').slice(0, 8)).not.toEqual(pose('back').slice(0, 8));
    });

    it('holds a mug with coffee in it at chest height', () => {
      const rows = pose('hold-mug');
      expect(rows.slice(8, 12).join('')).toMatch(/k/);
      expect(rows.slice(8, 12).join('')).toMatch(/u/);
    });
  });

  it('has a small helper robot with two frames and its own palette, and they render', () => {
    expect(Object.keys(HELPER_BOT.frames).sort()).toEqual(['helper-bot-a', 'helper-bot-b']);
    const [a, b] = [HELPER_BOT.frames['helper-bot-a'], HELPER_BOT.frames['helper-bot-b']];
    expect(a).not.toEqual(b);
    for (const map of [a, b]) {
      expect(map.length).toBeLessThanOrEqual(10);
      expect(new Set(map.map((row) => row.length))).toEqual(new Set([map[0]?.length]));
      expect(map[0]?.length).toBeLessThanOrEqual(10);
      expect(() => pixelPaths(map, HELPER_BOT.palette)).not.toThrow();
      const { container, unmount } = render(
        <svg>
          <PixelSprite map={map} palette={HELPER_BOT.palette} x={0} y={0} scale={2} />
        </svg>,
      );
      expect(container.querySelectorAll('path').length).toBeGreaterThan(3);
      unmount();
    }
  });

  it('has the talk and letter emotes for session messages (ADR-023) and the coffee emote (ADR-025), and they render', () => {
    for (const id of ['talk', 'letter', 'coffee']) {
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
