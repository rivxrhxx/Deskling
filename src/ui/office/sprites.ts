import type { Palette, PixelMap } from './pixelMap';
import { textMap } from './pixelText';

/**
 * Original pixel sprites for the office (ADR-019, ADR-025): the members' three looks, the helper bot and the emotes.
 * Members are 12×16 pixels; the scene draws them at 2.25×.
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

/** Outline, skin, eyes, cheeks and mouth: the same in every look, so everyone belongs to the same office. */
const FACE: Palette = {
  o: '#3b2a20', // outline
  s: '#ffe0c7', // skin
  e: '#2b1d16', // eyes
  p: '#ff9db0', // cheeks
  m: '#c0605a', // mouth
};

/**
 * Office members (ADR-025 §1): one per session, drawn in its kind's look.
 * Original characters (no marks, logos or mascots), all with the same 12×16 build, outline and face.
 * The kinds differ by silhouette first, colour mood second:
 * - Claude: knit beanie with a pom-pom, auburn bob, open terracotta hoodie over a cream tee, brown trousers.
 * - Codex: black hood up with headphones over it, light grey fringe, white drawstrings, grey joggers.
 * - Agent (ADR-025, every other session kind): bare head of short dark hair with a cowlick, round slate glasses,
 *   open mint cardigan over a white shirt with an office lanyard and badge, dark trousers, brown shoes.
 * Keys: o s e p m the shared face; h hair; n/N pom-pom; g glasses; j/J garment and its second tone; i tee, shirt or
 * drawstrings; d trousers; f shoes; u/U/k a coffee mug and its coffee; A/a the session accent — Claude's whole
 * beanie, Codex's headphones, the agent's lanyard and badge.
 */
export type GuestKind = 'claude' | 'codex' | 'agent';

/** Every look, in sheet order. */
export const GUEST_LOOKS: readonly GuestKind[] = ['claude', 'codex', 'agent'];

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
  // The office (ADR-025): desks seen from behind and from the front, the coffee corner and the lounge sofa.
  'sit-desk',
  'sit-desk-type',
  'sit-desk-front',
  'sit-desk-front-type',
  'sit-desk-think',
  'sit-desk-back-think',
  'hold-mug',
  'sit-sofa',
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

/** No hat: a round head of short hair with a cowlick (mirrored from behind), arched round lenses over the eyes. */
const AGENT_LOOK: GuestLook = {
  head: [
    '......oo....',
    '...ooohoo...',
    '..ohhhhhho..',
    '.ohhhhhhhho.',
    '.ohgssssgho.',
    '.ogegssgego.',
    '.opssmmsspo.',
    '..osssssso..',
  ],
  headBack: [
    '....oo......',
    '...oohooo...',
    '..ohhhhhho..',
    '.ohhhhhhhho.',
    '.ohhhhhhhho.',
    '.ghhhhhhhhg.',
    '..ohhhhhho..',
    '...osssso...',
  ],
  // Lanyard from the collar to a badge on the shirt; from behind, the cord round the neck.
  torso: ['..ojAiiAjo..', '..ojjAAjjo..', '..ojjaajjo..', '..ojjiijjo..', '..oJJiiJJo..'],
  torsoBack: ['..ojAAAAjo..', '..ojjjjjjo..', '..ojjjjjjo..', '..ojjjjjjo..', '..oJJJJJJo..'],
  think: { 6: '.opsssmsspo.' },
  thinkHand: { 7: '........ss..', 8: '.........J..', 9: '.........J..', 10: '.........Jj.', 11: '..........j.' },
  upset: { 4: '.ohgossogho.', 6: '.opsseesspo.' },
  call: { 6: '.opsssssspo.', 7: '..ossmmsso..' },
  cheer: { 6: '.opsmmmmspo.', 7: '..ossmmsso..' },
};

const GUEST_LEGS =['..oddooddo..', '...od..do...', '..off..ffo..'];
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

/** On an office chair facing the viewer: lap, shins, shoes. Kept plain — the desk front is drawn over rows 11–15. */
const GUEST_LEGS_CHAIR = ['.oddddddddo.', '..od....do..', '.off....ffo.'];
/** On an office chair seen from behind: only the seat of the trousers; the chair and the desk hide the rest. */
const GUEST_SEAT_BACK = ['..oddddddo..', BLANK, BLANK];
/** Sunk into a sofa: knees apart, feet on the floor. */
const GUEST_LEGS_SOFA = ['.oddddddddo.', '.od......do.', '.ff......ff.'];

