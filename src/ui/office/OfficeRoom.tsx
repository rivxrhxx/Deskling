import type { ReactNode } from 'react';
import { useId } from 'react';
import type { OfficeDecorId } from '../../core/growth';
import type { MemberActivity, MemberView } from '../../core/office';
import type { AngerLevel, EnergyLevel } from '../../core/mood';
import type { DeskId, Tile } from '../../core/room';
import { DESK_IDS, DOOR, FURNITURE, SPOTS, VIEWBOX, isOutside } from '../../core/room';
import type { ScreenId, Tone } from '../visualSpec';
import { VISUAL_SPEC } from '../visualSpec';
import { Bookshelf, CoffeeMachine, HelperBot, MeetingTable, Plant, Printer, Sofa, WaterCooler, Workstation } from './Furniture';
import { Member } from './Member';
import { deskFacesAway, memberPose, LOOK_OF } from './pose';
import { Clock, Door, Floor, LoungeRug, Night, WallDecor, Walls, Whiteboard, Window } from './Shell';

/** A session's vitals as the scene needs them: levels only, never numbers (ADR-016). `Vitals` from core/mood fits. */
export interface MemberVitals {
  readonly energy: { readonly level: EnergyLevel };
  readonly anger: { readonly level: AngerLevel };
}

export interface OfficeRoomProps {
  /** Everyone in the office, as the office engine places them (`useOffice`). */
  readonly members: readonly MemberView[];
  /** 0/1 animation frame. */
  readonly frame: number;
  /** Unlocked office props (ADR-025 §7). */
  readonly decor?: readonly OfficeDecorId[];
  /** Vitals by session key; a session without a report shows no mood. */
  readonly vitals?: Readonly<Record<string, MemberVitals>>;
}

/** What a member does in its chair (or standing up from it). */
const AT_DESK = new Set<MemberActivity>(['work', 'think', 'wave', 'upset', 'cheer', 'delegate', 'idle-desk']);
/** At the desk with these, the monitor shows the session's state; otherwise its screensaver. */
const SCREEN_ON = new Set<MemberActivity>(['work', 'think', 'wave', 'upset', 'cheer', 'delegate']);
/** Sprite rows that show over the desk top of a desk facing the viewer; the desk front covers the rest. */
const ROWS_OVER_DESK = 12;
const CANS: Readonly<Record<EnergyLevel, number>> = { unknown: 0, full: 0, ok: 1, low: 2, empty: 3 };
/** The light that spills round the back of a monitor facing away from the viewer, by tone (DESIGN §2). */
const LIGHT: Readonly<Record<Tone, string>> = {
  dim: '#5c6280',
  cool: '#6cc7f2',
  violet: '#a48df0',
  amber: '#f4b04a',
  ember: '#ff6a3d',
  mint: '#72e3bd',
};

const depthOf = (at: Tile) => at.x + at.y;
const centreDepth = (id: keyof typeof FURNITURE) => {
  const f = FURNITURE[id];
  return (f.x0 + f.x1 + f.y0 + f.y1) / 2;
};
/** Someone walking in or out through the doorway (or just beyond it). */
const inDoorway = (m: MemberView) => m.walking && m.at.y < 1.3 && m.at.x > DOOR.from - 0.6 && m.at.x < DOOR.to + 0.6;

/**
 * The office (ADR-025 §2, DESIGN §3): an original bright isometric pixel office with eight desks and a lounge.
 * The office engine places everyone; this component only draws, sorting furniture and people by depth.
 */
