import type { AgentEventSource } from '../types';
import type { DemoScript } from './scripts';
import { DEMO_SCRIPTS, demoEvent } from './scripts';

export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Resolves the global timer functions at call time so fake timers in tests are honoured. */
const globalScheduler: Scheduler = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

export interface DemoSourceOptions {
  readonly script?: DemoScript;
  readonly scheduler?: Scheduler;
  readonly now?: () => number;
}

/**
 * Plays a demo script on a fixed schedule and loops forever (FR-D1, FR-D4).
 * Each step's events are emitted together, then the player waits `dwellMs`.
 * Playback position (`seq`, step index) belongs to the source instance: a stop/start cycle — such as
 * React StrictMode's double effect — resumes after the current step instead of replaying it.
 */
export function createDemoSource({
  script = DEMO_SCRIPTS.tour,
  scheduler = globalScheduler,
  now = () => Date.now(),
}: DemoSourceOptions = {}): AgentEventSource {
  let seq = 0;
  let index = 0;
  let started = false;
  let lastDwellMs = 0;

  return {
    mode: 'demo',
    start(emit) {
      let handle: unknown = null;
      let stopped = false;

      const runStep = () => {
        const step = script.steps[index];
        if (stopped || !step) return;
        const at = now();
        for (const spec of step.events) {
          // stop() may be called from inside emit(); honour it immediately.
          if (stopped) return;
          seq += 1;
          emit(demoEvent(spec, { session: script.session, seq, at }));
        }
        if (stopped) return;
        index = (index + 1) % script.steps.length;
        lastDwellMs = step.dwellMs;
        handle = scheduler.setTimeout(runStep, step.dwellMs);
      };

      if (started) {
        handle = scheduler.setTimeout(runStep, lastDwellMs);
      } else {
        started = true;
        runStep();
      }

      return () => {
        if (stopped) return;
        stopped = true;
        if (handle !== null) scheduler.clearTimeout(handle);
        handle = null;
      };
    },
  };
}
