import type { SourceKind, VisualState } from './agentEvent';
import type { DeskId, Facing, LoungeSpot, Tile } from './room';
import { DESK_IDS, LOUNGE_SPOTS, SPOTS, pathBetween, pathLength, sameTile, toScreen } from './room';

/**
 * The office (ADR-025 §3–§4): one member per session, a pure and deterministic state machine.
 * - A member walks in through the door to the lowest free desk and shows its own session's facts there.
 * - Only an idle member leaves its desk: to a free lounge spot, chosen with a seeded PRNG carried in the state.
 * - A member whose session is gone walks out through the door; its desk is free once it is outside.
 * - Conversations are staged only from real `session.message` facts (ADR-023).
 * Time comes from the caller.
 */

export interface MemberInput {
  readonly key: string;
  readonly kind: SourceKind;
  readonly ordinal: number;
  readonly visual: VisualState;
}

/** The fact that session `from` sent a message, to `to` or to someone unknown (ADR-023). Keys increase and are not negative. */
export interface ConversationInput {
  readonly key: number;
  readonly from: string;
  readonly to: string | null;
}

export interface OfficeInput {
  readonly now: number;
  /** Sessions present, in arrival order. Beyond the eight desks they wait, outside the state. */
  readonly members: readonly MemberInput[];
  /** Messages between sessions, newest first. */
  readonly conversations?: readonly ConversationInput[];
  readonly reducedMotion?: boolean;
}

export type MemberActivity =
  | 'work'
  | 'think'
  | 'wave'
  | 'upset'
  | 'cheer'
  | 'delegate'
  | 'idle-desk'
  | 'coffee'
  | 'water'
  | 'sofa'
  | 'window'
  | 'plant';

/** How long a conversation emote shows (ms). Staging timed by the engine clock, not a fact (ADR-023). */
export const CHAT_MS = { talk: 4_000, letter: 3_000 } as const;
/** How long a member cheers at its desk after a success (ms). */
export const CHEER_MS = 3_000;
/** How long a member stays idle at its desk before it walks to the lounge, so quick idle blips do not send it walking (ms). */
export const IDLE_SETTLE_MS = 1_500;
/** Tiles per second. */
export const WALK_SPEED = 1.8;

const LOUNGE_ACTIVITY: Readonly<Record<LoungeSpot, MemberActivity>> = {
  coffee: 'coffee',
  water: 'water',
  'sofa-1': 'sofa',
  'sofa-2': 'sofa',
  window: 'window',
  plant: 'plant',
};

interface Walk {
  /** Waypoints of the current walk; the last one is where the member ends up. */
  readonly path: readonly Tile[];
  readonly departAt: number;
  readonly arriveAt: number;
}

export interface MemberState extends Walk {
  readonly key: string;
  readonly kind: SourceKind;
  readonly ordinal: number;
  readonly visual: VisualState;
  /** Held from walking in until the member is out of the door, so nobody else sits there meanwhile. */
  readonly desk: DeskId;
  readonly phase: 'arriving' | 'present' | 'leaving';
  /** Where the member is going or is: its desk, a lounge spot, or outside. */
  readonly spot: DeskId | LoungeSpot | 'outside';
  /** Since when the session has been resting (idle, or done with a success); null while it has work. */
  readonly restSince: number | null;
  /** When the cheer for the session's latest success ends; null when there is no success. */
  readonly cheerUntil: number | null;
}

/** A conversation emote on show. `a`/`b` are member keys; a letter has no `b`. */
export interface Chat {
  readonly a: string;
  readonly b: string | null;
  readonly kind: 'talk' | 'letter';
  readonly until: number;
}

export interface OfficeState {
  /** Members in the office (walking in, at work, resting or walking out), in arrival order. */
  readonly members: readonly MemberState[];
  readonly chats: readonly Chat[];
  /** The newest conversation key handled; -Infinity until conversations first arrive (what came before is not replayed). */
  readonly lastConversation: number;
  /** Seeded PRNG state (mulberry32). */
  readonly rng: number;
}

export interface MemberView {
  readonly key: string;
  readonly kind: SourceKind;
  readonly ordinal: number;
  readonly visual: VisualState;
  readonly desk: DeskId;
  readonly phase: MemberState['phase'];
  readonly at: Tile;
  readonly walking: boolean;
  /** While talking and not walking, a member faces its partner. */
  readonly face: Facing;
  readonly activity: MemberActivity;
  readonly chat: Chat['kind'] | null;
  /** The little helper bot beside the desk while work is delegated. */
  readonly helper: boolean;
}

const UNSEEN = Number.NEGATIVE_INFINITY;

function random(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(next ^ (next >>> 15), next | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
}

/** An empty office. It takes the start time like every step does, though nothing in an empty office depends on it yet. */
export const initialOffice: (seed: number, now: number) => OfficeState = (seed) => ({
  members: [],
  chats: [],
  lastConversation: UNSEEN,
  rng: seed >>> 0,
});

/** Idle, or a success: the session has nothing to do. */
const resting = (visual: VisualState) => visual === 'idle' || visual === 'success';
const isLounge = (spot: MemberState['spot']): spot is LoungeSpot => (LOUNGE_SPOTS as readonly string[]).includes(spot);

function faceFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'front-right' : 'back-left';
  return dy >= 0 ? 'front-left' : 'back-right';
}

