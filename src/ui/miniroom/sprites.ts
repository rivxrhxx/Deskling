import type { Palette, PixelMap } from './pixelMap';

/**
 * Original pixel sprites for Hermes and friends (ADR-019). 12×16 pixels, drawn at 2×.
 * Hermes: winged blue cap, brown hair, white shirt, violet scarf, blue shorts, red sneakers.
 */

/** Replaces the non-transparent pixels of `patch` onto `base` (same size). */
export function overlay(base: PixelMap, patch: PixelMap): string[] {
  return base.map((row, y) => {
    const over = patch[y] ?? '';
    return Array.from(row, (pixel, x) => (over[x] && over[x] !== '.' ? over[x] : pixel)).join('');
  });
}

const BLANK = '............';
/** A 16-row patch from a few rows. */
const patch = (rows: Record<number, string>): string[] => Array.from({ length: 16 }, (_, y) => rows[y] ?? BLANK);

export const HERMES_PALETTE: Palette = {
  o: '#3b2a20', // outline
  h: '#7a4f3a', // hair
  c: '#5b6fd6', // cap
  C: '#8fa0f0', // cap light
  W: '#ffffff', // wing
  w: '#d8deee', // wing shade
  s: '#ffe0c7', // skin
  e: '#2b1d16', // eyes
  p: '#ff9db0', // cheeks
  m: '#c0605a', // mouth
  t: '#fffaf2', // shirt
  v: '#a48df0', // scarf
  V: '#7d66c9', // scarf shade
  b: '#4a5aa8', // shorts
  f: '#e8505b', // shoes
  u: '#ffffff', // foam
  U: '#c9d6e8', // foam shade
  k: '#6a7bb8', // book cover
  K: '#f4f0e6', // pages
  g: '#7fc3d8', // watering can
};

const recolour = (changes: Readonly<Record<string, string>>): Palette => ({ ...HERMES_PALETTE, ...changes });

/** Friend A: pink bun, yellow tee. Friend B: mint beanie, sky tee. */
export const FRIEND_PALETTES: readonly Palette[] = [
  recolour({ h: '#f29ab9', t: '#ffe58f', v: '#ff8fb1', V: '#e0688f', b: '#8a5cf0', f: '#5b6fd6' }),
  recolour({ h: '#4a3426', c: '#56c9a0', C: '#a7f0d4', t: '#bfe3ff', v: '#5b6fd6', V: '#4153b0', b: '#3b4a6b', f: '#f4b04a' }),
];

const CAP = ['.W..oooo..W.', 'WWWocCccoWWW', '.WoccccccoW.'];

const HEAD_FRONT = [
  ...CAP,
  '.ohhhhhhhho.',
  '.ohssssssho.',
  '.osesssseso.',
  '.opssmmsspo.',
  '..osssssso..',
  '..ovvvvvvo..',
];
const HEAD_BACK = [...CAP, '.ohhhhhhhho.', '.ohhhhhhhho.', '.ohhhhhhhho.', '.ohhhhhhhho.', '..ohhhhhho..', '..ovvvvvvo..'];
const HEAD_SLEEP = [
  ...CAP,
  '.ohhhhhhhho.',
  '.ohssssssho.',
  '.osossssoso.',
  '.opsssssspo.',
  '..osssssso..',
  '..ovvvvvvo..',
];

const BODY_STAND = ['..otvvvvto..', '.sottttttos.', '.sotVttttos.', '..obbbbbbo..', '..obboobbo..', '...os..so...', '..off..ffo..'];
const BODY_BACK = ['..otvvvvto..', '.sottttttos.', '.sottttttos.', '..obbbbbbo..', '..obboobbo..', '...os..so...', '..off..ffo..'];
const BODY_NO_ARMS = ['..otvvvvto..', '..otttttto..', '..otVtttto..', '..obbbbbbo..', '..obboobbo..', '...os..so...', '..off..ffo..'];
const LEGS_WALK_A = ['..obbo.obbo.', '..os....so..', '.off....ffo.'];
const LEGS_WALK_B = ['..obboobbo..', '....osso....', '...offffo...'];

const withLegs = (body: readonly string[], legs: readonly string[]) => [...body.slice(0, 4), ...legs];

const FRONT = [...HEAD_FRONT, ...BODY_STAND];
const BACK = [...HEAD_BACK, ...BODY_BACK];

