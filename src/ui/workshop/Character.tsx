import type { ReactNode } from 'react';
import type { PoseId } from '../visualSpec';

/**
 * Deskling's own character: a small jelly-bean body, dot eyes, a state-coloured antenna bulb
 * and a restrained violet scarf. Every pose is a distinct drawing, not a recolour (FR-S3).
 * Coordinates live in the Workshop viewBox (0 0 320 260); the character sits on the chair at x≈105.
 */

interface PoseArt {
  /** Transform applied to the whole character (lean, tilt). */
  readonly body?: string;
  readonly eyes: ReactNode;
  readonly mouth: ReactNode;
  readonly arms: readonly ArmArt[];
  readonly extras?: ReactNode;
}

interface ArmArt {
  readonly d: string;
  readonly hand: readonly [number, number];
  readonly className?: string;
}

const EYE = '#171a27';

const openEyes = (lx: number, rx: number, y: number, ry = 2.4, rxSize = 1.8) => (
  <g className="character__eyes">
    <ellipse cx={lx} cy={y} rx={rxSize} ry={ry} fill={EYE} />
    <ellipse cx={rx} cy={y} rx={rxSize} ry={ry} fill={EYE} />
  </g>
);

const arcEyes = (lx: number, rx: number, y: number, bend: number) => (
  <g className="character__eyes" fill="none" stroke={EYE} strokeWidth="1.5" strokeLinecap="round">
    <path d={`M${lx - 2.5} ${y} q2.5 ${bend} 5 0`} />
    <path d={`M${rx - 2.5} ${y} q2.5 ${bend} 5 0`} />
  </g>
);

const line = (d: string) => <path className="character__mouth" d={d} fill="none" stroke={EYE} strokeWidth="1.3" strokeLinecap="round" />;
const smile = line('M102 147.5 q2.8 2 5.6 0');

/** A four-point sparkle, drawn rather than typed. */
const sparkle = (cx: number, cy: number, s: number) =>
  `M${cx} ${cy - s} L${cx + s * 0.3} ${cy - s * 0.3} L${cx + s} ${cy} L${cx + s * 0.3} ${cy + s * 0.3} ` +
  `L${cx} ${cy + s} L${cx - s * 0.3} ${cy + s * 0.3} L${cx - s} ${cy} L${cx - s * 0.3} ${cy - s * 0.3} Z`;

/** A "z" drawn as a stroke, so the scene contains no text glyphs (FR-S6). */
const zee = (x: number, y: number, s: number) => `M${x} ${y} h${s} l${-s} ${s * 1.2} h${s}`;

const restingArms: readonly ArmArt[] = [
  { d: 'M91 152 Q84 159 86 167', hand: [86, 167] },
  { d: 'M119 152 Q126 159 124 167', hand: [124, 167] },
];

