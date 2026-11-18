/** A tiny helper bot that appears on the floor only while work is delegated. */
export function Helper() {
  return (
    <g data-part="helper" className="helper">
      <ellipse cx="55" cy="200" rx="11" ry="2.2" fill="#000" opacity="0.35" />
      <g className="helper__bob">
        <path d="M55 172 v-5.5" stroke="#8b93ad" strokeWidth="1.4" strokeLinecap="round" />
        <circle className="tone-fill" cx="55" cy="165" r="2.4" />
        <rect x="44" y="172" width="22" height="20" rx="6" fill="#aab3cc" />
        <rect x="47.5" y="176.5" width="15" height="6.5" rx="3.2" fill="#171a27" />
        <circle className="tone-fill" cx="52" cy="179.7" r="1.3" />
        <circle className="tone-fill" cx="58" cy="179.7" r="1.3" />
        <rect x="47" y="192" width="5" height="5" rx="1.5" fill="#7d86a3" />
        <rect x="58" y="192" width="5" height="5" rx="1.5" fill="#7d86a3" />
        <rect x="62" y="183" width="9" height="7.5" rx="1.2" fill="#6a7bb8" />
        <path d="M62 186.5 h9" stroke="#b9c4ee" strokeWidth="0.8" opacity="0.7" />
      </g>
    </g>
  );
}