/** At a desk facing the viewer: forearms forward, both hands on the keys at row 10, just above the desk edge. */
const GUEST_ARMS_DESK = patch({ 9: '.j........j.', 10: '.jjs....sjj.' });
/** Typing frame: the viewer's-left hand lifts off the keys, the right one reaches in. */
const GUEST_ARMS_DESK_TYPE = patch({ 9: '.jjs......j.', 10: '.j.....sjjj.' });
/** Thinking at the desk: the viewer's-left hand stays on the keys (the other one is the look's `thinkHand`). */
const GUEST_ARMS_DESK_THINK = patch({ 9: '.j..........', 10: '.jjs........' });
/** At a desk seen from behind: the upper arms hang, the forearms curl forward round the body to the keys. */
const GUEST_ARMS_DESK_BACK = patch({ 9: '.j........j.', 10: '.j........j.', 11: '.jj......jj.' });
/** Typing from behind: the left forearm lifts off the keys a row while the right one stays down. */
const GUEST_ARMS_DESK_BACK_TYPE = patch({ 9: '.j........j.', 10: '.jj.......j.', 11: '.........jj.' });
/** From behind, a hand on the back of the head, its elbow out; the left arm stays at the desk. */
const GUEST_ARMS_HEAD_BACK = patch({
  3: '........ss..',
  4: '..........j.',
  5: '...........j',
  6: '...........j',
  7: '...........j',
  8: '..........j.',
  9: '.j..........',
  10: '.j..........',
  11: '.jj.........',
});
/** A mug of coffee at chest height: the left hand under it, the right one on the handle. */
const GUEST_HOLD_MUG = patch({ 9: '.j..okkoo.j.', 10: '.jjsuuUuosj.', 11: '....oooo....' });
/** Lounging: the viewer's-left arm along the sofa back, the other hand resting on the tummy. */
const GUEST_ARMS_SOFA = patch({ 8: 'sjj.........', 9: '..........j.', 10: '..........j.', 11: '........sjj.' });

const faced =(head: readonly string[], rows: Readonly<Record<number, string>>) => head.map((row, y) => rows[y] ?? row);

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
    // The office (ADR-025).
    'sit-desk': overlay(back(GUEST_SEAT_BACK), GUEST_ARMS_DESK_BACK),
    'sit-desk-type': overlay(back(GUEST_SEAT_BACK), GUEST_ARMS_DESK_BACK_TYPE),
    'sit-desk-front': overlay(front(look.head, GUEST_LEGS_CHAIR), GUEST_ARMS_DESK),
    'sit-desk-front-type': overlay(front(look.head, GUEST_LEGS_CHAIR), GUEST_ARMS_DESK_TYPE),
    'sit-desk-think': overlay(overlay(front(faced(look.head, look.think), GUEST_LEGS_CHAIR), GUEST_ARMS_DESK_THINK), patch(look.thinkHand)),
    'sit-desk-back-think': overlay(back(GUEST_SEAT_BACK), GUEST_ARMS_HEAD_BACK),
    'hold-mug': overlay(front(look.head, GUEST_LEGS), GUEST_HOLD_MUG),
    'sit-sofa': overlay(front(look.head, GUEST_LEGS_SOFA), GUEST_ARMS_SOFA),
  };
  return Object.fromEntries(Object.entries(poses).map(([pose, map]) => [`${prefix}-${pose}`, map]));
}

/** The office mug (`hold-mug`): the same white mug of coffee in every hand. */
const GUEST_MUG: Palette = { u: '#fffaf2', U: '#d8deee', k: '#7a4a2a' };
const claudePalette = (accent: string, shade: string): Palette => ({
  ...FACE,
  ...GUEST_MUG,
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
  ...FACE,
  ...GUEST_MUG,
  h: '#d5d8de', // light grey fringe
  j: '#2a2c33', // black hoodie
  J: '#464a55',
  i: '#f4f4f1', // white trim and drawstrings
  d: '#5b5e68', // grey joggers
  f: '#f4f4f1', // white sneakers
  A: accent,
  a: shade,
});
const agentPalette = (accent: string, shade: string): Palette => ({
  ...FACE,
  ...GUEST_MUG,
  h: '#3d2b2a', // short dark hair
  g: '#6b7686', // slate glasses
  j: '#8fd6b6', // mint cardigan
  J: '#5fb393',
  i: '#fdfbf6', // white shirt
  d: '#3c4256', // dark trousers
  f: '#6b4636', // brown shoes
  A: accent, // lanyard
  a: shade, // badge
});

/**
 * Accent per session ordinal (ADR-022 "Claude 1", "Claude 2" …): only `A`/`a` change, in the same hue order
 * for every look — 1 yellow, 2 green, 3 blue, 4 pink. Use `guestPalette` to pick one.
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
  agent: [
    agentPalette('#f5c242', '#c99a1c'),
    agentPalette('#4fb84a', '#35873a'),
    agentPalette('#4f7fe0', '#3559b0'),
    agentPalette('#e5559c', '#b23a76'),
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
  ...guestSheet('agent', AGENT_LOOK),
};

/**
 * The delegation helper (ADR-025): a small original robot that stands beside a desk while its session delegates.
 * A rounded white shell, a cyan visor with two eyes and a tiny antenna; frame b blinks the antenna and lifts an arm.
 */
