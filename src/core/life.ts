import type { VisualState } from './agentEvent';
import type { EnergyLevel } from './mood';
import type { Facing, GuestSeat, SpotId, Tile } from './room';
import { GUEST_SEATS, SPOTS, pathBetween, pathLength, sameTile, toScreen } from './room';

/**
 * Hermes' life in the mini room (ADR-020). A pure, deterministic state machine.
 * - Agent facts decide a required behaviour (desk work, waving for approval, sleeping offline).
 * - Only while the agent is idle does Hermes live its own life (shower, eat, TV, friends…),
 *   and it never uses the computer then: idle life must not look like work.
 * Randomness comes from a seeded PRNG carried in the state; time comes from the caller.
 */

export type RequiredActivity =
  | 'sleep'
  | 'ponder'
  | 'type-code'
  | 'browse'
  | 'type-terminal'
  | 'handle-files'
  | 'call-user'
  | 'delegate'
  | 'celebrate'
  | 'frustrated';

export const IDLE_ACTIVITIES = [
  'shower',
  'eat',
  'watch-tv',
  'read',
  'look-outside',
  'stretch',
  'water-plant',
  'nap',
  'fridge',
  'host-friend',
] as const;
export type IdleActivity = (typeof IDLE_ACTIVITIES)[number];
export type Activity = RequiredActivity | IdleActivity;

export const REQUIRED: Readonly<Record<VisualState, { activity: RequiredActivity; spot: SpotId } | null>> = {
  offline: { activity: 'sleep', spot: 'bed' },
  idle: null,
  thinking: { activity: 'ponder', spot: 'desk' },
  coding: { activity: 'type-code', spot: 'desk' },
  browsing: { activity: 'browse', spot: 'desk' },
  terminal: { activity: 'type-terminal', spot: 'desk' },
  'file-work': { activity: 'handle-files', spot: 'desk' },
  'waiting-approval': { activity: 'call-user', spot: 'front' },
  delegated: { activity: 'delegate', spot: 'desk' },
  success: { activity: 'celebrate', spot: 'celebrate' },
  error: { activity: 'frustrated', spot: 'desk' },
};

export const IDLE_SPOT: Readonly<Record<IdleActivity, SpotId>> = {
  shower: 'shower',
  eat: 'table',
  'watch-tv': 'sofa',
  read: 'bookshelf',
  'look-outside': 'window',
  stretch: 'stretch',
  'water-plant': 'plant',
  nap: 'bed',
  fridge: 'fridge',
  'host-friend': 'sofa',
};

/** How long each idle activity lasts once Hermes has arrived (ms). */
export const IDLE_DURATION: Readonly<Record<IdleActivity, number>> = {
  shower: 9_000,
  eat: 7_000,
  'watch-tv': 10_000,
  read: 8_000,
  'look-outside': 6_000,
  stretch: 4_000,
  'water-plant': 5_000,
  nap: 10_000,
  fridge: 4_000,
  'host-friend': 14_000,
};

const BASE_WEIGHT: Readonly<Record<IdleActivity, number>> = {
  shower: 2,
  eat: 2,
  'watch-tv': 3,
  read: 2,
  'look-outside': 2,
  stretch: 1,
  'water-plant': 1,
  nap: 1,
  fridge: 1,
  'host-friend': 2,
};

/** Tired Hermes naps and snacks more (ADR-020 §5). */
const TIRED_BOOST: Partial<Record<IdleActivity, number>> = { nap: 5, eat: 2, fridge: 2 };

export function walkSpeed(energy: EnergyLevel): number {
  if (energy === 'empty') return 0.9;
  if (energy === 'low') return 1.2;
  return 1.8;
}

export interface ActorState {
  readonly activity: Activity | 'visit' | 'help' | 'leave';
  readonly spot: SpotId;
  /** Waypoints of the current walk; the last one is where the actor ends up. */
  readonly path: readonly Tile[];
  readonly departAt: number;
  readonly arriveAt: number;
}

export interface HermesState extends ActorState {
  readonly activity: Activity;
}

export interface FriendState extends ActorState {
  readonly activity: 'visit' | 'help' | 'leave';
  readonly role: 'guest' | 'helper';
  /** Which friend is visiting (sprite variant). */
  readonly look: number;
}

