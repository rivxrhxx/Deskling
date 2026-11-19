import { describe, expect, it } from 'vitest';
import type { SourceKind, VisualState } from './agentEvent';
import type { ConversationInput, MemberInput, MemberView, OfficeInput, OfficeState } from './office';
import {
  CHAT_MS,
  CHEER_MS,
  IDLE_SETTLE_MS,
  LEVEL_UP_MS,
  LOUNGE_STAY_MS,
  WALK_SPEED,
  initialOffice,
  memberViewsAt,
  stepOffice,
} from './office';
import type { LoungeSpot, Tile } from './room';
import { DESK_IDS, LOUNGE_SPOTS, SPOTS, pathBetween, pathLength } from './room';

const T0 = 1_000_000;
/** Longer than any walk across the office. */
const SETTLED = 20_000;

function member(key: string, visual: VisualState = 'coding', kind: SourceKind = 'claude-code', ordinal = 1): MemberInput {
  return { key, kind, ordinal, visual };
}

function step(state: OfficeState, now: number, members: readonly MemberInput[], extra: Partial<OfficeInput> = {}): OfficeState {
  return stepOffice(state, { now, members, ...extra });
}

/** Steps the engine every `tick` ms from `from` to `to` (inclusive) with the same input. */
function run(state: OfficeState, from: number, to: number, members: readonly MemberInput[], extra: Partial<OfficeInput> = {}, tick = 250): OfficeState {
  let next = state;
  for (let now = from; now <= to; now += tick) next = step(next, now, members, extra);
  return next;
}

function viewOf(state: OfficeState, now: number, key: string): MemberView {
  const found = memberViewsAt(state, now).find((v) => v.key === key);
  if (!found) throw new Error(`${key} is not in the office`);
  return found;
}

const lastOf = (path: readonly Tile[]) => path[path.length - 1] as Tile;
/** The lounge spot at a point, or null. */
const loungeSpotAt = (at: Tile | undefined): LoungeSpot | null =>
  LOUNGE_SPOTS.find((id) => at !== undefined && SPOTS[id].at.x === at.x && SPOTS[id].at.y === at.y) ?? null;
/** The lounge spot a member is at, or null. */
const loungeSpotOf = (view: MemberView): LoungeSpot | null => loungeSpotAt(view.at);

/** Everyone in at their desks (reduced motion makes the walks instant), then a normal clock from there. */
function seated(members: readonly MemberInput[], seed = 1): OfficeState {
  return step(initialOffice(seed, T0), T0, members, { reducedMotion: true });
}

const A = member('claude-code:a');
const B = member('codex:b', 'coding', 'codex');

describe('arriving (ADR-025 §3)', () => {
  it('starts empty', () => {
    expect(memberViewsAt(initialOffice(1, T0), T0)).toEqual([]);
  });

  it('a new member walks in from outside, through the door, to the lowest free desk', () => {
    const state = step(initialOffice(1, T0), T0, [A]);
    const [m] = state.members;
    expect(m?.path.slice(0, 2)).toEqual([SPOTS.outside.at, SPOTS.door.at]);
    expect(m && lastOf(m.path)).toEqual(SPOTS['desk-1'].at);
    expect(m?.path).toEqual(pathBetween(SPOTS.outside.at, SPOTS['desk-1'].at));
    const duration = (pathLength(m?.path ?? []) / WALK_SPEED) * 1000;
    expect(WALK_SPEED).toBe(1.8);

    expect(viewOf(state, T0, A.key)).toMatchObject({ desk: 'desk-1', phase: 'arriving', walking: true, at: SPOTS.outside.at, activity: 'work' });
    expect(viewOf(state, T0 + duration / 2, A.key)).toMatchObject({ phase: 'arriving', walking: true });
    expect(viewOf(state, T0 + duration, A.key)).toEqual({
      key: A.key,
      kind: 'claude-code',
      ordinal: 1,
      visual: 'coding',
      desk: 'desk-1',
      phase: 'present',
      at: SPOTS['desk-1'].at,
      walking: false,
      face: SPOTS['desk-1'].face,
      activity: 'work',
      chat: null,
      helper: false,
      level: 1,
      levelUp: false,
    });
    expect(step(state, T0 + duration, [A]).members[0]?.phase).toBe('present');
  });

  it('gives each newcomer the lowest free desk, in input order', () => {
    const state = step(initialOffice(1, T0), T0, [A, B, member('claude-code:c')]);
    expect(memberViewsAt(state, T0).map((v) => [v.key, v.desk])).toEqual([
      [A.key, 'desk-1'],
      [B.key, 'desk-2'],
      ['claude-code:c', 'desk-3'],
    ]);
  });

  it('takes a desk freed in the middle before the higher ones', () => {
    const c = member('claude-code:c');
    let state = run(initialOffice(1, T0), T0, T0 + SETTLED, [A, B, c]);
    state = run(state, T0 + SETTLED, T0 + 2 * SETTLED, [A, c]);
    state = step(state, T0 + 2 * SETTLED + 250, [A, c, member('codex:d', 'coding', 'codex')]);
    expect(memberViewsAt(state, T0 + 2 * SETTLED + 250).map((v) => v.desk)).toEqual(['desk-1', 'desk-3', 'desk-2']);
  });

  it('seats eight at most; the ninth waits and comes in when a desk is freed, in input order', () => {
    const everyone = Array.from({ length: 10 }, (_, i) => member(`claude-code:${i + 1}`, 'coding', 'claude-code', i + 1));
    let state = run(initialOffice(1, T0), T0, T0 + SETTLED, everyone);
    expect(memberViewsAt(state, T0 + SETTLED).map((v) => v.desk)).toEqual(DESK_IDS);
    expect(state.members.map((m) => m.key)).not.toContain('claude-code:9');

    // Member 3 goes home: the ninth comes in only once member 3 is out of the door, and takes desk-3.
    const without3 = everyone.filter((m) => m.key !== 'claude-code:3');
    state = step(state, T0 + SETTLED + 250, without3);
    expect(viewOf(state, T0 + SETTLED + 250, 'claude-code:3')).toMatchObject({ phase: 'leaving', desk: 'desk-3' });
    expect(state.members.map((m) => m.key)).not.toContain('claude-code:9');
    state = run(state, T0 + SETTLED + 500, T0 + 2 * SETTLED, without3);
    const views = memberViewsAt(state, T0 + 2 * SETTLED);
    expect(views.map((v) => v.key)).not.toContain('claude-code:3');
    expect(views.find((v) => v.key === 'claude-code:9')).toMatchObject({ desk: 'desk-3' });
    expect(views.map((v) => v.key)).not.toContain('claude-code:10');
  });
});