/** Which way to face to look at `to`, by the on-screen direction. */
function faceToward(from: Tile, to: Tile): Facing {
  const a = toScreen(from);
  const b = toScreen(to);
  if (b.y >= a.y) return b.x >= a.x ? 'front-right' : 'front-left';
  return b.x >= a.x ? 'back-right' : 'back-left';
}

/** Where a member is at `now`, whether it is walking and which way it faces. */
function positionAt(member: Walk & { readonly spot: MemberState['spot'] }, now: number): { at: Tile; walking: boolean; face: Facing } {
  const { path, departAt, arriveAt } = member;
  const end = path[path.length - 1] as Tile;
  if (now >= arriveAt || path.length < 2) return { at: end, walking: false, face: SPOTS[member.spot].face };
  let remaining = (Math.max(0, now - departAt) / (arriveAt - departAt)) * pathLength(path);
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1] as Tile;
    const b = path[i] as Tile;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length || i === path.length - 1) {
      const t = length === 0 ? 1 : Math.min(1, remaining / length);
      return { at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, walking: true, face: faceFor(b.x - a.x, b.y - a.y) };
    }
    remaining -= length;
  }
  return { at: end, walking: false, face: SPOTS[member.spot].face };
}

/** A walk from `from` to a spot; instant (and straight there) with reduced motion. */
function walkTo(from: Tile, spot: MemberState['spot'], now: number, reduced: boolean): Walk {
  const to = SPOTS[spot].at;
  if (reduced || sameTile(from, to)) return { path: [to], departAt: now, arriveAt: now };
  const path = pathBetween(from, to);
  return { path, departAt: now, arriveAt: now + (pathLength(path) / WALK_SPEED) * 1000 };
}

/** Sends a member to a spot from wherever it is now; already heading there, it keeps its walk. */
function sendTo(member: MemberState, spot: MemberState['spot'], now: number, reduced: boolean): MemberState {
  if (member.spot === spot) return member;
  return { ...member, spot, ...walkTo(positionAt(member, now).at, spot, now, reduced) };
}

/** With reduced motion nobody is seen mid-walk: a member still on its way is already there. */
function arrived(member: MemberState, now: number): MemberState {
  if (member.arriveAt <= now) return member;
  const cheerUntil = member.cheerUntil === null ? null : Math.min(member.cheerUntil, now + CHEER_MS);
  return { ...member, path: [member.path[member.path.length - 1] as Tile], departAt: now, arriveAt: now, cheerUntil };
}

/** The member's session facts as of this step: when it began resting, and when a new success's cheer ends. */
function withFacts(member: MemberState, input: MemberInput, now: number): MemberState {
  const { visual } = input;
  const restSince = resting(visual) ? (resting(member.visual) ? member.restSince : now) : null;
  let { cheerUntil } = member;
  if (visual !== 'success') cheerUntil = null;
  // A new success: cheered at the desk, once the member is there (one in the lounge walks back first).
  else if (member.visual !== 'success') cheerUntil = Math.max(now, member.spot === member.desk ? member.arriveAt : now) + CHEER_MS;
  return { ...member, kind: input.kind, ordinal: input.ordinal, visual, restSince, cheerUntil };
}

const cheering = (member: MemberState, now: number) => member.cheerUntil !== null && now < member.cheerUntil;

/** Where a present member belongs this step: its desk for any work, the lounge once it has rested a moment. */
function placed(member: MemberState, others: readonly MemberState[], now: number, reduced: boolean, rng: number): [MemberState, number] {
  const { desk } = member;
  if (isLounge(member.spot)) {
    if (resting(member.visual) && !cheering(member, now)) return [member, rng];
    const back = sendTo(member, desk, now, reduced);
    // A new success met in the lounge: the full cheer happens back at the desk.
    return [member.visual === 'success' ? { ...back, cheerUntil: back.arriveAt + CHEER_MS } : back, rng];
  }
  const settled = member.restSince !== null && now >= Math.max(member.restSince, member.arriveAt) + IDLE_SETTLE_MS;
  if (member.spot !== desk || !resting(member.visual) || cheering(member, now) || !settled) return [member, rng];
  const free = LOUNGE_SPOTS.filter((spot) => !others.some((o) => o.spot === spot));
  if (free.length === 0) return [member, rng];
  const [r, next] = random(rng);
  return [sendTo(member, free[Math.floor(r * free.length)] as LoungeSpot, now, reduced), next];
}