const ARMS_UP = patch({ 4: 's..........s', 5: 's..........s', 6: 's..........s', 7: 'os........so', 8: '.o........o.' });
const WAVE = patch({ 3: '...........s', 4: '...........s', 5: '...........s', 6: '..........os', 7: '..........o.' });
const HANDS_ON_HEAD = patch({ 3: 's..........s', 4: 'so........os', 5: 'so........os', 6: '.o........o.' });
const BOOK = patch({ 10: '..okkkkkko..', 11: '..okKKKKko..', 12: '..okkkkkko..' });
const WATERING = patch({ 10: '.........ooo', 11: '........sggg', 12: '.........ggg', 13: '..........o.' });

const SIT_BACK = [...HEAD_BACK, '..otvvvvto..', '.sottttttos.', '.sottttttos.', '..obbbbbbo..', '..obbbbbbo..', BLANK, BLANK];
const SIT_BACK_TYPE = [...HEAD_BACK, '..otvvvvto..', '.oottttttos.', '..ottttttoo.', '..obbbbbbo..', '..obbbbbbo..', BLANK, BLANK];
const SIT_FRONT = [...HEAD_FRONT, '..otvvvvto..', '.sottttttos.', '.sotVttttos.', '..obbbbbbo..', '.obbbbbbbbo.', '.os......so.', '.ff......ff.'];

const SHOWER = [
  '...uu..uu...',
  '..uUUu.uUUu.',
  '.ouuuuuuuuo.',
  '.ohhhhhhhho.',
  '.ohssssssho.',
  '.osossssoso.',
  '.opssmmsspo.',
  '..osssssso..',
  '..osssssso..',
  '.osssssssso.',
  '.osssssssso.',
  BLANK,
  BLANK,
  BLANK,
  BLANK,
  BLANK,
];

/** Friend heads: A has a hair bun, B a beanie; no wings. */
const FRIEND_A_HEAD = ['....oooo....', '...ohhhho...', '..ohhhhhho..', '.ohhhhhhhho.', '.ohssssssho.', '.osesssseso.', '.opssmmsspo.', '..osssssso..', '..ovvvvvvo..'];
const FRIEND_A_BACK = ['....oooo....', '...ohhhho...', '..ohhhhhho..', '.ohhhhhhhho.', '.ohhhhhhhho.', '.ohhhhhhhho.', '.ohhhhhhhho.', '..ohhhhhho..', '..ovvvvvvo..'];
const FRIEND_B_HEAD = ['............', '..occcccco..', '.occCCCCcco.', '.occcccccco.', '.ohssssssho.', '.osesssseso.', '.opssmmsspo.', '..osssssso..', '..ovvvvvvo..'];
const FRIEND_B_BACK = ['............', '..occcccco..', '.occCCCCcco.', '.occcccccco.', '.ohhhhhhhho.', '.ohhhhhhhho.', '.ohhhhhhhho.', '..ohhhhhho..', '..ovvvvvvo..'];

const friendSheet = (prefix: string, head: readonly string[], back: readonly string[]) => ({
  [`${prefix}-front`]: [...head, ...BODY_STAND],
  [`${prefix}-back`]: [...back, ...BODY_BACK],
  [`${prefix}-walk-a`]: [...head, ...withLegs(BODY_STAND, LEGS_WALK_A)],
  [`${prefix}-walk-b`]: [...head, ...withLegs(BODY_STAND, LEGS_WALK_B)],
  [`${prefix}-back-walk-a`]: [...back, ...withLegs(BODY_BACK, LEGS_WALK_A)],
  [`${prefix}-back-walk-b`]: [...back, ...withLegs(BODY_BACK, LEGS_WALK_B)],
  [`${prefix}-sit-back`]: [...back, ...SIT_BACK.slice(9)],
  [`${prefix}-sit-back-type`]: [...back, ...SIT_BACK_TYPE.slice(9)],
  [`${prefix}-sit-front`]: [...head, ...SIT_FRONT.slice(9)],
});

