import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VISUAL_STATES } from '../../core/agentEvent';
import type { VisualState } from '../../core/agentEvent';
import type { Activity, GuestView } from '../../core/life';
import type { GuestSeat } from '../../core/room';
import { SPOTS } from '../../core/room';
import { VISUAL_SPEC } from '../visualSpec';
import { emoteFor, guestEmoteFor } from './emote';
import type { MiniRoomProps } from './MiniRoom';
import { MiniRoom } from './MiniRoom';
import { spriteFor } from './pose';

const hermesAt = (activity: Activity, spot: keyof typeof SPOTS = 'desk', walking = false) => ({
  activity,
  at: SPOTS[spot].at,
  walking,
  face: SPOTS[spot].face,
});

function room(props: Partial<MiniRoomProps> = {}) {
  render(<MiniRoom state="coding" hermes={hermesAt('type-code')} frame={0} {...props} />);
  return screen.getByRole('img', { name: /헤르메스의 방/ });
}

const count = (svg: Element, selector: string) => svg.querySelectorAll(selector).length;

describe('spriteFor (FR-R2, FR-R3)', () => {
  it('walks with alternating frames, facing the way it goes', () => {
    expect(spriteFor({ activity: 'shower', walking: true, face: 'front-right', frame: 0 })).toMatchObject({ name: 'front-walk-a', flip: false });
    expect(spriteFor({ activity: 'shower', walking: true, face: 'front-left', frame: 1 })).toMatchObject({ name: 'front-walk-b', flip: true });
    expect(spriteFor({ activity: 'shower', walking: true, face: 'back-right', frame: 0 })).toMatchObject({ name: 'back-walk-a' });
  });

  it.each([
    ['type-code', 'sit-back'],
    ['type-terminal', 'sit-back'],
    ['ponder', 'sit-back'],
    ['frustrated', 'hands-on-head'],
    ['call-user', 'wave'],
    ['celebrate', 'arms-up'],
    ['sleep', 'sleep'],
    ['nap', 'sleep'],
    ['shower', 'shower'],
    ['eat', 'sit-front'],
    ['watch-tv', 'sit-front'],
    ['read', 'read'],
    ['water-plant', 'water'],
    ['stretch', 'arms-up'],
    ['look-outside', 'back'],
  ] as const)('%s at rest → %s', (activity, name) => {
    expect(spriteFor({ activity, walking: false, face: 'back-right', frame: 0 }).name).toBe(name);
  });

  it('types with alternating hands', () => {
    expect(spriteFor({ activity: 'type-code', walking: false, face: 'back-right', frame: 1 }).name).toBe('sit-back-type');
  });

  it('uses the friend sheets for the helper', () => {
    expect(spriteFor({ activity: 'help', walking: false, face: 'back-right', frame: 1, who: 'friend-a' }).name).toBe('friend-a-sit-back-type');
    expect(spriteFor({ activity: 'help', walking: false, face: 'back-right', frame: 0, who: 'friend-b' }).name).toBe('friend-b-sit-back');
    expect(spriteFor({ activity: 'leave', walking: true, face: 'front-left', frame: 0, who: 'friend-a' }).name).toBe('friend-a-walk-a');
  });

  it('turns round on the desk stool to face a friend he talks with (ADR-023)', () => {
    expect(spriteFor({ activity: 'type-code', walking: false, face: 'front-left', frame: 1 })).toMatchObject({ name: 'sit-front', flip: true, seated: true });
    expect(spriteFor({ activity: 'browse', walking: false, face: 'front-right', frame: 0 })).toMatchObject({ name: 'sit-front', flip: false });
    expect(spriteFor({ activity: 'type-code', walking: false, face: 'back-left', frame: 1 })).toMatchObject({ name: 'sit-back-type', flip: true });
  });
});