describe('leaving (ADR-025 §3)', () => {
  it('a member whose session is gone walks out through the door; its desk is free once it is outside', () => {
    let state = run(initialOffice(1, T0), T0, T0 + SETTLED, [A, B]);
    state = step(state, T0 + SETTLED, [B]);
    const leaving = state.members.find((m) => m.key === A.key);
    expect(leaving?.path.slice(-2)).toEqual([SPOTS.door.at, SPOTS.outside.at]);
    expect(viewOf(state, T0 + SETTLED, A.key)).toMatchObject({ phase: 'leaving', walking: true, desk: 'desk-1', activity: 'idle-desk' });
    state = run(state, T0 + SETTLED + 250, T0 + 2 * SETTLED, [B]);
    expect(state.members.map((m) => m.key)).toEqual([B.key]);
    state = step(state, T0 + 2 * SETTLED + 250, [B, member('claude-code:new')]);
    expect(viewOf(state, T0 + 2 * SETTLED + 250, 'claude-code:new').desk).toBe('desk-1');
  });

  it('a member leaving whose session is back walks back to its own desk', () => {
    let state = run(initialOffice(1, T0), T0, T0 + SETTLED, [A, B]);
    state = step(state, T0 + SETTLED, [B]);
    state = step(state, T0 + SETTLED + 1_000, [A, B]);
    const back = state.members.find((m) => m.key === A.key);
    expect(back).toMatchObject({ phase: 'arriving', desk: 'desk-1' });
    expect(back && lastOf(back.path)).toEqual(SPOTS['desk-1'].at);
    state = run(state, T0 + SETTLED + 1_250, T0 + 2 * SETTLED, [A, B]);
    expect(viewOf(state, T0 + 2 * SETTLED, A.key)).toMatchObject({ phase: 'present', at: SPOTS['desk-1'].at, walking: false });
  });

  it('a member sent home while still walking in turns back the way it came', () => {
    let state = step(initialOffice(1, T0), T0, [A]);
    state = step(state, T0 + 300, []);
    const m = state.members[0];
    expect(m?.phase).toBe('leaving');
    // Still between outside and the door: straight back out, not in to the door first.
    expect(m?.path).toHaveLength(2);
    expect(m && lastOf(m.path)).toEqual(SPOTS.outside.at);
  });

  it('an offline session is not in the office', () => {
    let state = run(initialOffice(1, T0), T0, T0 + SETTLED, [A, B]);
    state = step(state, T0 + SETTLED, [{ ...A, visual: 'offline' }, B]);
    expect(viewOf(state, T0 + SETTLED, A.key).phase).toBe('leaving');
    state = run(state, T0 + SETTLED + 250, T0 + 2 * SETTLED, [{ ...A, visual: 'offline' }, B]);
    expect(state.members.map((m) => m.key)).toEqual([B.key]);
    expect(step(initialOffice(1, T0), T0, [member('x', 'offline')]).members).toEqual([]);
  });
});

