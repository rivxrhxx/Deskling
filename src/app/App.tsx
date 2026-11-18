import { useState } from 'react';
import { createDemoSource } from '../adapters/demo/demoSource';
import type { AgentEventSource } from '../adapters/types';
import { DemoBadge } from '../ui/DemoBadge';
import { StatusBubble } from '../ui/StatusBubble';
import { Workshop } from '../ui/workshop/Workshop';
import { useAgentFeed } from './useAgentFeed';
import type { MotionSetting } from './useReducedMotion';
import { useReducedMotion } from './useReducedMotion';

export interface AppProps {
  /** Event source. Defaults to the deterministic demo tour until a real adapter exists. */
  readonly source?: AgentEventSource;
  readonly motion?: MotionSetting;
}

export function App({ source: providedSource, motion = 'system' }: AppProps) {
  const [defaultSource] = useState(() => createDemoSource());
  const source = providedSource ?? defaultSource;
  const view = useAgentFeed(source);
  const reducedMotion = useReducedMotion(motion);

  return (
    <section
      className="deskling"
      aria-label="Deskling"
      data-state={view.visual}
      data-motion={reducedMotion ? 'reduced' : 'full'}
    >
      <div className="stage">
        {source.mode === 'demo' && <DemoBadge />}
        <StatusBubble state={view.visual} />
        <Workshop state={view.visual} />
      </div>
    </section>
  );
}
