/**
 * The character in bed (ADR-017): lounging with a little book while idle, tucked in and asleep while offline.
 * Room coordinates (400×260): the head rests on the pillow at the left end of the bed.
 * Drawn from primitives only; the "z"s are strokes, not text (FR-S6).
 */

export type BedPoseId = 'lounging' | 'asleep-in-bed';

const EYE = '#171a27';

const zee = (x: number, y: number, s: number) => `M${x} ${y} h${s} l${-s} ${s * 1.2} h${s}`;

function Lounging({ skinGradientId }: { skinGradientId: string }) {
  return (
    <g className="bed-body">
      <path className="character__antenna" d="M76 148 Q71 141 70 136" fill="none" stroke="#9aa3bd" strokeWidth="1.6" strokeLinecap="round" />
      <circle className="character__bulb-glow tone-fill" cx="69.5" cy="134" r="6" />
      <circle className="character__bulb tone-fill" cx="69.5" cy="134" r="3.2" />
      <rect className="character__torso" x="64" y="147" width="52" height="29" rx="14.5" fill={`url(#${skinGradientId})`} />
      <path className="character__scarf" d="M95 148.5 Q99 161.5 95 175 L100 175 Q104 161.5 100 148.5 Z" />
      <ellipse className="character__cheek" cx="72.5" cy="165" rx="2.4" ry="1.3" />
      <ellipse className="character__cheek" cx="89" cy="165" rx="2.4" ry="1.3" />
      <g className="eyes-blink">
        <ellipse cx="77" cy="158" rx="1.8" ry="2.4" fill={EYE} />
        <ellipse cx="86" cy="158" rx="1.8" ry="2.4" fill={EYE} />
      </g>
      <path className="character__mouth" d="M78.5 165.5 q2.8 2 5.6 0" fill="none" stroke={EYE} strokeWidth="1.3" strokeLinecap="round" />
      <g className="bed-book">
        <path d="M104 152 Q109 142 103 134" fill="none" stroke="#c3cadf" strokeWidth="5" strokeLinecap="round" />
        <rect x="94" y="122" width="16" height="11" rx="1.2" fill="#6a7bb8" transform="rotate(-10 102 127)" />
        <path d="M102 122.6 V133.4" stroke="#b9c4ee" strokeWidth="0.8" transform="rotate(-10 102 127)" />
        <circle cx="103" cy="134" r="2.8" fill="#d6dcee" />
      </g>
      <path d="M90 170 Q99 174 108 169" fill="none" stroke="#c3cadf" strokeWidth="5" strokeLinecap="round" />
      <circle cx="108" cy="169" r="2.8" fill="#d6dcee" />
    </g>
  );
}

function Asleep({ skinGradientId }: { skinGradientId: string }) {
  return (
    <g className="bed-body">
      <path className="character__antenna" d="M74 152 Q66 149 62 154" fill="none" stroke="#9aa3bd" strokeWidth="1.6" strokeLinecap="round" />
      <circle className="character__bulb tone-fill" cx="61" cy="155.5" r="2.6" />
      <rect className="character__torso" x="64" y="151" width="52" height="27" rx="13.5" fill={`url(#${skinGradientId})`} />
      <g fill="none" stroke={EYE} strokeWidth="1.5" strokeLinecap="round">
        <path d="M74 161 q2.5 2 5 0" />
        <path d="M83 161 q2.5 2 5 0" />
      </g>
      <path d="M79 167 h3" stroke={EYE} strokeWidth="1.2" strokeLinecap="round" />
      <path
        data-part="bed-blanket"
        className="bed-blanket"
        d="M88 185 L88 165 Q97 155 114 157 Q134 159 153 165 L153 185 Z"
        fill="#574c8c"
      />
      <path d="M96 164 Q118 160 150 168" fill="none" stroke="#6d62a8" strokeWidth="1.2" />
      <g className="zzz" fill="none" stroke="#c9cfe4" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path className="zzz__a" d={zee(88, 136, 5)} />
        <path className="zzz__b" d={zee(97, 123, 7)} />
      </g>
    </g>
  );
}

export function BedCharacter({ pose, skinGradientId }: { pose: BedPoseId; skinGradientId: string }) {
  return (
    <g data-part="character" data-pose={pose} data-place="bed" className={`character pose-${pose}`}>
      {pose === 'lounging' ? <Lounging skinGradientId={skinGradientId} /> : <Asleep skinGradientId={skinGradientId} />}
    </g>
  );
}