describe("what a member does shows its own session's facts (ADR-025 §3)", () => {
  it.each([
    ['thinking', 'think'],
    ['coding', 'work'],
    ['browsing', 'work'],
    ['terminal', 'work'],
    ['file-work', 'work'],
    ['waiting-approval', 'wave'],
    ['error', 'upset'],
    ['delegated', 'delegate'],
    ['success', 'cheer'],
    ['idle', 'idle-desk'],
  ] as const)('%s → %s at the desk', (visual, activity) => {
    const state = seated([member('k', visual)]);
    expect(viewOf(state, T0, 'k')).toMatchObject({ activity, at: SPOTS['desk-1'].at, walking: false, helper: visual === 'delegated' });
  });

  it('keeps showing work at the desk for as long as the session works', () => {
    let state = seated([A]);
    state = run(state, T0, T0 + 10 * 60_000, [A], {}, 1_000);
    expect(viewOf(state, T0 + 10 * 60_000, A.key)).toMatchObject({ activity: 'work', at: SPOTS['desk-1'].at });
  });

  it('the helper bot is there only while work is delegated', () => {
    let state = seated([member('k', 'delegated')]);
    expect(viewOf(state, T0, 'k').helper).toBe(true);
    state = step(state, T0 + 500, [member('k', 'coding')]);
    expect(viewOf(state, T0 + 500, 'k')).toMatchObject({ helper: false, activity: 'work' });
  });

  it('cheers at the desk for CHEER_MS after a success, then rests like an idle member (to the lounge)', () => {
    let state = seated([member('k', 'coding')]);
    state = step(state, T0 + 1_000, [member('k', 'success')]);
    expect(CHEER_MS).toBe(3_000);
    expect(viewOf(state, T0 + 1_000, 'k')).toMatchObject({ activity: 'cheer', at: SPOTS['desk-1'].at, walking: false });
    state = run(state, T0 + 1_250, T0 + 3_750, [member('k', 'success')]);
    expect(viewOf(state, T0 + 3_750, 'k')).toMatchObject({ activity: 'cheer', walking: false });
    state = step(state, T0 + 4_000, [member('k', 'success')]);
    const view = viewOf(state, T0 + 4_000, 'k');
    expect(view.activity).not.toBe('cheer');
    expect(view.walking).toBe(true);
    expect(['coffee', 'water', 'sofa', 'window', 'plant']).toContain(view.activity);
  });

  it('cheers again for a new success', () => {
    let state = seated([member('k', 'success')]);
    state = run(state, T0 + 250, T0 + 2_500, [member('k', 'success')]);
    state = step(state, T0 + 2_600, [member('k', 'thinking')]);
    expect(viewOf(state, T0 + 2_600, 'k').activity).toBe('think');
    state = step(state, T0 + 2_700, [member('k', 'success')]);
    expect(viewOf(state, T0 + 2_700, 'k').activity).toBe('cheer');
    expect(viewOf(state, T0 + 2_700 + CHEER_MS - 1, 'k').activity).toBe('cheer');
    expect(viewOf(state, T0 + 2_700 + CHEER_MS, 'k').activity).toBe('idle-desk');
  });
});