export type GuestKind = 'claude-code' | 'codex';

/** A session friend present in the room (ADR-022) and the visual state of its own session. */
export interface GuestInput {
  readonly key: string;
  readonly kind: GuestKind;
  readonly ordinal: number;
  readonly visual: VisualState;
}

/** The fact that session `from` sent a message, to `to` or to someone unknown (ADR-023). Keys increase and are not negative. */
export interface ConversationInput {
  readonly key: number;
  readonly from: string;
  readonly to: string | null;
}

/** A session friend: walks in to its seat, shows its session's state there, walks out when the session is gone. */
export interface GuestActor extends ActorState {
  readonly activity: 'visit' | 'leave';
  readonly key: string;
  readonly kind: GuestKind;
  readonly ordinal: number;
  readonly visual: VisualState;
  /** Held until the friend has walked out, so nobody else sits there meanwhile. */
  readonly seat: GuestSeat;
  readonly phase: 'arriving' | 'seated' | 'leaving';
}

/** A conversation emote on show. `a`/`b` are session keys (Hermes is addressed by the resident key); a letter has no `b`. */
export interface Chat {
  readonly a: string;
  readonly b: string | null;
  readonly kind: 'talk' | 'letter';
  readonly until: number;
}

export interface LifeState {
  readonly hermes: HermesState;
  readonly friend: FriendState | null;
  readonly friendLeaveAt: number | null;
  /** When the current idle activity ends; null while a required behaviour runs. */
  readonly until: number | null;
  /** Seeded PRNG state (mulberry32). */
  readonly rng: number;
  /** Session friends in the room, in arrival order. */
  readonly guests: readonly GuestActor[];
  readonly chats: readonly Chat[];
  /** The newest conversation key handled; -Infinity until conversations first arrive (what came before is not replayed). */
  readonly lastConversation: number;
}

export interface LifeInput {
  readonly now: number;
  readonly visual: VisualState;
  readonly energy: EnergyLevel;
  /** A one-off "친구 초대" from the user. */
  readonly invite?: boolean;
  readonly reducedMotion?: boolean;
  /** Session friends present, in arrival order. Beyond the seats they wait, outside the state. */
  readonly guests?: readonly GuestInput[];
  /** Messages between sessions, newest first. */
  readonly conversations?: readonly ConversationInput[];
  /** The session that drives Hermes. */
  readonly residentKey?: string | null;
}

export const FRIEND_LOOKS = 2;
const VISIT_MS = IDLE_DURATION['host-friend'];
const GUEST_SPEED = 1.8;
/** How long a conversation emote shows (ms). Staging timed by the engine clock, not a fact (ADR-023). */
export const CHAT_MS = { talk: 4_000, letter: 3_000 } as const;
const UNSEEN = Number.NEGATIVE_INFINITY;

function random(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(next ^ (next >>> 15), next | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, next];
}

export function initialLife(seed: number, now: number): LifeState {
  const at = SPOTS.bed.at;
  return {
    hermes: { activity: 'sleep', spot: 'bed', path: [at], departAt: now, arriveAt: now },
    friend: null,
    friendLeaveAt: null,
    until: null,
    rng: seed >>> 0,
    guests: [],
    chats: [],
    lastConversation: UNSEEN,
  };
}

function faceFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'front-right' : 'back-left';
  return dy >= 0 ? 'front-left' : 'back-right';
}

/** The walk under way at `now`: the index of the waypoint being walked to and the point reached; null when not walking. */
function progress(actor: ActorState, now: number): { next: number; at: Tile } | null {
  if (now >= actor.arriveAt || actor.path.length < 2) return null;
  const total = pathLength(actor.path);
  let remaining = (Math.max(0, now - actor.departAt) / (actor.arriveAt - actor.departAt)) * total;
  for (let i = 1; i < actor.path.length; i += 1) {
    const a = actor.path[i - 1] as Tile;
    const b = actor.path[i] as Tile;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length || i === actor.path.length - 1) {
      const t = length === 0 ? 1 : Math.min(1, remaining / length);
      return { next: i, at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } };
    }
    remaining -= length;
  }
  return null;
}