const POSES: Record<PoseId, PoseArt> = {
  sleeping: {
    body: 'rotate(9 105 172)',
    eyes: arcEyes(99, 110, 140, 2),
    mouth: line('M103.5 148 h3'),
    arms: [
      { d: 'M91 152 Q85 160 87 168', hand: [87, 168] },
      { d: 'M119 152 Q125 160 123 168', hand: [123, 168] },
    ],
    extras: (
      <g className="zzz" fill="none" stroke="#c9cfe4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path className="zzz__a" d={zee(124, 108, 5)} />
        <path className="zzz__b" d={zee(133, 96, 7)} />
      </g>
    ),
  },
  resting: {
    body: 'rotate(-3 105 172)',
    eyes: <g className="eyes-blink">{openEyes(103, 113, 139)}</g>,
    mouth: smile,
    arms: restingArms,
  },
  pondering: {
    eyes: openEyes(104, 114, 136),
    mouth: line('M104 148.5 h4.5'),
    arms: [
      { d: 'M91 153 Q85 160 87 167', hand: [87, 167] },
      { d: 'M119 156 Q131 160 117 151', hand: [117, 151] },
    ],
    extras: (
      <g className="thought" fill="#e6e9f5">
        <circle className="thought__a" cx="123" cy="117" r="1.8" />
        <circle className="thought__b" cx="130" cy="109" r="2.6" />
        <circle className="thought__c" cx="139" cy="100" r="3.4" />
      </g>
    ),
  },
  typing: {
    eyes: openEyes(103, 113, 139, 1.5),
    mouth: line('M103.5 148 q2.2 1.2 4.4 0'),
    arms: [
      { d: 'M92 152 Q117 161 143 147', hand: [143, 147], className: 'tap-a' },
      { d: 'M119 151 Q137 156 154 146', hand: [154, 146], className: 'tap-b' },
    ],
  },
  scrolling: {
    body: 'rotate(-6 105 172)',
    eyes: openEyes(105, 115, 136.5),
    mouth: line('M103 147.5 q2.8 1.8 5.6 0'),
    arms: [
      { d: 'M91 153 Q95 162 103 162', hand: [103, 162] },
      { d: 'M119 152 Q128 157 132 147', hand: [132, 147], className: 'scroll-hand' },
    ],
  },
  'leaning-in': {
    body: 'translate(5 1) rotate(8 105 172)',
    eyes: openEyes(104, 114, 139.5, 1.4),
    mouth: line('M104 148.5 h3.5'),
    arms: [
      { d: 'M92 151 Q112 158 136 147', hand: [136, 147], className: 'tap-a' },
      { d: 'M119 151 Q132 153 146 145', hand: [146, 145], className: 'tap-b' },
    ],
  },
  'holding-folder': {
    eyes: openEyes(104, 114, 141.5),
    mouth: line('M102.5 147.5 q2.8 2 5.6 0'),
    arms: [
      { d: 'M91 156 Q98 160 106 153', hand: [106, 153] },
      { d: 'M119 156 Q130 156 128 150', hand: [128, 150] },
    ],
    extras: (
      <g className="folder" transform="rotate(-8 116 155)">
        <path d="M104 149 v-2.5 a1.5 1.5 0 0 1 1.5 -1.5 h6 l2 2.5" fill="#5f6fa8" />
        <rect x="104" y="148" width="24" height="16" rx="2" fill="#6a7bb8" />
        <rect x="108" y="153" width="14" height="1.6" rx="0.8" fill="#b9c4ee" opacity="0.7" />
        <rect x="108" y="157" width="10" height="1.6" rx="0.8" fill="#b9c4ee" opacity="0.5" />
      </g>
    ),
  },
  'raising-hand': {
    eyes: (
      <g>
        {openEyes(99, 110, 139, 2.9, 2.1)}
        <circle cx="99.7" cy="138" r="0.7" fill="#fff" />
        <circle cx="110.7" cy="138" r="0.7" fill="#fff" />
      </g>
    ),
    mouth: <circle className="character__mouth" cx="104.5" cy="148.5" r="1.6" fill={EYE} />,
    arms: [
      { d: 'M91 153 Q85 160 87 167', hand: [87, 167] },
      { d: 'M119 150 Q129 139 127 123', hand: [127, 122], className: 'raised-hand' },
    ],
    extras: (
      <g className="approval-flag">
        <circle className="approval-halo tone-fill" cx="127" cy="122" r="7.5" />
        <circle className="tone-fill" cx="139" cy="109" r="6.5" />
        <rect x="138.1" y="104.6" width="1.8" height="6" rx="0.9" fill="#1d1406" />
        <circle cx="139" cy="113.2" r="1.1" fill="#1d1406" />
      </g>
    ),
  },
  pointing: {
    eyes: openEyes(96, 106, 139),
    mouth: smile,
    arms: [
      { d: 'M91 151 Q79 147 69 145', hand: [69, 145] },
      { d: 'M119 152 Q126 159 124 167', hand: [124, 167] },
    ],
    extras: (
      <path className="handoff-link tone-stroke" d="M65 148 Q60 156 57 164" fill="none" strokeWidth="1.4" strokeDasharray="2.5 2.5" />
    ),
  },
  cheering: {
    eyes: arcEyes(99, 110, 140, -3),
    mouth: <path className="character__mouth" d="M100.5 146.5 q4.5 5.5 9 0 z" fill={EYE} />,
    arms: [
      { d: 'M91 150 Q79 138 81 121', hand: [81, 121], className: 'cheer-a' },
      { d: 'M119 150 Q131 138 129 121', hand: [129, 121], className: 'cheer-b' },
    ],
    extras: (
      <g className="sparkles">
        <path className="sparkle sparkle--a tone-fill" d={sparkle(70, 112, 4)} />
        <path className="sparkle sparkle--b tone-fill" d={sparkle(141, 106, 5)} />
        <path className="sparkle sparkle--c tone-fill" d={sparkle(64, 134, 3)} />
        <path className="sparkle sparkle--d tone-fill" d={sparkle(147, 130, 3.5)} />
      </g>
    ),
  },
  distressed: {
    eyes: (
      <g>
        {openEyes(99, 110, 139.5)}
        <path d="M95.5 133.5 l5 1.6 M114 133.5 l-5 1.6" stroke={EYE} strokeWidth="1.3" strokeLinecap="round" />
      </g>
    ),
    mouth: line('M100.5 149 q2 -2 4 0 q2 2 4 0'),
    arms: [
      { d: 'M91 152 Q77 141 89 130', hand: [89, 130] },
      { d: 'M119 152 Q133 141 121 130', hand: [121, 130] },
    ],
    extras: <path className="sweat" d="M126 125 q3 4.5 0 6 q-3 -1.5 0 -6 z" fill="#8fd3ff" />,
  },
};

export function Character({ pose, skinGradientId }: { pose: PoseId; skinGradientId: string }) {
  const art = POSES[pose];
  return (
    <g data-part="character" data-pose={pose} className={`character pose-${pose}`}>
      <g className="character__pose" transform={art.body}>
        <g className="character__breath">
          <path className="character__antenna" d="M105 125 Q104 117 108 111" fill="none" stroke="#9aa3bd" strokeWidth="1.6" strokeLinecap="round" />
          <circle className="character__bulb-glow tone-fill" cx="108" cy="109" r="6" />
          <circle className="character__bulb tone-fill" cx="108" cy="109" r="3.2" />
          <rect className="character__torso" x="88" y="124" width="34" height="48" rx="16" fill={`url(#${skinGradientId})`} />
          <path className="character__scarf" d="M89.5 153 Q105 159 120.5 153 L120.5 158 Q105 164 89.5 158 Z" />
          <path className="character__scarf" d="M93 158 L89 169 L95 167 Z" />
          <ellipse className="character__cheek" cx="96.5" cy="146" rx="2.6" ry="1.4" />
          <ellipse className="character__cheek" cx="115" cy="146" rx="2.6" ry="1.4" />
          {art.eyes}
          {art.mouth}
        </g>
        {art.arms.map((arm) => (
          <g key={arm.d} className={`character__arm ${arm.className ?? ''}`.trim()}>
            <path d={arm.d} fill="none" stroke="#c3cadf" strokeWidth="5.5" strokeLinecap="round" />
            <circle cx={arm.hand[0]} cy={arm.hand[1]} r="2.9" fill="#d6dcee" />
          </g>
        ))}
        {art.extras}
      </g>
    </g>
  );
}
