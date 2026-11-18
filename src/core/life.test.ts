import { describe, expect, it } from 'vitest';
import type { VisualState } from './agentEvent';
import { VISUAL_STATES } from './agentEvent';
import type { Activity, ConversationInput, GuestInput, IdleActivity, LifeInput, LifeState } from './life';
import {
  CHAT_MS,
  IDLE_ACTIVITIES,
  IDLE_DURATION,
  IDLE_SPOT,
  REQUIRED,
  guestViewsAt,
  hermesChatAt,
  hermesFaceOverride,
  initialLife,
  positionAt,
  stepLife,
  walkSpeed,
} from './life';
import type { EnergyLevel } from './mood';
import type { SpotId, Tile } from './room';
import { GUEST_SEATS, HUB, SPOTS, pathBetween, pathLength, segmentHitsRect } from './room';

const T0 = 1_000_000;

function input(visual: VisualState, now: number, extra: Partial<LifeInput> = {}): LifeInput {
  return { now, visual, energy: 'full', ...extra };
}

/** Runs the engine with a fixed tick, returning every state. */
function simulate(
  seed: number,
  timeline: Array<{ from: number; visual: VisualState; energy?: EnergyLevel }>,
  until: number,
  tick = 250,
): LifeState[] {
  let state = initialLife(seed, T0);
  const states: LifeState[] = [];
  for (let now = T0; now <= until; now += tick) {
    const phase = [...timeline].reverse().find((p) => now >= p.from) ?? timeline[0]!;
    state = stepLife(state, input(phase.visual, now, { energy: phase.energy ?? 'full' }));
    states.push(state);
  }
  return states;
}

const WORK: readonly Activity[] = ['ponder', 'type-code', 'browse', 'type-terminal', 'handle-files', 'frustrated', 'delegate'];

describe('required behaviour follows agent facts (FR-R2, FR-R5, ADR-020)', () => {
  it.each([
    ['offline', 'sleep', 'bed'],
    ['thinking', 'ponder', 'desk'],
    ['coding', 'type-code', 'desk'],
    ['browsing', 'browse', 'desk'],
    ['terminal', 'type-terminal', 'desk'],
    ['file-work', 'handle-files', 'desk'],
    ['waiting-approval', 'call-user', 'front'],
    ['delegated', 'delegate', 'desk'],
    ['success', 'celebrate', 'celebrate'],
    ['error', 'frustrated', 'desk'],
  ] as const)('%s → %s at %s', (visual, activity, spot) => {
    expect(REQUIRED[visual]).toEqual({ activity, spot });
    const state = stepLife(initialLife(1, T0), input(visual, T0));
    expect(state.hermes.activity).toBe(activity);
    expect(state.hermes.spot).toBe(spot);
  });

  it('idle has no required behaviour', () => {
    expect(REQUIRED.idle).toBeNull();
  });

  it('every visual state except idle has a distinct required activity', () => {
    const activities = VISUAL_STATES.filter((v) => v !== 'idle').map((v) => REQUIRED[v]?.activity);
    expect(new Set(activities).size).toBe(activities.length);
  });

  it('starts asleep in bed', () => {
    const state = initialLife(7, T0);
    expect(state.hermes).toMatchObject({ activity: 'sleep', spot: 'bed' });
    expect(positionAt(state.hermes, T0).at).toEqual(SPOTS.bed.at);
  });
});