/** Where an actor is at `now`, whether it is walking and which way it faces. */
export function positionAt(actor: ActorState, now: number): { at: Tile; walking: boolean; face: Facing } {
  const walk = progress(actor, now);
  if (!walk) return { at: actor.path[actor.path.length - 1] as Tile, walking: false, face: SPOTS[actor.spot].face };
  const a = actor.path[walk.next - 1] as Tile;
  const b = actor.path[walk.next] as Tile;
  return { at: walk.at, walking: true, face: faceFor(b.x - a.x, b.y - a.y) };
}

/** The waypoints an actor has already passed on its current walk, ending where it is at `now`. */
function walked(actor: ActorState, now: number): Tile[] {
  const walk = progress(actor, now);
  if (!walk) return [actor.path[actor.path.length - 1] as Tile];
  const passed = actor.path.slice(0, walk.next);
  return sameTile(passed[passed.length - 1] as Tile, walk.at) ? passed : [...passed, walk.at];
}

/**
 * A walk to `spot` from the end of `trail` (the points passed so far). When the spot lies on the trail,
 * the actor turns back along it (a friend sent home in the doorway leaves from there); otherwise via the hub.
 */
function walkTo(trail: readonly Tile[], spot: SpotId, now: number, speed: number, reduced: boolean) {
  const to = SPOTS[spot].at;
  const back = trail.findLastIndex((point) => sameTile(point, to));
  const path = back >= 0 ? trail.slice(back).reverse() : pathBetween(trail[trail.length - 1] as Tile, to);
  const duration = reduced ? 0 : (pathLength(path) / speed) * 1000;
  return { path, departAt: now, arriveAt: now + duration };
}

/** With reduced motion nobody is seen mid-walk: an actor still on its way is already there. */
function arrived<T extends ActorState>(actor: T, now: number): T {
  if (actor.arriveAt <= now) return actor;
  return { ...actor, path: [actor.path[actor.path.length - 1] as Tile], departAt: now, arriveAt: now };
}

const isIdleActivity = (activity: Activity): activity is IdleActivity =>
  (IDLE_ACTIVITIES as readonly string[]).includes(activity);

