import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { VisualState } from '../../core/agentEvent';
import { SOURCE_KINDS } from '../../core/agentEvent';
import { OFFICE_DECOR } from '../../core/growth';
import type { MemberActivity, MemberView } from '../../core/office';
import type { DeskId, Facing } from '../../core/room';
import { DESK_IDS, SPOTS } from '../../core/room';
import { VISUAL_SPEC } from '../visualSpec';
import { memberEmote } from './emote';
import type { OfficeRoomProps } from './OfficeRoom';
import { OfficeRoom } from './OfficeRoom';
import { LOOK_OF, deskFacesAway, memberPose } from './pose';
import { EMOTES, GUEST_LOOKS, SPRITES } from './sprites';

/** What a member at its desk does for each state (core/office). */
const DESK_ACTIVITY: Readonly<Record<VisualState, MemberActivity>> = {
  offline: 'idle-desk',
  idle: 'idle-desk',
  thinking: 'think',
  coding: 'work',
  browsing: 'work',
  terminal: 'work',
  'file-work': 'work',
  'waiting-approval': 'wave',
  delegated: 'delegate',
  success: 'cheer',
  error: 'upset',
};

const member = (desk: DeskId, visual: VisualState, extra: Partial<MemberView> = {}): MemberView => ({
  key: `claude-code:${desk}`,
  kind: 'claude-code',
  ordinal: DESK_IDS.indexOf(desk) + 1,
  visual,
  desk,
  phase: 'present',
  at: SPOTS[desk].at,
  walking: false,
  face: SPOTS[desk].face,
  activity: DESK_ACTIVITY[visual],
  chat: null,
  helper: visual === 'delegated',
  level: 1,
  levelUp: false,
  ...extra,
});

const lounging = (desk: DeskId, spot: 'coffee' | 'water' | 'sofa-1' | 'sofa-2' | 'window' | 'plant', activity: MemberActivity) =>
  member(desk, 'idle', { at: SPOTS[spot].at, face: SPOTS[spot].face, activity });

function office(props: Partial<OfficeRoomProps> = {}) {
  render(<OfficeRoom members={[]} frame={0} {...props} />);
  return screen.getByRole('img', { name: /사무실/ });
}

const count = (svg: Element, selector: string) => svg.querySelectorAll(selector).length;
const memberOn = (svg: Element, desk: DeskId) => svg.querySelector(`[data-part="member"][data-desk="${desk}"]`);
const station = (svg: Element, desk: DeskId) => svg.querySelector(`[data-part="workstation"][data-desk="${desk}"]`);
/** Order of a workstation's direct children by their data-part. */
const layers = (group: Element | null) => [...(group?.children ?? [])].map((child) => child.getAttribute('data-part'));

describe('LOOK_OF (ADR-025 §1)', () => {
  it('draws Claude and Codex in their own looks and every other kind as an office agent', () => {
    expect(LOOK_OF).toEqual({ 'claude-code': 'claude', codex: 'codex', hermes: 'agent', demo: 'agent', custom: 'agent' });
    expect(Object.keys(LOOK_OF).sort()).toEqual([...SOURCE_KINDS].sort());
  });
});

