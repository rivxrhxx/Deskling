import { describe, expect, it } from 'vitest';
import type { VisualState } from '../../core/agentEvent';
import { VISUAL_STATES } from '../../core/agentEvent';
import type { AgentViewState } from '../../core/agentState';
import { initialAgentState, reduceAgentState } from '../../core/agentState';
import { deriveVitals } from '../../core/mood';
import { normalizeAgentEvent } from '../../core/normalize';
import type { RoomViewState } from '../../core/roomState';
import { initialRoomState, reduceRoom, residentView, sessionKey, sessionLabel } from '../../core/roomState';
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

  it('life: rests in bed, works through the day, gets tired and cross, then sleeps', () => {
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

const guestsOf = (room: RoomViewState) =>
  room.guestKeys.map((key) => {
    const session = room.sessions[key]!;
    return [sessionLabel(session), session.visual];
  });
const said = (room: RoomViewState) => room.conversations.map(({ from, to }) => [from, to]);

describe('demo script: friends — 방 친구들 (FR-MS7)', () => {
  const script = DEMO_SCRIPTS.friends;
  const run = playRoom(script);
  const H = 'hermes:demo-hermes';
  const C1 = 'claude-code:demo-claude-a';
  const C2 = 'claude-code:demo-claude-b';
  const X1 = 'codex:demo-codex-a';
  /** The room after the first step at which `check` holds. */
  const first = (check: (room: RoomViewState) => boolean) => {
    const index = run.findIndex(check);
    expect(index, 'no such step').toBeGreaterThanOrEqual(0);
    return { index, room: run[index]! };
  };

  it('is offered as a demo scenario', () => {
    expect(DEMO_SCRIPT_IDS).toContain('friends');
    expect(script.id).toBe('friends');
  });

  it('Hermes is online and coding from the start, with no friends yet', () => {
    expect(residentView(run[0]!)).toMatchObject({ visual: 'coding', key: H });
    expect(run[0]!.guestKeys).toEqual([]);
  });

  it('Claude 1, Claude 2 and Codex 1 arrive one by one and get to work', () => {
    const arrivals = run.map((room) => room.guestKeys.length);
    expect(arrivals.slice(0, 4)).toEqual([0, 1, 2, 3]);
    expect(guestsOf(run[3]!)).toEqual([
      ['Claude 1', 'coding'],
      ['Claude 2', 'browsing'],
      ['Codex 1', 'terminal'],
    ]);
  });

  it('Claude 1 talks with Codex 1, then Codex 1 asks for approval, which is resolved', () => {
    const talk = first((room) => room.conversations.length === 1);
    expect(said(talk.room)).toEqual([[C1, X1]]);
    const asking = first((room) => room.sessions[X1]?.visual === 'waiting-approval');
    expect(asking.index).toBeGreaterThan(talk.index);
    expect(run[asking.index + 1]!.sessions[X1]?.visual).toBe('terminal');
  });

  it('Claude 2 talks with Hermes and succeeds, Codex 1 fails, Claude 1 sends a letter', () => {
    const toHermes = first((room) => room.conversations.length === 2);
    expect(said(toHermes.room)[0]).toEqual([C2, H]);
    const success = first((room) => room.sessions[C2]?.visual === 'success');
    const failure = first((room) => room.sessions[X1]?.visual === 'error');
    const letter = first((room) => room.conversations.length === 3);
    expect(said(letter.room)[0]).toEqual([C1, null]);
    expect([toHermes.index, success.index, failure.index, letter.index]).toEqual(
      [toHermes.index, success.index, failure.index, letter.index].sort((a, b) => a - b),
    );
    expect(guestsOf(failure.room)).toContainEqual(['Codex 1', 'error']);
  });

  it('the friends leave one by one, then Hermes finishes and idles', () => {
    const full = first((room) => room.conversations.length === 3).index;
    expect(run.slice(full).map((room) => room.guestKeys.length)).toEqual([3, 2, 1, 0, 0, 0]);
    expect(residentView(run.at(-2)!).visual).toBe('success');
    expect(residentView(run.at(-1)!).visual).toBe('idle');
  });

  it('every beat is visible and the loop lasts about a minute', () => {
    for (const step of script.steps) {
      expect(step.dwellMs).toBeGreaterThanOrEqual(2_500);
      expect(step.dwellMs).toBeLessThanOrEqual(5_000);
    }
    const total = script.steps.reduce((sum, step) => sum + step.dwellMs, 0);
    expect(total).toBeGreaterThanOrEqual(60_000);
    expect(total).toBeLessThanOrEqual(80_000);
  });

  it('loops with the same friends, numbers and conversations', () => {
    const twice = playRoom(script, 2);
    const steps = script.steps.length;
    const shape = (room: RoomViewState) => [residentView(room).visual, guestsOf(room)];
    expect(twice.slice(steps).map(shape)).toEqual(twice.slice(0, steps).map(shape));
    expect(twice.at(-1)!.conversationCount).toBe(2 * run.at(-1)!.conversationCount);
    expect(said(twice.at(-1)!).slice(0, 3)).toEqual(said(run.at(-1)!));
  });
});
