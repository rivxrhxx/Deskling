import { useId } from 'react';
import type { VisualState } from '../../core/agentEvent';
import { VISUAL_SPEC } from '../visualSpec';
import { Character } from './Character';
import { Helper } from './Helper';
import { MonitorScreen } from './MonitorScreen';

/**
 * The miniature night-time developer room (docs/DESIGN.md §3). Hand-written SVG primitives only.
 * Everything outside the diorama is transparent so the desktop shows through.
 */
export function Workshop({ state }: { state: VisualState }) {
  const spec = VISUAL_SPEC[state];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (name: string) => `dl-${uid}-${name}`;

  return (
    <svg
      className="workshop"
      viewBox="0 0 320 260"
      role="img"
      aria-labelledby={id('title')}
      data-state={state}
      data-tone={spec.tone}
      preserveAspectRatio="xMidYMax meet"
    >
      <title id={id('title')}>{`미니어처 작업실 — ${spec.label}`}</title>
      <defs>
        <linearGradient id={id('wall')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a1f30" />
          <stop offset="1" stopColor="#131624" />
        </linearGradient>
        <linearGradient id={id('floor')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1e2233" />
          <stop offset="1" stopColor="#181b29" />
        </linearGradient>
        <linearGradient id={id('sky')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a1330" />
          <stop offset="1" stopColor="#1c1f3e" />
        </linearGradient>
        <linearGradient id={id('skin')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#aeb6cf" />
          <stop offset="1" stopColor="#e1e6f4" />
        </linearGradient>
        <radialGradient id={id('glow')} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="glow-stop glow-stop--core" />
          <stop offset="1" className="glow-stop glow-stop--edge" />
        </radialGradient>
        <linearGradient id={id('cone')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a48df0" stopOpacity="0.28" />
          <stop offset="1" stopColor="#a48df0" stopOpacity="0" />
        </linearGradient>
        <clipPath id={id('screen')}>
          <rect x="166" y="92" width="80" height="42" rx="2" />
        </clipPath>
      </defs>

      {/* Diorama base */}
      <ellipse cx="160" cy="241" rx="150" ry="7" fill="#000" opacity="0.35" />
      <g data-part="floor">
        <polygon points="34,198 286,198 306,224 14,224" fill={`url(#${id('floor')})`} />
        <polygon points="14,224 306,224 306,234 14,234" fill="#10131d" />
        <path d="M100 198 L86 224 M160 198 V224 M220 198 L234 224" stroke="#ffffff" strokeOpacity="0.035" />
        <ellipse cx="104" cy="207" rx="46" ry="7" fill="#232842" opacity="0.85" />
      </g>

      {/* Back wall */}
      <g data-part="wall">
        <rect x="34" y="50" width="252" height="148" fill={`url(#${id('wall')})`} />
        <rect x="30" y="46" width="260" height="6" rx="2" fill="#20263a" />
        <rect x="34" y="193" width="252" height="5" fill="#11141e" />
        <g className="status-lamp">
          <circle className="status-lamp__glow tone-fill" cx="206" cy="66" r="9" />
          <circle cx="206" cy="66" r="5" fill="#10131d" stroke="#2a3047" strokeWidth="1.2" />
          <circle className="status-lamp__light tone-fill" cx="206" cy="66" r="2.8" />
        </g>
      </g>
      <g data-part="window">
        <rect x="52" y="70" width="58" height="44" rx="3" fill={`url(#${id('sky')})`} stroke="#2a3047" strokeWidth="2" />
        <circle cx="98" cy="80" r="5" fill="#dfe6ff" opacity="0.85" />
        <circle cx="100.4" cy="78.2" r="4.4" fill="#0d1534" />
        <g className="stars" fill="#dfe6ff">
          <circle className="star star--a" cx="62" cy="78" r="0.8" />
          <circle className="star star--b" cx="73" cy="87" r="0.6" />
          <circle className="star star--c" cx="90" cy="101" r="0.7" />
          <circle className="star star--a" cx="64" cy="105" r="0.6" />
        </g>
        <path d="M81 71 V113 M53 92 H109" stroke="#2a3047" strokeWidth="1.5" />
      </g>
      <g data-part="shelf">
        <rect x="230" y="76" width="6" height="16" rx="1" fill="#3b4263" />
        <rect x="237" y="79" width="5" height="13" rx="1" fill="#55479a" />
        <rect x="243" y="74" width="7" height="18" rx="1" fill="#2e4a5e" />
        <rect x="251" y="80" width="5" height="12" rx="1" transform="rotate(8 253 86)" fill="#3b4263" />
        <rect x="263" y="85" width="9" height="7" rx="1.5" fill="#2f3550" />
        <path d="M267.5 85 q-3 -5 -1 -8 M267.5 85 q3 -4 2 -7" stroke="#4d8073" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <rect x="226" y="92" width="50" height="3" rx="1" fill="#2a2f44" />
      </g>

      {/* Monitor light washes the wall and the desk */}
      <ellipse className="monitor-glow" cx="200" cy="116" rx="96" ry="60" fill={`url(#${id('glow')})`} />

      <g data-part="plant" className="plant">
        <g className="plant__leaves" fill="none" strokeLinecap="round">
          <path d="M28 184 Q22 170 16 166" stroke="#3f6b62" strokeWidth="3" />
          <path d="M28 184 Q30 166 27 156" stroke="#4d8073" strokeWidth="3" />
          <path d="M29 184 Q36 172 42 169" stroke="#3f6b62" strokeWidth="3" />
        </g>
        <polygon points="20,184 37,184 35,199 22,199" fill="#2f3550" />
      </g>

      <g data-part="desk">
        <rect x="126" y="156" width="5" height="46" fill="#232737" />
        <rect x="263" y="156" width="5" height="46" fill="#232737" />
        <rect x="226" y="156" width="36" height="34" rx="1.5" fill="#22273a" stroke="#2c3247" />
        <rect x="238" y="165" width="12" height="2" rx="1" fill="#3a4058" />
        <rect x="238" y="179" width="12" height="2" rx="1" fill="#3a4058" />
        <rect x="120" y="150" width="154" height="6" rx="1.5" fill="#2f3447" />
        <path d="M121 150.5 H273" stroke="#40476a" strokeWidth="1" />
      </g>

      <g data-part="monitor">
        <rect x="202" y="137" width="8" height="10" fill="#1a1e2b" />
        <rect x="190" y="146" width="32" height="4" rx="2" fill="#1a1e2b" />
        <rect x="162" y="88" width="88" height="50" rx="4" fill="#0b0d14" stroke="#2a3046" strokeWidth="1.2" />
        <MonitorScreen key={spec.screen} screen={spec.screen} clipId={id('screen')} />
        <circle className="monitor__led tone-fill" cx="244" cy="135.8" r="0.9" />
      </g>

      <g data-part="keyboard">
        <rect x="140" y="145" width="36" height="4.5" rx="1.2" fill="#3a4058" />
        <path d="M143 147 H173" stroke="#535b7c" strokeWidth="1" strokeDasharray="2 1.2" />
      </g>
      <rect data-part="mouse" x="127" y="145" width="6" height="4.5" rx="2.2" fill="#3a4058" />

      {state === 'file-work' && (
        <g data-part="papers">
          <rect x="226" y="146" width="15" height="4" rx="0.6" fill="#8d97b8" transform="rotate(-4 233 148)" />
          <rect x="225" y="143" width="15" height="4" rx="0.6" fill="#aab3cc" transform="rotate(3 232 145)" />
          <rect x="226" y="140" width="15" height="4" rx="0.6" fill="#c3cadf" />
        </g>
      )}

      <g data-part="mug">
        <path className="steam" d="M246 134 q-2 -3 0 -6 M250 134 q2 -3 0 -6" stroke="#c9cfe4" strokeWidth="1" fill="none" strokeLinecap="round" />
        <rect x="244" y="138" width="9" height="12" rx="1.5" fill="#4b5373" />
        <path d="M253 141 h1.6 a2.6 2.6 0 0 1 0 5.2 h-1.6" stroke="#4b5373" strokeWidth="1.6" fill="none" />
      </g>

      <g data-part="lamp" className="desk-lamp">
        <polygon className="desk-lamp__cone" points="266,121 278,121 290,150 252,150" fill={`url(#${id('cone')})`} />
        <ellipse cx="268" cy="149" rx="6" ry="1.6" fill="#2a2f44" />
        <path d="M268 148 L262 130 L270 118" stroke="#3a4058" strokeWidth="2" fill="none" strokeLinejoin="round" />
        <path d="M264 121 L280 121 L276 113 L268 113 Z" fill="#3a4058" />
      </g>

      <g data-part="chair">
        <rect x="74" y="124" width="8" height="48" rx="3" fill="#2a2f45" />
        <rect x="98" y="176" width="5" height="16" fill="#222637" />
        <rect x="84" y="191" width="34" height="3" rx="1.5" fill="#222637" />
        <circle cx="86" cy="196" r="2.2" fill="#1a1d2a" />
        <circle cx="101" cy="197" r="2.2" fill="#1a1d2a" />
        <circle cx="116" cy="196" r="2.2" fill="#1a1d2a" />
        <rect x="78" y="170" width="46" height="6" rx="3" fill="#313752" />
      </g>

      <Character key={spec.pose} pose={spec.pose} skinGradientId={id('skin')} />

      {state === 'delegated' && <Helper />}

      {/* Dims the diorama only — the area around it must stay fully transparent. */}
      <polygon
        className="room-dim"
        points="30,46 290,46 290,52 286,52 286,198 306,224 306,234 14,234 14,224 34,198 34,52 30,52"
        fill="#04050a"
      />
    </svg>
  );
}
