// ESLint flat config. Enforces the dependency rule of design §1.4 (Req 2 c1, c3, Req 15 c5)
// and the determinism bans of design §14.2. Verified by src/test/architecture.lint.test.ts.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

const TEST_FILES = ['**/*.test.ts', '**/*.test.tsx'];
const SIM_LOOP = ['src/sim/**/*.{ts,tsx}', 'src/loop/**/*.{ts,tsx}'];

// --- Shared rule fragments -------------------------------------------------------------

/** Packages the simulation and loop may never import, directly (Req 2 c1). */
const UI_RUNTIME_PACKAGES = [
  { name: 'react', message: 'src/sim and src/loop must not import React (Req 2 c1).' },
  { name: 'react-dom', message: 'src/sim and src/loop must not import React DOM (Req 2 c1).' },
  { name: 'three', message: 'src/sim and src/loop must not import Three.js (Req 2 c1).' },
  { name: 'zustand', message: 'src/sim and src/loop must not import Zustand (Req 2 c1).' },
];
const UI_RUNTIME_PATTERNS = [
  { group: ['three/*'], message: 'src/sim and src/loop must not import Three.js (Req 2 c1).' },
  { group: ['@react-three/*'], message: 'src/sim and src/loop must not import React Three Fiber (Req 2 c1).' },
];
const shellDirs = (dirs, who) => ({
  regex: `(^|/)(${dirs.join('|')})(/|$)`,
  message: `${who} must not import ${dirs.map((d) => `src/${d}`).join(', ')} (design §1.4).`,
});

/** Globals that read time, input, the DOM, or audio (Req 2 c1, c3). */
const BANNED_GLOBALS = [
  'window',
  'document',
  'navigator',
  'performance',
  'Date',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'AudioContext',
  'webkitAudioContext',
  'setTimeout',
  'setInterval',
].map((name) => ({ name, message: `'${name}' is not allowed in src/sim or src/loop (Req 2 c1, c3).` }));

/** Math functions that are random or not specified bit-exactly across engines (design §2.1, §14.2). */
const NONDETERMINISTIC_MATH = [
  'random',
  'pow',
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'cbrt',
  'hypot',
].map((property) => ({
  object: 'Math',
  property,
  message: `Math.${property} is not allowed in src/sim or src/loop: it is ${
    property === 'random' ? 'not seeded (use the sfc32 PRNG, Req 3 c2)' : 'not bit-exact across engines (design §14.2)'
  }.`,
}));

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'blob-report/**']),

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Browser code by default.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  // Node-side tooling, tests helpers, benchmarks, and browser tests.
  {
    files: ['*.{js,ts}', 'bench/**/*.ts', 'e2e/**/*.ts', 'src/test/**/*.ts', ...TEST_FILES],
    languageOptions: { globals: { ...globals.node } },
  },

  // --- src/sim: may import only itself and zod (design §1.4) ----------------------------
  {
    files: ['src/sim/**/*.{ts,tsx}'],
    ignores: TEST_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: UI_RUNTIME_PACKAGES,
          patterns: [
            ...UI_RUNTIME_PATTERNS,
            shellDirs(['render', 'ui', 'app', 'input', 'loop'], 'src/sim'),
            { regex: '^(?![./]|zod$)', message: 'src/sim may import only its own modules and zod (design §1.4).' },
          ],
        },
      ],
    },
  },
  // --- src/loop: imports nothing outside itself (design §1.4) --------------------------
  {
    files: ['src/loop/**/*.{ts,tsx}'],
    ignores: TEST_FILES,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: UI_RUNTIME_PACKAGES,
          patterns: [
            ...UI_RUNTIME_PATTERNS,
            { regex: '^(?!\\./)', message: 'src/loop must not import anything outside src/loop (design §1.4).' },
          ],
        },
      ],
    },
  },
  // --- Tests inside src/sim and src/loop: same package and shell bans --------------------
  {
    files: TEST_FILES.map((t) => `src/{sim,loop}/${t}`),
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: UI_RUNTIME_PACKAGES,
          patterns: [...UI_RUNTIME_PATTERNS, shellDirs(['render', 'ui', 'app', 'input'], 'Simulation tests')],
        },
      ],
    },
  },
  // --- Determinism and environment bans for all of src/sim and src/loop ----------------
  {
    files: SIM_LOOP,
    rules: {
      'no-restricted-globals': ['error', ...BANNED_GLOBALS],
      'no-restricted-properties': ['error', ...NONDETERMINISTIC_MATH],
    },
  },
  {
    files: SIM_LOOP,
    ignores: TEST_FILES,
    rules: {
      'no-restricted-globals': [
        'error',
        ...BANNED_GLOBALS,
        { name: 'process', message: "'process' is not allowed in src/sim or src/loop (Req 2 c3)." },
      ],
    },
  },

  // --- Import direction for the browser shell (design §1.4) ----------------------------
  // render -> sim (types only), ui/stores
  {
    files: ['src/render/**/*.{ts,tsx}'],
    ignores: TEST_FILES,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            shellDirs(['app', 'input', 'loop'], 'src/render'),
            { regex: '(^|/)ui(/(?!stores$).*)?$', message: 'src/render may import only src/ui/stores from src/ui (design §1.4).' },
            { regex: '(^|/)sim(/|$)', allowTypeImports: true, message: 'src/render may import only types from src/sim (design §1.4).' },
          ],
        },
      ],
    },
  },
  // ui -> sim (types only)
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    ignores: TEST_FILES,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            shellDirs(['render', 'input', 'loop', 'app'], 'src/ui'),
            { regex: '(^|/)sim(/|$)', allowTypeImports: true, message: 'src/ui may import only types from src/sim (design §1.4).' },
          ],
        },
      ],
    },
  },
  // input -> sim command constants (src/sim/types) only
  {
    files: ['src/input/**/*.{ts,tsx}'],
    ignores: TEST_FILES,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            shellDirs(['render', 'ui', 'app', 'loop'], 'src/input'),
            {
              regex: '(^|/)sim(/(?!types$).*)?$',
              message: 'src/input may import only the command constants in src/sim/types (design §1.4).',
            },
            { regex: '^(?![./])', message: 'src/input must not import packages (design §1.4).' },
          ],
        },
      ],
    },
  },
]);
