import { describe, expect, it } from 'vitest';
import type { VisualState } from '../../core/agentEvent';
import { VISUAL_STATES } from '../../core/agentEvent';
import type { AgentViewState } from '../../core/agentState';
import { initialAgentState, reduceAgentState } from '../../core/agentState';
import { normalizeAgentEvent } from '../../core/normalize';
import type { DemoScript } from './scripts';
import { DEMO_SCRIPTS, demoEvent } from './scripts';

/** Plays a script through the real pipeline (normalize → reducer) and records the visual after each step. */
function play(script: DemoScript, loops = 1): VisualState[] {
  let seq = 0;
  let state: AgentViewState = initialAgentState;
  const seen: VisualState[] = [];
  for (let loop = 0; loop < loops; loop += 1) {
    for (const step of script.steps) {
      for (const spec of step.events) {
        seq += 1;
        const result = normalizeAgentEvent(demoEvent(spec, { session: script.session, seq, at: seq * 1000 }));
        if (!result.ok) throw new Error(`demo event rejected: ${result.error}`);
        state = reduceAgentState(state, result.event);
      }
      seen.push(state.visual);
    }
  }
  return seen;
}

const CORE_SEQUENCE: VisualState[] = ['idle', 'thinking', 'coding', 'terminal', 'success', 'idle'];

describe('demo script: core (FR-D2)', () => {
  it('plays idle → thinking → coding → terminal → success → idle', () => {
    expect(play(DEMO_SCRIPTS.core)).toEqual(CORE_SEQUENCE);
  });

  it('repeats the same sequence when looped (FR-D4)', () => {
    expect(play(DEMO_SCRIPTS.core, 2)).toEqual([...CORE_SEQUENCE, ...CORE_SEQUENCE]);
  });

  it('uses fixed, positive dwell times (FR-D1)', () => {
    for (const step of DEMO_SCRIPTS.core.steps) {
      expect(Number.isInteger(step.dwellMs)).toBe(true);
      expect(step.dwellMs).toBeGreaterThan(0);
    }
  });
});

describe('demo script: tour (FR-D3)', () => {
  it('visits all 11 visual states in protocol order', () => {
    expect(play(DEMO_SCRIPTS.tour)).toEqual([...VISUAL_STATES]);
  });

  it('repeats the same tour when looped (FR-D4)', () => {
    expect(play(DEMO_SCRIPTS.tour, 2)).toEqual([...VISUAL_STATES, ...VISUAL_STATES]);
  });

  it('uses fixed, positive dwell times (FR-D1)', () => {
    for (const step of DEMO_SCRIPTS.tour.steps) {
      expect(Number.isInteger(step.dwellMs)).toBe(true);
      expect(step.dwellMs).toBeGreaterThan(0);
    }
  });

  it('runs in its own session so switching scripts starts fresh', () => {
    expect(DEMO_SCRIPTS.tour.session).not.toBe(DEMO_SCRIPTS.core.session);
  });
});

describe('demo events use the real normalization path (FR-D6)', () => {
  it.each(Object.values(DEMO_SCRIPTS).map((s) => [s.id, s] as const))(
    '%s: every event normalizes, is marked demo and has a unique id',
    (_id, script) => {
      const ids = new Set<string>();
      let seq = 0;
      for (const step of script.steps) {
        for (const spec of step.events) {
          seq += 1;
          const result = normalizeAgentEvent(demoEvent(spec, { session: script.session, seq, at: seq }));
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.event.source).toEqual({ kind: 'demo', session: script.session });
            ids.add(result.event.id);
          }
        }
      }
      expect(ids.size).toBe(seq);
    },
  );
});
