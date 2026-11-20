// FSM properties (task 7): Properties 8 and 9.
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { M1_TRANSITIONS, ruleKey } from './fsm';
import { createInitialState } from './state';
import { step } from './step';
import type { SimulationState } from './types';
import { arbConfig, arbMask, arbMaskPairs, compile, expectSame, tickInput } from '../test/sim';

const RULES = new Map(M1_TRANSITIONS.map((r) => [ruleKey(r.from, r.to, r.trigger), r]));

// Feature: project-ring, Property 8: FSM transitions follow the table
// For any config and command sequence, every transition recorded in the step trace is a rule
// in M1_TRANSITIONS with the matching step, there is at most one transition per Fighter per
// step (so at most one step-4 action per Tick), each new state's enteredAt equals the current
// Gameplay_Tick (except the HitStun refresh, which keeps it), and chaining the recorded
// transitions from the previous state's kind yields the next state's kind.
// (Validates: Requirements 4.5, 4.7, 4.8, 35.2)
test.prop([arbConfig(), arbMaskPairs(1, 600)])('Property 8: every transition is a declared rule', (raw, masks) => {
  const cfg = compile(raw);
  let s = createInitialState(cfg);
  for (const [pm, am] of masks) {
    const r = step(s, tickInput(pm, am), cfg, { trace: true });
    const g = r.state.gameplayTick;
    for (const i of [0, 1] as const) {
      const id = s.fighters[i].id;
      const recs = r.trace!.filter((t) => t.fighter === id);
      for (const t of recs) {
        expect(t.ok, `rejected transition ${JSON.stringify(t)}`).toBe(true);
        const rule = RULES.get(ruleKey(t.from, t.to, t.trigger));
        expect(rule?.step, `undeclared transition ${JSON.stringify(t)}`).toBe(t.step);
        expect(t.at).toBe(g);
      }
      const steps = recs.map((t) => t.step);
      expect(new Set(steps).size, 'more than one transition in a step').toBe(steps.length);
      expect([...steps].sort((a, b) => a - b)).toEqual(steps); // in pipeline order

      let kind = s.fighters[i].fsm.kind;
      for (const t of recs) {
        expect(t.from).toBe(kind);
        kind = t.to;
      }
      const after = r.state.fighters[i].fsm;
      expect(after.kind).toBe(kind);
      const last = recs.at(-1);
      if (last === undefined) expect(after.enteredAt).toBe(s.fighters[i].fsm.enteredAt);
      else if (last.from === 'HitStun' && last.to === 'HitStun') expect(after.enteredAt).toBe(s.fighters[i].fsm.enteredAt);
      else expect(after.enteredAt).toBe(g);
    }
    s = r.state;
  }
});

// Feature: project-ring, Property 9: Commands to a Fighter that cannot act have no effect
// For any reachable state where a Fighter is not Able_To_Act (Attacking, HitStun, or
// Defeated) on the next Tick, the next state with arbitrary movement and attack bits for that
// Fighter equals the next state with no commands for that Fighter.
// (Validates: Requirements 4.6, 4.11, 7.9, 9.6)
function cannotActNextTick(s: SimulationState, i: 0 | 1, jabTotal: number): boolean {
  const f = s.fighters[i].fsm;
  const g = s.gameplayTick + 1;
  if (f.kind === 'Defeated') return true;
  if (f.kind === 'Attacking') return g - f.enteredAt < jabTotal; // does not end in step 3
  if (f.kind === 'HitStun') return g < f.until; // does not end in step 3
  return false;
}

test.prop([arbConfig({ aiEnabled: false }), arbMaskPairs(1, 600), fc.array(arbMask, { minLength: 600, maxLength: 600 })])(
  'Property 9: commands to a Fighter that cannot act change nothing',
  (raw, masks, noise) => {
    const cfg = compile(raw);
    let s = createInitialState(cfg);
    masks.forEach(([pm, am], k) => {
      const extra = noise[k]!;
      for (const i of [0, 1] as const) {
        if (!cannotActNextTick(s, i, cfg.jab.total)) continue;
        const withCmds = i === 0 ? tickInput(extra, am) : tickInput(pm, extra);
        const without = i === 0 ? tickInput(0, am) : tickInput(pm, 0);
        const a = step(s, withCmds, cfg);
        const b = step(s, without, cfg);
        expectSame(a.state, b.state, `fighter ${i} at Tick ${a.state.tick}`);
        expectSame(a.events, b.events);
      }
      s = step(s, tickInput(pm, am), cfg).state;
    });
  },
);
