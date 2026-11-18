/**
 * Pixel-art sprites from ASCII maps (ADR-019). Each character is one pixel; '.' is transparent.
 * Same-colour horizontal runs merge into one path, so a sprite is a handful of <path>s.
 */

export type PixelMap = readonly string[];
export type Palette = Readonly<Record<string, string>>;

export interface PixelPath {
  readonly fill: string;
  readonly d: string;
}

export function pixelPaths(map: PixelMap, palette: Palette): PixelPath[] {
  const byColour = new Map<string, string>();
  map.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x] as string;
      let run = 1;
      while (x + run < row.length && row[x + run] === key) run += 1;
      if (key !== '.') {
        const fill = palette[key];
        if (fill === undefined) throw new Error(`pixel key "${key}" is not in the palette`);
        byColour.set(fill, `${byColour.get(fill) ?? ''}M${x} ${y}h${run}v1h-${run}z`);
      }
      x += run;
    }
  });
  return [...byColour].map(([fill, d]) => ({ fill, d }));
}
