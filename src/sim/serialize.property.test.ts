// Serialization and restore properties (task 9): Properties 2, 3, 4, 25.
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { loadConfig, type CompiledConfig } from './config/compile';
import type { GameConfig } from './config/schema';
import { parseSimulationState, serialize } from './serialize';
import { cloneState, createInitialState } from './state';
import { stepInto } from './step';
import type { GameEvent, SimulationState, TickInput } from './types';
import { arbConfig, arbMaskPairs, compile, deepEqualStrict, expectSame, sameCompact, tickInput } from '../test/sim';

/** Double-buffered stepInto runner from any state (AI inside stepInto when enabled). */
function runner(s0: SimulationState, cfg: CompiledConfig) {
  let prev = cloneState(s0);
  let curr = cloneState(s0);
  return {
    tick(input: TickInput): GameEvent[] {
      const t = prev;
      prev = curr;
      curr = t;
      return stepInto(prev, curr, input, cfg);
    },
    get curr() {
      return curr;
    },
  };
}

function reach(cfg: CompiledConfig, masks: Array<[number, number]>): SimulationState {
  const r = runner(createInitialState(cfg), cfg);
  for (const [p, a] of masks) r.tick(tickInput(p, cfg.ai.enabled ? 0 : a));
  return cloneState(r.curr);
}

/** Every number in a JSON-like value, for the finiteness and -0 checks. */
function numbers(v: unknown, out: number[] = []): number[] {
  if (typeof v === 'number') out.push(v);
  else if (Array.isArray(v)) for (const x of v) numbers(x, out);
  else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) numbers(x, out);
  return out;
}

// Feature: project-ring, Property 2: Serialization round trip
// For any state reachable from a valid config and command prefix, parsing its JSON succeeds
// and returns a state deep-equal to it (including rng and the observation history), and every
// number in it is finite; no reached state contains -0. (Validates: Requirements 3.4, 12.11)
test.prop([arbConfig(), arbMaskPairs(1, 600), fc.integer({ min: 1, max: 12 })])('Property 2: JSON round trip is exact', (raw, masks, samples) => {
  const cfg = compile(raw);
  const r = runner(createInitialState(cfg), cfg);
  const every = Math.max(1, Math.floor(masks.length / samples));
  const check = (s: SimulationState) => {
    const nums = numbers(s);
    for (const n of nums) {
      expect(Number.isFinite(n)).toBe(true);
      expect(Object.is(n, -0)).toBe(false);
    }
    const p = parseSimulationState(serialize(s), cfg);
    if (!p.ok) throw new Error(`round trip failed: ${p.error}: ${p.issues.join('; ')}`);
    if (!deepEqualStrict(p.state, s)) expectSame(p.state, s, `round trip at Tick ${s.tick}`);
  };
  check(r.curr);
  masks.forEach(([p, a], i) => {
    r.tick(tickInput(p, cfg.ai.enabled ? 0 : a));
    for (const f of r.curr.fighters) expect(Object.is(f.x, -0) || Object.is(f.health, -0)).toBe(false);
    if (i % every === 0 || i === masks.length - 1) check(r.curr);
  });
});

// Feature: project-ring, Property 3: Restore equivalence
// For any reachable state s and any continuation command sequence of 1-10,800 Ticks, stepping
// the restored parse(stringify(s)) and the original s produces identical states and
// Game_Events after every Tick. (Validates: Requirements 3.5)
function restoreEquivalence(raw: GameConfig, prefix: Array<[number, number]>, cont: Array<[number, number]>, fullEveryTick: boolean) {
  const cfg = compile(raw);
  const s = reach(cfg, prefix);
  const p = parseSimulationState(serialize(s), cfg);
  if (!p.ok) throw new Error(`restore failed: ${p.issues.join('; ')}`);
  const orig = runner(s, cfg);
  const rest = runner(p.state, cfg);
  for (const [pm, am] of cont) {
    const input = tickInput(pm, cfg.ai.enabled ? 0 : am);
    const eo = orig.tick(input);
    const er = rest.tick(input);
    const same = fullEveryTick ? deepEqualStrict(orig.curr, rest.curr) : sameCompact(orig.curr, rest.curr);
    if (!same || !deepEqualStrict(eo, er)) {
      expectSame(rest.curr, orig.curr, `Tick ${orig.curr.tick}`);
      expectSame(er, eo, `events at Tick ${orig.curr.tick}`);
    }
  }
  expectSame(rest.curr, orig.curr, 'final state');
}

test.prop([arbConfig(), arbMaskPairs(0, 400), arbMaskPairs(1, 600)])('Property 3 (1-600 Ticks): a restored state continues identically', (raw, prefix, cont) =>
  restoreEquivalence(raw, prefix, cont, true),
);

test.prop([arbConfig(), arbMaskPairs(0, 400), arbMaskPairs(1, 10_800)])('Property 3 (up to 10,800 Ticks): a restored state continues identically', (raw, prefix, cont) =>
  restoreEquivalence(raw, prefix, cont, false),
);

