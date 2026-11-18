import type { VisualState } from './agentEvent';
import type { EnergyLevel } from './mood';
import type { Facing, SpotId, Tile } from './room';
import { SPOTS, pathBetween, pathLength } from './room';

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

const IDLE_SPOT: Readonly<Record<IdleActivity, SpotId>> = {
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

export interface LifeState {
  readonly hermes: HermesState;
  readonly friend: FriendState | null;
  readonly friendLeaveAt: number | null;
  /** When the current idle activity ends; null while a required behaviour runs. */
  readonly until: number | null;
  /** Seeded PRNG state (mulberry32). */
  readonly rng: number;
}

export interface LifeInput {
  readonly now: number;
  readonly visual: VisualState;
  readonly energy: EnergyLevel;
  /** A one-off "친구 초대" from the user. */
  readonly invite?: boolean;
  readonly reducedMotion?: boolean;
}

export const FRIEND_LOOKS = 2;
const VISIT_MS = IDLE_DURATION['host-friend'];

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
  };
}

function faceFor(dx: number, dy: number): Facing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'front-right' : 'back-left';
  return dy >= 0 ? 'front-left' : 'back-right';
}

/** Where an actor is at `now`, whether it is walking and which way it faces. */
export function positionAt(actor: ActorState, now: number): { at: Tile; walking: boolean; face: Facing } {
  const last = actor.path[actor.path.length - 1] as Tile;
  if (now >= actor.arriveAt || actor.path.length < 2) {
    return { at: last, walking: false, face: SPOTS[actor.spot].face };
  }
  const total = pathLength(actor.path);
  let remaining = (Math.max(0, now - actor.departAt) / (actor.arriveAt - actor.departAt)) * total;
  for (let i = 1; i < actor.path.length; i += 1) {
    const a = actor.path[i - 1] as Tile;
    const b = actor.path[i] as Tile;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (remaining <= length || i === actor.path.length - 1) {
      const t = length === 0 ? 1 : Math.min(1, remaining / length);
      return {
        at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        walking: true,
        face: faceFor(b.x - a.x, b.y - a.y),
      };
    }
    remaining -= length;
  }
  return { at: last, walking: false, face: SPOTS[actor.spot].face };
}

function walkTo(from: Tile, spot: SpotId, now: number, speed: number, reduced: boolean) {
  const path = pathBetween(from, SPOTS[spot].at);
  const duration = reduced ? 0 : (pathLength(path) / speed) * 1000;
  return { path, departAt: now, arriveAt: now + duration };
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

export function stepLife(state: LifeState, input: LifeInput): LifeState {
  const { now, visual, energy, invite = false, reducedMotion = false } = input;
  const speed = walkSpeed(energy);
  let { hermes, friend, friendLeaveAt, until, rng } = state;

  const spawnFriend = (role: FriendState['role'], spot: SpotId): FriendState => {
    const [r, next] = random(rng);
    rng = next;
    const walk = walkTo(SPOTS.outside.at, spot, now, 1.8, reducedMotion);
    return { activity: role === 'helper' ? 'help' : 'visit', role, spot, look: Math.floor(r * FRIEND_LOOKS), ...walk };
  };
  const friendLeaves = (current: FriendState): FriendState => ({
    ...current,
    activity: 'leave',
    spot: 'outside',
    ...walkTo(positionAt(current, now).at, 'outside', now, 1.8, reducedMotion),
  });
  const hermesGoes = (activity: Activity, spot: SpotId): HermesState => ({
    activity,
    spot,
    ...walkTo(positionAt(hermes, now).at, spot, now, speed, reducedMotion),
  });

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
      until = hermes.arriveAt + IDLE_DURATION[choice];
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
      friend = { ...friend, role: 'helper', activity: 'help', spot: 'helper', ...walkTo(positionAt(friend, now).at, 'helper', now, 1.8, reducedMotion) };
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

  return { hermes, friend, friendLeaveAt, until, rng };
}
