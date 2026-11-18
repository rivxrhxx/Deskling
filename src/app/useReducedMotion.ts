import { useSyncExternalStore } from 'react';

export const MOTION_SETTINGS = ['system', 'reduced', 'full'] as const;
export type MotionSetting = (typeof MOTION_SETTINGS)[number];

const QUERY = '(prefers-reduced-motion: reduce)';

function mediaQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null;
}

function subscribe(onChange: () => void): () => void {
  const query = mediaQuery();
  if (!query) return () => undefined;
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function systemPrefersReduced(): boolean {
  return mediaQuery()?.matches ?? false;
}

/** Combines the OS "reduce motion" preference with the in-app setting (FR-M1, FR-M2). */
export function useReducedMotion(setting: MotionSetting): boolean {
  const system = useSyncExternalStore(subscribe, systemPrefersReduced, () => false);
  if (setting === 'reduced') return true;
  if (setting === 'full') return false;
  return system;
}