describe('memberPose (ADR-025 §3)', () => {
  const pose = (activity: MemberActivity, extra: Partial<Parameters<typeof memberPose>[0]> = {}) =>
    memberPose({ look: 'claude', activity, walking: false, face: 'back-right', frame: 0, away: true, ...extra });

  it('knows which desks have their chair back to the viewer', () => {
    expect(DESK_IDS.filter(deskFacesAway)).toEqual(['desk-1', 'desk-2', 'desk-5', 'desk-6']);
  });

  it.each([
    ['work', true, 0, 'claude-sit-desk'],
    ['work', true, 1, 'claude-sit-desk-type'],
    ['work', false, 0, 'claude-sit-desk-front'],
    ['work', false, 1, 'claude-sit-desk-front-type'],
    ['delegate', true, 1, 'claude-sit-desk-type'],
    ['delegate', false, 0, 'claude-sit-desk-front'],
    ['think', true, 1, 'claude-sit-desk-back-think'],
    ['think', false, 0, 'claude-sit-desk-think'],
    ['idle-desk', true, 1, 'claude-sit-desk'],
    ['idle-desk', false, 1, 'claude-sit-desk-front'],
    ['wave', true, 0, 'claude-wave'],
    ['wave', true, 1, 'claude-front'],
    ['wave', false, 0, 'claude-wave'],
    ['upset', true, 0, 'claude-hands-on-head'],
    ['cheer', false, 1, 'claude-arms-up'],
    ['coffee', true, 0, 'claude-hold-mug'],
    ['water', false, 1, 'claude-hold-mug'],
    ['sofa', true, 0, 'claude-sit-sofa'],
    ['window', true, 0, 'claude-back'],
    ['plant', false, 1, 'claude-back'],
    ['books', true, 0, 'claude-back'],
  ] as const)('%s (back to the viewer: %s), frame %d → %s', (activity, away, frame, name) => {
    expect(pose(activity, { away, frame }).name).toBe(name);
  });

  it('shows its back only when seated at a desk that faces away, or looking at the window or a plant', () => {
    expect(pose('work', { away: true }).back).toBe(true);
    expect(pose('think', { away: true }).back).toBe(true);
    expect(pose('work', { away: false }).back).toBe(false);
    // Waving, upset and cheering turn round to the viewer even at a desk that faces away.
    expect(pose('wave', { away: true }).back).toBe(false);
    expect(pose('upset', { away: true }).back).toBe(false);
    expect(pose('cheer', { away: true }).back).toBe(false);
    expect(pose('window').back).toBe(true);
    expect(pose('coffee').back).toBe(false);
  });

  it('cheers with a small bob on odd frames only', () => {
    expect(pose('cheer', { frame: 0 }).bob).toBe(0);
    expect(pose('cheer', { frame: 1 }).bob).toBeLessThan(0);
    expect(pose('work', { frame: 1 }).bob).toBe(0);
  });

  it('sits up on the sofa cushion', () => {
    expect(pose('sofa').lift).toBeGreaterThan(0);
    expect(pose('work').lift).toBe(0);
  });

  it('bobs up a pixel on the second walking frame, facing either way (ADR-027 §3)', () => {
    for (const face of ['front-right', 'back-left'] as const) {
      expect(pose('work', { walking: true, face, frame: 0 }).bob).toBe(0);
      expect(pose('work', { walking: true, face, frame: 1 }).bob).toBe(-1);
    }
  });

  it('walks with alternating frames, its back turned when walking away, mirrored when walking left', () => {
    expect(pose('work', { walking: true, face: 'front-right', frame: 0 })).toMatchObject({ name: 'claude-walk-a', flip: false, back: false });
    expect(pose('coffee', { walking: true, face: 'front-left', frame: 1 })).toMatchObject({ name: 'claude-walk-b', flip: true });
    expect(pose('idle-desk', { walking: true, face: 'back-left', frame: 0 })).toMatchObject({ name: 'claude-back-walk-a', flip: true, back: true });
    expect(pose('sofa', { walking: true, face: 'back-right', frame: 1 })).toMatchObject({ name: 'claude-back-walk-b', flip: false });
  });

  it('uses the look it is given', () => {
    expect(pose('work', { look: 'codex', frame: 1 }).name).toBe('codex-sit-desk-type');
    expect(pose('coffee', { look: 'agent' }).name).toBe('agent-hold-mug');
  });

  it('only picks sprites that exist, for every look, activity, frame, facing and desk', () => {
    const activities: MemberActivity[] = ['work', 'think', 'wave', 'upset', 'cheer', 'delegate', 'idle-desk', 'coffee', 'water', 'sofa', 'window', 'plant'];
    const faces: Facing[] = ['front-right', 'front-left', 'back-right', 'back-left'];
    for (const look of GUEST_LOOKS)
      for (const activity of activities)
        for (const frame of [0, 1])
          for (const face of faces)
            for (const away of [true, false])
              for (const walking of [true, false]) {
                const { name } = memberPose({ look, activity, walking, face, frame, away });
                expect(SPRITES, name).toHaveProperty(name);
              }
  });
});