describe('walking (FR-R6)', () => {
  it('walks from the bed to the desk via the hub at the energy speed', () => {
    const state = stepLife(initialLife(1, T0), input('coding', T0));
    const distance = pathLength(pathBetween(SPOTS.bed.at, SPOTS.desk.at));
    const arrive = T0 + (distance / walkSpeed('full')) * 1000;
    expect(state.hermes.arriveAt).toBeCloseTo(arrive, 6);
    expect(positionAt(state.hermes, T0)).toMatchObject({ at: SPOTS.bed.at, walking: true });
    expect(positionAt(state.hermes, arrive)).toMatchObject({ at: SPOTS.desk.at, walking: false, face: 'back-right' });
  });

  it('walks slower when energy runs low', () => {
    expect(walkSpeed('low')).toBeLessThan(walkSpeed('full'));
    expect(walkSpeed('empty')).toBeLessThan(walkSpeed('low'));
  });

  it('faces the direction it walks', () => {
    const state = stepLife(initialLife(1, T0), input('waiting-approval', T0));
    const mid = positionAt(state.hermes, (state.hermes.departAt + state.hermes.arriveAt) / 2);
    expect(mid.walking).toBe(true);
    expect(['front-right', 'front-left', 'back-right', 'back-left']).toContain(mid.face);
  });

  it('teleports when motion is reduced', () => {
    const state = stepLife(initialLife(1, T0), input('coding', T0, { reducedMotion: true }));
    expect(state.hermes.arriveAt).toBe(T0);
    expect(positionAt(state.hermes, T0)).toMatchObject({ at: SPOTS.desk.at, walking: false });
  });

  it('drops what it is doing and heads to the desk when work starts', () => {
    const states = simulate(3, [{ from: T0, visual: 'idle' }, { from: T0 + 20_000, visual: 'coding' }], T0 + 20_000);
    expect(states.at(-1)?.hermes).toMatchObject({ activity: 'type-code', spot: 'desk' });
  });

  it('keeps its walk when the work changes but the desk stays the goal', () => {
    let state = stepLife(initialLife(1, T0), input('thinking', T0));
    const { path, departAt, arriveAt } = state.hermes;
    state = stepLife(state, input('coding', arriveAt - 500));
    expect(state.hermes).toMatchObject({ activity: 'type-code', spot: 'desk', path, departAt, arriveAt });
  });

  it('reaches the desk in one walk even when the tool changes every 1.2 s', () => {
    const tick = 300;
    const walkMs = (pathLength(pathBetween(SPOTS.bed.at, SPOTS.desk.at)) / walkSpeed('full')) * 1000;
    const tools: VisualState[] = ['thinking', 'coding', 'terminal'];
    const timeline = Array.from({ length: 6 }, (_, i) => ({ from: T0 + i * 1200, visual: tools[i % 3]! }));
    const states = simulate(1, timeline, T0 + 7_200, tick);
    for (let i = Math.ceil(walkMs / tick); i < states.length; i += 1) {
      expect(positionAt(states[i]!.hermes, T0 + i * tick)).toMatchObject({ at: SPOTS.desk.at, walking: false });
    }
  });

  it('keeps its walk to the sofa when a friend is invited on the way to the TV', () => {
    const path = pathBetween(SPOTS.bed.at, SPOTS.sofa.at);
    const arriveAt = T0 + (pathLength(path) / walkSpeed('full')) * 1000;
    const onTheWay: LifeState = {
      ...initialLife(5, T0),
      hermes: { activity: 'watch-tv', spot: 'sofa', path, departAt: T0, arriveAt },
      until: arriveAt + IDLE_DURATION['watch-tv'],
    };
    const state = stepLife(onTheWay, input('idle', T0 + 3_000, { invite: true }));
    expect(state.hermes).toMatchObject({ activity: 'host-friend', spot: 'sofa', path, departAt: T0, arriveAt });
  });

  it('an idle activity where Hermes already is still lasts its full time', () => {
    const later = T0 + 60_000;
    const picked = new Set<Activity>();
    for (let seed = 1; seed <= 30; seed += 1) {
      const state = stepLife(initialLife(seed, T0), input('idle', later, { energy: 'empty' }));
      const activity = state.hermes.activity as IdleActivity;
      picked.add(activity);
      expect(state.until).toBeGreaterThanOrEqual(later + IDLE_DURATION[activity]);
    }
    expect(picked.has('nap')).toBe(true);
  });

  it('turns straight back when its goal is behind it on the current walk', () => {
    let state = stepLife(initialLife(1, T0), input('coding', T0));
    const now = T0 + 1_000;
    const here = positionAt(state.hermes, now).at;
    state = stepLife(state, input('offline', now));
    expect(state.hermes).toMatchObject({ activity: 'sleep', spot: 'bed', path: [here, SPOTS.bed.at] });
  });

  it('snaps to where it was going when motion becomes reduced mid-walk', () => {
    let state = stepLife(initialLife(5, T0), input('coding', T0));
    state = stepLife(state, input('coding', T0 + 100, { invite: true }));
    const mid = T0 + 1_000;
    expect(positionAt(state.hermes, mid).walking).toBe(true);
    expect(positionAt(state.friend!, mid).walking).toBe(true);
    state = stepLife(state, input('coding', mid, { reducedMotion: true }));
    expect(state.hermes).toMatchObject({ path: [SPOTS.desk.at], departAt: mid, arriveAt: mid });
    expect(positionAt(state.hermes, mid)).toMatchObject({ at: SPOTS.desk.at, walking: false });
    expect(state.friend).toMatchObject({ spot: 'sofa-2', path: [SPOTS['sofa-2'].at], departAt: mid, arriveAt: mid });
  });
});

