import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  TOKEN_BUDGETS,
  loadSettings,
  parseSettings,
  saveSettings,
  windowSizeFor,
} from './settings';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void data.set(key, value)),
  };
}

describe('parseSettings (FR-W6)', () => {
  it('accepts a complete valid object', () => {
    const value = { size: 'l', opacity: 0.6, alwaysOnTop: false, motion: 'reduced', demoScript: 'core', tokenBudget: 500_000 };
    expect(parseSettings(value)).toEqual(value);
  });

  it.each([null, undefined, 42, 'm', []])('falls back to defaults for %s', (value) => {
    expect(parseSettings(value)).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back per field instead of discarding everything', () => {
    expect(parseSettings({ size: 'xl', opacity: 0.5, alwaysOnTop: 'yes', motion: 'wild', demoScript: 'nope' })).toEqual({
      ...DEFAULT_SETTINGS,
      opacity: 0.5,
    });
  });

  it.each([
    [0, 0.3],
    [0.1, 0.3],
    [2, 1],
    [0.333, 0.35],
    [Number.NaN, DEFAULT_SETTINGS.opacity],
    ['0.5', DEFAULT_SETTINGS.opacity],
  ])('clamps and rounds opacity %s to %s', (input, expected) => {
    expect(parseSettings({ opacity: input }).opacity).toBe(expected);
  });

  it('drops unknown keys', () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, token: 'SECRET' })).not.toHaveProperty('token');
  });
});

describe('token budget (FR-V6)', () => {
  it('defaults to 200k', () => {
    expect(DEFAULT_SETTINGS.tokenBudget).toBe(200_000);
  });

  it.each(TOKEN_BUDGETS)('accepts %d', (budget) => {
    expect(parseSettings({ tokenBudget: budget }).tokenBudget).toBe(budget);
  });

  it.each([0, -1, 123_456, '200000', Number.NaN])('falls back to the default for %s', (budget) => {
    expect(parseSettings({ tokenBudget: budget }).tokenBudget).toBe(200_000);
  });

  it('offers 50k, 100k, 200k, 500k and 1M', () => {
    expect([...TOKEN_BUDGETS]).toEqual([50_000, 100_000, 200_000, 500_000, 1_000_000]);
  });
});

describe('loadSettings / saveSettings (FR-W6, SEC-7)', () => {
  it('returns defaults when nothing is stored or storage is unavailable', () => {
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('returns defaults for corrupt JSON', () => {
    expect(loadSettings(memoryStorage({ [SETTINGS_KEY]: '{not json' }))).toEqual(DEFAULT_SETTINGS);
  });

  it('survives a storage that throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadSettings(throwing)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(throwing, DEFAULT_SETTINGS)).not.toThrow();
  });

  it('round-trips through a single storage key containing only settings fields', () => {
    const storage = memoryStorage();
    const settings = { size: 's', opacity: 0.7, alwaysOnTop: false, motion: 'full', demoScript: 'core', tokenBudget: 100_000 } as const;
    saveSettings(storage, { ...settings, extra: 'SECRET' } as typeof settings);

    expect([...storage.data.keys()]).toEqual([SETTINGS_KEY]);
    expect(storage.data.get(SETTINGS_KEY)).not.toContain('SECRET');
    expect(Object.keys(JSON.parse(storage.data.get(SETTINGS_KEY) ?? '{}')).sort()).toEqual(
      ['alwaysOnTop', 'demoScript', 'motion', 'opacity', 'size', 'tokenBudget'].sort(),
    );
    expect(loadSettings(storage)).toEqual(settings);
  });
});

describe('windowSizeFor (FR-W4, ADR-012)', () => {
  it.each([
    ['s', 256, 224],
    ['m', 320, 280],
    ['l', 416, 364],
  ] as const)('%s → %dx%d', (size, width, height) => {
    expect(windowSizeFor(size)).toEqual({ width, height });
  });
});
