import { describe, expect, it } from 'vitest';
import type { VisualState } from '../../core/agentEvent';
import { VISUAL_STATES } from '../../core/agentEvent';
import type { AgentViewState } from '../../core/agentState';
import { initialAgentState, reduceAgentState } from '../../core/agentState';
import { deriveVitals } from '../../core/mood';
import { normalizeAgentEvent } from '../../core/normalize';
import type { RoomViewState } from '../../core/roomState';
import { initialRoomState, officeCounts, reduceRoom, sessionKey, sessionLabel } from '../../core/roomState';
import type { DemoScript } from './scripts';
import { DEMO_SCRIPTS, DEMO_SCRIPT_IDS, demoEvent, demoEventSource } from './scripts';

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
    '%s: every event normalizes, carries its source and has a unique id',
    (_id, script) => {
      const ids = new Set<string>();
      let seq = 0;
      for (const step of script.steps) {
        for (const spec of step.events) {
          seq += 1;
          const result = normalizeAgentEvent(demoEvent(spec, { session: script.session, seq, at: seq }));
          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.event.source).toEqual(spec.source ?? { kind: 'demo', session: script.session });
            ids.add(result.event.id);
          }
        }
      }
      expect(ids.size).toBe(seq);
    },
  );

  it('an event without its own source belongs to the script session as kind demo', () => {
    expect(demoEventSource({ type: 'agent.online' }, 'demo-x')).toEqual({ kind: 'demo', session: 'demo-x' });
    const own = { kind: 'codex', session: 'demo-codex' } as const;
    expect(demoEventSource({ type: 'agent.online', source: own }, 'demo-x')).toBe(own);
    expect(demoEvent({ type: 'agent.online', source: own }, { session: 'demo-x', seq: 4, at: 9 })).toMatchObject({ source: own, seq: 4, id: 'demo-codex-0004' });
  });
});

describe('demo usage reports and the life script (FR-V1–V4)', () => {
  /** Plays a script once and records visual + mood after each step (budget 200k). */
  function playWithMood(script: DemoScript) {
    let seq = 0;
    let state: AgentViewState = initialAgentState;
    const out: Array<{ visual: VisualState; energy: string; anger: string }> = [];
    for (const step of script.steps) {
      for (const spec of step.events) {
        seq += 1;
        const result = normalizeAgentEvent(demoEvent(spec, { session: script.session, seq, at: seq * 1000 }));
        if (!result.ok) throw new Error(`demo event rejected: ${result.error}`);
        state = reduceAgentState(state, result.event);
      }
      const vitals = deriveVitals(state.usage, 200_000);
      out.push({ visual: state.visual, energy: vitals.energy.level, anger: vitals.anger.level });
    }
    return out;
  }

  it.each(Object.values(DEMO_SCRIPTS).map((s) => [s.id, s] as const))('%s reports usage at least once', (_id, script) => {
    expect(script.steps.some((step) => step.events.some((e) => e.type === 'usage.reported'))).toBe(true);
  });

  it('life: rests, works through the day, gets tired and cross, then goes home', () => {
    const run = playWithMood(DEMO_SCRIPTS.life);
    expect(run.map((r) => r.visual)).toEqual([
      'idle',
      'thinking',
      'coding',
      'terminal',
      'browsing',
      'success',
      'idle',
      'offline',
    ]);
    expect(run.map((r) => r.energy)).toEqual(['full', 'full', 'full', 'ok', 'low', 'empty', 'empty', 'empty']);
    expect(run.map((r) => r.anger)).toEqual(['calm', 'calm', 'annoyed', 'angry', 'furious', 'furious', 'calm', 'calm']);
  });

  it('life loops with the same sequence', () => {
    const script = DEMO_SCRIPTS.life;
    expect(play(script, 2)).toEqual([...play(script), ...play(script)]);
  });

  it('usage reports never change the core and tour visual sequences', () => {
    expect(play(DEMO_SCRIPTS.core)).toEqual(CORE_SEQUENCE);
    expect(play(DEMO_SCRIPTS.tour)).toEqual([...VISUAL_STATES]);
  });
});