describe('idle life (FR-R3, ADR-020)', () => {
  const tenMinutes = T0 + 10 * 60_000;
  const life = simulate(11, [{ from: T0, visual: 'idle' }], tenMinutes);

  it('never touches the computer or pretends to work while the agent is idle', () => {
    for (const state of life) {
      expect(WORK).not.toContain(state.hermes.activity);
      expect(state.hermes.spot).not.toBe('desk');
      expect(state.hermes.spot).not.toBe('helper');
    }
  });

  it('lives a varied day of idle activities', () => {
    const seen = new Set(life.map((s) => s.hermes.activity));
    for (const activity of seen) expect(IDLE_ACTIVITIES).toContain(activity);
    expect(seen.size).toBeGreaterThanOrEqual(6);
    expect(seen.has('shower')).toBe(true);
  });

  it('does not repeat the same activity back to back', () => {
    for (let i = 1; i < life.length; i += 1) {
      const prev = life[i - 1]!.hermes;
      const next = life[i]!.hermes;
      if (next.departAt !== prev.departAt) expect(next.activity).not.toBe(prev.activity);
    }
  });

  it('is deterministic for a seed', () => {
    const again = simulate(11, [{ from: T0, visual: 'idle' }], tenMinutes);
    expect(again).toEqual(life);
    const other = simulate(12, [{ from: T0, visual: 'idle' }], tenMinutes);
    expect(other).not.toEqual(life);
  });

  it('invites friends over now and then, who come in and leave through the door', () => {
    const withFriend = life.filter((s) => s.friend !== null);
    expect(withFriend.length).toBeGreaterThan(0);
    const first = withFriend[0]!.friend!;
    expect(first.path[0]).toEqual(SPOTS.outside.at);
    const leaving = life.find((s) => s.friend?.spot === 'outside');
    expect(leaving).toBeDefined();
    const afterVisit = life.slice(life.indexOf(leaving!)).find((s) => s.friend === null);
    expect(afterVisit).toBeDefined();
  });

  it('naps and eats more when energy is low', () => {
    const share = (energy: EnergyLevel) => {
      let rest = 0;
      let total = 0;
      for (let seed = 1; seed <= 12; seed += 1) {
        const states = simulate(seed, [{ from: T0, visual: 'idle', energy }], T0 + 6 * 60_000, 1000);
        for (const s of states) {
          total += 1;
          if (s.hermes.activity === 'nap' || s.hermes.activity === 'eat' || s.hermes.activity === 'fridge') rest += 1;
        }
      }
      return rest / total;
    };
    expect(share('empty')).toBeGreaterThan(share('full') * 1.5);
  });
});

