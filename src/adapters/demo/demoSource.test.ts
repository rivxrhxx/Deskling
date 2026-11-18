import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoSource } from './demoSource';
import type { DemoScript } from './scripts';
import { DEMO_SCRIPTS } from './scripts';

const script: DemoScript = {
  id: 'test',
  session: 'demo-test',
  steps: [
    { dwellMs: 100, events: [{ type: 'agent.online' }] },
    { dwellMs: 200, events: [{ type: 'turn.started' }, { type: 'tool.started', tool: 'code' }] },
    { dwellMs: 300, events: [{ type: 'agent.idle' }] },
  ],
};

type Raw = { type: string; seq: number; at: number; id: string; source: unknown };

function collect() {
  const events: Raw[] = [];
  return { events, emit: (raw: unknown) => events.push(raw as Raw) };
}

let clock = 0;
const now = () => clock;

beforeEach(() => {
  vi.useFakeTimers();
  clock = 1_767_225_600_000;
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  clock += ms;
  vi.advanceTimersByTime(ms);
}

describe('createDemoSource (FR-D1, FR-D4)', () => {
  it('identifies itself as a demo source', () => {
    expect(createDemoSource({ script, now }).mode).toBe('demo');
  });

  it('emits the first step synchronously on start', () => {
    const { events, emit } = collect();
    createDemoSource({ script, now }).start(emit);
    expect(events.map((e) => e.type)).toEqual(['agent.online']);
  });

  it('emits each following step after the previous step dwell time', () => {
    const { events, emit } = collect();
    createDemoSource({ script, now }).start(emit);

    advance(99);
    expect(events).toHaveLength(1);
    advance(1);
    expect(events.map((e) => e.type)).toEqual(['agent.online', 'turn.started', 'tool.started']);
    advance(199);
    expect(events).toHaveLength(3);
    advance(1);
    expect(events.at(-1)?.type).toBe('agent.idle');
  });

  it('loops forever with seq continuing to increase', () => {
    const { events, emit } = collect();
    createDemoSource({ script, now }).start(emit);
    advance(100 + 200 + 300);
    expect(events.map((e) => e.type)).toEqual(['agent.online', 'turn.started', 'tool.started', 'agent.idle', 'agent.online']);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('stamps events with the injected clock and the script session', () => {
    const { events, emit } = collect();
    createDemoSource({ script, now }).start(emit);
    advance(100);
    expect(events.map((e) => e.at)).toEqual([1_767_225_600_000, 1_767_225_600_100, 1_767_225_600_100]);
    expect(events[0]?.source).toEqual({ kind: 'demo', session: 'demo-test' });
  });

  it('stops emitting and leaves no timers after stop', () => {
    const { events, emit } = collect();
    const stop = createDemoSource({ script, now }).start(emit);
    stop();
    advance(10_000);
    expect(events).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => stop()).not.toThrow();
  });

  it('continues seq when the same source is restarted (e.g. React StrictMode)', () => {
    const { events, emit } = collect();
    const source = createDemoSource({ script, now });
    source.start(emit)();
    source.start(emit);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('is deterministic: two sources produce identical timelines', () => {
    const a = collect();
    const b = collect();
    createDemoSource({ script: DEMO_SCRIPTS.tour, now }).start(a.emit);
    createDemoSource({ script: DEMO_SCRIPTS.tour, now }).start(b.emit);
    advance(60_000);
    expect(a.events.length).toBeGreaterThan(11);
    expect(a.events).toEqual(b.events);
  });

  it('accepts an injected scheduler', () => {
    const pending: Array<() => void> = [];
    const scheduler = {
      setTimeout: (fn: () => void) => pending.push(fn),
      clearTimeout: vi.fn(),
    };
    const { events, emit } = collect();
    createDemoSource({ script, now, scheduler }).start(emit);
    expect(pending).toHaveLength(1);
    pending.shift()?.();
    expect(events).toHaveLength(3);
  });
});