describe('spriteFor: session friends (FR-MS3, ADR-022)', () => {
  const guest = (visual: VisualState, frame = 0, extra: Partial<Parameters<typeof spriteFor>[0]> = {}) =>
    spriteFor({ activity: 'visit', visual, walking: false, face: 'front-right', frame, who: 'claude', ...extra });

  it.each([
    ['coding', 0, 'claude-sit-front', true],
    ['coding', 1, 'claude-sit-front-type', true],
    ['browsing', 1, 'claude-sit-front-type', true],
    ['terminal', 1, 'claude-sit-front-type', true],
    ['file-work', 0, 'claude-sit-front', true],
    ['thinking', 1, 'claude-sit-think', true],
    ['delegated', 0, 'claude-sit-think', true],
    ['idle', 1, 'claude-sit-front', true],
    ['error', 1, 'claude-hands-on-head', true],
    ['waiting-approval', 0, 'claude-wave', false],
    ['waiting-approval', 1, 'claude-front', false],
    ['success', 0, 'claude-arms-up', false],
  ] as const)('%s, frame %d → %s (seated: %s)', (visual, frame, name, seated) => {
    expect(guest(visual, frame)).toMatchObject({ name, seated });
  });

  it('jumps for joy on odd frames', () => {
    expect(guest('success', 0).bob).toBe(0);
    expect(guest('success', 1).bob).toBeLessThan(0);
    expect(guest('coding', 1).bob).toBe(0);
  });

  it('walks in and out with the walk frames, its back turned when walking away', () => {
    expect(guest('coding', 0, { walking: true })).toMatchObject({ name: 'claude-walk-a', seated: false });
    expect(guest('coding', 1, { walking: true, face: 'back-left' })).toMatchObject({ name: 'claude-back-walk-b', flip: true });
    expect(guest('offline', 0, { activity: 'leave' }).name).toBe('claude-walk-a');
  });

  it('turns to its partner by facing, and uses its own kind’s sheet', () => {
    expect(guest('idle', 0, { face: 'back-left' })).toMatchObject({ name: 'claude-sit-front', flip: true });
    expect(guest('coding', 1, { who: 'codex' }).name).toBe('codex-sit-front-type');
  });
});

describe('emoteFor (FR-V4, FR-G4)', () => {
  const base = { walking: false, energy: 'full', anger: 'calm', reaction: null } as const;
  it.each([
    [{ activity: 'type-code' }, 'code'],
    [{ activity: 'browse' }, 'globe'],
    [{ activity: 'type-terminal' }, 'prompt'],
    [{ activity: 'handle-files' }, 'folder'],
    [{ activity: 'ponder' }, 'dots'],
    [{ activity: 'delegate' }, 'arrow'],
    [{ activity: 'call-user' }, 'exclaim-amber'],
    [{ activity: 'frustrated' }, 'exclaim-ember'],
    [{ activity: 'celebrate' }, 'sparkle'],
    [{ activity: 'sleep' }, 'zzz'],
    [{ activity: 'shower' }, 'bubbles'],
    [{ activity: 'type-code', walking: true }, null],
    [{ activity: 'type-code', anger: 'angry' }, 'vein'],
    [{ activity: 'type-code', anger: 'furious' }, 'steam'],
    [{ activity: 'type-code', energy: 'empty' }, 'battery'],
    [{ activity: 'type-code', anger: 'annoyed' }, 'sweat'],
    [{ activity: 'type-code', anger: 'annoyed', energy: 'empty' }, 'battery'],
    [{ activity: 'type-code', anger: 'unknown' }, 'code'],
    [{ activity: 'call-user', anger: 'furious' }, 'exclaim-amber'],
    [{ activity: 'sleep', anger: 'furious', energy: 'empty' }, 'zzz'],
    [{ activity: 'sleep', reaction: { kind: 'hearts', id: 1 } }, 'heart'],
    [{ activity: 'eat', reaction: { kind: 'snack', id: 2 } }, 'note'],
    [{ activity: 'type-code', chat: 'talk' }, 'talk'],
    [{ activity: 'call-user', chat: 'letter' }, 'letter'],
    [{ activity: 'type-code', anger: 'furious', chat: 'talk' }, 'talk'],
    [{ activity: 'type-code', chat: 'talk', reaction: { kind: 'hearts', id: 3 } }, 'heart'],
    [{ activity: 'type-code', chat: null }, 'code'],
  ] as const)('%j → %s', (overrides, emote) => {
    expect(emoteFor({ ...base, ...overrides })).toBe(emote);
  });
});