describe('friends (FR-R4)', () => {
  it('comes over when invited and leaves after the visit', () => {
    let state = stepLife(initialLife(5, T0), input('idle', T0));
    state = stepLife(state, input('idle', T0 + 100, { invite: true }));
    expect(state.friend).toMatchObject({ role: 'guest', spot: 'sofa-2' });
    expect(state.hermes).toMatchObject({ activity: 'host-friend', spot: 'sofa' });
    const leaveAt = state.friendLeaveAt!;
    state = stepLife(state, input('idle', leaveAt));
    expect(state.friend).toMatchObject({ spot: 'outside' });
    state = stepLife(state, input('idle', state.friend!.arriveAt));
    expect(state.friend).toBeNull();
  });

  it('ignores invitations while asleep with the lights off', () => {
    const state = stepLife(initialLife(5, T0), input('offline', T0, { invite: true }));
    expect(state.friend).toBeNull();
  });

  it('a visiting friend may hang out on the sofa while Hermes works', () => {
    let state = stepLife(initialLife(5, T0), input('coding', T0));
    state = stepLife(state, input('coding', T0 + 100, { invite: true }));
    expect(state.friend).toMatchObject({ role: 'guest', spot: 'sofa-2' });
    expect(state.hermes).toMatchObject({ activity: 'type-code', spot: 'desk' });
  });

  it('a friend helps at the side desk while work is delegated, then goes home', () => {
    let state = stepLife(initialLife(5, T0), input('delegated', T0));
    expect(state.friend).toMatchObject({ role: 'helper', spot: 'helper' });
    state = stepLife(state, input('success', T0 + 30_000));
    expect(state.friend).toMatchObject({ spot: 'outside' });
  });

  it('everyone goes home when the agent goes offline', () => {
    let state = stepLife(initialLife(5, T0), input('idle', T0, { invite: true }));
    state = stepLife(state, input('offline', T0 + 1_000));
    expect(state.friend?.spot).toBe('outside');
    expect(state.hermes).toMatchObject({ activity: 'sleep', spot: 'bed' });
  });

  it('a friend sent home while coming in turns back at the door instead of crossing the room', () => {
    let state = stepLife(initialLife(5, T0), input('idle', T0));
    state = stepLife(state, input('idle', T0 + 100, { invite: true }));
    const now = T0 + 600;
    const here = positionAt(state.friend!, now).at;
    state = stepLife(state, input('offline', now));
    const leaving = state.friend!;
    const out = SPOTS.outside.at;
    const away = (p: Tile) => Math.hypot(p.x - out.x, p.y - out.y);
    expect(leaving).toMatchObject({ activity: 'leave', spot: 'outside' });
    expect(leaving.path[0]).toEqual(here);
    expect(leaving.path.at(-1)).toEqual(out);
    expect(leaving.path).not.toContainEqual(HUB);
    for (const point of leaving.path) expect(away(point)).toBeLessThanOrEqual(away(here) + 1e-9);
    state = stepLife(state, input('offline', leaving.arriveAt));
    expect(state.friend).toBeNull();
  });

  it('a friend on the way out is gone at once when motion becomes reduced', () => {
    let state = stepLife(initialLife(5, T0), input('idle', T0, { invite: true }));
    state = stepLife(state, input('offline', T0 + 1_000));
    const leaving = state.friend!;
    expect(leaving.spot).toBe('outside');
    const mid = (leaving.departAt + leaving.arriveAt) / 2;
    expect(positionAt(leaving, mid).walking).toBe(true);
    state = stepLife(state, input('offline', mid, { reducedMotion: true }));
    expect(state.friend).toBeNull();
  });

  it('an invited visit lasts until both are seated, plus the visit, like one Hermes starts himself', () => {
    let state = stepLife(initialLife(5, T0), input('idle', T0, { energy: 'empty' }));
    state = stepLife(state, input('idle', T0 + 100, { energy: 'empty', invite: true }));
    const { hermes, friend } = state;
    expect(hermes).toMatchObject({ activity: 'host-friend', spot: 'sofa' });
    // A tired Hermes walks slowly, so he sits down after the friend.
    expect(hermes.arriveAt).toBeGreaterThan(friend!.arriveAt);
    expect(state.friendLeaveAt).toBe(hermes.arriveAt + IDLE_DURATION['host-friend']);
    expect(state.until).toBe(state.friendLeaveAt);
  });

  it('while Hermes works, an invited visit is timed from the friend sitting down', () => {
    let state = stepLife(initialLife(5, T0), input('coding', T0, { energy: 'empty' }));
    state = stepLife(state, input('coding', T0 + 100, { energy: 'empty', invite: true }));
    expect(state.friendLeaveAt).toBe(state.friend!.arriveAt + IDLE_DURATION['host-friend']);
  });
});

const claude = (n: number, visual: VisualState = 'idle'): GuestInput => ({ key: `claude-code:s${n}`, kind: 'claude-code', ordinal: n, visual });
const codex = (n: number, visual: VisualState = 'idle'): GuestInput => ({ key: `codex:s${n}`, kind: 'codex', ordinal: n, visual });
const guestOf = (state: LifeState, key: string) => state.guests.find((g) => g.key === key);
/** Long enough for anyone to walk in from outside and sit down. */
const SETTLED = 20_000;

