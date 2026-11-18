// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { augmentPath } from './with-cargo.mjs';

// ADR-010: npm scripts must find cargo even when ~/.cargo/bin is not on the shell PATH.
const home = '/Users/someone';
const cargoBin = '/Users/someone/.cargo/bin';
const hasCargo = (p) => p === `${cargoBin}/cargo`;
const noCargo = () => false;

describe('augmentPath (ADR-010)', () => {
  it('appends ~/.cargo/bin when it holds cargo and is missing from PATH', () => {
    expect(augmentPath('/usr/bin:/bin', { home, exists: hasCargo, delimiter: ':' })).toBe(
      `/usr/bin:/bin:${cargoBin}`,
    );
  });

  it('keeps PATH unchanged when ~/.cargo/bin is already present', () => {
    const path = `${cargoBin}:/usr/bin`;
    expect(augmentPath(path, { home, exists: hasCargo, delimiter: ':' })).toBe(path);
  });

  it('keeps PATH unchanged when ~/.cargo/bin has no cargo binary', () => {
    expect(augmentPath('/usr/bin', { home, exists: noCargo, delimiter: ':' })).toBe('/usr/bin');
  });

  it('handles an empty PATH', () => {
    expect(augmentPath(undefined, { home, exists: hasCargo, delimiter: ':' })).toBe(cargoBin);
  });
});
