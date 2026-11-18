import type { CSSProperties, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ListenHookRecords } from '../adapters/claudeCode/source';
import { createClaudeCodeSource } from '../adapters/claudeCode/source';
import { createDemoSource } from '../adapters/demo/demoSource';
import type { DemoScriptId } from '../adapters/demo/scripts';
import { DEMO_SCRIPT_IDS, DEMO_SCRIPTS } from '../adapters/demo/scripts';
import type { AgentEventSource } from '../adapters/types';
import type { GuestKind, SourceKind } from '../core/agentEvent';
import { GUEST_KINDS } from '../core/agentEvent';
import type { GuestInput } from '../core/life';
import { deriveVitals } from '../core/mood';
import { GUEST_SEATS, toScreen } from '../core/room';
import { residentView } from '../core/roomState';
import { listenHookRecords } from '../platform/hookRecords';
import type { WindowControls } from '../platform/windowControls';
import { createWindowControls } from '../platform/windowControls';
import type { PanelSession } from '../ui/ActivityPanel';
import { ActivityPanel } from '../ui/ActivityPanel';
import { AttentionLine } from '../ui/AttentionLine';
import { CharacterHotspot } from '../ui/CharacterHotspot';
import { DemoBadge } from '../ui/DemoBadge';
import { StatusBubble } from '../ui/StatusBubble';
import { MiniRoom } from '../ui/miniroom/MiniRoom';
import { WindowToolbar } from '../ui/WindowToolbar';
import type { Settings, SourceChoice } from './settings';
import { SOURCE_CHOICES, TOKEN_BUDGETS, loadSettings, parseSettings, saveSettings, windowSizeFor } from './settings';
import { useAgentFeed } from './useAgentFeed';
import { useLife } from './useLife';
import { usePet } from './usePet';
import { useReducedMotion } from './useReducedMotion';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const DEMO_LABEL: Readonly<Record<DemoScriptId, string>> = {
  tour: '전체 상태',
  core: '기본 흐름',
  life: '하루 일과',
  friends: '방 친구들',
};

const isGuestKind = (kind: SourceKind): kind is GuestKind => (GUEST_KINDS as readonly SourceKind[]).includes(kind);

/** Interactive elements and overlays never start a window drag (ADR-008). */
const NO_DRAG = 'button, input, select, textarea, a, [role="dialog"], [data-no-drag]';

export interface AppProps {
  /** Event source. Defaults to the deterministic demo tour until a real adapter exists. */
  readonly source?: AgentEventSource;
  /** Native window actions. Defaults to Tauri when running inside it, no-op otherwise. */
  readonly controls?: WindowControls;
  /** Where UI preferences live. Defaults to localStorage when available. */
  readonly storage?: StorageLike | null;
  /** Where real Claude Code hook records come from. Defaults to the Tauri bridge (ADR-024); injected in tests. */
  readonly liveListen?: ListenHookRecords;
}

const SOURCE_LABEL: Readonly<Record<SourceChoice, string>> = { auto: '자동', live: '실제', demo: '데모' };

/** A source that never emits — the live slot when a test supplies its own source. */
const SILENT_SOURCE: AgentEventSource = { mode: 'live', start: () => () => {} };

/** Hermes first (asleep when no resident session is known), then the friends; those beyond the seats wait (FR-MS2). */
function panelSessions(
  resident: Pick<PanelSession, 'key' | 'kind' | 'ordinal' | 'visual'> | undefined,
  guests: readonly GuestInput[],
): PanelSession[] {
  const hermes = resident ?? { key: 'resident', kind: 'hermes', ordinal: 0, visual: 'offline' };
  return [
    { key: hermes.key, kind: hermes.kind, ordinal: hermes.ordinal, visual: hermes.visual, seated: true },
    ...guests.map((guest, index) => ({ ...guest, seated: index < GUEST_SEATS.length })),
  ];
}

function browserStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function App({ source: providedSource, controls: providedControls, storage: providedStorage, liveListen }: AppProps) {
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
  const primarySource = providedSource ?? (demoSource as AgentEventSource);
  // Real Claude Code sessions arrive through the hook bridge (ADR-024). Created once; its translator keeps per-session seqs.
  const [liveSource] = useState<AgentEventSource>(() =>
    providedSource ? SILENT_SOURCE : createClaudeCodeSource(liveListen ?? listenHookRecords),
  );
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

  // Embedded in the desktop by default; "위에 띄우기" floats it above other windows (ADR-021).
  useEffect(() => {
    // Clear the opposite layer first; IPC calls are delivered in order.
    if (settings.floatOnTop) {
      void controls.setAlwaysOnBottom(false);
      void controls.setAlwaysOnTop(true);
    } else {
      void controls.setAlwaysOnTop(false);
      void controls.setAlwaysOnBottom(true);
    }
  }, [controls, settings.floatOnTop]);

  // The whole room: Hermes is the latest resident session, every guest session a friend (ADR-022).
  // Both rooms are always fed, so switching never drops an arrival; the choice only decides which one is shown.
  const primaryRoom = useAgentFeed(primarySource);
  const liveRoom = useAgentFeed(liveSource);
  const showLive =
    !providedSource && (settings.sourceChoice === 'live' || (settings.sourceChoice === 'auto' && liveRoom.entryCount > 0));
  const source = showLive ? liveSource : primarySource;
  const room = showLive ? liveRoom : primaryRoom;
  const resident = residentView(room);
  const reducedMotion = useReducedMotion(settings.motion);
  // Energy and anger: fixed readings of Hermes' reported numbers against the user's budget (ADR-016).
  const vitals = deriveVitals(resident.usage, settings.tokenBudget);
  // The desktop pet grows from tasks completed in the room; demo and real agents keep separate profiles (ADR-018).
  const pet = usePet({ mode: source.mode, completedTurns: room.completedTurns, feedKey: source, storage });
  // Present friends in arrival order. Memoised: the life engine ticks every 300 ms and needs no new arrays then.
  const guests = useMemo<GuestInput[]>(
    () =>
      room.guestKeys.flatMap((key) => {
        const session = room.sessions[key];
        return session && isGuestKind(session.kind)
          ? [{ key, kind: session.kind, ordinal: session.ordinal, visual: session.visual }]
          : [];
      }),
    [room.guestKeys, room.sessions],
  );
  // Hermes' life in the room: agent facts first, his own routine while idle (ADR-020); friends at their seats.
  const life = useLife({
    visual: resident.visual,
    energy: vitals.energy.level,
    reducedMotion,
    guests,
    conversations: room.conversations,
    residentKey: room.residentKey,
  });

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
      data-state={resident.visual}
      data-motion={reducedMotion ? 'reduced' : 'full'}
      style={style}
    >
      <div className="stage" onMouseDown={startDrag}>
        {source.mode === 'demo' && <DemoBadge />}
        <StatusBubble state={resident.visual} />
        <AttentionLine sessions={guests} />
        <MiniRoom
          state={resident.visual}
          hermes={life.hermes}
          friend={life.friend}
          guests={life.guests}
          hermesChat={life.hermesChat}
          frame={life.frame}
          energy={vitals.energy.level}
          anger={vitals.anger.level}
          stage={pet.stage}
          decor={pet.decor}
          reaction={pet.reaction}
        />
        <CharacterHotspot
          expanded={panelOpen}
          onActivate={togglePanel}
          buttonRef={hotspotRef}
          at={toScreen(life.hermes.at)}
        />
        {panelOpen && (
          <ActivityPanel
            entries={room.recent}
            sessions={panelSessions(room.residentKey === null ? undefined : room.sessions[room.residentKey], guests)}
            onClose={closePanel}
            pet={{
              name: pet.profile.name,
              hearts: pet.hearts,
              snacksLeft: pet.snacksLeft,
              demo: source.mode === 'demo',
              onPet: () => void pet.pet(),
              onFeed: () => void pet.feed(),
              onRename: pet.rename,
            }}
            vitals={vitals}
            budget={{
              value: settings.tokenBudget,
              options: TOKEN_BUDGETS,
              onChange: (value) => updateSettings({ tokenBudget: value as Settings['tokenBudget'] }),
            }}
            view={
              providedSource
                ? undefined
                : {
                    options: SOURCE_CHOICES.map((choice) => ({
                      value: choice,
                      label: SOURCE_LABEL[choice],
                      selected: choice === settings.sourceChoice,
                    })),
                    onSelect: (value) => updateSettings({ sourceChoice: value as SourceChoice }),
                    showing: showLive ? '지금: 실제 세션' : '지금: 데모',
                  }
            }
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