describe('the lounge (ADR-025 §3)', () => {
  it('an idle member rests at its desk for a moment, then walks to a free lounge spot and rests there', () => {
    let state = seated([A]);
    state = step(state, T0 + 1_000, [member(A.key, 'idle')]);
    expect(IDLE_SETTLE_MS).toBe(1_500);
    state = step(state, T0 + 1_000 + IDLE_SETTLE_MS - 100, [member(A.key, 'idle')]);
    expect(viewOf(state, T0 + 1_000 + IDLE_SETTLE_MS - 100, A.key)).toMatchObject({ activity: 'idle-desk', at: SPOTS['desk-1'].at, walking: false });

    const leaveAt = T0 + 1_000 + IDLE_SETTLE_MS;
    state = step(state, leaveAt, [member(A.key, 'idle')]);
    const m = state.members[0];
    const spot = loungeSpotAt(m && lastOf(m.path));
    expect(spot).not.toBeNull();
    expect(m?.path).toEqual(pathBetween(SPOTS['desk-1'].at, SPOTS[spot ?? 'coffee'].at));
    const walking = viewOf(state, leaveAt, A.key);
    expect(walking.walking).toBe(true);
    expect(walking.phase).toBe('present');

    // Rests there on arrival, until its stay is over (then it wanders on, ADR-027 §1).
    const restAt = (m?.arriveAt ?? 0) + 250;
    expect(restAt).toBeLessThan(m?.stayUntil ?? 0);
    state = run(state, leaveAt + 250, restAt, [member(A.key, 'idle')]);
    const resting = viewOf(state, restAt, A.key);
    const expected = { coffee: 'coffee', water: 'water', 'sofa-1': 'sofa', 'sofa-2': 'sofa', window: 'window', plant: 'plant', books: 'books' } as const;
    expect(resting).toMatchObject({ walking: false, at: SPOTS[spot ?? 'coffee'].at, face: SPOTS[spot ?? 'coffee'].face, activity: expected[spot ?? 'coffee'], desk: 'desk-1' });
  });

  it('a quick idle blip does not send anyone walking', () => {
    let state = seated([A]);
    state = run(state, T0 + 250, T0 + 1_250, [member(A.key, 'idle')]);
    state = run(state, T0 + 1_500, T0 + 10_000, [A]);
    for (let now = T0; now <= T0 + 10_000; now += 250) {
      expect(viewOf(state, now, A.key).at).toEqual(SPOTS['desk-1'].at);
    }
    expect(state.members[0]?.path).toEqual([SPOTS['desk-1'].at]);
  });

  it('a member walking in idle sits down first, then goes to the lounge', () => {
    let state = step(initialOffice(1, T0), T0, [member('k', 'idle')]);
    const arrive = state.members[0]?.arriveAt ?? 0;
    state = run(state, T0 + 250, arrive + IDLE_SETTLE_MS - 250, [member('k', 'idle')]);
    expect(viewOf(state, arrive + IDLE_SETTLE_MS - 250, 'k')).toMatchObject({ at: SPOTS['desk-1'].at, walking: false, activity: 'idle-desk' });
    state = run(state, arrive + IDLE_SETTLE_MS, arrive + IDLE_SETTLE_MS + SETTLED, [member('k', 'idle')]);
    expect(loungeSpotOf(viewOf(state, arrive + IDLE_SETTLE_MS + SETTLED, 'k'))).not.toBeNull();
  });

  it('goes back to its desk when work starts again, facing the way it walks', () => {
    let state = seated([member('k', 'idle')]);
    state = run(state, T0 + 250, T0 + SETTLED, [member('k', 'idle')]);
    expect(loungeSpotOf(viewOf(state, T0 + SETTLED, 'k'))).not.toBeNull();
    state = step(state, T0 + SETTLED + 250, [member('k', 'coding')]);
    const back = viewOf(state, T0 + SETTLED + 250, 'k');
    expect(back).toMatchObject({ walking: true, activity: 'work' });
    const m = state.members[0];
    expect(m && lastOf(m.path)).toEqual(SPOTS['desk-1'].at);
    const [a, b] = m?.path ?? [];
    const dx = (b?.x ?? 0) - (a?.x ?? 0);
    const dy = (b?.y ?? 0) - (a?.y ?? 0);
    const face = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'front-right' : 'back-left') : dy >= 0 ? 'front-left' : 'back-right';
    expect(viewOf(state, T0 + SETTLED + 300, 'k').face).toBe(face);
    state = run(state, T0 + SETTLED + 500, T0 + 2 * SETTLED, [member('k', 'coding')]);
    expect(viewOf(state, T0 + 2 * SETTLED, 'k')).toMatchObject({ walking: false, at: SPOTS['desk-1'].at, activity: 'work', face: SPOTS['desk-1'].face });
  });

  it('turns back to the desk mid-walk when work starts on the way to the lounge', () => {
    let state = seated([member('k', 'idle')]);
    state = run(state, T0 + 250, T0 + IDLE_SETTLE_MS, [member('k', 'idle')]);
    expect(viewOf(state, T0 + IDLE_SETTLE_MS, 'k').walking).toBe(true);
    const mid = viewOf(state, T0 + IDLE_SETTLE_MS + 700, 'k').at;
    state = step(state, T0 + IDLE_SETTLE_MS + 700, [member('k', 'thinking')]);
    expect(state.members[0]?.path).toEqual(pathBetween(mid, SPOTS['desk-1'].at));
    expect(viewOf(state, T0 + IDLE_SETTLE_MS + 700, 'k')).toMatchObject({ activity: 'think', walking: true });
  });

  it('called for approval in the lounge: walks back to the desk first, then waves there', () => {
    let state = seated([member('k', 'idle')]);
    state = run(state, T0 + 250, T0 + SETTLED, [member('k', 'idle')]);
    state = step(state, T0 + SETTLED + 250, [member('k', 'waiting-approval')]);
    expect(viewOf(state, T0 + SETTLED + 250, 'k')).toMatchObject({ activity: 'wave', walking: true });
    state = run(state, T0 + SETTLED + 500, T0 + 2 * SETTLED, [member('k', 'waiting-approval')]);
    expect(viewOf(state, T0 + 2 * SETTLED, 'k')).toMatchObject({ activity: 'wave', walking: false, at: SPOTS['desk-1'].at });
  });

  it.each([['error', 'upset'], ['delegated', 'delegate']] as const)('%s in the lounge: back to the desk to %s', (visual, activity) => {
    let state = seated([member('k', 'idle')]);
    state = run(state, T0 + 250, T0 + SETTLED, [member('k', 'idle')]);
    state = run(state, T0 + SETTLED + 250, T0 + 2 * SETTLED, [member('k', visual)]);
    expect(viewOf(state, T0 + 2 * SETTLED, 'k')).toMatchObject({ activity, walking: false, at: SPOTS['desk-1'].at });
  });

  it('a success in the lounge: back to the desk, a full cheer there, then back to rest', () => {
    let state = seated([member('k', 'idle')]);
    state = run(state, T0 + 250, T0 + SETTLED, [member('k', 'idle')]);
    state = step(state, T0 + SETTLED + 250, [member('k', 'success')]);
    expect(viewOf(state, T0 + SETTLED + 250, 'k')).toMatchObject({ walking: true });
    const arrive = state.members[0]?.arriveAt ?? 0;
    expect(lastOf(state.members[0]?.path ?? [])).toEqual(SPOTS['desk-1'].at);
    state = run(state, T0 + SETTLED + 500, arrive + CHEER_MS - 100, [member('k', 'success')], {}, 100);
    expect(viewOf(state, arrive + 50, 'k')).toMatchObject({ activity: 'cheer', walking: false, at: SPOTS['desk-1'].at });
    expect(viewOf(state, arrive + CHEER_MS - 100, 'k').activity).toBe('cheer');
    state = run(state, arrive + CHEER_MS, arrive + CHEER_MS + SETTLED, [member('k', 'success')]);
    expect(loungeSpotOf(viewOf(state, arrive + CHEER_MS + SETTLED, 'k'))).not.toBeNull();
  });

  it('never puts two members on one lounge spot; with the lounge full the rest stay idle at their desks', () => {
    const everyone = Array.from({ length: 8 }, (_, i) => member(`k${i}`, 'idle', 'claude-code', i + 1));
    let state = seated(everyone, 3);
    state = run(state, T0 + 250, T0 + SETTLED, everyone);
    const views = memberViewsAt(state, T0 + SETTLED);
    const spots = views.map(loungeSpotOf).filter((s) => s !== null);
    expect(spots).toHaveLength(LOUNGE_SPOTS.length);
    expect(new Set(spots).size).toBe(spots.length);
    const atDesk = views.filter((v) => loungeSpotOf(v) === null);
    expect(atDesk).toHaveLength(everyone.length - LOUNGE_SPOTS.length);
    for (const v of atDesk) expect(v).toMatchObject({ activity: 'idle-desk', at: SPOTS[v.desk].at });

    // One resting member goes back to work: a member idle at its desk takes the freed spot.
    const worker = views.find((v) => loungeSpotOf(v) !== null);
    const freed = worker && loungeSpotOf(worker);
    const next = everyone.map((m) => (m.key === worker?.key ? { ...m, visual: 'coding' as const } : m));
    state = run(state, T0 + SETTLED + 250, T0 + 2 * SETTLED, next);
    const after = memberViewsAt(state, T0 + 2 * SETTLED);
    expect(after.filter((v) => loungeSpotOf(v) === freed).map((v) => v.key)).toHaveLength(1);
    expect(after.find((v) => v.key === worker?.key)).toMatchObject({ at: SPOTS[worker?.desk ?? 'desk-1'].at, activity: 'work' });
  });

  it('never chooses a spot someone else is already walking to', () => {
    const everyone = Array.from({ length: 8 }, (_, i) => member(`k${i}`, 'idle', 'claude-code', i + 1));
    for (const seed of [1, 2, 3, 4, 5]) {
      let state = seated(everyone, seed);
      state = step(state, T0 + IDLE_SETTLE_MS, everyone);
      const goals = state.members.map((m) => loungeSpotAt(lastOf(m.path))).filter((id) => id !== null);
      expect(goals, `seed ${seed}`).toHaveLength(LOUNGE_SPOTS.length);
      expect(new Set(goals).size, `seed ${seed}`).toBe(LOUNGE_SPOTS.length);
    }
  });

  it('chooses the lounge spot with the seeded randomness: the same seed the same spot, other seeds others', () => {
    const choose = (seed: number) => {
      let state = seated([member('k', 'idle')], seed);
      state = run(state, T0 + 250, T0 + IDLE_SETTLE_MS, [member('k', 'idle')]);
      return loungeSpotAt(lastOf(state.members[0]?.path ?? []));
    };
    expect(choose(42)).toBe(choose(42));
    const chosen = new Set(Array.from({ length: 30 }, (_, i) => choose(i + 1)));
    expect(chosen.size).toBeGreaterThanOrEqual(3);
    expect(chosen.has(null)).toBe(false);
  });
});

