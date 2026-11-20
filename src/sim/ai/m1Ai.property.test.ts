// AI properties (task 8): Properties 18, 19, 27.
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import type { CompiledConfig } from '../config/compile';
import { HISTORY_SIZE, observe } from '../observation';
import { seedSfc32 } from '../rng';
import { cloneState, createInitialState } from '../state';
import { step } from '../step';
import { CMD, type PlayerObservation, type RngState, type SimulationState } from '../types';
import { decideAi } from './m1Ai';
import { arbConfig, arbTickMasks, compile, deepEqualStrict, expectSame, tickInput } from '../../test/sim';

/** Runs an AI-enabled fight, calling `visit` with the state before each Tick and the player observation log. */
function run(cfg: CompiledConfig, masks: number[], visit: (s: SimulationState, log: PlayerObservation[]) => void): void {
  let s = createInitialState(cfg);
  const log: PlayerObservation[] = [observe(s.fighters[0], 0)];
  for (const m of masks) {
    visit(s, log);
    s = step(s, tickInput(m), cfg).state;
    log.push(observe(s.fighters[0], s.gameplayTick));
  }
}

// Feature: project-ring, Property 18: AI decision model
// For any reachable state and AI config, decideAi leaves the state deep-equal to its input and
// returns a mask that is: 0 if a result exists; otherwise a single movement command toward the
// observed player position if the observed distance is at least the jab's Connect_Range;
// otherwise (strictly less) a jab exactly when the AI_Fighter is Able_To_Act and at least
// attackInterval Ticks have passed since its previous jab start or Match start; otherwise 0.
// (Validates: Requirements 12.2, 12.3, 12.4, 12.7)
test.prop([arbConfig({ aiEnabled: true }), arbTickMasks(1, 600)])('Property 18: the AI follows the M1 decision model', (raw, masks) => {
  const cfg = compile(raw);
  let jabs = 0;
  run(cfg, masks, (s, log) => {
    const before = cloneState(s);
    const got = decideAi(s, [s.rng[0], s.rng[1], s.rng[2], s.rng[3]], cfg);
    if (!deepEqualStrict(s, before)) expectSame(s, before, 'decideAi modified the state');

    // Independent reference: the player only through the logged observation of T-1-D.
    const T = s.gameplayTick + 1;
    const me = s.fighters[1];
    let want = 0;
    if (s.result === null) {
      const obs = log[Math.max(T - 1 - cfg.ai.reactionDelay, s.matchStartAt)]!;
      const d = Math.abs(obs.x - me.x);
      if (2 * d >= cfg.jab.connectRange2) want = obs.x > me.x ? CMD.MoveRight : CMD.MoveLeft;
      else if ((me.fsm.kind === 'Idle' || me.fsm.kind === 'Walking') && T - (me.lastJabStartAt ?? s.matchStartAt) >= cfg.ai.attackInterval) want = CMD.Jab;
    }
    if (got.mask === CMD.Jab) jabs++;
    if (got.mask !== want) expect(got.mask, `AI mask on Tick ${T}`).toBe(want);
  });
  return jabs >= 0;
});

// Feature: project-ring, Property 19: AI sees the player only through the delayed observation
// For any reachable state and reaction delay D, changing the Player_Fighter's live fields and
// any history entries newer than Gameplay_Tick T-1-D (keeping that entry, or the Match-start
// entry when T-1-D is earlier than Match start) does not change decideAi's output.
// (Validates: Requirements 12.5, 12.10, 12.13)
const arbObsNoise = fc.record({
  x: fc.integer({ min: -20000, max: 20000 }),
  facing: fc.constantFrom(-1 as const, 1 as const),
  fsm: fc.constantFrom('Idle' as const, 'Walking' as const, 'Attacking' as const, 'HitStun' as const, 'Defeated' as const),
});

test.prop([arbConfig({ aiEnabled: true }), arbTickMasks(1, 400), fc.nat(), fc.array(arbObsNoise, { minLength: HISTORY_SIZE, maxLength: HISTORY_SIZE })])(
  'Property 19: player data newer than the delayed observation is invisible to the AI',
  (raw, masks, pick, noise) => {
    const cfg = compile(raw);
    const at = pick % masks.length;
    let k = 0;
    run(cfg, masks, (s) => {
      if (k++ !== at) return;
      const rng: RngState = [s.rng[0], s.rng[1], s.rng[2], s.rng[3]];
      const base = decideAi(s, [...rng] as RngState, cfg);

      const m = cloneState(s);
      const T = m.gameplayTick + 1;
      const target = Math.max(T - 1 - cfg.ai.reactionDelay, m.matchStartAt);
      // Live Player_Fighter fields.
      const n0 = noise[0]!;
      m.fighters[0].x = n0.x;
      m.fighters[0].facing = n0.facing;
      m.fighters[0].health = 1;
      m.fighters[0].fsm = { kind: 'HitStun', enteredAt: m.gameplayTick, until: m.gameplayTick + 99 };
      m.fighters[0].lastJabStartAt = m.gameplayTick;
      // History entries strictly newer than the target observation (their `at` stays).
      const h = m.history;
      for (let off = 0; off < h.count; off++) {
        const e = h.entries[(h.head - off + HISTORY_SIZE) % HISTORY_SIZE]!;
        if (e.at <= target) break;
        const n = noise[off % noise.length]!;
        e.x = n.x;
        e.facing = n.facing;
        e.fsm = n.fsm;
        e.attackId = n.fsm === 'Attacking' ? 'jab' : null;
        e.phase = n.fsm === 'Attacking' ? 'active' : null;
      }
      expect(decideAi(m, [...rng] as RngState, cfg)).toStrictEqual(base);
    });
  },
);

// Feature: project-ring, Property 27: M1 AI leaves the PRNG unchanged
// For any config with ai.enabled = true and any player command sequence, decideAi returns an
// rng deep-equal to the copy it received on every Tick, and state.rng after every Tick equals
// seedSfc32(seed). (Validates: Requirements 12.6, 12.14)
test.prop([arbConfig({ aiEnabled: true }), arbTickMasks(1, 600)])('Property 27: the M1 AI never advances the PRNG', (raw, masks) => {
  const cfg = compile(raw);
  const seeded = seedSfc32(cfg.seed);
  let s = createInitialState(cfg);
  for (const m of masks) {
    const copy: RngState = [s.rng[0], s.rng[1], s.rng[2], s.rng[3]];
    const out = decideAi(s, [...copy] as RngState, cfg);
    expect(out.rng).toEqual(copy);
    s = step(s, tickInput(m), cfg).state;
    expect(s.rng).toEqual(seeded);
  }
});