export const SPRITES: Readonly<Record<string, PixelMap>> = {
  front: FRONT,
  'front-walk-a': [...HEAD_FRONT, ...withLegs(BODY_STAND, LEGS_WALK_A)],
  'front-walk-b': [...HEAD_FRONT, ...withLegs(BODY_STAND, LEGS_WALK_B)],
  back: BACK,
  'back-walk-a': [...HEAD_BACK, ...withLegs(BODY_BACK, LEGS_WALK_A)],
  'back-walk-b': [...HEAD_BACK, ...withLegs(BODY_BACK, LEGS_WALK_B)],
  'sit-back': SIT_BACK,
  'sit-back-type': SIT_BACK_TYPE,
  'sit-front': SIT_FRONT,
  sleep: [...HEAD_SLEEP, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK, BLANK],
  shower: SHOWER,
  wave: overlay([...HEAD_FRONT, ...BODY_STAND], WAVE),
  'arms-up': overlay([...HEAD_FRONT, ...BODY_NO_ARMS], ARMS_UP),
  'hands-on-head': overlay([...HEAD_BACK, ...SIT_BACK.slice(9)].map((row, y) => (y === 10 || y === 11 ? '..otttttto..' : row)), HANDS_ON_HEAD),
  read: overlay(FRONT, BOOK),
  water: overlay(FRONT, WATERING),
  ...friendSheet('friend-a', FRIEND_A_HEAD, FRIEND_A_BACK),
  ...friendSheet('friend-b', FRIEND_B_HEAD, FRIEND_B_BACK),
};

export interface Emote {
  readonly map: PixelMap;
  readonly palette: Palette;
}

/** Little pixel signs above a head. Shapes, not text. */
export const EMOTES: Readonly<Record<string, Emote>> = {
  heart: {
    map: ['.rr.rr..', 'rRRrRRr.', 'rRRRRRr.', '.rRRRr..', '..rRr...', '...r....'],
    palette: { r: '#c2185b', R: '#ff8fb1' },
  },
  zzz: {
    map: ['....zzzz', '......z.', '.....z..', 'zzz.zzzz', '..z.....', '.z......', 'zzz.....'],
    palette: { z: '#e8ecf8' },
  },
  note: { map: ['..nnnnn.', '..n...n.', '..n...n.', 'nnn.nnn.', 'nnn.nnn.'], palette: { n: '#5b6fd6' } },
  vein: { map: ['.a....a.', 'aa....aa', '........', '........', 'aa....aa', '.a....a.'], palette: { a: '#ff5c7a' } },
  sweat: { map: ['..d.', '.dd.', 'dDdd', 'dddd', '.dd.'], palette: { d: '#8fd3ff', D: '#ffffff' } },
  'exclaim-amber': { map: ['.xx.', '.xx.', '.xx.', '.xx.', '....', '.xx.'], palette: { x: '#f4b04a' } },
  'exclaim-ember': { map: ['.xx.', '.xx.', '.xx.', '.xx.', '....', '.xx.'], palette: { x: '#ff6a3d' } },
  dots: { map: ['ii.ii.ii', 'ii.ii.ii'], palette: { i: '#a48df0' } },
  sparkle: { map: ['..y..', '..y..', 'yyYyy', '..y..', '..y..'], palette: { y: '#f2d27a', Y: '#ffffff' } },
  steam: { map: ['..ss.ss.', '.sssssss', 'ssssssss', '.ssssss.'], palette: { s: '#e8ecf8' } },
  battery: { map: ['kkkkkkk.', 'kq....kk', 'kq....kk', 'kkkkkkk.'], palette: { k: '#3b2a20', q: '#ff5c5c' } },
  water: { map: ['.w.', 'wWw', '.w.'], palette: { w: '#6cc7f2', W: '#ffffff' } },
  bubbles: { map: ['..u..', '.uUu.', '..u.u'], palette: { u: '#ffffff', U: '#c9d6e8' } },
  code: {
    map: ['..c..cc..', '.c...c.c.', 'c...c...c', '.c.c...c.', '..cc..c..'],
    palette: { c: '#6cc7f2' },
  },
  globe: { map: ['..ggg..', '.gGgGg.', 'gGGgGGg', 'ggggggg', 'gGGgGGg', '.gGgGg.', '..ggg..'], palette: { g: '#6cc7f2', G: '#a8e0f8' } },
  prompt: { map: ['p......', '.p.....', '..p....', '.p.....', 'p..pppp'], palette: { p: '#72e3bd' } },
  folder: { map: ['fff....', 'fFFffff', 'fFFFFFf', 'fFFFFFf', 'fffffff'], palette: { f: '#6a7bb8', F: '#a9b6e6' } },
  arrow: { map: ['....v..', 'vvvvvvv', '....v..'], palette: { v: '#a48df0' } },
  moon: { map: ['.mmm.', 'mm...', 'm....', 'mm...', '.mmm.'], palette: { m: '#ffe48a' } },
};