describe('guestEmoteFor (FR-MS3, FR-MS5)', () => {
  it.each([
    ['thinking', 'dots'],
    ['coding', 'code'],
    ['browsing', 'globe'],
    ['terminal', 'prompt'],
    ['file-work', 'folder'],
    ['delegated', 'arrow'],
    ['success', 'sparkle'],
    ['waiting-approval', 'exclaim-amber'],
    ['error', 'exclaim-ember'],
    ['idle', null],
    ['offline', null],
  ] as const)('%s → %s', (visual, emote) => {
    expect(guestEmoteFor({ visual, walking: false, chat: null })).toBe(emote);
  });

  it('a conversation comes first, then what the user is needed for, and no work signs while walking', () => {
    expect(guestEmoteFor({ visual: 'waiting-approval', walking: false, chat: 'talk' })).toBe('talk');
    expect(guestEmoteFor({ visual: 'error', walking: false, chat: 'letter' })).toBe('letter');
    expect(guestEmoteFor({ visual: 'waiting-approval', walking: true, chat: null })).toBe('exclaim-amber');
    expect(guestEmoteFor({ visual: 'coding', walking: true, chat: null })).toBeNull();
  });
});

describe('MiniRoom (FR-R1, ADR-019)', () => {
  it('is an accessible picture of Hermes’ room for the current state', () => {
    const svg = room({ state: 'browsing', hermes: hermesAt('browse') });
    expect(svg).toHaveAccessibleName(`헤르메스의 방 — ${VISUAL_SPEC.browsing.label}`);
    expect(svg).toHaveAttribute('data-state', 'browsing');
    expect(svg).toHaveAttribute('data-tone', VISUAL_SPEC.browsing.tone);
  });

  it('furnishes the room', () => {
    const svg = room();
    for (const part of ['floor', 'wall-left', 'wall-right', 'window', 'door', 'bed', 'bookshelf', 'tv', 'desk', 'monitor', 'fridge', 'shower', 'sofa', 'table', 'plant']) {
      expect(svg.querySelector(`[data-part="${part}"]`), part).not.toBeNull();
    }
  });

  it.each([...VISUAL_STATES])('shows the %s screen on the monitor', (state) => {
    const svg = room({ state });
    expect(svg.querySelector('[data-part="monitor-screen"]')).toHaveAttribute('data-screen', VISUAL_SPEC[state].screen);
  });

  it('draws Hermes with its activity and pose', () => {
    const svg = room({ hermes: hermesAt('type-code'), frame: 1 });
    const hermes = svg.querySelector('[data-part="hermes"]');
    expect(hermes).toHaveAttribute('data-activity', 'type-code');
    expect(hermes).toHaveAttribute('data-pose', 'sit-back-type');
  });

  it('moves Hermes on screen as its tile position changes', () => {
    const { rerender } = render(<MiniRoom state="idle" hermes={hermesAt('stretch', 'stretch')} frame={0} />);
    const before = screen.getByRole('img').querySelector('[data-part="hermes"] [data-part="sprite"]')?.getAttribute('transform');
    rerender(<MiniRoom state="idle" hermes={hermesAt('read', 'bookshelf')} frame={0} />);
    const after = screen.getByRole('img').querySelector('[data-part="hermes"] [data-part="sprite"]')?.getAttribute('transform');
    expect(after).not.toBe(before);
  });

  it.each([
    ['sleep', 'bed', 'bed'],
    ['shower', 'shower', 'shower'],
    ['watch-tv', 'sofa', 'sofa'],
  ] as const)('tucks Hermes into the %s furniture', (activity, spot, furniture) => {
    const svg = room({ state: activity === 'sleep' ? 'offline' : 'idle', hermes: hermesAt(activity, spot) });
    expect(svg.querySelector(`[data-part="${furniture}"] [data-part="hermes"]`)).not.toBeNull();
  });

  it('covers a sleeping Hermes with the blanket', () => {
    const svg = room({ state: 'offline', hermes: hermesAt('sleep', 'bed') });
    const bed = svg.querySelector('[data-part="bed"]')!;
    const children = [...bed.children];
    const hermes = children.findIndex((c) => c.getAttribute('data-part') === 'hermes');
    const blanket = children.findIndex((c) => c.getAttribute('data-part') === 'blanket');
    expect(hermes).toBeGreaterThanOrEqual(0);
    expect(blanket).toBeGreaterThan(hermes);
  });

  it('turns the lights off while offline', () => {
    expect(count(room({ state: 'offline', hermes: hermesAt('sleep', 'bed') }), '[data-part="night"]')).toBe(1);
  });

  it('keeps the lights on otherwise', () => {
    expect(count(room({ state: 'idle', hermes: hermesAt('read', 'bookshelf') }), '[data-part="night"]')).toBe(0);
  });

  it('does not draw a helper who has gone out of the door', () => {
    const gone = { activity: 'leave' as const, at: SPOTS.outside.at, walking: true, face: SPOTS.outside.face, look: 1 };
    expect(count(room({ state: 'idle', hermes: hermesAt('stretch', 'stretch'), friend: gone }), '[data-part="friend"]')).toBe(0);
  });

  it('gives a helping friend a laptop', () => {
    const friend = { activity: 'help' as const, at: SPOTS.helper.at, walking: false, face: SPOTS.helper.face, look: 0 };
    expect(count(room({ state: 'delegated', hermes: hermesAt('delegate'), friend }), '[data-part="laptop"]')).toBe(1);
  });

  it('shows one emote above Hermes', () => {
    const svg = room({ hermes: hermesAt('type-code'), anger: 'furious' });
    expect(svg.querySelector('[data-part="emote"]')).toHaveAttribute('data-emote', 'steam');
  });

  it.each([
    ['unknown', 0],
    ['ok', 1],
    ['low', 2],
    ['empty', 3],
  ] as const)('energy %s leaves %d empty cans on the desk', (energy, cans) => {
    expect(count(room({ energy }), '[data-part="energy-can"]')).toBe(cans);
  });

  it.each([
    ['baby', 2],
    ['kid', 2.25],
    ['adult', 2.5],
  ] as const)('draws a %s Hermes at %sx', (stage, scale) => {
    const svg = room({ stage });
    expect(svg.querySelector('[data-part="hermes"]')).toHaveAttribute('data-stage', stage);
    expect(svg.querySelector('[data-part="hermes"] [data-part="sprite"]')?.getAttribute('transform') ?? '').toContain(`scale(${scale}`);
  });

  it('pins the adult star badge on his chest only when the chest is visible (FR-G2)', () => {
    const badge = (props: Partial<MiniRoomProps>) => room(props).querySelector('[data-part="star-badge"]');
    expect(badge({ stage: 'adult', state: 'idle', hermes: hermesAt('stretch', 'stretch') })).not.toBeNull();
    cleanup();
    expect(badge({ stage: 'adult', state: 'coding', hermes: hermesAt('type-code') })).toBeNull();
    cleanup();
    expect(badge({ stage: 'adult', state: 'idle', hermes: hermesAt('read', 'bookshelf') })).toBeNull();
    cleanup();
    expect(badge({ stage: 'kid', state: 'idle', hermes: hermesAt('stretch', 'stretch') })).toBeNull();
  });

  it.each(['poster', 'desk-plant', 'string-lights', 'bedside-rug', 'more-books', 'trophy'] as const)('adds the unlocked %s', (id) => {
    const svg = room({ decor: [id] });
    expect(count(svg, `[data-part="decor-${id}"]`)).toBe(1);
  });

  it('plays care reactions', () => {
    const svg = room({ state: 'idle', hermes: hermesAt('eat', 'table'), reaction: { kind: 'snack', id: 4 } });
    expect(count(svg, '[data-part="cookie"]')).toBe(1);
    expect(svg.querySelector('[data-part="emote"]')).toHaveAttribute('data-emote', 'note');
  });

  it('draws only shapes: no text glyphs or raster images', () => {
    const svg = room({ state: 'delegated', hermes: hermesAt('delegate'), decor: ['poster', 'trophy'], energy: 'empty', anger: 'furious' });
    expect(svg.querySelectorAll('text, tspan, foreignObject, image')).toHaveLength(0);
    const title = svg.querySelector('title')?.textContent ?? '';
    expect((svg.textContent ?? '').replace(title, '').trim()).toBe('');
  });
});

