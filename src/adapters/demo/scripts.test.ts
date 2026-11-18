import { describe, expect, it } from 'vitest';
import type { VisualState } from '../../core/agentEvent';
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
