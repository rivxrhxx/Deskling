import { describe, expect, it } from 'vitest';
import type { VisualState } from './agentEvent';
import { VISUAL_STATES } from './agentEvent';
import type { Activity, IdleActivity, LifeInput, LifeState } from './life';
import { IDLE_ACTIVITIES, IDLE_DURATION, REQUIRED, initialLife, positionAt, stepLife, walkSpeed } from './life';
import type { EnergyLevel } from './mood';
import type { Tile } from './room';
import { HUB, SPOTS, pathBetween, pathLength } from './room';

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