describe('reduced motion', () => {
  it('every move is instant: in at the desk, off to the lounge, out of the door', () => {
    let state = step(initialOffice(1, T0), T0, [member('k', 'idle')], { reducedMotion: true });
    expect(viewOf(state, T0, 'k')).toMatchObject({ phase: 'present', walking: false, at: SPOTS['desk-1'].at });
    state = step(state, T0 + IDLE_SETTLE_MS, [member('k', 'idle')], { reducedMotion: true });
    expect(loungeSpotOf(viewOf(state, T0 + IDLE_SETTLE_MS, 'k'))).not.toBeNull();
    expect(viewOf(state, T0 + IDLE_SETTLE_MS, 'k').walking).toBe(false);
    state = step(state, T0 + IDLE_SETTLE_MS + 1_000, [], { reducedMotion: true });
    expect(state.members).toEqual([]);
  });

  it('snaps walks in progress to where they were going when it turns on', () => {
    let state = step(initialOffice(1, T0), T0, [A, B]);
    state = step(state, T0 + 1_000, [B]);
    expect(memberViewsAt(state, T0 + 1_000).map((v) => v.walking)).toEqual([true, true]);
    state = step(state, T0 + 1_300, [B], { reducedMotion: true });
    expect(memberViewsAt(state, T0 + 1_300)).toEqual([expect.objectContaining({ key: B.key, phase: 'present', walking: false, at: SPOTS['desk-2'].at })]);
  });
});