describe('session friends (FR-MS2, FR-MS3, ADR-022)', () => {
  it('a new session friend walks in through the door and sits in the first seat', () => {
    let state = stepLife(initialLife(1, T0), input('idle', T0, { guests: [claude(1)] }));
    expect(state.guests).toHaveLength(1);
    const guest = state.guests[0]!;
    expect(guest).toMatchObject({ key: 'claude-code:s1', kind: 'claude-code', ordinal: 1, visual: 'idle', seat: 'guest-1', spot: 'guest-1', phase: 'arriving' });
    expect(guest.path).toEqual(pathBetween(SPOTS.outside.at, SPOTS['guest-1'].at));
    expect(guest.path).toContainEqual(SPOTS.door.at);
    expect(guest.arriveAt).toBeCloseTo(T0 + (pathLength(guest.path) / 1.8) * 1000, 6);
    expect(positionAt(guest, T0 + 1_000).walking).toBe(true);
    state = stepLife(state, input('idle', guest.arriveAt, { guests: [claude(1)] }));
    expect(state.guests[0]).toMatchObject({ phase: 'seated' });
    expect(positionAt(state.guests[0]!, guest.arriveAt)).toEqual({ at: SPOTS['guest-1'].at, walking: false, face: SPOTS['guest-1'].face });
  });

  it('seats at most four friends; the fifth comes in when a seat frees up', () => {
    const five = [claude(1), claude(2), codex(1), claude(3), codex(2)];
    let state = stepLife(initialLife(1, T0), input('coding', T0, { guests: five }));
    expect(state.guests.map((g) => [g.key, g.seat])).toEqual([
      ['claude-code:s1', 'guest-1'],
      ['claude-code:s2', 'guest-2'],
      ['codex:s1', 'guest-3'],
      ['claude-code:s3', 'guest-4'],
    ]);
    const later = T0 + SETTLED;
    state = stepLife(state, input('coding', later, { guests: five }));
    expect(state.guests.map((g) => g.phase)).toEqual(['seated', 'seated', 'seated', 'seated']);

    const withoutSecond = five.filter((g) => g.key !== 'claude-code:s2');
    state = stepLife(state, input('coding', later + 300, { guests: withoutSecond }));
    const leaving = guestOf(state, 'claude-code:s2')!;
    expect(leaving).toMatchObject({ phase: 'leaving', spot: 'outside', seat: 'guest-2' });
    // The seat is still taken while its friend walks out.
    expect(guestOf(state, 'codex:s2')).toBeUndefined();

    state = stepLife(state, input('coding', leaving.arriveAt, { guests: withoutSecond }));
    expect(guestOf(state, 'claude-code:s2')).toBeUndefined();
    expect(guestOf(state, 'codex:s2')).toMatchObject({ seat: 'guest-2', phase: 'arriving' });
  });

  it('a friend whose session is gone walks out through the door, then its seat is free again', () => {
    let state = stepLife(initialLife(1, T0), input('idle', T0, { guests: [claude(1)] }));
    const later = T0 + SETTLED;
    state = stepLife(state, input('idle', later, { guests: [claude(1)] }));
    state = stepLife(state, input('idle', later, { guests: [] }));
    const leaving = state.guests[0]!;
    expect(leaving).toMatchObject({ activity: 'leave', phase: 'leaving', spot: 'outside', seat: 'guest-1' });
    expect(leaving.path).toEqual(pathBetween(SPOTS['guest-1'].at, SPOTS.outside.at));
    expect(leaving.arriveAt).toBeCloseTo(later + (pathLength(leaving.path) / 1.8) * 1000, 6);
    state = stepLife(state, input('idle', leaving.arriveAt - 1, { guests: [] }));
    expect(state.guests).toHaveLength(1);
    state = stepLife(state, input('idle', leaving.arriveAt, { guests: [] }));
    expect(state.guests).toEqual([]);
    state = stepLife(state, input('idle', leaving.arriveAt + 300, { guests: [codex(1)] }));
    expect(state.guests[0]).toMatchObject({ key: 'codex:s1', seat: 'guest-1' });
  });

  it('a friend whose session ends while coming in turns back the way it came', () => {
    let state = stepLife(initialLife(1, T0), input('idle', T0, { guests: [claude(1)] }));
    const now = T0 + 500;
    const here = positionAt(state.guests[0]!, now).at;
    state = stepLife(state, input('idle', now, { guests: [] }));
    const leaving = state.guests[0]!;
    expect(leaving).toMatchObject({ phase: 'leaving', spot: 'outside' });
    expect(leaving.path[0]).toEqual(here);
    expect(leaving.path.at(-1)).toEqual(SPOTS.outside.at);
    expect(leaving.path).not.toContainEqual(HUB);
  });

  it('a friend on its way out whose session is back returns to its seat', () => {
    let state = stepLife(initialLife(1, T0), input('idle', T0, { guests: [claude(1)] }));
    state = stepLife(state, input('idle', T0 + SETTLED, { guests: [] }));
    state = stepLife(state, input('idle', T0 + SETTLED + 1_000, { guests: [claude(1, 'coding')] }));
    expect(state.guests).toHaveLength(1);
    expect(state.guests[0]).toMatchObject({ phase: 'arriving', spot: 'guest-1', seat: 'guest-1', visual: 'coding' });
    expect(state.guests[0]!.path.at(-1)).toEqual(SPOTS['guest-1'].at);
  });

  it('with reduced motion friends appear in their seats and are gone at once', () => {
    let state = stepLife(initialLife(1, T0), input('idle', T0, { guests: [claude(1)], reducedMotion: true }));
    expect(state.guests[0]).toMatchObject({ phase: 'seated', arriveAt: T0 });
    expect(positionAt(state.guests[0]!, T0)).toMatchObject({ at: SPOTS['guest-1'].at, walking: false });
    state = stepLife(state, input('idle', T0 + 1_000, { guests: [], reducedMotion: true }));
    expect(state.guests).toEqual([]);
  });

  it('a friend walking in is seated at once when motion becomes reduced', () => {
    let state = stepLife(initialLife(1, T0), input('idle', T0, { guests: [claude(1)] }));
    state = stepLife(state, input('idle', T0 + 1_000, { guests: [claude(1)], reducedMotion: true }));
    expect(state.guests[0]).toMatchObject({ phase: 'seated', path: [SPOTS['guest-1'].at] });
  });

  it("a friend shows only its own session's state and has no routine of its own", () => {
    let state = stepLife(initialLife(1, T0), input('idle', T0, { guests: [claude(1), codex(1)] }));
    state = stepLife(state, input('idle', T0 + SETTLED, { guests: [claude(1, 'coding'), codex(1, 'waiting-approval')] }));
    expect(state.guests.map((g) => g.visual)).toEqual(['coding', 'waiting-approval']);
    const seated = state.guests;
    for (let now = T0 + SETTLED; now <= T0 + 5 * 60_000; now += 1_000) {
      state = stepLife(state, input('idle', now, { guests: [claude(1, 'coding'), codex(1, 'waiting-approval')] }));
    }
    expect(state.guests.map((g) => [g.spot, g.path, g.arriveAt, g.phase])).toEqual(seated.map((g) => [g.seat, g.path, g.arriveAt, 'seated']));
  });

  it("friends do not change Hermes' own life (no extra randomness, no new routine)", () => {
    const plain = simulate(11, [{ from: T0, visual: 'idle' }], T0 + 5 * 60_000);
    let state = initialLife(11, T0);
    const withGuests: LifeState[] = [];
    for (let now = T0; now <= T0 + 5 * 60_000; now += 250) {
      state = stepLife(state, input('idle', now, { guests: [claude(1), codex(1)] }));
      withGuests.push(state);
    }
    expect(withGuests.map((s) => [s.hermes, s.rng, s.until])).toEqual(plain.map((s) => [s.hermes, s.rng, s.until]));
  });

  it("Hermes' spots and walks stay clear of the guest seats", () => {
    const hermesSpots = new Set<SpotId>([...Object.values(IDLE_SPOT), ...Object.values(REQUIRED).flatMap((r) => (r ? [r.spot] : []))]);
    for (const seat of GUEST_SEATS) {
      expect(hermesSpots.has(seat)).toBe(false);
      const at = SPOTS[seat].at;
      // A tiny footprint around the cushion: no walk from the hub to one of Hermes' spots crosses it.
      const cushion = { x0: at.x - 0.3, y0: at.y - 0.3, x1: at.x + 0.3, y1: at.y + 0.3 };
      for (const spot of hermesSpots) {
        const where = SPOTS[spot].at;
        expect(Math.hypot(where.x - at.x, where.y - at.y), `${seat} vs ${spot}`).toBeGreaterThanOrEqual(0.8);
        expect(segmentHitsRect(HUB, where, cushion), `walk to ${spot} crosses ${seat}`).toBe(false);
      }
    }
  });
});