describe('memberEmote (ADR-025 §3, §6; ADR-023)', () => {
  const base = { visual: 'coding', activity: 'work', walking: false, chat: null, energy: 'full', anger: 'calm' } as const;

  it.each([
    [{ visual: 'thinking', activity: 'think' }, 'dots'],
    [{ visual: 'coding' }, 'code'],
    [{ visual: 'browsing' }, 'globe'],
    [{ visual: 'terminal' }, 'prompt'],
    [{ visual: 'file-work' }, 'folder'],
    [{ visual: 'delegated', activity: 'delegate' }, 'arrow'],
    [{ visual: 'success', activity: 'cheer' }, 'sparkle'],
    [{ visual: 'waiting-approval', activity: 'wave' }, 'exclaim-amber'],
    [{ visual: 'error', activity: 'upset' }, 'exclaim-ember'],
    [{ visual: 'idle', activity: 'idle-desk' }, null],
    [{ visual: 'success', activity: 'idle-desk' }, null],
    [{ visual: 'idle', activity: 'coffee' }, 'coffee'],
    [{ visual: 'idle', activity: 'water' }, 'coffee'],
    [{ visual: 'idle', activity: 'sofa' }, null],
    [{ visual: 'idle', activity: 'window' }, null],
    [{ visual: 'idle', activity: 'plant' }, null],
    // Walking: no work or coffee signs, but what the user is needed for still shows.
    [{ walking: true }, null],
    [{ visual: 'idle', activity: 'coffee', walking: true }, null],
    [{ visual: 'waiting-approval', activity: 'wave', walking: true }, 'exclaim-amber'],
    // Anger and energy over work, under the user's attention.
    [{ anger: 'furious' }, 'steam'],
    [{ anger: 'angry' }, 'vein'],
    [{ energy: 'empty' }, 'battery'],
    [{ anger: 'annoyed' }, 'sweat'],
    [{ anger: 'annoyed', energy: 'empty' }, 'battery'],
    [{ anger: 'furious', energy: 'empty' }, 'steam'],
    [{ anger: 'unknown', energy: 'unknown' }, 'code'],
    [{ anger: 'furious', walking: true }, 'steam'],
    [{ visual: 'waiting-approval', activity: 'wave', anger: 'furious' }, 'exclaim-amber'],
    [{ visual: 'error', activity: 'upset', energy: 'empty' }, 'exclaim-ember'],
    // A conversation comes first.
    [{ chat: 'talk' }, 'talk'],
    [{ chat: 'letter', visual: 'waiting-approval', activity: 'wave' }, 'letter'],
    [{ chat: 'talk', anger: 'furious' }, 'talk'],
    // A level-up (ADR-028 §4): after a conversation and what the user is needed for, before everything else.
    [{ levelUp: true, visual: 'success', activity: 'cheer' }, 'level-up'],
    [{ levelUp: true, walking: true }, 'level-up'],
    [{ levelUp: true, anger: 'furious', energy: 'empty' }, 'level-up'],
    [{ levelUp: true, chat: 'talk' }, 'talk'],
    [{ levelUp: true, visual: 'waiting-approval', activity: 'wave' }, 'exclaim-amber'],
    [{ levelUp: true, visual: 'error', activity: 'upset' }, 'exclaim-ember'],
  ] as const)('%j → %s', (overrides, emote) => {
    expect(memberEmote({ ...base, ...overrides })).toBe(emote);
  });

  it('defaults to no mood when vitals are not reported', () => {
    expect(memberEmote({ visual: 'coding', activity: 'work', walking: false, chat: null })).toBe('code');
  });

  it('only names emotes that exist', () => {
    for (const id of ['dots', 'code', 'globe', 'prompt', 'folder', 'arrow', 'sparkle', 'coffee', 'talk', 'letter', 'steam', 'vein', 'battery', 'sweat', 'exclaim-amber', 'exclaim-ember', 'level-up']) {
      expect(EMOTES, id).toHaveProperty(id);
    }
  });
});

