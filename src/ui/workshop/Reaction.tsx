/** Short-lived care reactions (ADR-018): floating hearts after petting, a cookie after a snack. */

export interface CareReaction {
  readonly kind: 'hearts' | 'snack';
  readonly id: number;
}

const HEART = 'M0 3 C0 1.5 -2.5 0 -4 1.5 C-5.5 3 -4 5.5 0 8 C4 5.5 5.5 3 4 1.5 C2.5 0 0 1.5 0 3 Z';

export function Reaction({ reaction, x, y }: { reaction: CareReaction; x: number; y: number }) {
  if (reaction.kind === 'hearts') {
    return (
      <g data-part="reaction-hearts" className="reaction-hearts">
        {[
          [x - 9, y + 2, 'a'],
          [x, y - 4, 'b'],
          [x + 9, y + 1, 'c'],
        ].map(([hx, hy, delay]) => (
          <path
            key={String(delay)}
            data-part="heart"
            className={`heart heart--${delay}`}
            d={HEART}
            transform={`translate(${hx} ${hy}) scale(0.7)`}
          />
        ))}
      </g>
    );
  }
  return (
    <g data-part="reaction-snack" className="reaction-snack">
      <circle cx={x} cy={y + 6} r="4.2" fill="#c8955c" />
      <circle cx={x - 1.4} cy={y + 5} r="0.7" fill="#5a3a24" />
      <circle cx={x + 1.6} cy={y + 6.4} r="0.7" fill="#5a3a24" />
      <circle cx={x - 0.2} cy={y + 8} r="0.6" fill="#5a3a24" />
      <circle className="crumb" cx={x + 6} cy={y + 10} r="0.6" fill="#c8955c" />
      <circle className="crumb" cx={x - 5.5} cy={y + 11} r="0.5" fill="#c8955c" />
    </g>
  );
}
