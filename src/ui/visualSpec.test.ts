import { describe, expect, it } from 'vitest';
import designDoc from '../../docs/DESIGN.md?raw';
import { VISUAL_STATES } from '../core/agentEvent';
import { VISUAL_SPEC } from './visualSpec';

const specs = VISUAL_STATES.map((state) => VISUAL_SPEC[state]);

function uniqueCount<T>(values: T[]): number {
  return new Set(values).size;
}

describe('visualSpec (FR-S3)', () => {
  it('covers exactly the 11 visual states', () => {
    expect(Object.keys(VISUAL_SPEC).sort()).toEqual([...VISUAL_STATES].sort());
  });

  it.each(['label', 'icon', 'pose', 'screen'] as const)('gives every state a distinct %s', (key) => {
    expect(uniqueCount(specs.map((spec) => spec[key]))).toBe(VISUAL_STATES.length);
  });

  it('gives every state a non-empty label and description', () => {
    for (const spec of specs) {
      expect(spec.label.trim()).not.toBe('');
      expect(spec.description.trim()).not.toBe('');
    }
  });

  it('reserves amber for waiting-approval and ember for error (FR-S5)', () => {
    expect(VISUAL_SPEC['waiting-approval'].tone).toBe('amber');
    expect(VISUAL_SPEC.error.tone).toBe('ember');
    expect(specs.filter((spec) => spec.tone === 'amber')).toHaveLength(1);
    expect(specs.filter((spec) => spec.tone === 'ember')).toHaveLength(1);
  });

  it('faces the viewer for states that need the user, the monitor while working', () => {
    expect(VISUAL_SPEC['waiting-approval'].gaze).toBe('viewer');
    expect(VISUAL_SPEC.error.gaze).toBe('viewer');
    expect(VISUAL_SPEC.coding.gaze).toBe('monitor');
    expect(VISUAL_SPEC.offline.gaze).toBe('closed');
  });
});

describe('visualSpec matches docs/DESIGN.md §4', () => {
  const rows = new Map<string, string[]>();
  for (const line of designDoc.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const state = cells[1];
    if (state && (VISUAL_STATES as readonly string[]).includes(state)) {
      rows.set(state, cells.slice(1, -1));
    }
  }

  it.each([...VISUAL_STATES])('%s row agrees with the spec', (state) => {
    const row = rows.get(state);
    expect(row, `DESIGN.md has no row for ${state}`).toBeDefined();
    const [, label, icon, pose, tone] = row ?? [];
    const spec = VISUAL_SPEC[state];
    expect(label).toBe(spec.label);
    expect(icon).toBe(spec.icon);
    expect(pose?.match(/`([^`]+)`/)?.[1]).toBe(spec.pose);
    expect(tone).toBe(spec.tone);
  });
});
