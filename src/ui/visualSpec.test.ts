import { describe, expect, it } from 'vitest';
import designDoc from '../../docs/DESIGN.md?raw';
import type { VisualState } from '../core/agentEvent';
import { VISUAL_STATES } from '../core/agentEvent';
import { OFFICE_DECOR } from '../core/growth';
import type { MemberActivity } from '../core/office';
import { initialOffice, memberViewsAt, stepOffice } from '../core/office';
import { LOUNGE_SPOTS } from '../core/room';
import { memberEmote } from './office/emote';
import { memberPose } from './office/pose';
import { VISUAL_SPEC } from './visualSpec';

const specs = VISUAL_STATES.map((state) => VISUAL_SPEC[state]);
const code = (cell: string | undefined) => cell?.match(/`([^`]+)`/)?.[1];
const codes = (cell: string | undefined) => new Set([...(cell ?? '').matchAll(/`([^`]+)`/g)].map((match) => match[1]));

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

/** What a member of this state does once at its desk, from the office engine itself; null when it is not in the office. */
function deskActivity(visual: VisualState): MemberActivity | null {
  const office = stepOffice(initialOffice(1, 0), { now: 0, members: [{ key: 'demo:a', kind: 'demo', ordinal: 1, visual }], reducedMotion: true });
  return memberViewsAt(office, 0)[0]?.activity ?? null;
}

const calm = { walking: false, chat: null, energy: 'full', anger: 'calm' } as const;
const emoteAtDesk = (visual: VisualState) => {
  const activity = deskActivity(visual);
  return activity && memberEmote({ ...calm, visual, activity });
};

describe('visualSpec (FR-S3)', () => {
  it('covers exactly the 11 visual states', () => {
    expect(Object.keys(VISUAL_SPEC).sort()).toEqual([...VISUAL_STATES].sort());
  });

  it.each(['label', 'icon', 'screen'] as const)('gives every state a distinct %s', (key) => {
    expect(uniqueCount(specs.map((spec) => spec[key]))).toBe(VISUAL_STATES.length);
  });

  it('tells every state apart in the office by what the member does or the sign over it, not by colour (FR-R2)', () => {
    const looks = VISUAL_STATES.map((state) => `${deskActivity(state)}/${emoteAtDesk(state)}`);
    expect(uniqueCount(looks)).toBe(VISUAL_STATES.length);
  });

  it('leaves where a member is to the office engine (ADR-025)', () => {
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

  it.each([...VISUAL_STATES])('%s row agrees with the spec, the office engine and the emotes', (state) => {
    const row = rows.get(state);
    expect(row, `DESIGN.md has no row for ${state}`).toBeDefined();
    const [, label, icon, tone, screen, activity, emote] = row ?? [];
    const spec = VISUAL_SPEC[state];
    expect(label).toBe(spec.label);
    expect(icon).toBe(spec.icon);
    expect(tone).toBe(spec.tone);
    expect(code(screen)).toBe(spec.screen);
    const doing = deskActivity(state);
    if (doing) {
      expect(code(activity)).toBe(doing);
    } else {
      expect(code(activity)).toBeUndefined();
      expect(activity).toMatch(/문/);
    }
    expect(code(emote)).toBe(emoteAtDesk(state) ?? undefined);
  });
});

describe('docs/DESIGN.md §3.3 matches the member poses and emotes', () => {
  const ACTIVITIES: readonly MemberActivity[] = ['work', 'think', 'delegate', 'idle-desk', 'wave', 'upset', 'cheer', 'coffee', 'water', 'sofa', 'window', 'plant'];
  const LOUNGE: readonly MemberActivity[] = ['coffee', 'water', 'sofa', 'window', 'plant'];
  const rows = tableRows('### 3.3', '### 3.4', ACTIVITIES.map((activity) => `\`${activity}\``));
  /** The states a member is in while it does this: resting in the lounge, or what the engine has it do at its desk. */
  const visualsFor = (activity: MemberActivity) => (LOUNGE.includes(activity) ? (['idle'] as const) : VISUAL_STATES.filter((state) => deskActivity(state) === activity));

  it.each([...ACTIVITIES])('%s row agrees with the poses, places and emotes', (activity) => {
    const row = rows.get(`\`${activity}\``);
    expect(row, `DESIGN.md §3.3 has no row for ${activity}`).toBeDefined();
    const [, place, pose, emote] = row ?? [];
    const poses = new Set(
      [0, 1].flatMap((frame) => [true, false].map((away) => memberPose({ look: 'claude', activity, walking: false, face: 'back-right', frame, away }).name.replace(/^claude-/, ''))),
    );
    expect(codes(pose)).toEqual(poses);
    for (const spot of codes(place)) expect(LOUNGE_SPOTS, spot).toContain(spot);
    expect(codes(place).size > 0).toBe(LOUNGE.includes(activity));
    const signs = new Set(visualsFor(activity).map((visual) => memberEmote({ ...calm, visual, activity })).filter((sign) => sign !== null));
    expect(visualsFor(activity).length, activity).toBeGreaterThan(0);
    expect(codes(emote)).toEqual(signs);
  });
});

describe('docs/DESIGN.md §4.2 matches the office growth', () => {
  const rows = tableRows('### 4.2', '## 5. UI 요소', OFFICE_DECOR.map((decor) => `\`${decor.id}\``));

  it.each(OFFICE_DECOR.map((decor) => [decor.id, decor.xp] as const))('%s unlocks at %d', (id, xp) => {
    const row = rows.get(`\`${id}\``);
    expect(row, `DESIGN.md §4.2 has no row for ${id}`).toBeDefined();
    expect(row?.[1]).toBe(String(xp));
  });
});