function pickIdle(
  rng: number,
  current: Activity,
  energy: EnergyLevel,
  friendPresent: boolean,
): [IdleActivity, number] {
  const tired = energy === 'low' || energy === 'empty';
  const options = IDLE_ACTIVITIES.filter((a) => a !== current && !(friendPresent && a === 'host-friend'));
  const weights = options.map((a) => BASE_WEIGHT[a] * (tired ? (TIRED_BOOST[a] ?? 1) : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const [r, next] = random(rng);
  let roll = r * total;
  for (let i = 0; i < options.length; i += 1) {
    roll -= weights[i] as number;
    if (roll < 0) return [options[i] as IdleActivity, next];
  }
  return [options[options.length - 1] as IdleActivity, next];
}

/** Session friends take the lowest free seat, show their own session's state, and walk out when it is gone (FR-MS2, FR-MS3). */
function stepGuests(guests: readonly GuestActor[], present: readonly GuestInput[], now: number, reduced: boolean): GuestActor[] {
  const byKey = new Map(present.map((g) => [g.key, g]));
  const next: GuestActor[] = [];
  for (const current of guests) {
    let guest = reduced ? arrived(current, now) : current;
    const wanted = byKey.get(guest.key);
    if (wanted && guest.phase === 'leaving') {
      // Back before it was out of the door: its seat is still its own.
      guest = { ...guest, activity: 'visit', spot: guest.seat, phase: 'arriving', ...walkTo(walked(guest, now), guest.seat, now, GUEST_SPEED, reduced) };
    } else if (!wanted && guest.phase !== 'leaving') {
      guest = { ...guest, activity: 'leave', spot: 'outside', phase: 'leaving', ...walkTo(walked(guest, now), 'outside', now, GUEST_SPEED, reduced) };
    }
    if (guest.phase === 'leaving' && now >= guest.arriveAt) continue;
    if (guest.phase === 'arriving' && now >= guest.arriveAt) guest = { ...guest, phase: 'seated' };
    next.push(wanted ? { ...guest, visual: wanted.visual } : guest);
  }
  for (const { key, kind, ordinal, visual } of present) {
    if (next.some((g) => g.key === key)) continue;
    const seat = GUEST_SEATS.find((s) => !next.some((g) => g.seat === s));
    if (!seat) break;
    const walk = walkTo([SPOTS.outside.at], seat, now, GUEST_SPEED, reduced);
    next.push({ key, kind, ordinal, visual, activity: 'visit', spot: seat, seat, phase: walk.arriveAt <= now ? 'seated' : 'arriving', ...walk });
  }
  return next;
}

const asleep = (hermes: HermesState) => hermes.activity === 'sleep' || hermes.activity === 'nap';

export function stepLife(state: LifeState, input: LifeInput): LifeState {
  const { now, visual, energy, invite = false, reducedMotion = false } = input;
  const speed = walkSpeed(energy);
  let { hermes, friend, friendLeaveAt, until, rng } = state;
  if (reducedMotion) {
    hermes = arrived(hermes, now);
    friend = friend && arrived(friend, now);
  }

  const spawnFriend = (role: FriendState['role'], spot: SpotId): FriendState => {
    const [r, next] = random(rng);
    rng = next;
    const walk = walkTo([SPOTS.outside.at], spot, now, 1.8, reducedMotion);
    return { activity: role === 'helper' ? 'help' : 'visit', role, spot, look: Math.floor(r * FRIEND_LOOKS), ...walk };
  };
  const friendLeaves = (current: FriendState): FriendState => ({
    ...current,
    activity: 'leave',
    spot: 'outside',
    ...walkTo(walked(current, now), 'outside', now, 1.8, reducedMotion),
  });
  // Already heading for (or at) that spot: keep the walk and only change what Hermes will do there.
  const hermesGoes = (activity: Activity, spot: SpotId): HermesState =>
    spot === hermes.spot
      ? { ...hermes, activity }
      : { activity, spot, ...walkTo(walked(hermes, now), spot, now, speed, reducedMotion) };

  // 1. Hermes: agent facts first, its own life only while the agent is idle.
  const required = REQUIRED[visual];
  if (required) {
    if (hermes.activity !== required.activity) {
      hermes = hermesGoes(required.activity, required.spot);
    }
    until = null;
  } else if (!isIdleActivity(hermes.activity) || (until !== null && now >= until)) {
    const [choice, next] = pickIdle(rng, hermes.activity, energy, friend !== null);
    rng = next;
    hermes = hermesGoes(choice, IDLE_SPOT[choice]);
    if (choice === 'host-friend') {
      friend = spawnFriend('guest', 'sofa-2');
      friendLeaveAt = Math.max(hermes.arriveAt, friend.arriveAt) + VISIT_MS;
      until = friendLeaveAt;
    } else {
      // A kept walk may have ended long ago (nap in the bed he slept in): the activity still lasts its full time.
      until = Math.max(hermes.arriveAt, now) + IDLE_DURATION[choice];
    }
  } else if (until === null) {
    until = hermes.arriveAt + IDLE_DURATION[hermes.activity];
  }

  // 2. Friends.
  if (visual === 'offline') {
    if (friend && friend.spot !== 'outside') friend = friendLeaves(friend);
    friendLeaveAt = null;
  } else if (visual === 'delegated') {
    if (!friend) {
      friend = spawnFriend('helper', 'helper');
    } else if (friend.role !== 'helper' || friend.spot === 'outside') {
      friend = { ...friend, role: 'helper', activity: 'help', spot: 'helper', ...walkTo(walked(friend, now), 'helper', now, 1.8, reducedMotion) };
    }
    friendLeaveAt = null;
  } else if (friend?.role === 'helper' && friend.spot !== 'outside') {
    friend = friendLeaves(friend);
  }

  if (invite && visual !== 'offline' && friend === null) {
    friend = spawnFriend('guest', 'sofa-2');
    friendLeaveAt = friend.arriveAt + VISIT_MS;
    if (!required) {
      hermes = hermesGoes('host-friend', 'sofa');
      // As with a visit Hermes starts himself: it begins once both are seated.
      friendLeaveAt = Math.max(hermes.arriveAt, friend.arriveAt) + VISIT_MS;
      until = friendLeaveAt;
    }
  }

  if (friend?.role === 'guest' && friend.spot !== 'outside' && friendLeaveAt !== null && now >= friendLeaveAt) {
    friend = friendLeaves(friend);
    friendLeaveAt = null;
  }
  if (friend?.spot === 'outside' && now >= friend.arriveAt) {
    friend = null;
  }

  // 3. Session friends and their conversations (ADR-022, ADR-023). No randomness: Hermes' own life is untouched.
  const guests = stepGuests(state.guests, input.guests ?? [], now, reducedMotion);
  const resident = input.residentKey ?? null;
  const inRoom = (key: string) =>
    guests.some((g) => g.key === key && g.phase === 'seated') || (key === resident && !asleep(hermes));
  const chats = state.chats.filter((c) => c.until > now && inRoom(c.a) && (c.b === null || inRoom(c.b)));
  let { lastConversation } = state;
  if (input.conversations) {
    if (lastConversation !== UNSEEN) {
      const fresh = input.conversations.filter((c) => c.key > lastConversation).sort((x, y) => x.key - y.key);
      for (const { from, to } of fresh) {
        if (to !== null && to !== from && inRoom(from) && inRoom(to)) chats.push({ a: from, b: to, kind: 'talk', until: now + CHAT_MS.talk });
        else if (inRoom(from)) chats.push({ a: from, b: null, kind: 'letter', until: now + CHAT_MS.letter });
      }
    }
    // The first list seen is history: only mark it handled (-1 so a first message keyed 0 still shows).
    lastConversation = input.conversations.reduce((max, c) => Math.max(max, c.key), Math.max(lastConversation, -1));
  }

  return { hermes, friend, friendLeaveAt, until, rng, guests, chats, lastConversation };
}

export interface GuestView {
  readonly key: string;
  readonly kind: GuestKind;
  readonly ordinal: number;
  readonly visual: VisualState;
  readonly phase: GuestActor['phase'];
  readonly at: Tile;
  readonly walking: boolean;
  readonly face: Facing;
  readonly chat: Chat['kind'] | null;
}

/** Which way to face to look at `to`, by the on-screen direction. */
function faceToward(from: Tile, to: Tile): Facing {
  const a = toScreen(from);
  const b = toScreen(to);
  if (b.y >= a.y) return b.x >= a.x ? 'front-right' : 'front-left';
  return b.x >= a.x ? 'back-right' : 'back-left';
}

/** The newest chat on show at `now` that `key` takes part in (a letter only over its sender). */
const chatOf = (state: LifeState, key: string, now: number) =>
  state.chats.findLast((c) => c.until > now && (c.a === key || c.b === key)) ?? null;

/** A chat partner's position: a guest, or else the resident (only guests and the resident ever chat). */
function partnerAt(state: LifeState, key: string, now: number): Tile {
  return positionAt(state.guests.find((g) => g.key === key) ?? state.hermes, now).at;
}

/** Session friends as drawn at `now`. A seated friend who is talking turns to its partner. */
export function guestViewsAt(state: LifeState, now: number): GuestView[] {
  return state.guests.map((guest) => {
    const { at, walking, face } = positionAt(guest, now);
    const phase = guest.phase === 'arriving' && now >= guest.arriveAt ? 'seated' : guest.phase;
    const chat = chatOf(state, guest.key, now);
    const partner = chat?.kind === 'talk' ? (chat.a === guest.key ? chat.b : chat.a) : null;
    return {
      key: guest.key,
      kind: guest.kind,
      ordinal: guest.ordinal,
      visual: guest.visual,
      phase,
      at,
      walking,
      face: partner !== null && phase === 'seated' ? faceToward(at, partnerAt(state, partner, now)) : face,
      chat: chat?.kind ?? null,
    };
  });
}

/** Hermes' part in a conversation at `now`: talking, or a letter he sent. */
export function hermesChatAt(state: LifeState, now: number, residentKey: string | null): Chat['kind'] | null {
  return residentKey === null ? null : (chatOf(state, residentKey, now)?.kind ?? null);
}

/** While Hermes talks with a friend and is not walking he faces them; null leaves his own facing (positionAt) as it is. */
export function hermesFaceOverride(state: LifeState, now: number, residentKey: string | null): Facing | null {
  const chat = residentKey === null ? null : chatOf(state, residentKey, now);
  if (chat?.kind !== 'talk') return null;
  const here = positionAt(state.hermes, now);
  const partner = state.guests.find((g) => g.key === (chat.a === residentKey ? chat.b : chat.a));
  return partner && !here.walking ? faceToward(here.at, positionAt(partner, now).at) : null;
}
