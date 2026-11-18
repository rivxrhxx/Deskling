import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VISUAL_STATES } from '../../core/agentEvent';
import type { Activity } from '../../core/life';
import { SPOTS } from '../../core/room';
import { VISUAL_SPEC } from '../visualSpec';
import { emoteFor } from './emote';
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

  it('uses the friend sheets for friends', () => {
    expect(spriteFor({ activity: 'visit', walking: false, face: 'front-right', frame: 0, who: 'friend-b' }).name).toBe('friend-b-sit-front');
    expect(spriteFor({ activity: 'help', walking: false, face: 'back-right', frame: 1, who: 'friend-a' }).name).toBe('friend-a-sit-back-type');
    expect(spriteFor({ activity: 'leave', walking: true, face: 'front-left', frame: 0, who: 'friend-a' }).name).toBe('friend-a-walk-a');
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
    [{ activity: 'call-user', anger: 'furious' }, 'exclaim-amber'],
    [{ activity: 'sleep', anger: 'furious', energy: 'empty' }, 'zzz'],
    [{ activity: 'sleep', reaction: { kind: 'hearts', id: 1 } }, 'heart'],
    [{ activity: 'eat', reaction: { kind: 'snack', id: 2 } }, 'note'],
  ] as const)('%j → %s', (overrides, emote) => {
    expect(emoteFor({ ...base, ...overrides })).toBe(emote);
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

  const visitor = { activity: 'visit' as const, at: SPOTS['sofa-2'].at, walking: false, face: SPOTS['sofa-2'].face, look: 1 };

  it('draws a visiting friend on the sofa', () => {
    const svg = room({ state: 'idle', hermes: hermesAt('host-friend', 'sofa'), friend: visitor });
    expect(svg.querySelector('[data-part="sofa"] [data-part="friend"]')).not.toBeNull();
  });

  it('does not draw a friend who has gone out of the door', () => {
    const gone = { ...visitor, activity: 'leave' as const, at: SPOTS.outside.at };
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
