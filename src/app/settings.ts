import type { DemoScriptId } from '../adapters/demo/scripts';
import { DEMO_SCRIPT_IDS } from '../adapters/demo/scripts';
import type { MotionSetting } from './useReducedMotion';
import { MOTION_SETTINGS } from './useReducedMotion';

/**
 * UI preferences — the only thing Deskling persists (FR-W6, SEC-7).
 * Stored under one key; every field is validated on the way in and on the way out.
 */

export const SETTINGS_KEY = 'deskling.settings.v1';

export const SIZE_PRESETS = { s: 0.8, m: 1, l: 1.3 } as const;
export type SizePreset = keyof typeof SIZE_PRESETS;
const SIZE_IDS = Object.keys(SIZE_PRESETS) as SizePreset[];

/** Base (M) window size in logical pixels (ADR-017). */
export const BASE_WINDOW = { width: 400, height: 280 } as const;
/** Token budget choices for the energy reading (FR-V6, ADR-016). */
export const TOKEN_BUDGETS = [50_000, 100_000, 200_000, 500_000, 1_000_000] as const;
export type TokenBudget = (typeof TOKEN_BUDGETS)[number];

export const OPACITY_MIN = 0.3;
export const OPACITY_MAX = 1;

export interface Settings {
  readonly size: SizePreset;
  readonly opacity: number;
  readonly alwaysOnTop: boolean;
  readonly motion: MotionSetting;
  readonly demoScript: DemoScriptId;
  readonly tokenBudget: TokenBudget;
}

export const DEFAULT_SETTINGS: Settings = Object.freeze({
  size: 'm',
  opacity: 1,
  alwaysOnTop: true,
  motion: 'system',
  demoScript: 'tour',
  tokenBudget: 200_000,
});

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function oneOf<T extends string>(list: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function normalizeOpacity(value: unknown, fallback = DEFAULT_SETTINGS.opacity): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, value));
  return Math.round(clamped * 20) / 20;
}

export function parseSettings(value: unknown): Settings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return DEFAULT_SETTINGS;
  const record = value as Record<string, unknown>;
  return {
    size: oneOf(SIZE_IDS, record.size, DEFAULT_SETTINGS.size),
    opacity: normalizeOpacity(record.opacity),
    alwaysOnTop: typeof record.alwaysOnTop === 'boolean' ? record.alwaysOnTop : DEFAULT_SETTINGS.alwaysOnTop,
    motion: oneOf(MOTION_SETTINGS, record.motion, DEFAULT_SETTINGS.motion),
    demoScript: oneOf(DEMO_SCRIPT_IDS, record.demoScript, DEFAULT_SETTINGS.demoScript),
    tokenBudget: (TOKEN_BUDGETS as readonly unknown[]).includes(record.tokenBudget)
      ? (record.tokenBudget as TokenBudget)
      : DEFAULT_SETTINGS.tokenBudget,
  };
}

export function loadSettings(storage: StorageLike | null): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    return raw ? parseSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(storage: StorageLike | null, settings: Settings): void {
  try {
    // Re-parse so only whitelisted settings fields can ever be written.
    storage?.setItem(SETTINGS_KEY, JSON.stringify(parseSettings(settings)));
  } catch {
    // Storage may be unavailable (private mode, quota). Preferences are a convenience, not state.
  }
}

export function windowSizeFor(size: SizePreset): { width: number; height: number } {
  const scale = SIZE_PRESETS[size];
  return { width: Math.round(BASE_WINDOW.width * scale), height: Math.round(BASE_WINDOW.height * scale) };
}