/** Plays a script through normalize → reduceRoom with a seq counter per session, recording the room after each step. */
function playRoom(script: DemoScript, loops = 1): RoomViewState[] {
  const seqs = new Map<string, number>();
  let room = initialRoomState;
  const after: RoomViewState[] = [];
  let at = 0;
  for (let loop = 0; loop < loops; loop += 1) {
    for (const step of script.steps) {
      for (const spec of step.events) {
        const key = sessionKey(demoEventSource(spec, script.session));
        const seq = (seqs.get(key) ?? 0) + 1;
        seqs.set(key, seq);
        const result = normalizeAgentEvent(demoEvent(spec, { session: script.session, seq, at }));
        if (!result.ok) throw new Error(`demo event rejected: ${result.error}`);
        const next = reduceRoom(room, result.event);
        if (next === room) throw new Error(`demo event ignored: ${spec.type}`);
        room = next;
      }
      after.push(room);
      at += step.dwellMs;
    }
  }
  return after;
}

const membersOf = (room: RoomViewState) =>
  room.memberKeys.map((key) => {
    const session = room.sessions[key]!;
    return [sessionLabel(session), session.visual];
  });
const said = (room: RoomViewState) => room.conversations.map(({ from, to }) => [from, to]);

describe('single-session scripts: one member, 데모 1 (ADR-025 §1)', () => {
  it.each(['core', 'tour', 'life'] as const)('%s plays one demo member', (id) => {
    const run = playRoom(DEMO_SCRIPTS[id]);
    for (const room of run) {
      expect(room.memberKeys.length).toBeLessThanOrEqual(1);
      for (const key of room.memberKeys) expect(sessionLabel(room.sessions[key]!)).toBe('데모 1');
    }
  });
});