export function OfficeRoom({ members, frame, decor = [], vitals = {} }: OfficeRoomProps) {
  const titleId = `office-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const empty = members.length === 0;
  const has = (id: OfficeDecorId) => decor.includes(id);

  const member = (m: MemberView, rows?: number) => {
    const v = vitals[m.key];
    return <Member key={m.key} view={m} frame={frame} energy={v?.energy.level} anger={v?.anger.level} rows={rows} />;
  };
  const inRoom = members.filter((m) => !isOutside(m.at));
  const atDesk = (m: MemberView) => !m.walking && AT_DESK.has(m.activity);
  const onSofa = (m: MemberView) => !m.walking && m.activity === 'sofa';

  type Item = { readonly depth: number; readonly key: string; readonly node: ReactNode };
  const items: Item[] = DESK_IDS.map((desk: DeskId) => {
    const holder = members.find((m) => m.desk === desk);
    const sitter = holder && atDesk(holder) && !isOutside(holder.at) ? holder : undefined;
    const screen: ScreenId = !holder ? 'off' : sitter && SCREEN_ON.has(sitter.activity) ? VISUAL_SPEC[sitter.visual].screen : 'screensaver';
    const glow = screen === 'off' ? null : screen === 'screensaver' ? LIGHT.violet : LIGHT[VISUAL_SPEC[holder?.visual ?? 'idle'].tone];
    const away = deskFacesAway(desk);
    const turned =
      sitter !== undefined &&
      !memberPose({ look: LOOK_OF[sitter.kind], activity: sitter.activity, walking: false, face: sitter.face, frame, away }).back;
    const energy = holder ? vitals[holder.key]?.energy.level : undefined;
    return {
      key: desk,
      // A chair in front of its desk is the nearest part of the workstation; otherwise the desk itself.
      depth: away ? depthOf(SPOTS[desk].at) : centreDepth(desk),
      node: (
        <Workstation
          desk={desk}
          screen={screen}
          glow={glow}
          cans={CANS[energy ?? 'unknown']}
          plant={has('desk-plants')}
          occupant={sitter ? member(sitter, away ? undefined : ROWS_OVER_DESK) : undefined}
          occupantFacesViewer={away && turned}
          helper={holder?.helper ? <HelperBot desk={desk} frame={frame} /> : undefined}
        />
      ),
    };
  });
  const sitters = inRoom.filter(onSofa).sort((a, b) => depthOf(a.at) - depthOf(b.at));
  const brewing = inRoom.some((m) => !m.walking && m.activity === 'coffee');
  items.push(
    { key: 'plant-1', depth: centreDepth('plant-1'), node: <Plant id="plant-1" tall /> },
    { key: 'coffee-machine', depth: centreDepth('coffee-machine'), node: <CoffeeMachine brewing={brewing} /> },
    { key: 'water-cooler', depth: centreDepth('water-cooler'), node: <WaterCooler /> },
    { key: 'printer', depth: centreDepth('printer'), node: <Printer /> },
    { key: 'sofa', depth: centreDepth('sofa'), node: <Sofa sitters={sitters.map((m) => member(m))} /> },
    { key: 'plant-2', depth: centreDepth('plant-2'), node: <Plant id="plant-2" tall={false} /> },
    { key: 'bookshelf', depth: centreDepth('bookshelf'), node: <Bookshelf full={has('full-bookshelf')} /> },
    { key: 'meeting-table', depth: centreDepth('meeting-table'), node: <MeetingTable /> },
  );
  for (const m of inRoom) {
    if (atDesk(m) || onSofa(m)) continue;
    items.push({ key: `member-${m.key}`, depth: depthOf(m.at), node: member(m) });
  }
  items.sort((a, b) => a.depth - b.depth);

  return (
    <svg
      className="office"
      viewBox={`0 0 ${VIEWBOX.w} ${VIEWBOX.h}`}
      role="img"
      aria-labelledby={titleId}
      data-empty={empty ? 'true' : 'false'}
      data-count={members.length}
      preserveAspectRatio="xMidYMax meet"
    >
      <title id={titleId}>{empty ? '사무실 — 아무도 없음' : `사무실 — ${members.length}명`}</title>
      <ellipse cx="324" cy="370" rx="200" ry="10" fill="#000000" opacity="0.16" />
      <Floor />
      {has('lounge-rug') && <LoungeRug />}
      <Walls />
      <Window night={empty} />
      <Door open={members.some(inDoorway)} />
      <Whiteboard />
      <Clock />
      <WallDecor decor={decor} />
      {items.map((item) => (
        <g key={item.key}>{item.node}</g>
      ))}
      {empty && <Night />}
    </svg>
  );
}