describe('member levels in the scene (ADR-028 §3–§4)', () => {
  const badgeOf = (svg: Element, desk: DeskId) => svg.querySelector(`[data-part="member"][data-desk="${desk}"] [data-part="level"]`);

  it('gives every member a badge with its own level', () => {
    const svg = office({ members: [member('desk-1', 'coding', { level: 3 }), member('desk-2', 'idle'), member('desk-3', 'thinking', { level: 12 })] });
    expect(badgeOf(svg, 'desk-1')).toHaveAttribute('data-level', '3');
    expect(badgeOf(svg, 'desk-2')).toHaveAttribute('data-level', '1');
    expect(badgeOf(svg, 'desk-3')).toHaveAttribute('data-level', '12');
    expect(badgeOf(svg, 'desk-1')?.querySelectorAll('path').length).toBeGreaterThan(0);
  });

  it('widens the badge for a two-digit level', () => {
    const svg = office({ members: [member('desk-1', 'coding', { level: 9 }), member('desk-2', 'coding', { level: 10 })] });
    const width = (desk: DeskId) => Number(badgeOf(svg, desk)?.querySelector('rect')?.getAttribute('width'));
    expect(width('desk-2')).toBeGreaterThan(width('desk-1'));
  });

  it.each([
    [1, 'rookie'],
    [4, 'rookie'],
    [5, 'pro'],
    [9, 'pro'],
    [10, 'star'],
    [99, 'star'],
  ])('Lv %i wears the %s plate', (level, tier) => {
    const svg = office({ members: [member('desk-1', 'coding', { level })] });
    expect(badgeOf(svg, 'desk-1')).toHaveAttribute('data-tier', tier);
  });

  it('draws the level in pixels: the scene holds no text but its title', () => {
    const svg = office({ members: [member('desk-1', 'coding', { level: 42 })] });
    expect(svg.textContent).toBe('사무실 — 1명');
  });

  it('shows LEVEL UP over the head and makes the badge shine while the level has just risen', () => {
    const svg = office({ members: [member('desk-1', 'success', { activity: 'cheer', level: 5, levelUp: true }), member('desk-2', 'coding')] });
    const up = svg.querySelector('[data-part="member"][data-desk="desk-1"]');
    expect(up).toHaveAttribute('data-level-up', 'true');
    expect(up?.querySelector('[data-part="emote"]')).toHaveAttribute('data-emote', 'level-up');
    expect(badgeOf(svg, 'desk-1')).toHaveAttribute('data-shine', 'true');
    expect(svg.querySelector('[data-part="member"][data-desk="desk-2"]')).toHaveAttribute('data-level-up', 'false');
    expect(badgeOf(svg, 'desk-2')).toHaveAttribute('data-shine', 'false');
  });
});

