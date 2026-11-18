import type { ReactNode } from 'react';
import type { IconId } from './visualSpec';

/** Original 16×16 line icons drawn for Deskling. Decorative: the text label carries the meaning. */
const PATHS: Record<IconId, ReactNode> = {
  plug: (
    <>
      <path d="M5.5 1.5v3M10.5 1.5v3" />
      <path d="M3.5 4.5h9v2.5a4.5 4.5 0 0 1-9 0z" />
      <path d="M8 11.5v3" />
    </>
  ),
  cup: (
    <>
      <path d="M3 6.5h8v3.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" />
      <path d="M11 7.5h1.2a1.6 1.6 0 0 1 0 3.2H11" />
      <path d="M6 2c0 1 1 1.2 1 2.4M9 2c0 1 1 1.2 1 2.4" />
    </>
  ),
  dots: (
    <>
      <circle cx="3.5" cy="8" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  brackets: <path d="M6 3.5 1.8 8 6 12.5M10 3.5 14.2 8 10 12.5" />,
  globe: (
    <>
      <circle cx="8" cy="8" r="6" />
      <ellipse cx="8" cy="8" rx="2.6" ry="6" />
      <path d="M2 8h12" />
    </>
  ),
  prompt: <path d="M2.5 4.5 6 8l-3.5 3.5M8 11.5h5.5" />,
  folder: <path d="M1.8 4.2a1 1 0 0 1 1-1H6l1.6 1.6h5.6a1 1 0 0 1 1 1v6.4a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z" />,
  hand: (
    <path d="M5 8.5V4.2a1 1 0 0 1 2 0V7.5M7 7.5V3a1 1 0 0 1 2 0v4.5M9 7.5V3.8a1 1 0 0 1 2 0v4.2M11 8V6a1 1 0 0 1 2 0v3.5c0 2.8-2 4.8-4.6 4.8-1.9 0-3.1-.8-4-2.4L3 9.6a1 1 0 0 1 1.7-1L5 9" />
  ),
  branch: (
    <>
      <circle cx="4" cy="3.2" r="1.6" />
      <circle cx="4" cy="12.8" r="1.6" />
      <circle cx="12" cy="6" r="1.6" />
      <path d="M4 4.8v6.4M4 9.5c0-2.2 2.2-3.5 4.4-3.5h2" />
    </>
  ),
  check: <path d="M2.8 8.6 6.2 12 13.2 4.6" />,
  alert: (
    <>
      <path d="M8 1.8 14.6 13.6H1.4z" />
      <path d="M8 6.2v3.4" />
      <circle cx="8" cy="11.6" r="0.6" fill="currentColor" />
    </>
  ),
};

export function StateIcon({ icon, className }: { icon: IconId; className?: string }) {
  return (
    <svg
      className={className}
      data-icon={icon}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[icon]}
    </svg>
  );
}
