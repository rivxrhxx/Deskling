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

/** Fills only the transparent pixels of `base` from `patch`: limbs that pass behind the head. */
export function underlay(base: PixelMap, patch: PixelMap): string[] {
  return base.map((row, y) => {
    const under = patch[y] ?? '';
    return Array.from(row, (pixel, x) => (pixel === '.' && under[x] && under[x] !== '.' ? under[x] : pixel)).join('');
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

/**
 * Session friends (ADR-022): each Claude Code session is a Claude friend, each Codex session a Codex friend.
 * Original characters (no marks, logos or mascots) with Hermes' 12×16 build, outline and face.
 * The kinds differ by silhouette first, colour mood second:
 * - Claude: knit beanie with a pom-pom, auburn bob, open terracotta hoodie over a cream tee, brown trousers.
 * - Codex: black hood up with headphones over it, light grey fringe, white drawstrings, grey joggers.
 * Keys: o s e p m as Hermes; h hair; n/N pom-pom; j/J garment and its second tone; i tee or drawstrings;
 * d trousers; f shoes; A/a the session accent — Claude's whole beanie, Codex's headphones.
 */
export type GuestKind = 'claude' | 'codex';

/** Pose suffixes of a guest sheet: sprite names are `${kind}-${pose}`. */
export const GUEST_POSES = [
  'front',
  'back',
  'walk-a',
  'walk-b',
  'back-walk-a',
  'back-walk-b',
  'sit-front',
  'sit-front-type',
  'sit-think',
  'wave',
  'arms-up',
  'hands-on-head',
] as const;
export type GuestPose = (typeof GUEST_POSES)[number];

interface GuestLook {
  /** Rows 0–7 facing the viewer, and from behind. */
  readonly head: readonly string[];
  readonly headBack: readonly string[];
  /** Rows 8–12 without arms (arms are patches), facing the viewer and from behind. */
  readonly torso: readonly string[];
  readonly torsoBack: readonly string[];
  /** Face rows for thinking, upset, calling out and cheering. */
  readonly think: Readonly<Record<number, string>>;
  /** The viewer's-right arm raised to the chin (the jaw sits differently under a bob and a hood). */
  readonly thinkHand: Readonly<Record<number, string>>;
  readonly upset: Readonly<Record<number, string>>;
  readonly call: Readonly<Record<number, string>>;
  readonly cheer: Readonly<Record<number, string>>;
}

const CLAUDE_LOOK: GuestLook = {
  head: [
    '....onNo....',
    '..ooAAAAoo..',
    '.oAaAaAaAao.',
    '.oaaaaaaaao.',
    '.ohhhhhssho.',
    '.ohesssseho.',
    '.ohpsmmspho.',
    '..ohssssho..',
  ],
  headBack: [
    '....onNo....',
    '..ooAAAAoo..',
    '.oAaAaAaAao.',
    '.oaaaaaaaao.',
    '.ohhhhhhhho.',
    '.ohhhhhhhho.',
    '.ohhhhhhhho.',
    '..ohhhhhho..',
  ],
  torso: ['..ojjiijjo..', '..ojjiijjo..', '..ojjiijjo..', '..ojjiijjo..', '..oJJJJJJo..'],
  torsoBack: ['..oJJJJJJo..', '..ojjjjjjo..', '..ojjjjjjo..', '..ojjjjjjo..', '..oJJJJJJo..'],
  think: { 6: '.ohpssmspho.' },
  thinkHand: { 7: '........ss..', 8: '.........J..', 9: '.........J..', 10: '.........Jj.', 11: '..........j.' },
  upset: { 5: '.ohoossooho.', 6: '.ohpseespho.' },
  call: { 7: '..ohsmmsho..' },
  cheer: { 6: '.ohpmmmmpho.', 7: '..ohsmmsho..' },
};

const CODEX_LOOK: GuestLook = {
  head: [
    '...oooooo...',
    '..oAAAAAAo..',
    '.oAjjjjjjAo.',
    'oAjhhhhhhjAo',
    'AjhsssssshjA',
    'AjsessssesjA',
    'ajpssmmsspja',
    '.jossssssoj.',
  ],
  headBack: [
    '...oooooo...',
    '..oAAAAAAo..',
    '.oAjjjjjjAo.',
    'oAjJJjjjjjAo',
    'AjJjjjjjjjjA',
    'AjjjjjjjjjjA',
    'ajjjjjjjjjja',
    '.ojjjjjjjjo.',
  ],
  torso: ['.ojjijjijjo.', '..ojijjijo..', '..ojjjjjjo..', '..ojJJJJjo..', '..oJJJJJJo..'],
  torsoBack: ['.ojjjjjjjjo.', '..ojjjjjjo..', '..ojjjjjjo..', '..ojjjjjjo..', '..oJJJJJJo..'],
  think: { 6: 'ajpsssmsspja' },
  thinkHand: { 7: '.........ss.', 8: '..........J.', 9: '..........J.', 10: '..........J.', 11: '..........j.' },
  upset: { 5: 'AjsoossoosjA', 6: 'ajpsseesspja' },
  call: { 7: '.jossmmssoj.' },
  cheer: { 6: 'ajpsmmmmspja', 7: '.jossmmssoj.' },
};

const GUEST_LEGS = ['..oddooddo..', '...od..do...', '..off..ffo..'];
const GUEST_LEGS_WALK_A = ['..oddo.oddo.', '..od....do..', '.off....ffo.'];
const GUEST_LEGS_WALK_B = ['..oddooddo..', '....oddo....', '...offffo...'];
/** Cross-legged on a floor cushion. */
const GUEST_LEGS_SIT = ['.oddddddddo.', 'oddffddffddo', '.oooooooooo.'];

const GUEST_ARMS = patch({ 10: '.j........j.', 11: '.j........j.', 12: '.s........s.' });
/** Seated, hands resting in the lap (a laptop is drawn in front). */
const GUEST_ARMS_LAP = patch({ 10: '.j........j.', 11: '.jj......jj.', 12: '...s....s...' });
/** Seated, hands lifted forward onto the keys; alternates with the lap frame. */
const GUEST_ARMS_TYPE = patch({ 10: '.j........j.', 11: 'j..........j', 12: '.jjs....sjj.' });
/** Seated, the viewer's-left hand in the lap (the other one is the look's `thinkHand`). */
const GUEST_ARMS_THINK = patch({ 10: '.j..........', 11: '.jj.........', 12: '...s........' });
/** Raised arms are underlaid: they pass behind the head, so headphones stay in front. */
const GUEST_ARM_RAISED_RIGHT = patch({ 1: '...........s', 2: '...........s', 3: '...........j', 4: '...........j', 5: '...........j', 6: '...........j', 7: '...........j', 8: '..........j.' });
const GUEST_ARM_DOWN_LEFT = patch({ 10: '.j..........', 11: '.j..........', 12: '.s..........' });
const GUEST_ARMS_UP = patch({ 0: 's..........s', 1: 's..........s', 2: 'j..........j', 3: 'j..........j', 4: 'j..........j', 5: 'j..........j', 6: 'j..........j', 7: '.j........j.', 8: '.j........j.' });
/** Hands clutching the top of the head (in front), elbows out (behind). */
const GUEST_HANDS_ON_HEAD = patch({ 1: '..s......s..', 2: '.s........s.' });
const GUEST_ELBOWS_OUT = patch({ 3: 'j..........j', 4: 'j..........j', 5: 'j..........j', 6: 'j..........j', 7: '.j........j.', 8: '.j........j.' });

const faced = (head: readonly string[], rows: Readonly<Record<number, string>>) => head.map((row, y) => rows[y] ?? row);

function guestSheet(prefix: GuestKind, look: GuestLook): Record<string, PixelMap> {
  const front = (face: readonly string[], legs: readonly string[]) => [...face, ...look.torso, ...legs];
  const back = (legs: readonly string[]) => [...look.headBack, ...look.torsoBack, ...legs];
  const poses: Record<GuestPose, PixelMap> = {
    front: overlay(front(look.head, GUEST_LEGS), GUEST_ARMS),
    back: overlay(back(GUEST_LEGS), GUEST_ARMS),
    'walk-a': overlay(front(look.head, GUEST_LEGS_WALK_A), GUEST_ARMS),
    'walk-b': overlay(front(look.head, GUEST_LEGS_WALK_B), GUEST_ARMS),
    'back-walk-a': overlay(back(GUEST_LEGS_WALK_A), GUEST_ARMS),
    'back-walk-b': overlay(back(GUEST_LEGS_WALK_B), GUEST_ARMS),
    'sit-front': overlay(front(look.head, GUEST_LEGS_SIT), GUEST_ARMS_LAP),
    'sit-front-type': overlay(front(look.head, GUEST_LEGS_SIT), GUEST_ARMS_TYPE),
    'sit-think': overlay(overlay(front(faced(look.head, look.think), GUEST_LEGS_SIT), GUEST_ARMS_THINK), patch(look.thinkHand)),
    wave: overlay(underlay(front(faced(look.head, look.call), GUEST_LEGS), GUEST_ARM_RAISED_RIGHT), GUEST_ARM_DOWN_LEFT),
    'arms-up': underlay(front(faced(look.head, look.cheer), GUEST_LEGS), GUEST_ARMS_UP),
    // Seated at the laptop, facing the viewer.
    'hands-on-head': underlay(overlay(front(faced(look.head, look.upset), GUEST_LEGS_SIT), GUEST_HANDS_ON_HEAD), GUEST_ELBOWS_OUT),
  };
  return Object.fromEntries(Object.entries(poses).map(([pose, map]) => [`${prefix}-${pose}`, map]));
}

/** Outline, skin, eyes, cheeks and mouth exactly as Hermes', so the friends belong to the same room. */
const GUEST_FACE: Palette = Object.fromEntries(Object.entries(HERMES_PALETTE).filter(([key]) => 'osepm'.includes(key)));
const claudePalette = (accent: string, shade: string): Palette => ({
  ...GUEST_FACE,
  h: '#9c4a2c', // auburn hair
  n: '#f6e6c4', // oat pom-pom
  N: '#dcc59a',
  j: '#d97757', // terracotta hoodie
  J: '#b45a3e',
  i: '#fff6e6', // cream tee
  d: '#5e4438', // brown trousers
  f: '#f6e6c4', // oat sneakers
  A: accent,
  a: shade,
});
const codexPalette = (accent: string, shade: string): Palette => ({
  ...GUEST_FACE,
  h: '#d5d8de', // light grey fringe
  j: '#2a2c33', // black hoodie
  J: '#464a55',
  i: '#f4f4f1', // white trim and drawstrings
  d: '#5b5e68', // grey joggers
  f: '#f4f4f1', // white sneakers
  A: accent,
  a: shade,
});

/**
 * Accent per session ordinal (ADR-022 "Claude 1", "Claude 2" …): only `A`/`a` change, in the same hue order
 * for both kinds — 1 yellow, 2 green, 3 blue, 4 pink. Use `guestPalette` to pick one.
 */
export const GUEST_PALETTES: Readonly<Record<GuestKind, readonly Palette[]>> = {
  claude: [
    claudePalette('#f2b33d', '#c98a1c'),
    claudePalette('#3fae8f', '#2a8068'),
    claudePalette('#5b8de8', '#3d68bd'),
    claudePalette('#d6559a', '#a83a74'),
  ],
  codex: [
    codexPalette('#ffd23f', '#d1a516'),
    codexPalette('#7ee06a', '#4fb23e'),
    codexPalette('#3fc8f0', '#1f97bd'),
    codexPalette('#ff5fb8', '#d03a8c'),
  ],
};

/** The palette of the n-th session friend of a kind (n ≥ 1): accents repeat every four. */
export function guestPalette(kind: GuestKind, ordinal: number): Palette {
  const palettes = GUEST_PALETTES[kind];
  const index = (((Math.trunc(ordinal) - 1) % palettes.length) + palettes.length) % palettes.length;
  return palettes[index] ?? (palettes[0] as Palette);
}

export const GUEST_SPRITES: Readonly<Record<string, PixelMap>> = {
  ...guestSheet('claude', CLAUDE_LOOK),
  ...guestSheet('codex', CODEX_LOOK),
};

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
  ...GUEST_SPRITES,
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
  /** Two sessions talking (ADR-023): a speech bubble with three dots — never letters or content. */
  talk: {
    map: ['.bbbbbbb.', 'bwwwwwwwb', 'bwkwkwkwb', 'bwwwwwwwb', '.bbbbbbb.', '..bw.....', '..b......'],
    palette: { b: '#3b2a20', w: '#ffffff', k: '#5b6fd6' },
  },
  /** A message sent to someone not in the room (ADR-023): a sealed envelope. */
  letter: {
    map: ['bbbbbbbbb', 'bLwwwwwLb', 'bwLwwwLwb', 'bwwLwLwwb', 'bwwwrwwwb', 'bbbbbbbbb'],
    palette: { b: '#3b2a20', w: '#fff7ea', L: '#c9b48a', r: '#e8505b' },
  },
};