export function stepOffice(state: OfficeState, input: OfficeInput): OfficeState {
  const { now, reducedMotion: reduced = false } = input;
  const present = input.members.filter((m) => m.visual !== 'offline');
  const wanted = new Map(present.map((m) => [m.key, m]));
  let { rng } = state;

  // 1. Who is here: members stay, turn back or walk out; those outside are gone and their desks free.
  const members: MemberState[] = [];
  for (const current of state.members) {
    let member = reduced ? arrived(current, now) : current;
    const want = wanted.get(member.key);
    if (!want) {
      if (member.phase !== 'leaving') member = { ...sendTo(member, 'outside', now, reduced), phase: 'leaving' };
      if (now < member.arriveAt) members.push(member);
      continue;
    }
    // Back before it was out of the door: its desk is still its own.
    if (member.phase === 'leaving') member = { ...sendTo(member, member.desk, now, reduced), phase: 'arriving' };
    if (member.phase === 'arriving' && now >= member.arriveAt) member = { ...member, phase: 'present' };
    members.push(withFacts(member, want, now));
  }
  for (const want of present) {
    if (members.some((m) => m.key === want.key)) continue;
    const desk = DESK_IDS.find((d) => !members.some((m) => m.desk === d));
    if (!desk) break;
    const walk = walkTo(SPOTS.outside.at, desk, now, reduced);
    const newcomer: MemberState = {
      key: want.key,
      kind: want.kind,
      ordinal: want.ordinal,
      visual: want.visual,
      desk,
      phase: walk.arriveAt <= now ? 'present' : 'arriving',
      spot: desk,
      ...walk,
      restSince: resting(want.visual) ? now : null,
      cheerUntil: want.visual === 'success' ? walk.arriveAt + CHEER_MS : null,
    };
    members.push(newcomer);
  }

  // 2. Where each one belongs: at the desk for work, in the lounge once settled idle. In order, so spots are not shared.
  for (let i = 0; i < members.length; i += 1) {
    const member = members[i] as MemberState;
    if (member.phase !== 'present') continue;
    const [next, nextRng] = placed(member, members, now, reduced, rng);
    members[i] = next;
    rng = nextRng;
  }

  // 3. Conversations (ADR-023): no randomness, so they never change where anyone goes.
  const inOffice = (key: string) => members.some((m) => m.key === key && m.phase === 'present');
  const chats = state.chats.filter((c) => c.until > now && inOffice(c.a) && (c.b === null || inOffice(c.b)));
  let { lastConversation } = state;
  if (input.conversations) {
    if (lastConversation !== UNSEEN) {
      const fresh = input.conversations.filter((c) => c.key > lastConversation).sort((x, y) => x.key - y.key);
      for (const { from, to } of fresh) {
        if (to !== null && to !== from && inOffice(from) && inOffice(to)) chats.push({ a: from, b: to, kind: 'talk', until: now + CHAT_MS.talk });
        else if (inOffice(from)) chats.push({ a: from, b: null, kind: 'letter', until: now + CHAT_MS.letter });
      }
    }
    // The first list seen is history: only mark it handled (-1 so a first message keyed 0 still shows).
    lastConversation = input.conversations.reduce((max, c) => Math.max(max, c.key), Math.max(lastConversation, -1));
  }

  return { members, chats, lastConversation, rng };
}

function activityOf(member: MemberState, now: number): MemberActivity {
  if (member.phase === 'leaving') return 'idle-desk';
  if (isLounge(member.spot)) return LOUNGE_ACTIVITY[member.spot];
  switch (member.visual) {
    case 'thinking':
      return 'think';
    case 'coding':
    case 'browsing':
    case 'terminal':
    case 'file-work':
      return 'work';
    case 'waiting-approval':
      return 'wave';
    case 'error':
      return 'upset';
    case 'delegated':
      return 'delegate';
    case 'success':
      return cheering(member, now) ? 'cheer' : 'idle-desk';
    case 'idle':
    case 'offline':
      return 'idle-desk';
  }
}

/** The newest chat on show at `now` that `key` takes part in (a letter only over its sender). */
const chatOf = (state: OfficeState, key: string, now: number) =>
  state.chats.findLast((c) => c.until > now && (c.a === key || c.b === key)) ?? null;

/** The office as drawn at `now`, in arrival order. */
export function memberViewsAt(state: OfficeState, now: number): MemberView[] {
  return state.members.map((member) => {
    const { at, walking, face } = positionAt(member, now);
    const chat = chatOf(state, member.key, now);
    const partnerKey = chat?.kind === 'talk' ? (chat.a === member.key ? chat.b : chat.a) : null;
    const partner = state.members.find((m) => m.key === partnerKey);
    const activity = activityOf(member, now);
    return {
      key: member.key,
      kind: member.kind,
      ordinal: member.ordinal,
      visual: member.visual,
      desk: member.desk,
      phase: member.phase === 'arriving' && now >= member.arriveAt ? 'present' : member.phase,
      at,
      walking,
      face: partner && !walking ? faceToward(at, positionAt(partner, now).at) : face,
      activity,
      chat: chat?.kind ?? null,
      helper: activity === 'delegate',
    };
  });
}