describe('OfficeRoom (ADR-025 §2)', () => {
  it('is an accessible picture of the office that counts its members', () => {
    const svg = office({ members: [member('desk-1', 'coding'), member('desk-3', 'idle'), member('desk-5', 'thinking')] });
    expect(svg).toHaveAccessibleName('사무실 — 3명');
    expect(svg).toHaveAttribute('viewBox', '0 0 640 420');
    expect(svg).toHaveAttribute('data-count', '3');
    expect(svg).toHaveAttribute('data-empty', 'false');
  });

  it('says nobody is there, and turns the lights off, when the office is empty', () => {
    const svg = office();
    expect(svg).toHaveAccessibleName('사무실 — 아무도 없음');
    expect(svg).toHaveAttribute('data-count', '0');
    expect(svg).toHaveAttribute('data-empty', 'true');
    expect(count(svg, '[data-part="night"]')).toBe(1);
  });

  it('keeps the lights on while anyone is in', () => {
    expect(count(office({ members: [member('desk-2', 'idle')] }), '[data-part="night"]')).toBe(0);
  });

  it('furnishes the office', () => {
    const svg = office();
    for (const part of ['floor', 'wall-left', 'wall-right', 'window', 'door', 'whiteboard', 'meeting-table', 'coffee-machine', 'water-cooler', 'printer', 'sofa', 'bookshelf']) {
      expect(count(svg, `[data-part="${part}"]`), part).toBe(1);
    }
    expect(count(svg, '[data-part="plant"]')).toBe(2);
    for (const desk of DESK_IDS) {
      const group = station(svg, desk);
      expect(group, desk).not.toBeNull();
      for (const part of ['desk', 'chair', 'monitor']) expect(group?.querySelectorAll(`[data-part="${part}"]`), `${desk} ${part}`).toHaveLength(1);
    }
  });

  it('leaves the monitors of empty desks off', () => {
    const svg = office({ members: [member('desk-2', 'coding')] });
    const screens = [...svg.querySelectorAll('[data-part="monitor"]')].map((m) => [m.getAttribute('data-desk'), m.getAttribute('data-screen')]);
    expect(screens.sort()).toEqual(DESK_IDS.map((desk) => [desk, desk === 'desk-2' ? 'editor' : 'off']));
  });

  it.each(['thinking', 'coding', 'browsing', 'terminal', 'file-work', 'waiting-approval', 'delegated', 'success', 'error'] as const)(
    'shows the %s screen while its member is at the desk',
    (visual) => {
      const svg = office({ members: [member('desk-4', visual)] });
      expect(svg.querySelector('[data-part="monitor"][data-desk="desk-4"]')).toHaveAttribute('data-screen', VISUAL_SPEC[visual].screen);
    },
  );

  it('shows the screensaver while its member idles at the desk, rests in the lounge or walks', () => {
    const screen = (view: MemberView) => {
      const svg = office({ members: [view] });
      const id = svg.querySelector(`[data-part="monitor"][data-desk="${view.desk}"]`)?.getAttribute('data-screen');
      cleanup();
      return id;
    };
    expect(screen(member('desk-1', 'idle'))).toBe('screensaver');
    expect(screen(lounging('desk-1', 'coffee', 'coffee'))).toBe('screensaver');
    expect(screen(member('desk-1', 'coding', { walking: true, at: { x: 6, y: 6 }, face: 'back-right' }))).toBe('screensaver');
  });

  it('draws each member with its session kind, number, state, activity, pose and desk', () => {
    const svg = office({ frame: 1, members: [member('desk-1', 'coding'), member('desk-3', 'waiting-approval', { key: 'codex:x', kind: 'codex', ordinal: 2 })] });
    const claude = memberOn(svg, 'desk-1');
    expect(claude).toHaveAttribute('data-session-kind', 'claude-code');
    expect(claude).toHaveAttribute('data-ordinal', '1');
    expect(claude).toHaveAttribute('data-visual', 'coding');
    expect(claude).toHaveAttribute('data-activity', 'work');
    expect(claude).toHaveAttribute('data-pose', 'claude-sit-desk-type');
    expect(claude).toHaveAttribute('data-walking', 'false');
    expect(claude).not.toHaveAttribute('data-chat');
    expect(claude?.querySelector('[data-part="sprite"] path')).not.toBeNull();
    const codex = memberOn(svg, 'desk-3');
    expect(codex).toHaveAttribute('data-session-kind', 'codex');
    expect(codex).toHaveAttribute('data-ordinal', '2');
    expect(codex).toHaveAttribute('data-pose', 'codex-front');
  });

  it.each(['hermes', 'demo', 'custom'] as const)('draws a %s session as an office agent', (kind) => {
    const svg = office({ members: [member('desk-7', 'coding', { key: `${kind}:a`, kind })] });
    expect(memberOn(svg, 'desk-7')).toHaveAttribute('data-pose', 'agent-sit-desk-front');
    expect(memberOn(svg, 'desk-7')?.querySelector('[data-part="sprite"] path')).not.toBeNull();
  });

  it('seats a member at a desk facing the viewer behind the desk, so the desk front covers its lap', () => {
    for (const desk of ['desk-3', 'desk-4', 'desk-7', 'desk-8'] as const) {
      const svg = office({ members: [member(desk, 'coding')] });
      const order = layers(station(svg, desk));
      expect(order.indexOf('chair'), desk).toBeLessThan(order.indexOf('member'));
      expect(order.indexOf('member'), desk).toBeLessThan(order.indexOf('desk'));
      cleanup();
    }
  });

  it('seats a member at a desk facing away in front of the desk, behind its chair back', () => {
    for (const desk of ['desk-1', 'desk-2', 'desk-5', 'desk-6'] as const) {
      const svg = office({ members: [member(desk, 'coding')] });
      const order = layers(station(svg, desk));
      expect(order.indexOf('desk'), desk).toBeLessThan(order.indexOf('member'));
      expect(order.indexOf('member'), desk).toBeLessThan(order.indexOf('chair'));
      cleanup();
    }
  });

  it('draws only what shows over the desk of a member facing the viewer, so nothing sticks out past the desk end', () => {
    const rowsOf = (svg: Element, desk: DeskId) => {
      const d = [...(memberOn(svg, desk)?.querySelectorAll('[data-part="sprite"] path') ?? [])].map((p) => p.getAttribute('d') ?? '').join('');
      return Math.max(...[...d.matchAll(/M\d+ (\d+)/g)].map((match) => Number(match[1])));
    };
    const svg = office({ members: [member('desk-8', 'coding'), member('desk-7', 'waiting-approval'), member('desk-6', 'coding')] });
    expect(rowsOf(svg, 'desk-8')).toBeLessThan(12);
    expect(rowsOf(svg, 'desk-7')).toBeLessThan(12);
    // At a desk facing away the chair back covers the lower rows instead; the sprite is whole.
    expect(rowsOf(svg, 'desk-6')).toBe(13);
  });

  it('stands a member who turns round to the viewer in front of its chair', () => {
    const svg = office({ members: [member('desk-1', 'waiting-approval')] });
    const order = layers(station(svg, 'desk-1'));
    expect(order.indexOf('chair')).toBeLessThan(order.indexOf('member'));
  });

  it('draws walking and lounging members on their own, in depth with the furniture', () => {
    const walking = member('desk-1', 'coding', { phase: 'arriving', walking: true, at: { x: 9, y: 6 }, face: 'front-left' });
    const svg = office({ members: [walking, lounging('desk-2', 'window', 'window')] });
    expect(station(svg, 'desk-1')?.querySelector('[data-part="member"]')).toBeNull();
    expect(memberOn(svg, 'desk-1')).toHaveAttribute('data-walking', 'true');
    expect(memberOn(svg, 'desk-1')).toHaveAttribute('data-pose', 'claude-walk-a');
    expect(memberOn(svg, 'desk-2')).toHaveAttribute('data-pose', 'claude-back');
    const top = [...svg.children];
    const indexOf = (selector: string) => top.findIndex((layer) => layer.matches(selector) || layer.querySelector(selector) !== null);
    // The window-gazer stands in front of the coffee corner; the walker at (9, 6) in front of the back desk pod.
    expect(indexOf('[data-part="member"][data-desk="desk-2"]')).toBeGreaterThan(indexOf('[data-part="coffee-machine"]'));
    expect(indexOf('[data-part="member"][data-desk="desk-1"]')).toBeGreaterThan(indexOf('[data-part="workstation"][data-desk="desk-2"]'));
    expect(indexOf('[data-part="member"][data-desk="desk-1"]')).toBeLessThan(indexOf('[data-part="workstation"][data-desk="desk-8"]'));
  });

  it('seats sofa members on the sofa, in front of its back and behind its near arm', () => {
    const svg = office({ members: [lounging('desk-1', 'sofa-1', 'sofa'), lounging('desk-2', 'sofa-2', 'sofa')] });
    const sofa = svg.querySelector('[data-part="sofa"]');
    expect(sofa?.querySelectorAll('[data-part="member"]')).toHaveLength(2);
    expect(memberOn(svg, 'desk-1')).toHaveAttribute('data-pose', 'claude-sit-sofa');
    const order = layers(sofa);
    expect(order.indexOf('member')).toBeGreaterThan(order.indexOf('sofa-back'));
    expect(order.lastIndexOf('member')).toBeLessThan(order.indexOf('sofa-arm-near'));
  });

  it('holds a mug at the coffee machine and the water cooler', () => {
    const svg = office({ members: [lounging('desk-1', 'coffee', 'coffee'), lounging('desk-2', 'water', 'water')] });
    for (const desk of ['desk-1', 'desk-2'] as const) {
      expect(memberOn(svg, desk)).toHaveAttribute('data-pose', 'claude-hold-mug');
      expect(memberOn(svg, desk)?.querySelector('[data-part="emote"]')).toHaveAttribute('data-emote', 'coffee');
    }
  });

  it('moves a member on screen as its position changes', () => {
    const at = (x: number, y: number) => member('desk-1', 'coding', { walking: true, at: { x, y }, face: 'back-right' });
    const { rerender } = render(<OfficeRoom members={[at(6, 8)]} frame={0} />);
    const sprite = () => screen.getByRole('img').querySelector('[data-part="member"] [data-part="sprite"]')?.getAttribute('transform');
    const before = sprite();
    rerender(<OfficeRoom members={[at(6, 6)]} frame={0} />);
    expect(sprite()).not.toBe(before);
  });

  it('puts a helper bot beside the desk of a member who delegates', () => {
    const svg = office({ members: [member('desk-6', 'delegated'), member('desk-3', 'coding')] });
    expect(count(svg, '[data-part="helper-bot"]')).toBe(1);
    expect(station(svg, 'desk-6')?.querySelector('[data-part="helper-bot"] path')).not.toBeNull();
    expect(memberOn(svg, 'desk-6')).toHaveAttribute('data-pose', 'claude-sit-desk');
  });

  it('shows one emote over a member, from its state, conversation and vitals', () => {
    const svg = office({
      members: [
        member('desk-1', 'coding'),
        member('desk-2', 'coding', { key: 'codex:t', kind: 'codex', chat: 'talk', face: 'front-left' }),
        member('desk-3', 'coding', { key: 'codex:m' }),
        member('desk-4', 'error'),
      ],
      vitals: { 'codex:m': { energy: { level: 'empty' }, anger: { level: 'furious' } } },
    });
    const emote = (desk: DeskId) => memberOn(svg, desk)?.querySelectorAll('[data-part="emote"]');
    expect(emote('desk-1')?.[0]).toHaveAttribute('data-emote', 'code');
    expect(emote('desk-2')?.[0]).toHaveAttribute('data-emote', 'talk');
    expect(memberOn(svg, 'desk-2')).toHaveAttribute('data-chat', 'talk');
    expect(emote('desk-3')?.[0]).toHaveAttribute('data-emote', 'steam');
    expect(emote('desk-4')?.[0]).toHaveAttribute('data-emote', 'exclaim-ember');
    for (const desk of ['desk-1', 'desk-2', 'desk-3', 'desk-4'] as const) expect(emote(desk), desk).toHaveLength(1);
  });

  it('shows no emote over an idle member at its desk', () => {
    expect(memberOn(office({ members: [member('desk-5', 'idle')] }), 'desk-5')?.querySelector('[data-part="emote"]')).toBeNull();
  });

  it.each([
    ['unknown', 0],
    ['full', 0],
    ['ok', 1],
    ['low', 2],
    ['empty', 3],
  ] as const)('energy %s leaves %d empty cans on the member’s own desk', (level, cans) => {
    const svg = office({
      members: [member('desk-5', 'coding'), member('desk-2', 'coding')],
      vitals: { 'claude-code:desk-5': { energy: { level }, anger: { level: 'calm' } } },
    });
    expect(count(svg, '[data-part="energy-can"]')).toBe(cans);
    expect(station(svg, 'desk-5')?.querySelectorAll('[data-part="energy-can"]')).toHaveLength(cans);
    expect(count(svg, '[data-part="energy-can"][data-desk="desk-5"]')).toBe(cans);
  });

  it.each(OFFICE_DECOR.map((decor) => decor.id))('adds the unlocked %s', (id) => {
    expect(count(office(), `[data-part="decor-${id}"]`)).toBe(0);
    cleanup();
    expect(count(office({ decor: [id] }), `[data-part="decor-${id}"]`)).toBeGreaterThanOrEqual(1);
  });

  it('opens the door for a member walking through the doorway, and does not draw one outside', () => {
    const walker = (x: number, y: number) => member('desk-1', 'idle', { phase: 'arriving', walking: true, at: { x, y }, face: 'front-left', activity: 'idle-desk' });
    let svg = office({ members: [walker(SPOTS.outside.at.x, SPOTS.outside.at.y)] });
    expect(count(svg, '[data-part="member"]')).toBe(0);
    expect(svg).toHaveAttribute('data-count', '1');
    cleanup();
    svg = office({ members: [walker(12.4, 0.3)] });
    expect(svg.querySelector('[data-part="door"]')).toHaveAttribute('data-open', 'true');
    cleanup();
    svg = office({ members: [walker(8, 6)] });
    expect(svg.querySelector('[data-part="door"]')).toHaveAttribute('data-open', 'false');
    cleanup();
    svg = office({ members: [member('desk-1', 'coding')] });
    expect(svg.querySelector('[data-part="door"]')).toHaveAttribute('data-open', 'false');
  });

  it('draws only shapes: no text glyphs or raster images, even with a full office', () => {
    const svg = office({
      frame: 1,
      decor: OFFICE_DECOR.map((decor) => decor.id),
      members: [
        member('desk-1', 'coding', { chat: 'talk' }),
        member('desk-2', 'delegated'),
        member('desk-3', 'waiting-approval', { key: 'codex:a', kind: 'codex' }),
        member('desk-4', 'error', { key: 'demo:a', kind: 'demo' }),
        member('desk-5', 'success'),
        member('desk-6', 'thinking', { chat: 'letter' }),
        lounging('desk-7', 'sofa-1', 'sofa'),
        lounging('desk-8', 'coffee', 'coffee'),
      ],
      vitals: { 'claude-code:desk-1': { energy: { level: 'empty' }, anger: { level: 'furious' } } },
    });
    expect(count(svg, '[data-part="member"]')).toBe(8);
    expect(svg.querySelectorAll('text, tspan, foreignObject, image')).toHaveLength(0);
    const title = svg.querySelector('title')?.textContent ?? '';
    expect((svg.textContent ?? '').replace(title, '').trim()).toBe('');
  });
});

