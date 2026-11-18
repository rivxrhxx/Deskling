import type { ReactNode } from 'react';
import type { ScreenId } from '../visualSpec';

/**
 * Abstract monitor contents. Shapes only — never real code, commands, URLs or file names (FR-S6).
 * Screen area: x 166–246, y 92–134.
 */

const X = 166;
const Y = 92;
const W = 80;
const H = 42;

const bars = (rows: ReadonlyArray<readonly [number, number, number, string, number?]>) =>
  rows.map(([x, y, w, fill, opacity = 1]) => (
    <rect key={`${x}-${y}-${w}`} x={x} y={y} width={w} height="2.6" rx="1.3" fill={fill} opacity={opacity} />
  ));

const CODE_ROWS = [
  [178, 97, 10, '#a48df0'],
  [190, 97, 24, '#6cc7f2'],
  [182, 103, 14, '#9aa1bb'],
  [198, 103, 20, '#72e3bd'],
  [182, 109, 26, '#6cc7f2'],
  [210, 109, 12, '#9aa1bb'],
  [178, 115, 8, '#a48df0'],
  [188, 115, 30, '#9aa1bb'],
  [182, 121, 18, '#72e3bd'],
] as const;

const SCREENS: Record<ScreenId, ReactNode> = {
  off: (
    <>
      <rect x={X} y={Y} width={W} height={H} fill="#05060a" />
      <path d="M172 92 h16 l-14 42 h-8 z" fill="#ffffff" opacity="0.04" />
    </>
  ),
  screensaver: (
    <>
      <rect x={X} y={Y} width={W} height={H} fill="#0a0f1c" />
      <circle cx="178" cy="100" r="0.7" fill="#9aa1bb" opacity="0.5" />
      <circle cx="236" cy="124" r="0.7" fill="#9aa1bb" opacity="0.5" />
      <g className="screen-drift">
        <rect x="200" y="107" width="12" height="12" rx="3" transform="rotate(45 206 113)" fill="#a48df0" opacity="0.75" />
        <rect x="203" y="110" width="6" height="6" rx="1.5" transform="rotate(45 206 113)" fill="#0a0f1c" />
      </g>
    </>
  ),
  'editor-dim': (
    <>
      <rect x={X} y={Y} width={W} height={H} fill="#0b1020" />
      <rect x={X} y={Y} width="8" height={H} fill="#0f1528" />
      {bars(CODE_ROWS.slice(0, 6).map(([x, y, w]) => [x, y, w, '#5c6280', 0.6] as const))}
      <rect className="caret-blink tone-fill" x="224" y="108" width="1.8" height="5" />
    </>
  ),
  editor: (
    <>
      <rect x={X} y={Y} width={W} height={H} fill="#0c1222" />
      <rect x={X} y={Y} width="8" height={H} fill="#10172b" />
      {bars([[168.5, 97, 3, '#3a4160'], [168.5, 103, 3, '#3a4160'], [168.5, 109, 3, '#3a4160'], [168.5, 115, 3, '#3a4160'], [168.5, 121, 3, '#3a4160'], [168.5, 127, 3, '#3a4160']])}
      {bars(CODE_ROWS)}
      <g className="typing-line">{bars([[182, 127, 30, '#6cc7f2']])}</g>
      <rect className="caret-blink tone-fill" x="214" y="126" width="1.8" height="5" />
    </>
  ),
  browser: (
    <>
      <rect x={X} y={Y} width={W} height={H} fill="#0d1324" />
      <g className="page-scroll">
        <rect x="172" y="104" width="68" height="12" rx="2" className="tone-fill" opacity="0.28" />
        {bars([[172, 120, 44, '#9aa1bb', 0.7], [172, 125, 60, '#5c6280'], [172, 130, 38, '#5c6280'], [172, 135, 52, '#5c6280'], [172, 140, 30, '#5c6280']])}
        <rect x="222" y="119" width="18" height="12" rx="1.5" fill="#1d2640" />
      </g>
      <rect x={X} y={Y} width={W} height="9" fill="#151c30" />
      <circle cx="170.5" cy="96.5" r="1.2" fill="#5c6280" />
      <circle cx="174.5" cy="96.5" r="1.2" fill="#5c6280" />
      <circle cx="178.5" cy="96.5" r="1.2" fill="#5c6280" />
      <rect x="184" y="94.6" width="52" height="3.8" rx="1.9" fill="#222b44" />
    </>
  ),
  terminal: (
    <>
      <rect x={X} y={Y} width={W} height={H} fill="#05070c" />
      <path d="M171 97 l3 2.4 -3 2.4" fill="none" stroke="#72e3bd" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      {bars([[177, 98, 30, '#9aa1bb', 0.8], [171, 105, 52, '#5c6280'], [171, 110, 40, '#5c6280'], [171, 115, 58, '#72e3bd', 0.55]])}
      <path d="M171 121 l3 2.4 -3 2.4" fill="none" stroke="#72e3bd" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <rect className="cursor-blink" x="177" y="120.5" width="4" height="5.5" fill="#72e3bd" />
    </>
  ),
  files: (
    <>
      <rect x={X} y={Y} width={W} height={H} fill="#0c1222" />
      {[0, 1, 2, 3].flatMap((col) =>
        [0, 1].map((row) => {
          const x = 174 + col * 17;
          const y = 97 + row * 18;
          const active = col === 2 && row === 0;
          return (
            <g key={`${col}-${row}`} className={active ? 'file-active' : undefined}>
              <path d={`M${x} ${y} h8 l4 4 v11 h-12 z`} fill={active ? '#6a7bb8' : '#1d2640'} />
              <path d={`M${x + 8} ${y} v4 h4`} fill="none" stroke={active ? '#b9c4ee' : '#2c3656'} strokeWidth="1" />
            </g>
          );
        }),
      )}
    </>
  ),
  dialog: (
    <>
      <rect x={X} y={Y} width={W} height={H} fill="#0b0f1a" />
      {bars([[172, 98, 40, '#2a3046'], [172, 104, 56, '#2a3046'], [172, 128, 46, '#2a3046']])}
      <g className="dialog-pulse">
        <rect x="180" y="100" width="52" height="27" rx="3" fill="#151a2b" stroke="#f4b04a" strokeWidth="1.2" />
        {bars([[186, 105, 40, '#9aa1bb', 0.8], [186, 110, 28, '#5c6280']])}
        <rect x="186" y="117" width="18" height="6" rx="2" fill="#f4b04a" opacity="0.9" />
        <rect x="208" y="117" width="18" height="6" rx="2" fill="#2a3046" />
      </g>
    </>
  ),
  handoff: (
    <>
      <rect x={X} y={Y} width={W} height={H} fill="#0b1020" />
      <path d="M192 113 H220" fill="none" className="tone-stroke" strokeWidth="1.4" strokeDasharray="3 3" />
      <circle cx="186" cy="113" r="6" fill="#121831" className="tone-stroke" strokeWidth="1.6" />
      <circle cx="226" cy="113" r="6" fill="#121831" className="tone-stroke" strokeWidth="1.6" />
      <circle cx="186" cy="113" r="2" className="tone-fill" />
      <circle className="packet tone-fill" cx="194" cy="113" r="2" />
    </>
  ),
  check: (
    <>
      <rect x={X} y={Y} width={W} height={H} fill="#08151a" />
      <circle cx="206" cy="113" r="12" fill="none" className="tone-stroke" strokeWidth="2.2" />
      <path d="M200 113.5 l4.5 4.5 l9 -9.5" fill="none" className="tone-stroke" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="176" y="100" width="3" height="3" rx="0.6" fill="#a48df0" transform="rotate(20 177 101)" />
      <rect x="232" y="124" width="3" height="3" rx="0.6" fill="#6cc7f2" transform="rotate(-15 233 125)" />
      <rect x="230" y="99" width="2.5" height="2.5" rx="0.5" className="tone-fill" />
    </>
  ),
  alert: (
    <>
      <rect x={X} y={Y} width={W} height={H} fill="#170b09" />
      <rect className="glitch glitch--a tone-fill" x={X} y="103" width={W} height="2" opacity="0.25" />
      <rect className="glitch glitch--b tone-fill" x={X} y="124" width={W} height="1.4" opacity="0.2" />
      <path d="M206 99.5 l13 23 h-26 z" fill="#2a120d" className="tone-stroke" strokeWidth="2" strokeLinejoin="round" />
      <rect x="204.9" y="107" width="2.2" height="8" rx="1.1" className="tone-fill" />
      <circle cx="206" cy="118.6" r="1.3" className="tone-fill" />
    </>
  ),
};

export function MonitorScreen({ screen, clipId }: { screen: ScreenId; clipId: string }) {
  return (
    <g data-part="screen" data-screen={screen} className={`screen screen--${screen}`} clipPath={`url(#${clipId})`}>
      {SCREENS[screen]}
    </g>
  );
}
