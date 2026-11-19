import { PixelSprite } from './PixelSprite';
import { EMOTES } from './sprites';

/** A one-pixel white rim round an emote, so it reads over a busy desk or another member. */
const HALO = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export interface EmoteSignProps {
  readonly id: string | null;
  readonly centerX: number;
  readonly headTop: number;
  /** Which desk's member it is over, when drawn outside the member (the LEVEL UP sign). */
  readonly desk?: string;
}

/** One pixel sign centred above a head (DESIGN §3.3). */
export function EmoteSign({ id, centerX, headTop, desk }: EmoteSignProps) {
  const emote = id ? EMOTES[id] : undefined;
  if (!emote || !id) return null;
  const scale = emote.scale ?? 2;
  const width = (emote.map[0]?.length ?? 0) * scale;
  const height = emote.map.length * scale;
  const x = centerX - width / 2;
  const y = headTop - height - 4;
  const rim = Object.fromEntries(Object.keys(emote.palette).map((key) => [key, emote.rim ?? '#ffffff']));
  return (
    <g data-part="emote" data-emote={id} data-desk={desk} className="emote">
      {HALO.map(([dx, dy]) => (
        <PixelSprite key={`${dx},${dy}`} map={emote.map} palette={rim} x={x + dx} y={y + dy} scale={scale} />
      ))}
      <PixelSprite map={emote.map} palette={emote.palette} x={x} y={y} scale={scale} />
    </g>
  );
}

