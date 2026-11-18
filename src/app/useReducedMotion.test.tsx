import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { mockReducedMotion } from '../test/matchMedia';
import { useReducedMotion } from './useReducedMotion';

describe('useReducedMotion (FR-M1, FR-M2)', () => {
  it('follows the system preference when set to system', () => {
    mockReducedMotion(true);
    expect(renderHook(() => useReducedMotion('system')).result.current).toBe(true);
  });

  it('is off under system when the OS does not ask for reduced motion', () => {
    mockReducedMotion(false);
    expect(renderHook(() => useReducedMotion('system')).result.current).toBe(false);
  });

  it('reacts when the system preference changes', () => {
    const media = mockReducedMotion(false);
    const { result } = renderHook(() => useReducedMotion('system'));
    act(() => media.set(true));
    expect(result.current).toBe(true);
  });

  it('lets the user force reduced motion', () => {
    mockReducedMotion(false);
    expect(renderHook(() => useReducedMotion('reduced')).result.current).toBe(true);
  });

  it('lets the user force full motion even if the OS prefers reduced', () => {
    mockReducedMotion(true);
    expect(renderHook(() => useReducedMotion('full')).result.current).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    const media = mockReducedMotion(false);
    const { unmount } = renderHook(() => useReducedMotion('system'));
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('treats a missing matchMedia as no preference', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useReducedMotion('system')).result.current).toBe(false);
  });
});