describe('conversations (FR-MS5, ADR-023)', () => {
  const RESIDENT = 'hermes:main';
  const A = claude(1);
  const B = codex(1);
  const room = (visual: VisualState, now: number, conversations: readonly ConversationInput[], extra: Partial<LifeInput> = {}) =>
    input(visual, now, { guests: [A, B], residentKey: RESIDENT, conversations, ...extra });
  /** Both friends seated, Hermes at work, and an empty conversation list already seen. */
  const settled = (visual: VisualState = 'coding') => {
    const state = stepLife(initialLife(1, T0), room(visual, T0, []));
    return stepLife(state, room(visual, T0 + SETTLED, []));
  };
  const NOW = T0 + SETTLED + 1_000;

  it('two friends in the room talk for 4 s, then it ends', () => {
    const said = [{ key: 1, from: A.key, to: B.key }];
    let state = stepLife(settled(), room('coding', NOW, said));
    expect(state.chats).toEqual([{ a: A.key, b: B.key, kind: 'talk', until: NOW + CHAT_MS.talk }]);
    expect(state.lastConversation).toBe(1);
    expect(CHAT_MS.talk).toBe(4_000);
    state = stepLife(state, room('coding', NOW + 3_999, said));
    expect(state.chats).toHaveLength(1);
    state = stepLife(state, room('coding', NOW + 4_000, said));
    expect(state.chats).toEqual([]);
  });

  it('a friend and an awake Hermes talk', () => {
    const state = stepLife(settled(), room('coding', NOW, [{ key: 1, from: A.key, to: RESIDENT }]));
    expect(state.chats).toEqual([{ a: A.key, b: RESIDENT, kind: 'talk', until: NOW + 4_000 }]);
    const back = stepLife(settled(), room('coding', NOW, [{ key: 1, from: RESIDENT, to: B.key }]));
    expect(back.chats).toEqual([{ a: RESIDENT, b: B.key, kind: 'talk', until: NOW + 4_000 }]);
  });

  it.each([
    ['nobody in particular', null],
    ['a session not in the room', 'codex:gone'],
  ])('a message to %s is a letter for 3 s', (_, to) => {
    let state = stepLife(settled(), room('coding', NOW, [{ key: 1, from: A.key, to }]));
    expect(state.chats).toEqual([{ a: A.key, b: null, kind: 'letter', until: NOW + CHAT_MS.letter }]);
    expect(CHAT_MS.letter).toBe(3_000);
    state = stepLife(state, room('coding', NOW + 3_000, [{ key: 1, from: A.key, to }]));
    expect(state.chats).toEqual([]);
  });

  it('a message to Hermes while he sleeps is a letter, and Hermes asleep sends nothing', () => {
    let state = stepLife(settled('offline'), room('offline', NOW, [{ key: 1, from: A.key, to: RESIDENT }]));
    expect(state.hermes.activity).toBe('sleep');
    expect(state.chats).toEqual([{ a: A.key, b: null, kind: 'letter', until: NOW + 3_000 }]);
    state = stepLife(settled('offline'), room('offline', NOW, [{ key: 1, from: RESIDENT, to: A.key }]));
    expect(state.chats).toEqual([]);
  });

  it('ignores a message from a session that is not in the room, but marks it handled', () => {
    const state = stepLife(settled(), room('coding', NOW, [{ key: 1, from: 'codex:gone', to: A.key }]));
    expect(state.chats).toEqual([]);
    expect(state.lastConversation).toBe(1);
  });

  it('a friend still walking in is not in the room yet', () => {
    let state = stepLife(initialLife(1, T0), room('coding', T0, []));
    state = stepLife(state, room('coding', T0 + 300, [{ key: 1, from: A.key, to: B.key }]));
    expect(state.chats).toEqual([]);
  });

  it('does not replay messages sent before it started watching', () => {
    const history = [
      { key: 5, from: A.key, to: B.key },
      { key: 4, from: B.key, to: A.key },
    ];
    let state = stepLife(initialLife(1, T0), room('coding', T0 + SETTLED, history, { reducedMotion: true }));
    expect(state.chats).toEqual([]);
    expect(state.lastConversation).toBe(5);
    state = stepLife(state, room('coding', NOW, [{ key: 6, from: B.key, to: A.key }, ...history], { reducedMotion: true }));
    expect(state.chats).toEqual([{ a: B.key, b: A.key, kind: 'talk', until: NOW + 4_000 }]);
  });

  it('shows the first message ever when it started watching an empty list', () => {
    const state = stepLife(settled(), room('coding', NOW, [{ key: 0, from: A.key, to: B.key }]));
    expect(state.chats).toHaveLength(1);
  });

  it('handles several new messages oldest first (the input lists them newest first)', () => {
    const state = stepLife(settled(), room('coding', NOW, [
      { key: 3, from: B.key, to: null },
      { key: 2, from: A.key, to: B.key },
    ]));
    expect(state.chats.map((c) => c.kind)).toEqual(['talk', 'letter']);
    expect(state.lastConversation).toBe(3);
  });

  it('a talk ends when one of them leaves the room', () => {
    let state = stepLife(settled(), room('coding', NOW, [{ key: 1, from: A.key, to: B.key }]));
    state = stepLife(state, input('coding', NOW + 1_000, { guests: [A], residentKey: RESIDENT, conversations: [{ key: 1, from: A.key, to: B.key }] }));
    expect(state.chats).toEqual([]);
  });

  it('is deterministic and leaves the idle randomness alone', () => {
    const run = () => stepLife(settled('idle'), room('idle', NOW, [{ key: 1, from: A.key, to: RESIDENT }]));
    const quiet = stepLife(settled('idle'), room('idle', NOW, []));
    expect(run()).toEqual(run());
    expect([run().hermes, run().rng, run().until]).toEqual([quiet.hermes, quiet.rng, quiet.until]);
  });
});