export const HELPER_BOT: { readonly palette: Palette; readonly frames: Readonly<Record<'helper-bot-a' | 'helper-bot-b', PixelMap>> } = {
  palette: {
    o: '#3b2a20', // outline, as the rest of the room
    w: '#f4f6f8', // shell
    W: '#c9d2dc', // shell shade
    v: '#4fd1e3', // visor
    e: '#1d4b5a', // eyes
    c: '#8ff0ff', // antenna light
  },
  frames: {
    'helper-bot-a': [
      '.....c....',
      '.....o....',
      '..oooooo..',
      '.owwwwwwo.',
      '.ovvvvvvo.',
      '.ovevvevo.',
      '.owwwwwWo.',
      '..owwwWo..',
      '.wowwwWow.',
      '..oo..oo..',
    ],
    'helper-bot-b': [
      '.....o....',
      '.....o....',
      '..oooooo..',
      '.owwwwwwo.',
      '.ovvvvvvo.',
      '.ovvevveo.',
      '.owwwwwWo.',
      '..owwwWow.',
      '.wowwwWo..',
      '..oo..oo..',
    ],
  },
};

/** Every member sprite, by name: `${look}-${pose}`. */
export const SPRITES: Readonly<Record<string, PixelMap>> = GUEST_SPRITES;

export interface Emote {
  readonly map: PixelMap;
  readonly palette: Palette;
  /** Scene units per pixel; 2 when not given. */
  readonly scale?: number;
  /** The colour of the one-pixel rim round the sign; white when not given. */
  readonly rim?: string;
}

/** Little pixel signs above a head. Shapes, not text. */
export const EMOTES: Readonly<Record<string, Emote>> = {
  vein: { map: ['.a....a.', 'aa....aa', '........', '........', 'aa....aa', '.a....a.'], palette: { a: '#ff5c7a' } },
  sweat: { map: ['..d.', '.dd.', 'dDdd', 'dddd', '.dd.'], palette: { d: '#8fd3ff', D: '#ffffff' } },
  'exclaim-amber': { map: ['.xx.', '.xx.', '.xx.', '.xx.', '....', '.xx.'], palette: { x: '#f4b04a' } },
  'exclaim-ember': { map: ['.xx.', '.xx.', '.xx.', '.xx.', '....', '.xx.'], palette: { x: '#ff6a3d' } },
  dots: { map: ['ii.ii.ii', 'ii.ii.ii'], palette: { i: '#a48df0' } },
  sparkle: { map: ['..y..', '..y..', 'yyYyy', '..y..', '..y..'], palette: { y: '#f2d27a', Y: '#ffffff' } },
  steam: { map: ['..ss.ss.', '.sssssss', 'ssssssss', '.ssssss.'], palette: { s: '#e8ecf8' } },
  battery: { map: ['kkkkkkk.', 'kq....kk', 'kq....kk', 'kkkkkkk.'], palette: { k: '#3b2a20', q: '#ff5c5c' } },
  code: {
    map: ['..c..cc..', '.c...c.c.', 'c...c...c', '.c.c...c.', '..cc..c..'],
    palette: { c: '#6cc7f2' },
  },
  globe: { map: ['..ggg..', '.gGgGg.', 'gGGgGGg', 'ggggggg', 'gGGgGGg', '.gGgGg.', '..ggg..'], palette: { g: '#6cc7f2', G: '#a8e0f8' } },
  prompt: { map: ['p......', '.p.....', '..p....', '.p.....', 'p..pppp'], palette: { p: '#72e3bd' } },
  folder: { map: ['fff....', 'fFFffff', 'fFFFFFf', 'fFFFFFf', 'fffffff'], palette: { f: '#6a7bb8', F: '#a9b6e6' } },
  arrow: { map: ['....v..', 'vvvvvvv', '....v..'], palette: { v: '#a48df0' } },
  /** Two sessions talking (ADR-023): a speech bubble with three dots — never letters or content. */
  talk: {
    map: ['.bbbbbbb.', 'bwwwwwwwb', 'bwkwkwkwb', 'bwwwwwwwb', '.bbbbbbb.', '..bw.....', '..b......'],
    palette: { b: '#3b2a20', w: '#ffffff', k: '#5b6fd6' },
  },
  /** A coffee break (ADR-025): a mug with two curls of steam. */
  coffee: {
    map: ['.w..w...', '..w..w..', '.w..w...', 'kkkkkk..', 'kuUuukkk', 'kuUuuk.k', 'kuUuukkk', '.kkkk...'],
    palette: { k: '#3b2a20', u: '#fff7ea', U: '#e8505b', w: '#e8ecf8' },
  },
  /** A member's level has just risen (ADR-028 §4): gold pixel letters, the only words over a head. */
  'level-up': { map: textMap('LEVEL UP!', 'y'), palette: { y: '#ffd23f' }, scale: 1.5, rim: '#7a3d0a' },
  /** A message sent to someone not in the room (ADR-023): a sealed envelope. */
  letter: {
    map: ['bbbbbbbbb', 'bLwwwwwLb', 'bwLwwwLwb', 'bwwLwLwwb', 'bwwwrwwwb', 'bbbbbbbbb'],
    palette: { b: '#3b2a20', w: '#fff7ea', L: '#c9b48a', r: '#e8505b' },
  },
};
