// Lint and type-check fixtures for the dependency rule (task 1.4; design §1.4; Req 2 c1, c3).
// Each fixture is linted as if it lived at the given path, so the real eslint.config.js
// and tsconfig.sim.json are what is being tested.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

async function lint(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, file) });
  if (!result) throw new Error('no lint result');
  const fatal = result.messages.filter((m) => m.fatal);
  if (fatal.length > 0) throw new Error(`fixture did not parse: ${fatal.map((m) => m.message).join('; ')}`);
  return result.messages.map((m) => m.ruleId ?? 'unknown');
}

const IMPORT_RULE = 'no-restricted-imports';
const TS_IMPORT_RULE = '@typescript-eslint/no-restricted-imports';

describe('src/sim import ban', () => {
  const banned = [
    'react',
    'react-dom',
    'react-dom/client',
    'three',
    'three/examples/jsm/controls/OrbitControls.js',
    '@react-three/fiber',
    'zustand',
    'node:fs',
    'fast-check',
    '../render/Scene',
    '../ui/stores',
    '../app/App',
    '../input/keymap',
    '../loop/fixedStepLoop',
  ];
  it.each(banned)('rejects a value import of %s', async (spec) => {
    const rules = await lint('src/sim/fixture.ts', `import * as m from '${spec}';\nexport const x = m;\n`);
    expect(rules).toContain(IMPORT_RULE);
  });
  it('rejects type-only imports of banned packages too', async () => {
    const rules = await lint('src/sim/fixture.ts', `import type { Mesh } from 'three';\nexport type M = Mesh;\n`);
    expect(rules).toContain(IMPORT_RULE);
  });
  it('rejects shell imports from a nested sim directory', async () => {
    const rules = await lint('src/sim/config/fixture.ts', `import * as m from '../../render/Scene';\nexport const x = m;\n`);
    expect(rules).toContain(IMPORT_RULE);
  });
  it('allows zod and sim-internal imports', async () => {
    const code = [
      `import { z } from 'zod';`,
      `import * as a from './fixed';`,
      `import * as b from '../types';`,
      `export const all = [z, a, b];`,
    ].join('\n');
    expect(await lint('src/sim/config/fixture.ts', code)).toEqual([]);
  });
  it('still bans UI packages inside simulation tests', async () => {
    const rules = await lint('src/sim/fixture.test.ts', `import * as m from 'three';\nexport const x = m;\n`);
    expect(rules).toContain(IMPORT_RULE);
  });
});

describe('src/sim and src/loop global and Math bans', () => {
  const globalsBanned = [
    'window',
    'document',
    'navigator',
    'performance',
    'Date',
    'requestAnimationFrame',
    'AudioContext',
    'setTimeout',
    'process',
  ];
  it.each(globalsBanned)('rejects the global %s in src/sim', async (name) => {
    expect(await lint('src/sim/fixture.ts', `export const g = ${name};\n`)).toContain('no-restricted-globals');
  });
  it.each(globalsBanned)('rejects the global %s in src/loop', async (name) => {
    expect(await lint('src/loop/fixture.ts', `export const g = ${name};\n`)).toContain('no-restricted-globals');
  });
  it.each(['random', 'pow', 'sin', 'cos', 'exp', 'log'])('rejects Math.%s', async (fn) => {
    expect(await lint('src/sim/fixture.ts', `export const f = Math.${fn};\n`)).toContain('no-restricted-properties');
  });
  it('rejects destructured Math.random', async () => {
    expect(await lint('src/sim/fixture.ts', `const { random } = Math;\nexport const r = random;\n`)).toContain(
      'no-restricted-properties',
    );
  });
  it('allows exact Math functions such as floor, imul, max', async () => {
    expect(await lint('src/sim/fixture.ts', `export const v = Math.floor(Math.imul(3, 5) / Math.max(1, 2));\n`)).toEqual([]);
  });
});

