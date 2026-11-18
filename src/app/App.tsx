import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createDemoSource } from '../adapters/demo/demoSource';
import type { AgentEventSource } from '../adapters/types';
import type { WindowControls } from '../platform/windowControls';
import { createWindowControls } from '../platform/windowControls';
import { ActivityPanel } from '../ui/ActivityPanel';
import { CharacterHotspot } from '../ui/CharacterHotspot';
import { DemoBadge } from '../ui/DemoBadge';
import { StatusBubble } from '../ui/StatusBubble';
import { WindowToolbar } from '../ui/WindowToolbar';
import { Workshop } from '../ui/workshop/Workshop';
import type { Settings } from './settings';
import { loadSettings, parseSettings, saveSettings, windowSizeFor } from './settings';
import { useAgentFeed } from './useAgentFeed';
import { useReducedMotion } from './useReducedMotion';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export interface AppProps {
  /** Event source. Defaults to the deterministic demo tour until a real adapter exists. */
  readonly source?: AgentEventSource;
  /** Native window actions. Defaults to Tauri when running inside it, no-op otherwise. */
  readonly controls?: WindowControls;
  /** Where UI preferences live. Defaults to localStorage when available. */
  readonly storage?: StorageLike | null;
}

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App({ source: providedSource, controls: providedControls, storage: providedStorage }: AppProps) {
  const [defaults] = useState(() => ({
    source: providedSource ? null : createDemoSource(),
    controls: providedControls ? null : createWindowControls(),
    storage: providedStorage === undefined ? browserStorage() : null,
  }));
  const source = providedSource ?? (defaults.source as AgentEventSource);
  const controls = providedControls ?? (defaults.controls as WindowControls);
  const storage = providedStorage === undefined ? defaults.storage : providedStorage;

  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage));
  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      const next = parseSettings({ ...settings, ...patch });
      setSettings(next);
      saveSettings(storage, next);
    },
    [settings, storage],
  );

  // Apply window preferences to the native window on start and whenever they change.
  useEffect(() => {
    const { width, height } = windowSizeFor(settings.size);
    void controls.setSize(width, height);
  }, [controls, settings.size]);

  useEffect(() => {
    void controls.setAlwaysOnTop(settings.alwaysOnTop);
  }, [controls, settings.alwaysOnTop]);

  const view = useAgentFeed(source);
  const reducedMotion = useReducedMotion(settings.motion);

  const [panelOpen, setPanelOpen] = useState(false);
  const hotspotRef = useRef<HTMLButtonElement>(null);
  const togglePanel = useCallback(() => setPanelOpen((open) => !open), []);
  const closePanel = useCallback(() => {
    setPanelOpen(false);
    hotspotRef.current?.focus();
  }, []);

  const style = { '--scene-opacity': String(settings.opacity) } as CSSProperties;

  return (
    <section
      className="deskling"
      aria-label="Deskling"
      data-state={view.visual}
      data-motion={reducedMotion ? 'reduced' : 'full'}
      style={style}
    >
      <div className="stage">
        {source.mode === 'demo' && <DemoBadge />}
        <StatusBubble state={view.visual} />
        <Workshop state={view.visual} />
        <CharacterHotspot expanded={panelOpen} onActivate={togglePanel} buttonRef={hotspotRef} />
        {panelOpen && <ActivityPanel entries={view.recent} onClose={closePanel} />}
        <WindowToolbar values={settings} onChange={updateSettings} onClose={() => void controls.close()} />
      </div>
    </section>
  );
}