describe('conversations (ADR-023, ADR-025 §4)', () => {
  const talk = (key: number, from: string, to: string | null): ConversationInput => ({ key, from, to });
  /** A and B seated, with an empty conversation list already seen. */
  const settled = () => step(seated([A, B]), T0 + 100, [A, B], { conversations: [] });
  const NOW = T0 + 1_000;
  const chatsOf = (state: OfficeState, now: number) => memberViewsAt(state, now).map((v) => v.chat);

  it('two members in the office talk for 4 s, turned to each other, then it ends', () => {
    const said = [talk(1, A.key, B.key)];
    let state = step(settled(), NOW, [A, B], { conversations: said });
    expect(CHAT_MS).toEqual({ talk: 4_000, letter: 3_000 });
    expect(chatsOf(state, NOW)).toEqual(['talk', 'talk']);
    // desk-2 is to the right of and below desk-1 on screen.
    expect(memberViewsAt(state, NOW).map((v) => v.face)).toEqual(['front-right', 'back-left']);
    state = step(state, NOW + 3_999, [A, B], { conversations: said });
    expect(chatsOf(state, NOW + 3_999)).toEqual(['talk', 'talk']);
    state = step(state, NOW + 4_000, [A, B], { conversations: said });
    expect(chatsOf(state, NOW + 4_000)).toEqual([null, null]);
    expect(memberViewsAt(state, NOW + 4_000).map((v) => v.face)).toEqual([SPOTS['desk-1'].face, SPOTS['desk-2'].face]);
  });

  it.each([
    ['nobody in particular', null],
    ['a session not in the office', 'codex:gone'],
    ['itself', A.key],
  ])('a message to %s is a letter over the sender for 3 s', (_, to) => {
    let state = step(settled(), NOW, [A, B], { conversations: [talk(1, A.key, to)] });
    expect(chatsOf(state, NOW)).toEqual(['letter', null]);
    expect(memberViewsAt(state, NOW).map((v) => v.face)).toEqual([SPOTS['desk-1'].face, SPOTS['desk-2'].face]);
    state = step(state, NOW + 3_000, [A, B], { conversations: [talk(1, A.key, to)] });
    expect(chatsOf(state, NOW + 3_000)).toEqual([null, null]);
  });

  it('ignores a message from a session that is not in the office, but marks it handled', () => {
    const state = step(settled(), NOW, [A, B], { conversations: [talk(1, 'codex:gone', A.key)] });
    expect(chatsOf(state, NOW)).toEqual([null, null]);
    expect(state.lastConversation).toBe(1);
  });

  it('a member still walking in is not in the office yet', () => {
    let state = step(initialOffice(1, T0), T0, [A, B], { conversations: [] });
    state = step(state, T0 + 300, [A, B], { conversations: [talk(1, A.key, B.key)] });
    expect(chatsOf(state, T0 + 300)).toEqual([null, null]);
  });

  it('a member walking to the lounge can talk, and keeps facing the way it walks', () => {
    let state = step(seated([member(A.key, 'idle'), B]), T0 + 100, [member(A.key, 'idle'), B], { conversations: [] });
    state = step(state, T0 + IDLE_SETTLE_MS, [member(A.key, 'idle'), B], { conversations: [] });
    const walking = viewOf(state, T0 + IDLE_SETTLE_MS + 100, A.key);
    expect(walking.walking).toBe(true);
    state = step(state, T0 + IDLE_SETTLE_MS + 100, [member(A.key, 'idle'), B], { conversations: [talk(1, B.key, A.key)] });
    const views = memberViewsAt(state, T0 + IDLE_SETTLE_MS + 100);
    expect(views.map((v) => v.chat)).toEqual(['talk', 'talk']);
    expect(views[0]?.face).toBe(walking.face);
  });

  it('does not replay messages sent before it started watching', () => {
    const history = [talk(5, A.key, B.key), talk(4, B.key, A.key)];
    let state = step(seated([A, B]), T0 + 100, [A, B], { conversations: history });
    expect(chatsOf(state, T0 + 100)).toEqual([null, null]);
    expect(state.lastConversation).toBe(5);
    state = step(state, NOW, [A, B], { conversations: [talk(6, B.key, A.key), ...history] });
    expect(chatsOf(state, NOW)).toEqual(['talk', 'talk']);
  });

  it('shows the first message ever when it started watching an empty list', () => {
    const state = step(settled(), NOW, [A, B], { conversations: [talk(0, A.key, B.key)] });
    expect(chatsOf(state, NOW)).toEqual(['talk', 'talk']);
  });

  it('handles several new messages oldest first (the input lists them newest first)', () => {
    const state = step(settled(), NOW, [A, B], { conversations: [talk(3, B.key, null), talk(2, A.key, B.key)] });
    expect(state.chats.map((c) => c.kind)).toEqual(['talk', 'letter']);
    // B's newest part is its letter; A is still talking.
    expect(chatsOf(state, NOW)).toEqual(['talk', 'letter']);
    expect(state.lastConversation).toBe(3);
  });

  it('a talk ends early when one of them leaves the office', () => {
    let state = step(settled(), NOW, [A, B], { conversations: [talk(1, A.key, B.key)] });
    state = step(state, NOW + 1_000, [A], { conversations: [talk(1, A.key, B.key)] });
    expect(chatsOf(state, NOW + 1_000)).toEqual([null, null]);
    expect(state.chats).toEqual([]);
  });

  it('is deterministic and leaves the lounge randomness alone', () => {
    const idleA = member(A.key, 'idle');
    const later = (conversations: readonly ConversationInput[]) => {
      let state = step(seated([idleA, B], 9), T0 + 100, [idleA, B], { conversations: [] });
      state = step(state, T0 + 500, [idleA, B], { conversations });
      return run(state, T0 + 750, T0 + SETTLED, [idleA, B], { conversations });
    };
    const quiet = later([]);
    const chatty = later([talk(1, A.key, B.key)]);
    expect(later([talk(1, A.key, B.key)])).toEqual(chatty);
    expect(chatty.rng).toBe(quiet.rng);
    expect(chatty.members).toEqual(quiet.members);
  });
});