const guestAt = (seat: GuestSeat, visual: VisualState, extra: Partial<GuestView> = {}): GuestView => ({
  key: `claude-code:${seat}`,
  kind: 'claude-code',
  ordinal: 1,
  visual,
  phase: 'seated',
  seat,
  at: SPOTS[seat].at,
  walking: false,
  face: SPOTS[seat].face,
  chat: null,
  ...extra,
});

describe('MiniRoom session friends (FR-MS2, FR-MS3, FR-MS5)', () => {
  const guestsOf = (svg: Element) => [...svg.querySelectorAll('[data-part="guest"]')];

  it('draws each friend with its session kind, number, state and pose', () => {
    const svg = room({
      frame: 1,
      guests: [
        guestAt('guest-1', 'coding'),
        guestAt('guest-2', 'waiting-approval', { key: 'codex:x', kind: 'codex', ordinal: 2 }),
      ],
    });
    const claude = svg.querySelector('[data-part="guest"][data-session-kind="claude-code"]');
    const codex = svg.querySelector('[data-part="guest"][data-session-kind="codex"]');
    expect(guestsOf(svg)).toHaveLength(2);
    expect(claude).toHaveAttribute('data-session-kind', 'claude-code');
    expect(claude).toHaveAttribute('data-ordinal', '1');
    expect(claude).toHaveAttribute('data-visual', 'coding');
    expect(claude).toHaveAttribute('data-pose', 'claude-sit-front-type');
    expect(claude?.querySelector('[data-part="emote"]')).toHaveAttribute('data-emote', 'code');
    expect(codex).toHaveAttribute('data-session-kind', 'codex');
    expect(codex).toHaveAttribute('data-ordinal', '2');
    expect(codex).toHaveAttribute('data-pose', 'codex-front');
    expect(codex?.querySelector('[data-part="emote"]')).toHaveAttribute('data-emote', 'exclaim-amber');
    expect(claude?.querySelector('[data-part="sprite"] path')).not.toBeNull();
  });

  it('gives every friend a floor cushion and a laptop whose screen shows its state', () => {
    const svg = room({ guests: [guestAt('guest-1', 'coding'), guestAt('guest-3', 'error', { key: 'claude-code:b', ordinal: 2 })] });
    expect(count(svg, '[data-part="guest-cushion"]')).toBe(2);
    const laptops = [...svg.querySelectorAll('[data-part="guest-laptop"]')];
    expect(laptops.map((l) => [l.getAttribute('data-open'), l.getAttribute('data-visual'), l.getAttribute('data-tone')]).sort()).toEqual([
      ['true', 'coding', 'cool'],
      ['true', 'error', 'ember'],
    ]);
  });

  it('keeps the laptop shut at the seat while its friend walks', () => {
    const walking = guestAt('guest-1', 'coding', { phase: 'arriving', walking: true, at: SPOTS.door.at, face: 'front-left' });
    const svg = room({ guests: [walking] });
    expect(svg.querySelector('[data-part="guest-laptop"]')).toHaveAttribute('data-open', 'false');
    expect(guestsOf(svg)[0]).toHaveAttribute('data-walking', 'true');
    expect(guestsOf(svg)[0]?.querySelector('[data-part="emote"]')).toBeNull();
  });

  it('does not draw a friend outside the door, and opens the door for one walking through it', () => {
    const outside = guestAt('guest-1', 'idle', { phase: 'arriving', walking: true, at: SPOTS.outside.at });
    let svg = room({ guests: [outside] });
    expect(guestsOf(svg)).toHaveLength(0);
    cleanup();
    svg = room({ guests: [guestAt('guest-1', 'idle', { phase: 'arriving', walking: true, at: { x: 8, y: 0.4 } })] });
    expect(svg.querySelector('[data-part="door"]')).toHaveAttribute('data-open', 'true');
    cleanup();
    svg = room({ guests: [guestAt('guest-1', 'idle')] });
    expect(svg.querySelector('[data-part="door"]')).toHaveAttribute('data-open', 'false');
  });

  it('sorts friends in depth with the furniture', () => {
    const svg = room({ guests: [guestAt('guest-1', 'idle'), guestAt('guest-2', 'idle', { key: 'claude-code:b', ordinal: 2 })] });
    const layers = [...svg.children];
    const indexOf = (selector: string) => layers.findIndex((layer) => layer.matches(selector) || layer.querySelector(selector) !== null);
    const plant = indexOf('[data-part="plant"]');
    // guest-2 (by the door) is behind the pot plant; guest-1 (front edge) is in front of everything.
    expect(indexOf('[data-part="guest"][data-ordinal="2"]')).toBeLessThan(plant);
    expect(indexOf('[data-part="guest"][data-ordinal="1"]')).toBeGreaterThan(plant);
  });

  it('shows a talk over both friends in a conversation and a letter over a sender', () => {
    const svg = room({
      guests: [
        guestAt('guest-1', 'coding', { chat: 'talk', face: 'back-right' }),
        guestAt('guest-2', 'idle', { key: 'codex:x', kind: 'codex', chat: 'talk' }),
        guestAt('guest-3', 'idle', { key: 'claude-code:c', ordinal: 3, chat: 'letter' }),
      ],
    });
    const shown = (selector: string) => {
      const guest = svg.querySelector(`[data-part="guest"]${selector}`);
      return [guest?.getAttribute('data-chat'), guest?.querySelector('[data-part="emote"]')?.getAttribute('data-emote')];
    };
    expect(shown('[data-session-kind="claude-code"][data-ordinal="1"]')).toEqual(['talk', 'talk']);
    expect(shown('[data-session-kind="codex"]')).toEqual(['talk', 'talk']);
    expect(shown('[data-ordinal="3"]')).toEqual(['letter', 'letter']);
  });

  it('shows Hermes talking with a friend', () => {
    const svg = room({ hermesChat: 'talk', hermes: { ...hermesAt('type-code'), face: 'front-left' } });
    const hermes = svg.querySelector('[data-part="hermes"]');
    expect(hermes).toHaveAttribute('data-chat', 'talk');
    expect(hermes).toHaveAttribute('data-pose', 'sit-front');
    expect(hermes?.querySelector('[data-part="emote"]')).toHaveAttribute('data-emote', 'talk');
  });

  it('still draws only shapes with a room full of friends', () => {
    const svg = room({
      guests: [
        guestAt('guest-1', 'success', { chat: 'talk' }),
        guestAt('guest-2', 'error', { key: 'codex:x', kind: 'codex' }),
        guestAt('guest-3', 'waiting-approval', { key: 'claude-code:c', ordinal: 3 }),
        guestAt('guest-4', 'thinking', { key: 'codex:y', kind: 'codex', ordinal: 2, chat: 'letter' }),
      ],
      hermesChat: 'talk',
    });
    expect(guestsOf(svg)).toHaveLength(4);
    expect(svg.querySelectorAll('text, tspan, foreignObject, image')).toHaveLength(0);
    const title = svg.querySelector('title')?.textContent ?? '';
    expect((svg.textContent ?? '').replace(title, '').trim()).toBe('');
  });
});
