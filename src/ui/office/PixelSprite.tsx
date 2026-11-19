import type { Palette, PixelMap } from './pixelMap';
import { pixelPaths } from './pixelMap';

export interface PixelSpriteProps {
  readonly map: PixelMap;
  readonly palette: Palette;
  /** Top-left corner in scene units. */
  readonly x: number;
  readonly y: number;
  readonly scale?: number;
  /** Mirror horizontally (faces the other way). */
  readonly flip?: boolean;
  readonly className?: string;
  readonly part?: string;
}

export function PixelSprite({ map, palette, x, y, scale = 1, flip = false, className, part }: PixelSpriteProps) {
  const width = map[0]?.length ?? 0;
  const transform = flip
    ? `translate(${x + width * scale} ${y}) scale(${-scale} ${scale})`
    : `translate(${x} ${y}) scale(${scale} ${scale})`;
  return (
    <g className={className} data-part={part} transform={transform} shapeRendering="crispEdges">
      {pixelPaths(map, palette).map((path) => (
        <path key={path.fill} fill={path.fill} d={path.d} />
      ))}
    </g>
  );
}
