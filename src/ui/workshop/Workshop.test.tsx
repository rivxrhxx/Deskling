import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VISUAL_STATES } from '../../core/agentEvent';
import { VISUAL_SPEC } from '../visualSpec';
import { Workshop } from './Workshop';

function scene() {
  return screen.getByRole('img', { name: /미니어처 작업실/ });
}

describe('Workshop scene (FR-S1, FR-S3, FR-S6)', () => {
  it('draws a miniature room with a work corner and a bed (ADR-017)', () => {
    render(<Workshop state="idle" />);
    expect(scene()).toHaveAttribute('viewBox', '0 0 400 260');
    for (const part of ['wall', 'window', 'shelf', 'floor', 'desk', 'monitor', 'keyboard', 'chair', 'mug', 'lamp', 'plant', 'bed', 'pillow', 'character']) {
      expect(scene().querySelector(`[data-part="${part}"]`), part).not.toBeNull();
    }
  });

  it.each([...VISUAL_STATES])('renders %s with its own pose, screen and tone', (state) => {
    const spec = VISUAL_SPEC[state];
    render(<Workshop state={state} />);
    const svg = scene();
    expect(svg).toHaveAttribute('data-state', state);
    expect(svg).toHaveAttribute('data-tone', spec.tone);
    expect(svg.querySelector('[data-part="character"]')).toHaveAttribute('data-pose', spec.pose);
    expect(svg.querySelector('[data-part="screen"]')).toHaveAttribute('data-screen', spec.screen);
    expect(svg).toHaveAccessibleName(`미니어처 작업실 — ${spec.label}`);
  });

  it('changes the actual drawing, not just attributes, between states', () => {
    const { rerender } = render(<Workshop state="coding" />);
    const coding = scene().querySelector('[data-part="character"]')?.innerHTML;
    rerender(<Workshop state="error" />);
    const error = scene().querySelector('[data-part="character"]')?.innerHTML;
    expect(coding).toBeTruthy();
    expect(error).not.toBe(coding);
  });

  it('shows the helper bot only while delegated', () => {
    const { rerender } = render(<Workshop state="delegated" />);
    expect(scene().querySelector('[data-part="helper"]')).not.toBeNull();
    rerender(<Workshop state="coding" />);
    expect(scene().querySelector('[data-part="helper"]')).toBeNull();
  });

  it.each([...VISUAL_STATES])('%s contains no text glyphs besides the accessible title (FR-S6)', (state) => {
    render(<Workshop state={state} />);
    const svg = scene();
    expect(svg.querySelectorAll('text, tspan, foreignObject')).toHaveLength(0);
    const title = svg.querySelector('title')?.textContent ?? '';
    expect((svg.textContent ?? '').replace(title, '').trim()).toBe('');
  });

  it('uses no external or raster images (NFR-2, NFR-3)', () => {
    render(<Workshop state="browsing" />);
    const svg = scene();
    expect(svg.querySelectorAll('image, img')).toHaveLength(0);
    for (const element of svg.querySelectorAll('*')) {
      for (const attr of ['href', 'xlink:href', 'src']) {
        expect(element.getAttribute(attr) ?? '').not.toMatch(/^(https?:|data:|\/\/)/);
      }
    }
  });

  it('keeps gradient ids unique per instance', () => {
    render(
      <>
        <Workshop state="idle" />
        <Workshop state="coding" />
      </>,
    );
    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Workshop places the character in the room (FR-V7, FR-V8, ADR-017)', () => {
  const character = () => scene().querySelector('[data-part="character"]');

  it.each([
    ['idle', 'bed', 'lounging'],
    ['offline', 'bed', 'asleep-in-bed'],
    ['coding', 'desk', 'typing'],
    ['waiting-approval', 'desk', 'raising-hand'],
  ] as const)('%s → %s (%s)', (state, place, pose) => {
    render(<Workshop state={state} />);
    expect(scene()).toHaveAttribute('data-place', place);
    expect(character()).toHaveAttribute('data-place', place);
    expect(character()).toHaveAttribute('data-pose', pose);
    expect(Boolean(character()?.closest('.work-corner'))).toBe(place === 'desk');
  });

  it('tucks the character under the blanket only while asleep', () => {
    const { rerender } = render(<Workshop state="offline" />);
    expect(scene().querySelector('[data-part="bed-blanket"]')).not.toBeNull();
    expect(scene().querySelector('[data-part="blanket"]')).toBeNull();
    rerender(<Workshop state="idle" />);
    expect(scene().querySelector('[data-part="bed-blanket"]')).toBeNull();
    expect(scene().querySelector('[data-part="blanket"]')).not.toBeNull();
  });

  it('wraps the character in a walker that is re-mounted only when the place changes', () => {
    const { rerender } = render(<Workshop state="coding" />);
    const deskWalker = scene().querySelector('.walker');
    expect(deskWalker).toHaveClass('walker--desk');
    rerender(<Workshop state="terminal" />);
    expect(scene().querySelector('.walker')).toBe(deskWalker);
    rerender(<Workshop state="idle" />);
    const bedWalker = scene().querySelector('.walker');
    expect(bedWalker).toHaveClass('walker--bed');
    expect(bedWalker).not.toBe(deskWalker);
  });
});