describe('small loops (ADR-027 §3)', () => {
  it('draws each member\'s sprite inside a body that the stylesheet animates, by what it does', () => {
    const svg = office({ members: [member('desk-1', 'thinking'), lounging('desk-2', 'window', 'window')] });
    for (const m of svg.querySelectorAll('[data-part="member"]')) {
      const body = m.querySelector('[data-part="body"]');
      expect(body).toHaveClass('member__body');
      expect(body?.querySelector('[data-part="sprite"]')).not.toBeNull();
      // The emote floats on its own, outside the body.
      expect(body?.querySelector('[data-part="emote"]')).toBeNull();
    }
  });

  it('gives every member its own beat, the same on every render, so they do not all move at once', () => {
    const keys = ['claude-code:a', 'claude-code:b', 'codex:a', 'codex:b', 'demo:x'];
    const beats = (members: MemberView[]) => {
      const svg = office({ members });
      const found = [...svg.querySelectorAll('[data-part="body"]')].map((b) => (b as SVGElement).style.getPropertyValue('--beat'));
      cleanup();
      return found;
    };
    const everyone = keys.map((key, i) => member(DESK_IDS[i] as DeskId, 'idle', { key }));
    const first = beats(everyone);
    expect(first).toHaveLength(keys.length);
    for (const beat of first) {
      expect(Number(beat)).toBeGreaterThanOrEqual(0);
      expect(Number(beat)).toBeLessThan(1);
    }
    expect(new Set(first).size).toBe(keys.length);
    expect(beats(everyone)).toEqual(first);
  });

  it('lets clouds drift past the window by day; at night there are none', () => {
    expect(office({ members: [member('desk-1', 'coding')] }).querySelector('[data-part="clouds"]')).toHaveClass('cloud-drift');
    cleanup();
    expect(office().querySelector('[data-part="clouds"]')).toBeNull();
  });

  it('sways the leaves of both floor plants', () => {
    const svg = office({ members: [member('desk-1', 'coding')] });
    const plants = [...svg.querySelectorAll('[data-part="plant"]')];
    expect(plants).toHaveLength(2);
    for (const plant of plants) expect(plant.querySelector('.plant-sway ellipse')).not.toBeNull();
  });
});

