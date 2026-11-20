// Feature: project-ring, Property 1: Determinism (with AI)
// For any valid config and any player command sequence of 1-10,800 Ticks, running two
// independent MatchDrivers (AI enabled) from the same initial state yields, after every Tick,
// deep-equal states (numbers compared with Object.is) and identical Game_Event lists; the same
// holds when both Fighters are driven by raw command sequences through step() with
// ai.enabled = false. (Validates: Requirements 3.1, 3.3, 3.7)
//
// Two variants (design §13.2): 1-600 Ticks with a full deep comparison after every Tick, and
// up to 10,800 Ticks with the compact per-Tick comparison plus a full comparison at the end.
import { test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { MatchDriver } from './driver';
import { cloneState, createInitialState } from './state';
import { step, stepInto } from './step';
import type { SimulationState } from './types';
import { arbConfig, arbMaskPairs, arbTickMasks, compile, deepEqualStrict, expectSame, sameCompact, tickInput } from '../test/sim';

test.prop([arbConfig({ aiEnabled: true }), arbTickMasks(1, 600)])('Property 1 (1-600 Ticks): two AI-enabled drivers stay identical', (raw, masks) => {
  const cfg = compile(raw);
  const a = new MatchDriver(cfg);
  const b = new MatchDriver(cfg);
  let viaStep = createInitialState(cfg); // the pure step() path must agree with the driver path
  for (const m of masks) {
    const ea = a.tick(m);
    const eb = b.tick(m);
    const r = step(viaStep, tickInput(m), cfg);
    viaStep = r.state;
    if (!deepEqualStrict(a.curr, b.curr)) expectSame(a.curr, b.curr, `driver states at Tick ${a.curr.tick}`);
    if (!deepEqualStrict(ea, eb)) expectSame(ea, eb, `driver events at Tick ${a.curr.tick}`);
    if (!deepEqualStrict(a.curr, viaStep)) expectSame(a.curr, viaStep, `driver vs step() at Tick ${a.curr.tick}`);
    if (!deepEqualStrict(ea, r.events)) expectSame(ea, r.events, `driver vs step() events at Tick ${a.curr.tick}`);
  }
});

test.prop([arbConfig({ aiEnabled: false }), arbMaskPairs(1, 600)])('Property 1 (1-600 Ticks): raw two-sided commands through step() are deterministic', (raw, masks) => {
  const cfg = compile(raw);
  let x = createInitialState(cfg);
  let y = createInitialState(cfg);
  for (const [pm, am] of masks) {
    const rx = step(x, tickInput(pm, am), cfg);
    const ry = step(y, tickInput(pm, am), cfg);
    if (!deepEqualStrict(rx, ry)) expectSame(rx, ry, `Tick ${rx.state.tick}`);
    x = rx.state;
    y = ry.state;
  }
});

/** A double-buffered runner over stepInto with two-sided raw commands (AI disabled). */
function rawRunner(s0: SimulationState) {
  let prev = cloneState(s0);
  let curr = cloneState(s0);
  return {
    tick(input: Parameters<typeof stepInto>[2], cfg: Parameters<typeof stepInto>[3]) {
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

test.prop([arbConfig({ aiEnabled: true }), arbTickMasks(1, 10_800)], { numRuns: 100 })(
  'Property 1 (up to 10,800 Ticks): two AI-enabled drivers stay identical',
  (raw, masks) => {
    const cfg = compile(raw);
    const a = new MatchDriver(cfg);
    const b = new MatchDriver(cfg);
    for (const m of masks) {
      const ea = a.tick(m);
      const eb = b.tick(m);
      if (!sameCompact(a.curr as SimulationState, b.curr as SimulationState) || !deepEqualStrict(ea, eb)) {
        expectSame(a.curr, b.curr, `Tick ${a.curr.tick}`);
        expectSame(ea, eb, `events at Tick ${a.curr.tick}`);
      }
    }
    expectSame(a.curr, b.curr, 'final state');
    expect(a.curr.tick).toBe(masks.length);
  },
);

test.prop([arbConfig({ aiEnabled: false }), arbMaskPairs(1, 10_800)], { numRuns: 100 })(
  'Property 1 (up to 10,800 Ticks): raw two-sided commands are deterministic',
  (raw, masks) => {
    const cfg = compile(raw);
    const s0 = createInitialState(cfg);
    const x = rawRunner(s0);
    const y = rawRunner(s0);
    for (const [pm, am] of masks) {
      const input = tickInput(pm, am);
      const ex = x.tick(input, cfg);
      const ey = y.tick(input, cfg);
      if (!sameCompact(x.curr, y.curr) || !deepEqualStrict(ex, ey)) {
        expectSame(x.curr, y.curr, `Tick ${x.curr.tick}`);
        expectSame(ex, ey, `events at Tick ${x.curr.tick}`);
      }
    }
    expectSame(x.curr, y.curr, 'final state');
  },
);