describe('determinism', () => {
  it('the same seed and the same facts give the same office', () => {
    const script = (seed: number) => {
      let state = initialOffice(seed, T0);
      const c = member('codex:c', 'idle', 'codex');
      const timeline: Array<[number, MemberInput[]]> = [
        [T0, [A, B, c]],
        [T0 + 9_000, [member(A.key, 'idle'), B, c]],
        [T0 + 20_000, [member(A.key, 'idle'), member(B.key, 'success'), c]],
        [T0 + 30_000, [member(A.key, 'waiting-approval'), member(B.key, 'idle')]],
        [T0 + 45_000, [member(B.key, 'idle')]],
      ];
      for (const [i, [from, members]] of timeline.entries()) {
        const until = (timeline[i + 1]?.[0] ?? T0 + 60_000) - 1;
        state = run(state, from, until, members);
      }
      return state;
    };
    expect(script(5)).toEqual(script(5));
    expect(memberViewsAt(script(5), T0 + 60_000)).toEqual(memberViewsAt(script(5), T0 + 60_000));
  });

  it('does not change the state it is given', () => {
    const before = step(initialOffice(1, T0), T0, [A, B]);
    const copy = structuredClone(before);
    step(before, T0 + 500, [member(A.key, 'idle')]);
    expect(before).toEqual(copy);
  });
});

describe('wandering the lounge (ADR-027 §1)', () => {
  const idle = (key: string, ordinal = 1) => member(key, 'idle', 'claude-code', ordinal);
  /** Steps every 250 ms and records, per step, the member's goal spot (its `spot`) and whether it walks. */
  function trace(state: OfficeState, from: number, to: number, members: readonly MemberInput[], key: string, extra: Partial<OfficeInput> = {}) {
    const seen: { now: number; spot: string; walking: boolean }[] = [];
    let next = state;
    for (let now = from; now <= to; now += 250) {
      next = step(next, now, members, extra);
      const m = next.members.find((x) => x.key === key);
      if (m) seen.push({ now, spot: m.spot, walking: viewOf(next, now, key).walking });
    }
    return { state: next, seen };
  }
  const isLoungeSpot = (spot: string) => (LOUNGE_SPOTS as readonly string[]).includes(spot);

  it('after resting a while at one spot, walks on to another free lounge spot', () => {
    expect(LOUNGE_STAY_MS).toEqual({ min: 8_000, max: 16_000 });
    let state = seated([idle('k')]);
    state = run(state, T0 + 250, T0 + IDLE_SETTLE_MS, [idle('k')]);
    const first = state.members[0];
    expect(first && isLoungeSpot(first.spot)).toBe(true);
    const arrive = first?.arriveAt ?? 0;
    const stay = (first?.stayUntil ?? 0) - arrive;
    expect(stay).toBeGreaterThanOrEqual(LOUNGE_STAY_MS.min);
    expect(stay).toBeLessThanOrEqual(LOUNGE_STAY_MS.max);

    // Rests where it is until the stay is over…
    const until = first?.stayUntil ?? 0;
    state = run(state, T0 + IDLE_SETTLE_MS + 250, until - 1, [idle('k')]);
    expect(state.members[0]?.spot).toBe(first?.spot);
    expect(viewOf(state, until - 1, 'k')).toMatchObject({ walking: false, at: SPOTS[first?.spot as LoungeSpot].at });

    // …then walks from there to a different lounge spot, still resting (not working).
    state = step(state, until, [idle('k')]);
    const next = state.members[0];
    expect(next && isLoungeSpot(next.spot)).toBe(true);
    expect(next?.spot).not.toBe(first?.spot);
    expect(next?.path).toEqual(pathBetween(SPOTS[first?.spot as LoungeSpot].at, SPOTS[next?.spot as LoungeSpot].at));
    expect(viewOf(state, until + 250, 'k')).toMatchObject({ walking: true, desk: 'desk-1' });
    expect(next?.stayUntil).toBeGreaterThanOrEqual((next?.arriveAt ?? 0) + LOUNGE_STAY_MS.min);
  });

  it('keeps wandering for as long as it is idle: several spots in two minutes, never the desk', () => {
    const { seen } = trace(seated([idle('k')]), T0 + 250, T0 + 120_000, [idle('k')], 'k');
    const after = seen.filter((s) => s.now >= T0 + IDLE_SETTLE_MS);
    expect(after.every((s) => isLoungeSpot(s.spot))).toBe(true);
    expect(new Set(after.map((s) => s.spot)).size).toBeGreaterThanOrEqual(3);
  });

  it('never wanders onto a spot someone else holds or is walking to', () => {
    const everyone = [idle('a', 1), idle('b', 2), idle('c', 3), idle('d', 4)];
    let state = seated(everyone, 7);
    for (let now = T0 + 250; now <= T0 + 120_000; now += 250) {
      state = step(state, now, everyone);
      const goals = state.members.map((m) => m.spot).filter(isLoungeSpot);
      expect(new Set(goals).size, `at ${now - T0} ms`).toBe(goals.length);
    }
  });

  it('with every lounge spot taken nobody wanders; the one left at its desk stays there', () => {
    const everyone = Array.from({ length: 8 }, (_, i) => idle(`k${i}`, i + 1));
    let state = seated(everyone, 3);
    state = run(state, T0 + 250, T0 + SETTLED, everyone);
    const before = state.members.map((m) => m.spot);
    expect(before.filter(isLoungeSpot)).toHaveLength(LOUNGE_SPOTS.length);
    state = run(state, T0 + SETTLED + 250, T0 + SETTLED + 90_000, everyone);
    expect(state.members.map((m) => m.spot)).toEqual(before);
  });

  it('does not wander with reduced motion: it stays at the first spot it chose', () => {
    const { seen } = trace(seated([idle('k')]), T0 + 250, T0 + 120_000, [idle('k')], 'k', { reducedMotion: true });
    const after = seen.filter((s) => s.now >= T0 + IDLE_SETTLE_MS);
    expect(new Set(after.map((s) => s.spot)).size).toBe(1);
    expect(isLoungeSpot(after[0]?.spot ?? '')).toBe(true);
  });

  it('work starting mid-wander sends it straight back to its desk from where it is', () => {
    let state = seated([idle('k')]);
    state = run(state, T0 + 250, T0 + IDLE_SETTLE_MS, [idle('k')]);
    const until = state.members[0]?.stayUntil ?? 0;
    state = run(state, T0 + IDLE_SETTLE_MS + 250, until - 1, [idle('k')]);
    state = step(state, until, [idle('k')]);
    expect(viewOf(state, until + 400, 'k').walking).toBe(true);
    const mid = viewOf(state, until + 400, 'k').at;
    state = step(state, until + 400, [member('k', 'coding')]);
    expect(state.members[0]?.spot).toBe('desk-1');
    expect(state.members[0]?.path).toEqual(pathBetween(mid, SPOTS['desk-1'].at));
    expect(viewOf(state, until + 400, 'k')).toMatchObject({ activity: 'work', walking: true });
  });

  it('wanders the same way for the same seed', () => {
    const spots = (seed: number) => trace(seated([idle('k')], seed), T0 + 250, T0 + 90_000, [idle('k')], 'k').seen.map((s) => s.spot).join();
    expect(spots(11)).toBe(spots(11));
    expect(spots(11)).not.toBe(spots(12));
  });

  it('has a spot by the bookshelf, where a member stands reading the shelf', () => {
    expect(LOUNGE_SPOTS).toContain('books');
    expect(SPOTS.books).toMatchObject({ furniture: 'bookshelf', face: 'back-left' });
    const everyone = Array.from({ length: 8 }, (_, i) => idle(`k${i}`, i + 1));
    let state = seated(everyone, 3);
    state = run(state, T0 + 250, T0 + SETTLED, everyone);
    const reader = memberViewsAt(state, T0 + SETTLED).find((v) => loungeSpotOf(v) === 'books');
    expect(reader).toMatchObject({ activity: 'books', walking: false, face: 'back-left' });
  });
});

