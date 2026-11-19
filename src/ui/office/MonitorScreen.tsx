import type { ScreenId } from '../visualSpec';

/**
 * Pixel monitor contents in local units (48×22), mapped onto the monitor face by the parent.
 * Abstract shapes only — never real code, commands, URLs or file names (FR-S6).
 */
const W = 48;
const H = 22;

const lines = (rows: ReadonlyArray<readonly [number, number, number, string]>) =>
  rows.map(([x, y, w, fill]) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height="2" fill={fill} />);

const SCREENS: Record<ScreenId, () => React.ReactNode> = {
  off: () => (
    <>
      <rect width={W} height={H} fill="#1a1d2b" />
      <path d="M6 0 h6 l-8 22 h-4z" fill="#ffffff" opacity="0.06" />
    </>
  ),
  screensaver: () => (
    <>
      <rect width={W} height={H} fill="#20264a" />
      <rect className="screen-drift" x="21" y="8" width="6" height="6" fill="#a48df0" transform="rotate(45 24 11)" />
    </>
  ),
  'editor-dim': () => (
    <>
      <rect width={W} height={H} fill="#1c2236" />
      {lines([[4, 4, 16, '#4b5272'], [8, 8, 22, '#4b5272'], [8, 12, 14, '#4b5272'], [4, 16, 18, '#4b5272']])}
      <rect className="cursor-blink" x="24" y="12" width="2" height="3" fill="#a48df0" />
    </>
  ),
  editor: () => (
    <>
      <rect width={W} height={H} fill="#1c2236" />
      {lines([[4, 3, 8, '#ff8fb1'], [14, 3, 18, '#6cc7f2'], [8, 7, 12, '#9aa1bb'], [22, 7, 14, '#72e3bd'], [8, 11, 22, '#6cc7f2'], [4, 15, 6, '#ff8fb1'], [12, 15, 20, '#9aa1bb']])}
      <rect className="cursor-blink" x="34" y="15" width="2" height="3" fill="#ffffff" />
    </>
  ),
  browser: () => (
    <>
      <rect width={W} height={H} fill="#f4f6fb" />
      <rect width={W} height="4" fill="#cdd5e8" />
      <rect x="10" y="1" width="30" height="2" fill="#ffffff" />
      <rect x="4" y="6" width="40" height="6" fill="#bfe6ff" />
      {lines([[4, 14, 30, '#9aa1bb'], [4, 18, 22, '#cdd5e8']])}
    </>
  ),
  terminal: () => (
    <>
      <rect width={W} height={H} fill="#0d1117" />
      {lines([[3, 3, 22, '#72e3bd'], [3, 7, 32, '#4b5272'], [3, 11, 26, '#4b5272']])}
      <rect x="3" y="15" width="3" height="2" fill="#72e3bd" />
      <rect className="cursor-blink" x="8" y="15" width="3" height="3" fill="#72e3bd" />
    </>
  ),
  files: () => (
    <>
      <rect width={W} height={H} fill="#1c2236" />
      {[0, 1, 2, 3].flatMap((col) =>
        [0, 1].map((row) => (
          <rect key={`${col}-${row}`} x={5 + col * 10} y={3 + row * 9} width="7" height="6" fill={col === 1 && row === 0 ? '#a9b6e6' : '#4b5a8a'} />
        )),
      )}
    </>
  ),
  dialog: () => (
    <>
      <rect width={W} height={H} fill="#1c2236" />
      <rect className="dialog-pulse" x="9" y="4" width="30" height="14" fill="#2a3150" stroke="#f4b04a" strokeWidth="1" />
      <rect x="13" y="12" width="9" height="3" fill="#f4b04a" />
      <rect x="25" y="12" width="9" height="3" fill="#4b5272" />
    </>
  ),
  handoff: () => (
    <>
      <rect width={W} height={H} fill="#1c2236" />
      <rect x="8" y="8" width="6" height="6" fill="#a48df0" />
      <rect x="34" y="8" width="6" height="6" fill="#a48df0" />
      <rect className="packet" x="16" y="10" width="3" height="2" fill="#ffffff" />
    </>
  ),
  check: () => (
    <>
      <rect width={W} height={H} fill="#133a33" />
      <path d="M16 11 l5 5 l10 -10" fill="none" stroke="#72e3bd" strokeWidth="3" />
    </>
  ),
  alert: () => (
    <>
      <rect width={W} height={H} fill="#3a1712" />
      <path d="M24 3 l10 16 h-20z" fill="#ff6a3d" />
      <rect x="23" y="8" width="2" height="6" fill="#3a1712" />
      <rect x="23" y="15" width="2" height="2" fill="#3a1712" />
    </>
  ),
};

export function MonitorScreen({ screen, transform }: { screen: ScreenId; transform: string }) {
  return (
    <g data-part="monitor-screen" data-screen={screen} transform={transform} shapeRendering="crispEdges">
      {SCREENS[screen]()}
    </g>
  );
}