describe('demo script: office — 사무실 하루 (ADR-025, FR-MS7)', () => {
  const script = DEMO_SCRIPTS.office;
  const run = playRoom(script);
  const C1 = 'claude-code:demo-claude-a';
  const C2 = 'claude-code:demo-claude-b';
  const C3 = 'claude-code:demo-claude-c';
  const X1 = 'codex:demo-codex-a';
  const A1 = 'custom:demo-agent-a';
  /** The first step at which `check` holds. */
  const first = (check: (room: RoomViewState) => boolean, from = 0) => {
    const index = run.findIndex((room, i) => i >= from && check(room));
    expect(index, 'no such step').toBeGreaterThanOrEqual(0);
    return { index, room: run[index]! };
  };
  const visualOf = (key: string) => (room: RoomViewState) => room.sessions[key]?.visual;

  it('is offered as a demo scenario', () => {
    expect(DEMO_SCRIPT_IDS).toContain('office');
    expect(DEMO_SCRIPT_IDS).not.toContain('friends');
    expect(script.id).toBe('office');
  });

  it('starts with one person at work', () => {
    expect(membersOf(run[0]!)).toEqual([['Claude 1', 'coding']]);
  });

  it('three Claude, two Codex and one other agent arrive over time, numbered within their kind', () => {
    const arrivals = run.map((room) => room.memberKeys.length);
    const full = arrivals.indexOf(6);
    expect(full).toBeGreaterThan(3);
    for (let i = 1; i <= full; i += 1) expect(arrivals[i]! - arrivals[i - 1]!).toBeGreaterThanOrEqual(0);
    expect(membersOf(run[full]!).map(([label]) => label)).toEqual(['Claude 1', 'Codex 1', 'Claude 2', '에이전트 1', 'Codex 2', 'Claude 3']);
  });

  it('shows thinking, coding, browsing, terminal and file work at its desks', () => {
    const seen = new Set(run.flatMap((room) => Object.values(room.sessions).map((s) => s.visual)));
    for (const visual of ['thinking', 'coding', 'browsing', 'terminal', 'file-work'] as const) expect(seen).toContain(visual);
  });

  it('Claude 1 talks with Codex 1 while both are in, and later sends a letter to nobody in particular', () => {
    const talk = first((room) => room.conversations.length === 1);
    expect(said(talk.room)).toEqual([[C1, X1]]);
    expect(talk.room.memberKeys).toEqual(expect.arrayContaining([C1, X1]));
    const letter = first((room) => room.conversations.length === 2);
    expect(said(letter.room)[0]).toEqual([C1, null]);
    expect(letter.index).toBeGreaterThan(talk.index);
    expect(run.at(-1)!.conversations).toHaveLength(2);
  });

  it('Claude 2 finishes, idles (so walks to the lounge) for a few beats, then gets back to work', () => {
    const done = first((room) => visualOf(C2)(room) === 'success');
    const idle = first((room) => visualOf(C2)(room) === 'idle', done.index);
    const back = first((room) => visualOf(C2)(room) === 'coding', idle.index);
    const restMs = script.steps.slice(idle.index + 1, back.index + 1).reduce((sum, step) => sum + step.dwellMs, 0);
    // Long enough to settle (1.5 s), walk over and be seen resting.
    expect(restMs).toBeGreaterThanOrEqual(12_000);
  });

  it('Codex 1 asks for approval, which is resolved back into its work', () => {
    const asking = first((room) => visualOf(X1)(room) === 'waiting-approval');
    expect(officeCounts(asking.room).waiting).toBe(1);
    const resolved = first((room) => visualOf(X1)(room) !== 'waiting-approval', asking.index);
    expect(resolved.index).toBeGreaterThan(asking.index);
    expect(visualOf(X1)(resolved.room)).toBe('terminal');
  });

  it('the other agent delegates (a helper bot comes) and then succeeds', () => {
    const delegated = first((room) => visualOf(A1)(room) === 'delegated');
    first((room) => visualOf(A1)(room) === 'success', delegated.index);
  });

  it('Claude 3 fails', () => {
    expect(officeCounts(first((room) => visualOf(C3)(room) === 'error').room).failing).toBe(1);
  });

  it('several people succeed (and cheer)', () => {
    const succeeded = new Set(run.flatMap((room) => Object.values(room.sessions).filter((s) => s.visual === 'success').map((s) => s.key)));
    expect(succeeded.size).toBeGreaterThanOrEqual(3);
    expect(run.at(-1)!.completedTurns).toBeGreaterThanOrEqual(4);
  });

  it('reports usage for the non-Claude sessions only (Claude Code reports none, FR-CC6)', () => {
    const reporters = new Set(
      script.steps.flatMap((step) => step.events.filter((e) => e.type === 'usage.reported').map((e) => e.source?.kind)),
    );
    expect(reporters.size).toBeGreaterThan(0);
    expect(reporters).not.toContain('claude-code');
  });

  it('people leave one by one until the office is empty', () => {
    const peak = run.reduce((max, room, i) => (room.memberKeys.length >= run[max]!.memberKeys.length ? i : max), 0);
    const leaving = run.slice(peak).map((room) => room.memberKeys.length);
    expect(leaving.at(-1)).toBe(0);
    for (let i = 1; i < leaving.length; i += 1) expect(leaving[i - 1]! - leaving[i]!).toBeLessThanOrEqual(1);
    expect(officeCounts(run.at(-1)!).total).toBe(0);
  });

  it('every beat lasts at least 3 s and the loop about a minute and a half', () => {
    for (const step of script.steps) expect(step.dwellMs).toBeGreaterThanOrEqual(3_000);
    const total = script.steps.reduce((sum, step) => sum + step.dwellMs, 0);
    expect(total).toBeGreaterThanOrEqual(80_000);
    expect(total).toBeLessThanOrEqual(100_000);
  });

  it('loops with the same people, numbers and conversations', () => {
    const twice = playRoom(script, 2);
    const steps = script.steps.length;
    expect(twice.slice(steps).map(membersOf)).toEqual(twice.slice(0, steps).map(membersOf));
    expect(twice.at(-1)!.conversationCount).toBe(2 * run.at(-1)!.conversationCount);
  });
});