describe('levelling up (ADR-028 §4)', () => {
  const at = (level: number, visual: VisualState = 'success'): MemberInput => ({ ...A, visual, level });

  it('shows each member’s level, Lv 1 when none is given', () => {
    const state = seated([A, { ...B, level: 7 }]);
    expect(viewOf(state, T0, A.key).level).toBe(1);
    expect(viewOf(state, T0, B.key).level).toBe(7);
  });

  it(`stages a level-up for ${LEVEL_UP_MS} ms when a present member’s level rises`, () => {
    expect(LEVEL_UP_MS).toBe(2_500);
    let state = seated([at(2, 'coding')]);
    expect(viewOf(state, T0 + 500, A.key).levelUp).toBe(false);
    const rise = T0 + 1_000;
    state = step(state, rise, [at(3)]);
    expect(viewOf(state, rise, A.key)).toMatchObject({ level: 3, levelUp: true });
    expect(viewOf(state, rise + LEVEL_UP_MS - 1, A.key).levelUp).toBe(true);
    expect(viewOf(state, rise + LEVEL_UP_MS, A.key).levelUp).toBe(false);
  });

  it('does not stage one for a member that walks in at a high level', () => {
    const state = step(initialOffice(1, T0), T0, [at(9)]);
    expect(viewOf(state, T0, A.key)).toMatchObject({ level: 9, levelUp: false });
  });

  it('does not stage one when the level stays the same or reads lower', () => {
    let state = seated([at(3)]);
    state = step(state, T0 + 1_000, [at(3)]);
    expect(viewOf(state, T0 + 1_000, A.key).levelUp).toBe(false);
    state = step(state, T0 + 2_000, [at(2)]);
    expect(viewOf(state, T0 + 2_000, A.key)).toMatchObject({ level: 2, levelUp: false });
  });

  it('starts again when the level rises again during one', () => {
    let state = seated([at(2)]);
    state = step(state, T0 + 1_000, [at(3)]);
    state = step(state, T0 + 2_000, [at(4)]);
    expect(viewOf(state, T0 + 1_000 + LEVEL_UP_MS + 100, A.key)).toMatchObject({ level: 4, levelUp: true });
    expect(viewOf(state, T0 + 2_000 + LEVEL_UP_MS, A.key).levelUp).toBe(false);
  });

  it('shows the same level-up with reduced motion', () => {
    let state = seated([at(1)]);
    state = step(state, T0 + 1_000, [at(2)], { reducedMotion: true });
    expect(viewOf(state, T0 + 1_000, A.key).levelUp).toBe(true);
    expect(viewOf(state, T0 + 1_000 + LEVEL_UP_MS, A.key).levelUp).toBe(false);
  });

  it('levels up one member only', () => {
    let state = seated([at(1), { ...B, level: 1 }]);
    state = step(state, T0 + 1_000, [at(2), { ...B, level: 1 }]);
    expect(viewOf(state, T0 + 1_000, A.key).levelUp).toBe(true);
    expect(viewOf(state, T0 + 1_000, B.key).levelUp).toBe(false);
  });
});
