import { describe, expect, it } from 'vitest';
import designDoc from '../../docs/DESIGN.md?raw';
import { VISUAL_STATES } from '../core/agentEvent';
import { IDLE_ACTIVITIES, IDLE_DURATION, IDLE_SPOT, REQUIRED } from '../core/life';
import { emoteFor, guestEmoteFor } from './miniroom/emote';
import { spriteFor } from './miniroom/pose';
import { VISUAL_SPEC } from './visualSpec';

const specs = VISUAL_STATES.map((state) => VISUAL_SPEC[state]);
const calm = { walking: false, energy: 'full', anger: 'calm', reaction: null } as const;
const code = (cell: string | undefined) => cell?.match(/`([^`]+)`/)?.[1];

function uniqueCount<T>(values: T[]): number {
  return new Set(values).size;
}

/** Rows of the markdown tables between two headings, keyed by their first cell. */
function tableRows(from: string, to: string, keys: readonly string[]): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  const section = designDoc.slice(designDoc.indexOf(from), designDoc.indexOf(to));
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((cell) => cell.trim());
    const key = cells[1];
    if (key && keys.includes(key)) rows.set(key, cells.slice(1, -1));
  }
  return rows;
}

describe('visualSpec (FR-S3)', () => {
  it('covers exactly the 11 visual states', () => {
    expect(Object.keys(VISUAL_SPEC).sort()).toEqual([...VISUAL_STATES].sort());
  });

  it.each(['label', 'icon', 'screen'] as const)('gives every state a distinct %s', (key) => {
    expect(uniqueCount(specs.map((spec) => spec[key]))).toBe(VISUAL_STATES.length);
  });

  it('gives every working state a distinct thing Hermes does (FR-R2)', () => {
    const required = VISUAL_STATES.map((state) => REQUIRED[state]).filter((entry) => entry !== null);
    expect(required).toHaveLength(VISUAL_STATES.length - 1);
    expect(uniqueCount(required.map((entry) => entry.activity))).toBe(required.length);
  });

  it('leaves where Hermes is to the life engine (ADR-020)', () => {
    for (const spec of specs) {
      expect(Object.keys(spec).sort()).toEqual(['description', 'icon', 'label', 'screen', 'tone']);
    }
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
});

describe('docs/DESIGN.md §4 matches the code', () => {
  const rows = tableRows('## 4. 상태별 사양', '### 4.1', VISUAL_STATES);

  it.each([...VISUAL_STATES])('%s row agrees with the spec, the life engine and the emotes', (state) => {
    const row = rows.get(state);
    expect(row, `DESIGN.md has no row for ${state}`).toBeDefined();
    const [, label, icon, tone, screen, activity, spot, emote] = row ?? [];
    const spec = VISUAL_SPEC[state];
    expect(label).toBe(spec.label);
    expect(icon).toBe(spec.icon);
    expect(tone).toBe(spec.tone);
    expect(code(screen)).toBe(spec.screen);
    const required = REQUIRED[state];
    if (required) {
      expect(code(activity)).toBe(required.activity);
      expect(code(spot)).toBe(required.spot);
      expect(code(emote)).toBe(emoteFor({ ...calm, activity: required.activity }));
    } else {
      expect(activity).toMatch(/일상/);
    }
  });
});

describe('docs/DESIGN.md §3.4 matches the session friends', () => {
  const states = VISUAL_STATES.filter((state) => state !== 'offline');
  const rows = tableRows('### 3.4', '## 4. 상태별 사양', states);
  const codes = (cell: string | undefined) => new Set([...(cell ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1]));

  it.each(states)('%s row agrees with the guest poses and emotes', (state) => {
    const row = rows.get(state);
    expect(row, `DESIGN.md §3.4 has no row for ${state}`).toBeDefined();
    const [, pose, emote] = row ?? [];
    const frames = [0, 1].map((frame) => spriteFor({ activity: 'visit', visual: state, walking: false, face: 'front-right', frame, who: 'claude' }).name.replace(/^claude-/, ''));
    expect(codes(pose)).toEqual(new Set(frames));
    expect(code(emote)).toBe(guestEmoteFor({ visual: state, walking: false, chat: null }) ?? undefined);
  });
});

describe('docs/DESIGN.md §4.3 matches the idle routine', () => {
  const rows = tableRows('### 4.3', '## 5. UI 요소', IDLE_ACTIVITIES.map((activity) => `\`${activity}\``));

  it.each([...IDLE_ACTIVITIES])('%s row agrees with the life engine and the emotes', (activity) => {
    const row = rows.get(`\`${activity}\``);
    expect(row, `DESIGN.md has no row for ${activity}`).toBeDefined();
    const [, spot, seconds, emote] = row ?? [];
    expect(code(spot)).toBe(IDLE_SPOT[activity]);
    expect(seconds).toBe(`${IDLE_DURATION[activity] / 1000}초`);
    expect(code(emote)).toBe(emoteFor({ ...calm, activity }) ?? undefined);
  });
});
