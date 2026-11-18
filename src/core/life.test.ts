import { describe, expect, it } from 'vitest';
import type { VisualState } from './agentEvent';
import { VISUAL_STATES } from './agentEvent';
import type { Activity, LifeInput, LifeState } from './life';
import { IDLE_ACTIVITIES, REQUIRED, initialLife, positionAt, stepLife, walkSpeed } from './life';
import type { EnergyLevel } from './mood';
import { SPOTS, pathBetween, pathLength } from './room';

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
});
