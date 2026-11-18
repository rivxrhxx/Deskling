// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// SEC-6 / ADR-011: layer boundaries are enforced by `no-restricted-imports`.
const eslint = new ESLint();

async function boundaryErrors(filePath: string, specifier: string): Promise<number> {
  const code = `import * as mod from '${specifier}';\nexport { mod };\n`;
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports').length;
}

describe('layer boundaries (SEC-6)', () => {
  it.each([
    ['src/ui/Fake.tsx', '@tauri-apps/api/window'],
    ['src/ui/Fake.tsx', '../adapters/demo/demoSource'],
    ['src/ui/Fake.tsx', '../platform/windowControls'],
    ['src/ui/Fake.tsx', '../app/settings'],
    ['src/core/fake.ts', 'react'],
    ['src/core/fake.ts', 'react-dom/client'],
    ['src/core/fake.ts', '@tauri-apps/api/core'],
    ['src/core/fake.ts', '../ui/visualSpec'],
    ['src/core/fake.ts', '../adapters/types'],
    ['src/adapters/demo/fake.ts', 'react'],
    ['src/adapters/demo/fake.ts', '../../ui/visualSpec'],
    ['src/adapters/demo/fake.ts', '@tauri-apps/api/event'],
    ['src/app/fake.ts', '@tauri-apps/api/window'],
    ['src/platform/fake.ts', '../ui/visualSpec'],
  ])('%s may not import %s', async (file, specifier) => {
    expect(await boundaryErrors(file, specifier)).toBeGreaterThan(0);
  });

  it.each([
    ['src/platform/fake.ts', '@tauri-apps/api/window'],
    ['src/ui/Fake.tsx', '../core/agentEvent'],
    ['src/ui/Fake.tsx', 'react'],
    ['src/app/fake.ts', '../platform/windowControls'],
    ['src/app/fake.ts', '../adapters/demo/demoSource'],
    ['src/adapters/demo/fake.ts', '../../core/normalize'],
  ])('%s may import %s', async (file, specifier) => {
    expect(await boundaryErrors(file, specifier)).toBe(0);
  });
});