// Feature: project-ring, Property 4: Invalid serialized states are rejected
// For any reachable state and any single corruption (truncated JSON, removed required field, a
// number replaced by null/string/out-of-range value, wrong history length or inconsistent
// head/count), parsing returns an invalid-Simulation_State error and the caller's current
// state is deep-equal to its value before the call. (Validates: Requirements 3.6)
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function paths(v: Json, pred: (x: Json, parent: Json | undefined) => boolean, at: Array<string | number> = [], parent?: Json, out: Array<Array<string | number>> = []) {
  if (pred(v, parent) && at.length > 0) out.push(at);
  if (Array.isArray(v)) v.forEach((x, i) => paths(x, pred, [...at, i], v, out));
  else if (v !== null && typeof v === 'object') for (const [k, x] of Object.entries(v)) paths(x, pred, [...at, k], v, out);
  return out;
}
function parentOf(root: Json, p: Array<string | number>): Record<string | number, Json> {
  return p.slice(0, -1).reduce<Json>((o, k) => (o as Record<string | number, Json>)[k]!, root) as Record<string | number, Json>;
}

const arbCorruption = fc.record({
  kind: fc.constantFrom('truncate', 'remove', 'number', 'historyLength', 'head', 'count'),
  pick: fc.nat(),
  value: fc.constantFrom<Json>(null, '7', 'NaN', 1e15, -1e15, 'half'),
  delta: fc.constantFrom(-1, 1),
});

test.prop([arbConfig(), arbMaskPairs(0, 400), arbCorruption])('Property 4: every single corruption is rejected', (raw, prefix, c) => {
  const cfg = compile(raw);
  const s = reach(cfg, prefix);
  const before = cloneState(s);
  const good = serialize(s);
  let json: string;
  const obj = JSON.parse(good) as Json;
  switch (c.kind) {
    case 'truncate':
      json = good.slice(0, c.pick % good.length);
      break;
    case 'remove': {
      const ps = paths(obj, (_x, parent) => parent !== undefined && !Array.isArray(parent));
      const p = ps[c.pick % ps.length]!;
      delete parentOf(obj, p)[p[p.length - 1]!];
      json = JSON.stringify(obj);
      break;
    }
    case 'number': {
      const ps = paths(obj, (x) => typeof x === 'number');
      const p = ps[c.pick % ps.length]!;
      const holder = parentOf(obj, p);
      const k = p[p.length - 1]!;
      holder[k] = c.value === 'half' ? (holder[k] as number) + 0.5 : c.value;
      json = JSON.stringify(obj);
      break;
    }
    case 'historyLength': {
      const h = (obj as { history: { entries: Json[] } }).history.entries;
      if (c.delta > 0) h.push(h[0]!);
      else h.pop();
      json = JSON.stringify(obj);
      break;
    }
    case 'head': {
      const h = (obj as { history: { head: number } }).history;
      h.head = (h.head + 121 + c.delta) % 121;
      json = JSON.stringify(obj);
      break;
    }
    case 'count': {
      const h = (obj as { history: { count: number } }).history;
      h.count += c.delta;
      json = JSON.stringify(obj);
      break;
    }
  }
  const r = parseSimulationState(json, cfg);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toBe('invalid-Simulation_State');
  expectSame(s, before, 'the caller state changed');
});

// Feature: project-ring, Property 25: Configuration fingerprint mismatch is rejected
// For any reachable state s under config c and any config c' that differs from c in at least
// one validated value, parsing JSON.stringify(s) under c' returns a config-mismatch error and
// the caller's current state is unchanged, while parsing under c (or under c with object keys
// reordered) succeeds. (Validates: Requirements 3.8, 3.9)
const MUTATIONS: Array<(c: GameConfig) => void> = [
  (c) => (c.seed = (c.seed + 1) % 4294967296),
  (c) => (c.ai.reactionDelay = c.ai.reactionDelay < 120 ? c.ai.reactionDelay + 1 : 119),
  (c) => (c.ai.attackInterval = c.ai.attackInterval < 600 ? c.ai.attackInterval + 1 : 599),
  (c) => (c.maxHealth = c.maxHealth < 1000 ? c.maxHealth + 1 : 999),
  (c) => (c.ai.enabled = !c.ai.enabled),
  (c) => (c.attacks[0]!.damage += 0.5),
  (c) => (c.attacks[0]!.blockStun = c.attacks[0]!.blockStun < 120 ? c.attacks[0]!.blockStun + 1 : 119),
  (c) => (c.attacks[0]!.staminaCost += 1),
  (c) => (c.ring.max = Math.round(c.ring.max * 1000 + 1) / 1000),
  (c) => (c.walkSpeed = Math.round(c.walkSpeed * 1000 + 1) / 1000),
];

function reverseKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(reverseKeys) as T;
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).reverse()) out[k] = reverseKeys((v as Record<string, unknown>)[k]);
    return out as T;
  }
  return v;
}

test.prop([arbConfig(), arbMaskPairs(0, 300), fc.integer({ min: 0, max: MUTATIONS.length - 1 })])(
  'Property 25: a state from another configuration is a config-mismatch',
  (raw, prefix, mi) => {
    const cfg = compile(raw);
    const s = reach(cfg, prefix);
    const before = cloneState(s);
    const json = serialize(s);

    const changed = JSON.parse(JSON.stringify(raw)) as GameConfig;
    MUTATIONS[mi]!(changed);
    const other = loadConfig(changed);
    if (!other.ok) throw new Error(`mutation produced an invalid config: ${other.errors.map((e) => e.setting).join(', ')}`);
    expect(other.config.fingerprint).not.toBe(cfg.fingerprint);

    const r = parseSimulationState(json, other.config);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('config-mismatch');
    expectSame(s, before, 'the caller state changed');

    expect(parseSimulationState(json, cfg).ok).toBe(true);
    expect(parseSimulationState(json, compile(reverseKeys(raw))).ok).toBe(true);
  },
);