describe('guest views', () => {
  const RESIDENT = 'hermes:main';
  const A = claude(1);
  const B = codex(1);
  const seated = (conversations: readonly ConversationInput[]) => {
    let state = stepLife(initialLife(1, T0), input('coding', T0, { guests: [A, B], residentKey: RESIDENT, conversations: [], reducedMotion: true }));
    state = stepLife(state, input('coding', T0 + 1_000, { guests: [A, B], residentKey: RESIDENT, conversations, reducedMotion: true }));
    return state;
  };
  const NOW = T0 + 1_000;

  it('shows each friend in its seat with its own state', () => {
    const state = stepLife(initialLife(1, T0), input('idle', T0, { guests: [A, codex(1, 'coding')] }));
    const walking = guestViewsAt(state, T0 + 1_000);
    expect(walking.map((v) => [v.key, v.phase, v.walking])).toEqual([
      [A.key, 'arriving', true],
      [B.key, 'arriving', true],
    ]);
    const later = guestViewsAt(state, T0 + SETTLED);
    expect(later).toEqual([
      { key: A.key, kind: 'claude-code', ordinal: 1, visual: 'idle', phase: 'seated', at: SPOTS['guest-1'].at, walking: false, face: SPOTS['guest-1'].face, chat: null },
      { key: B.key, kind: 'codex', ordinal: 1, visual: 'coding', phase: 'seated', at: SPOTS['guest-2'].at, walking: false, face: SPOTS['guest-2'].face, chat: null },
    ]);
  });

  it('talking friends turn to each other; the talk shows on both', () => {
    const state = seated([{ key: 1, from: A.key, to: B.key }]);
    const views = guestViewsAt(state, NOW);
    // On screen guest-2 (by the door) is up and to the right of guest-1 (front), so guest-1 turns back-right.
    expect(views.map((v) => [v.chat, v.face])).toEqual([
      ['talk', 'back-right'],
      ['talk', 'front-left'],
    ]);
    expect(guestViewsAt(state, NOW + 4_000).map((v) => [v.chat, v.face])).toEqual([
      [null, SPOTS['guest-1'].face],
      [null, SPOTS['guest-2'].face],
    ]);
    expect(hermesChatAt(state, NOW, RESIDENT)).toBeNull();
    expect(hermesFaceOverride(state, NOW, RESIDENT)).toBeNull();
  });

  it('a letter shows over its sender only', () => {
    const state = seated([{ key: 1, from: B.key, to: null }]);
    expect(guestViewsAt(state, NOW).map((v) => v.chat)).toEqual([null, 'letter']);
    expect(guestViewsAt(state, NOW).map((v) => v.face)).toEqual([SPOTS['guest-1'].face, SPOTS['guest-2'].face]);
  });

  it('Hermes and a friend turn to each other while they talk', () => {
    const state = seated([{ key: 1, from: A.key, to: RESIDENT }]);
    expect(positionAt(state.hermes, NOW)).toMatchObject({ at: SPOTS.desk.at, walking: false, face: 'back-right' });
    expect(hermesChatAt(state, NOW, RESIDENT)).toBe('talk');
    // The desk is up and to the right of guest-1 on screen.
    expect(hermesFaceOverride(state, NOW, RESIDENT)).toBe('front-left');
    expect(guestViewsAt(state, NOW)[0]).toMatchObject({ chat: 'talk', face: 'back-right' });
    expect(hermesChatAt(state, NOW + 4_000, RESIDENT)).toBeNull();
    expect(hermesFaceOverride(state, NOW + 4_000, RESIDENT)).toBeNull();
    expect(hermesChatAt(state, NOW, null)).toBeNull();
  });

  it('a letter from Hermes shows over Hermes', () => {
    const state = seated([{ key: 1, from: RESIDENT, to: null }]);
    expect(hermesChatAt(state, NOW, RESIDENT)).toBe('letter');
    expect(hermesFaceOverride(state, NOW, RESIDENT)).toBeNull();
    expect(guestViewsAt(state, NOW).map((v) => v.chat)).toEqual([null, null]);
  });
});
