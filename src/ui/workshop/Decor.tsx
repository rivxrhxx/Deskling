import type { DecorId } from '../../core/growth';

/**
 * Room decorations unlocked by completed tasks (ADR-018, DESIGN §4.2). Primitives only, no text.
 * RoomDecor uses room coordinates; DeskDecor uses the work corner's own coordinates.
 */

const has = (decor: readonly DecorId[], id: DecorId) => decor.includes(id);

const STRING_BULBS = [44, 70, 96, 122, 148, 174, 200, 226, 252, 278, 304, 330, 356] as const;
const BULB_COLORS = ['#a48df0', '#6cc7f2', '#72e3bd'] as const;

/** Wall and floor pieces, drawn before the furniture. */
export function RoomDecorBack({ decor }: { decor: readonly DecorId[] }) {
  return (
    <>
      {has(decor, 'string-lights') && (
        <g data-part="decor-string-lights" className="string-lights">
          <path d="M34 56 Q117 66 200 56 Q283 66 366 56" fill="none" stroke="#2f3550" strokeWidth="0.9" />
          {STRING_BULBS.map((x, index) => (
            <circle
              key={x}
              className={`string-bulb string-bulb--${index % 3}`}
              cx={x}
              cy={56 + 9 * Math.sin((Math.PI * ((x - 34) % 166)) / 166) * 0.6}
              r="1.5"
              fill={BULB_COLORS[index % 3]}
            />
          ))}
        </g>
      )}
      {has(decor, 'poster') && (
        <g data-part="decor-poster">
          <rect x="127" y="64" width="22" height="30" rx="1.5" fill="#1f2438" stroke="#30375a" strokeWidth="1" />
          <circle cx="138" cy="74" r="5" fill="#a48df0" opacity="0.75" />
          <path d="M130 90 L136 80 L141 86 L144 82 L147 90 Z" fill="#6cc7f2" opacity="0.6" />
        </g>
      )}
      {has(decor, 'more-books') && (
        <g data-part="decor-more-books">
          <rect x="128" y="108" width="34" height="2.5" rx="1" fill="#2a2f44" />
          <rect x="131" y="96" width="4" height="12" rx="0.8" fill="#55479a" />
          <rect x="136" y="98" width="5" height="10" rx="0.8" fill="#2e4a5e" />
          <rect x="142" y="95" width="4" height="13" rx="0.8" fill="#3b4263" />
          <rect x="147" y="100" width="6" height="8" rx="0.8" fill="#4b5373" transform="rotate(-12 150 104)" />
        </g>
      )}
      {has(decor, 'trophy') && (
        <g data-part="decor-trophy">
          <rect x="154" y="104" width="6" height="4" rx="0.8" fill="#8d97b8" />
          <path d="M157 96 l1.4 2.8 3.1 0.4 -2.3 2.1 0.6 3 -2.8 -1.5 -2.8 1.5 0.6 -3 -2.3 -2.1 3.1 -0.4 z" fill="#f2d27a" />
        </g>
      )}
      {has(decor, 'bedside-rug') && (
        <g data-part="decor-bedside-rug">
          <ellipse cx="98" cy="210" rx="42" ry="6.5" fill="#2d2550" />
          <ellipse cx="98" cy="210" rx="34" ry="4.6" fill="none" stroke="#4a3f86" strokeWidth="1" />
        </g>
      )}
    </>
  );
}

/** Desk-top pieces in work-corner coordinates. */
export function DeskDecor({ decor }: { decor: readonly DecorId[] }) {
  if (!has(decor, 'desk-plant')) return null;
  return (
    <g data-part="decor-desk-plant">
      <path d="M258 144 q-3 -4 -1 -7 M258 144 q3 -3 2 -6 M258 144 q0 -4 1 -8" stroke="#4d8073" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <rect x="255" y="143.5" width="6" height="6.5" rx="1" fill="#6a5f9e" />
    </g>
  );
}
