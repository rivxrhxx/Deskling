import type { CSSProperties, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDemoSource } from '../adapters/demo/demoSource';
import type { DemoScriptId } from '../adapters/demo/scripts';
import { DEMO_SCRIPT_IDS, DEMO_SCRIPTS } from '../adapters/demo/scripts';
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

const DEMO_LABEL: Readonly<Record<DemoScriptId, string>> = { tour: '전체 상태', core: '기본 흐름' };

/** Interactive elements and overlays never start a window drag (ADR-008). */
const NO_DRAG = 'button, input, select, textarea, a, [role="dialog"], [data-no-drag]';

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
    controls: providedControls ? null : createWindowControls(),
    storage: providedStorage === undefined ? browserStorage() : null,
  }));
  const controls = providedControls ?? (defaults.controls as WindowControls);
  const storage = providedStorage === undefined ? defaults.storage : providedStorage;

  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage));

  // Without a real adapter, the chosen deterministic demo script is the source (ADR-005).
  const demoSource = useMemo(
    () => (providedSource ? null : createDemoSource({ script: DEMO_SCRIPTS[settings.demoScript] })),
    [providedSource, settings.demoScript],
  );
  const source = providedSource ?? (demoSource as AgentEventSource);
  // Functional update: several changes before a re-render must all survive (review T34g).
  const updateSettings = useCallback(
    (patch: Partial<Settings>) => setSettings((previous) => parseSettings({ ...previous, ...patch })),
    [],
  );

  useEffect(() => {
    saveSettings(storage, settings);
  }, [storage, settings]);

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

  const startDrag = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest(NO_DRAG)) return;
      void controls.startDragging();
    },
    [controls],
  );

  const style = { '--scene-opacity': String(settings.opacity) } as CSSProperties;

  return (
    <section
      className="deskling"
      aria-label="Deskling"
      data-state={view.visual}
      data-motion={reducedMotion ? 'reduced' : 'full'}
      style={style}
    >
      <div className="stage" onMouseDown={startDrag}>
        {source.mode === 'demo' && <DemoBadge />}
        <StatusBubble state={view.visual} />
        <Workshop state={view.visual} />
        <CharacterHotspot expanded={panelOpen} onActivate={togglePanel} buttonRef={hotspotRef} />
        {panelOpen && (
          <ActivityPanel
            entries={view.recent}
            onClose={closePanel}
            demo={
              source.mode === 'demo' && !providedSource
                ? {
                    options: DEMO_SCRIPT_IDS.map((id) => ({
                      value: id,
                      label: DEMO_LABEL[id],
                      selected: id === settings.demoScript,
                    })),
                    onSelect: (value) => updateSettings({ demoScript: value as DemoScriptId }),
                  }
                : undefined
            }
          />
        )}
        <WindowToolbar values={settings} onChange={updateSettings} onClose={() => void controls.close()} />
      </div>
    </section>
  );
}
