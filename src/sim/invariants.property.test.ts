// Feature: project-ring, Property 11: State invariants
// For any config and command sequence, after every Tick: tick and gameplayTick have each
// increased by exactly 1; both positions are integers within [ring.min, ring.max]; center
// distance is at least minSeparation; each facing points toward the opponent; Health is an
// integer in [0, maxHealth]; and each Fighter has exactly one FSM state of a known kind.
// (Validates: Requirements 1.1, 4.1, 7.8, 7.10, 11.2)
import { test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { createInitialState } from './state';
import { step } from './step';
import { M1_FSM_KINDS, type SimulationState } from './types';
import { arbConfig, arbMaskPairs, compile, tickInput } from '../test/sim';
import type { CompiledConfig } from './config/compile';

function violations(s: SimulationState, prev: SimulationState, cfg: CompiledConfig): string[] {
  const v: string[] = [];
  if (s.tick !== prev.tick + 1) v.push('tick');
  if (s.gameplayTick !== prev.gameplayTick + 1) v.push('gameplayTick');
  const [a, b] = s.fighters;
  for (const f of s.fighters) {
    if (!Number.isInteger(f.x) || f.x < cfg.ring.minFx || f.x > cfg.ring.maxFx) v.push(`${f.id}.x out of ring`);
    if (!Number.isInteger(f.health) || f.health < 0 || f.health > cfg.maxHealth) v.push(`${f.id}.health`);
    if (!M1_FSM_KINDS.includes(f.fsm.kind)) v.push(`${f.id}.fsm`);
  }
  if (Math.abs(b.x - a.x) < cfg.minSeparationFx) v.push('separation');
  if (a.facing !== (b.x > a.x ? 1 : -1) || b.facing !== (a.x > b.x ? 1 : -1)) v.push('facing');
  return v;
}

test.prop([arbConfig(), arbMaskPairs(1, 600)])('Property 11: invariants hold after every Tick', (raw, masks) => {
  const cfg = compile(raw);
  let s = createInitialState(cfg);
  for (const [pm, am] of masks) {
    const n = step(s, tickInput(pm, am), cfg).state;
    const v = violations(n, s, cfg);
    if (v.length > 0) expect(v, `after Tick ${n.tick}`).toEqual([]);
    s = n;
  }
});