describe('src/loop imports nothing outside itself', () => {
  it.each(['../sim/types', 'react', 'zod'])('rejects %s', async (spec) => {
    expect(await lint('src/loop/fixture.ts', `import * as m from '${spec}';\nexport const x = m;\n`)).toContain(IMPORT_RULE);
  });
  it('allows loop-internal imports', async () => {
    expect(await lint('src/loop/fixture.ts', `import * as m from './other';\nexport const x = m;\n`)).toEqual([]);
  });
});

describe('browser shell import direction', () => {
  it('render: sim types and ui/stores allowed', async () => {
    const code = [
      `import type { SimulationState } from '../sim/types';`,
      `import * as stores from '../ui/stores';`,
      `export type S = SimulationState;`,
      `export const s = stores;`,
    ].join('\n');
    expect(await lint('src/render/fixture.ts', code)).toEqual([]);
  });
  it.each(['../sim/index', '../ui/Hud', '../input/keymap', '../loop/fixedStepLoop', '../app/App'])(
    'render: rejects value import of %s',
    async (spec) => {
      expect(await lint('src/render/fixture.ts', `import * as m from '${spec}';\nexport const x = m;\n`)).toContain(
        TS_IMPORT_RULE,
      );
    },
  );
  it('ui: sim types allowed, sim values and render rejected', async () => {
    expect(await lint('src/ui/fixture.ts', `import type { MatchResult } from '../sim/types';\nexport type R = MatchResult;\n`)).toEqual(
      [],
    );
    expect(await lint('src/ui/fixture.ts', `import * as m from '../sim/index';\nexport const x = m;\n`)).toContain(TS_IMPORT_RULE);
    expect(await lint('src/ui/fixture.ts', `import * as m from '../render/Scene';\nexport const x = m;\n`)).toContain(TS_IMPORT_RULE);
  });
  it('input: sim/types values allowed, other sim modules, shell modules, and packages rejected', async () => {
    expect(await lint('src/input/fixture.ts', `import { CMD } from '../sim/types';\nexport const c = CMD;\n`)).toEqual([]);
    for (const spec of ['../sim/index', '../ui/stores', '../render/Scene', 'react']) {
      expect(await lint('src/input/fixture.ts', `import * as m from '${spec}';\nexport const x = m;\n`)).toContain(TS_IMPORT_RULE);
    }
  });
});

describe('tsconfig.sim.json has no DOM library', () => {
  it('reports DOM identifiers in a src/sim fixture as type errors', () => {
    const configPath = path.join(ROOT, 'tsconfig.sim.json');
    const read = ts.readConfigFile(configPath, ts.sys.readFile);
    expect(read.error).toBeUndefined();
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, ROOT);
    const fixture = path.join(ROOT, 'src/sim/__dom_fixture__.ts').replace(/\\/g, '/');
    const source = [
      'export const a = window;',
      'export const b = document.body;',
      'export const c = performance.now();',
      'export const d = requestAnimationFrame;',
      'export const e = new AudioContext();',
      'export const f = navigator.userAgent;',
    ].join('\n');
    const host = ts.createCompilerHost(parsed.options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (name, lang, onError, create) =>
      name.replace(/\\/g, '/') === fixture ? ts.createSourceFile(name, source, lang) : getSourceFile(name, lang, onError, create);
    const fileExists = host.fileExists.bind(host);
    host.fileExists = (name) => name.replace(/\\/g, '/') === fixture || fileExists(name);
    const program = ts.createProgram({ rootNames: [fixture], options: parsed.options, host });
    const diags = ts.getPreEmitDiagnostics(program).filter((d) => d.file?.fileName.replace(/\\/g, '/') === fixture);
    const names = ['window', 'document', 'performance', 'requestAnimationFrame', 'AudioContext', 'navigator'];
    for (const n of names) {
      expect(
        diags.some((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n').includes(`'${n}'`)),
        `expected a type error for ${n}`,
      ).toBe(true);
    }
  });
});
