import type { CSSProperties, MouseEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ListenHookRecords } from '../adapters/claudeCode/source';
import { createClaudeCodeSource } from '../adapters/claudeCode/source';
import { createDemoSource } from '../adapters/demo/demoSource';
import type { DemoScriptId } from '../adapters/demo/scripts';
import { DEMO_SCRIPT_IDS, DEMO_SCRIPTS } from '../adapters/demo/scripts';
import type { AgentEventSource } from '../adapters/types';
import type { OfficeDecorId } from '../core/growth';
import { memberLevel } from '../core/growth';
import type { Vitals } from '../core/mood';
import { deriveVitals } from '../core/mood';
import type { ConversationInput, MemberInput } from '../core/office';
import { DESK_IDS } from '../core/room';
import type { SessionKey } from '../core/roomState';
import { officeCounts } from '../core/roomState';
import { listenHookRecords } from '../platform/hookRecords';
import type { WindowControls } from '../platform/windowControls';
import { createWindowControls } from '../platform/windowControls';
import { ActivityPanel } from '../ui/ActivityPanel';
import { AttentionLine } from '../ui/AttentionLine';
import { DemoBadge } from '../ui/DemoBadge';
import { OfficeRoom } from '../ui/office/OfficeRoom';
import { StatusBubble } from '../ui/StatusBubble';
import { WindowToolbar } from '../ui/WindowToolbar';
import type { Settings, SourceChoice } from './settings';
import { SOURCE_CHOICES, TOKEN_BUDGETS, loadSettings, parseSettings, saveSettings, windowSizeFor } from './settings';
import { useAgentFeed } from './useAgentFeed';
import { useOffice } from './useOffice';
import { useOfficeProgress } from './useOfficeProgress';
import { useReducedMotion } from './useReducedMotion';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const DEMO_LABEL: Readonly<Record<DemoScriptId, string>> = {
  office: '사무실 하루',
  core: '기본 흐름',
  tour: '전체 상태',
  life: '하루 일과',
};

/** Interactive elements and overlays never start a window drag (ADR-008). */
const NO_DRAG = 'button, input, select, textarea, a, [role="dialog"], [data-no-drag]';

export interface AppProps {
  /** Event source. Defaults to the deterministic demo until a real adapter exists. */
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

interface OfficeSceneProps {
  readonly members: readonly MemberInput[];
  readonly conversations: readonly ConversationInput[];
  readonly reducedMotion: boolean;
  readonly decor: readonly OfficeDecorId[];
  readonly vitals: Readonly<Record<SessionKey, Vitals>>;
}

/** The office of one feed (ADR-025 §3–§4). Keyed by the feed: a new feed is a new office, its messages counted afresh. */
function OfficeScene({ members, conversations, reducedMotion, decor, vitals }: OfficeSceneProps) {
  const office = useOffice({ members, conversations, reducedMotion });
  return <OfficeRoom members={office.members} frame={office.frame} decor={decor} vitals={vitals} />;
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

  // The whole office: every session is one member (ADR-025 §1).
  // Both feeds are always folded, so switching never drops an arrival; the choice only decides which one is shown.
  const primaryRoom = useAgentFeed(primarySource);
  const liveRoom = useAgentFeed(liveSource);
  const showLive =
    !providedSource && (settings.sourceChoice === 'live' || (settings.sourceChoice === 'auto' && liveRoom.entryCount > 0));
  const source = showLive ? liveSource : primarySource;
  const room = showLive ? liveRoom : primaryRoom;
  const reducedMotion = useReducedMotion(settings.motion);

  // Each new feed gets its own office (adjusting state on a prop change, without an effect).
  const [feed, setFeed] = useState({ source, id: 0 });
  if (feed.source !== source) setFeed({ source, id: feed.id + 1 });

  // Energy and anger per member: fixed readings of its own reported numbers against the user's budget (ADR-016, ADR-025 §6).
  const vitals = useMemo<Record<SessionKey, Vitals>>(
    () =>
      Object.fromEntries(
        room.memberKeys.flatMap((key) => {
          const session = room.sessions[key];
          return session ? [[key, deriveVitals(session.usage, settings.tokenBudget)]] : [];
        }),
      ),
    [room.memberKeys, room.sessions, settings.tokenBudget],
  );
  // The office grows from tasks completed by anyone in it, and every member from its own (ADR-025 §7, ADR-028 §2);
  // demo and real agents grow separately.
  const progress = useOfficeProgress({
    mode: source.mode,
    completedTurns: room.completedTurns,
    completedBy: room.completedBy,
    feedKey: source,
    storage,
  });

  // Present sessions in arrival order, each at its own level (ADR-028).
  // Memoised so the office (ticking every 300 ms) sees the same array until the next event.
  const { memberXp } = progress;
  const members = useMemo<MemberInput[]>(
    () =>
      room.memberKeys.flatMap((key) => {
        const session = room.sessions[key];
        if (!session) return [];
        return [{ key, kind: session.kind, ordinal: session.ordinal, visual: session.visual, level: memberLevel(memberXp(key)).level }];
      }),
    [room.memberKeys, room.sessions, memberXp],
  );

  const [panelOpen, setPanelOpen] = useState(false);
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const togglePanel = useCallback(() => setPanelOpen((open) => !open), []);
  const closePanel = useCallback(() => {
    setPanelOpen(false);
    bubbleRef.current?.focus();
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
    <section className="deskling" aria-label="Deskling" data-motion={reducedMotion ? 'reduced' : 'full'} style={style}>
      <div className="stage" onMouseDown={startDrag}>
        {source.mode === 'demo' && <DemoBadge />}
        <StatusBubble counts={officeCounts(room)} expanded={panelOpen} onToggle={togglePanel} ref={bubbleRef} />
        <AttentionLine sessions={members} />
        <OfficeScene
          key={feed.id}
          members={members}
          conversations={room.conversations}
          reducedMotion={reducedMotion}
          decor={progress.decor}
          vitals={vitals}
        />
        {panelOpen && (
          <ActivityPanel
            entries={room.recent}
            sessions={members.map((member, index) => ({ ...member, seated: index < DESK_IDS.length, vitals: vitals[member.key] }))}
            onClose={closePanel}
            office={{ xp: progress.xp, decor: progress.decor, next: progress.next, demo: source.mode === 'demo' }}
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
