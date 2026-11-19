import type { ReactNode } from 'react';
import { boxFaces } from './isoMath';

export interface IsoBoxProps {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly z0?: number;
  readonly h: number;
  readonly top: string;
  readonly left: string;
  readonly right: string;
  readonly stroke?: string;
  readonly className?: string;
  readonly part?: string;
  readonly children?: ReactNode;
}

/** An isometric box: lit top, mid-tone left face, shaded right face, dark pixel outline. */
export function IsoBox({ x0, y0, x1, y1, z0 = 0, h, top, left, right, stroke = '#3b2a20', className, part, children }: IsoBoxProps) {
  const faces = boxFaces(x0, y0, x1, y1, z0, z0 + h);
  return (
    <g className={className} data-part={part}>
      <polygon points={faces.right} fill={right} stroke={stroke} strokeWidth="1" strokeLinejoin="round" />
      <polygon points={faces.left} fill={left} stroke={stroke} strokeWidth="1" strokeLinejoin="round" />
      <polygon points={faces.top} fill={top} stroke={stroke} strokeWidth="1" strokeLinejoin="round" />
      {children}
    </g>
  );
}
