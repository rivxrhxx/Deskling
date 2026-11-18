import { vi } from 'vitest';

/** A controllable `prefers-reduced-motion` media query for jsdom, which has no matchMedia. */
export function mockReducedMotion(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(event: { matches: boolean }) => void>();
  const query = {
    get matches() {
      return matches;
    },
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeEventListener: (_type: 'change', listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn((media: string) => (media === query.media ? query : { ...query, matches: false })),
  );
  return {
    set(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener({ matches }));
    },
    listenerCount: () => listeners.size,
  };
}
