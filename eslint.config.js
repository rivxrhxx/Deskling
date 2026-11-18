import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Layer boundaries (docs/ARCHITECTURE.md §2, ADR-011). Do not disable — fix the structure instead.
const REACT = { regex: '^react(-dom)?(/.*)?$', message: '이 레이어는 React에 의존할 수 없다.' };
const TAURI = {
  regex: '^@tauri-apps/',
  message: 'Tauri API는 src/platform/ 에서만 import한다.',
};
const layer = (names, message) => ({
  regex: `^\\.{1,2}/(.*/)?(${names.join('|')})(/|$)`,
  message,
});
const boundary = (files, patterns) => ({
  files,
  rules: { 'no-restricted-imports': ['error', { patterns }] },
});

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'node_modules', 'src-tauri/target', 'src-tauri/gen', '.omc']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn'] }],
    },
  },
  boundary(
    ['src/core/**/*.{ts,tsx}'],
    [REACT, TAURI, layer(['adapters', 'app', 'ui', 'platform'], 'core는 순수 TS — 다른 레이어를 import하지 않는다.')],
  ),
  boundary(
    ['src/adapters/**/*.{ts,tsx}'],
    [REACT, TAURI, layer(['app', 'ui', 'platform'], 'adapter는 UI·앱·플랫폼 레이어를 모른다.')],
  ),
  boundary(
    ['src/platform/**/*.{ts,tsx}'],
    [layer(['adapters', 'app', 'ui'], 'platform은 창 API 래퍼만 담당한다.')],
  ),
  boundary(['src/app/**/*.{ts,tsx}'], [TAURI]),
  boundary(
    ['src/ui/**/*.{ts,tsx}'],
    [TAURI, layer(['adapters', 'app', 'platform'], 'UI는 시각 상태만 받는다 — provider·플랫폼 로직 금지.')],
  ),
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
]);
