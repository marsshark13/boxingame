// Combat properties (task 7): Properties 13, 14, 15, 28.
// The oracle reconstructs each Tick's post-movement snapshot independently: positions and
// facing are final (steps 7-8 never move anyone), and an attacker's snapshot attack state is
// its previous Attacking instance advanced by one Tick (steps 3-4 cannot replace an attack
// that has not ended). Box math is re-implemented here from design §8.2.
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { applyHits, detectHits } from './combat';
import type { CompiledConfig } from './config/compile';
import { newFsmTickContext } from './fsm';
import { createInitialState, cloneState } from './state';
import { EventCollector, step } from './step';
import type { FighterState, FsmTransitionRecord, GameEvent, SimulationState } from './types';
import { arbConfig, arbMaskPairs, compile, deepEqualStrict, tickInput } from '../test/sim';

interface SnapAttack {
  enteredAt: number;
  active: boolean;
  contactUsed: boolean;
}

/** The attacker's attack state in Tick g's post-movement snapshot, or null if not Attacking. */
function snapshotAttack(prevF: FighterState, g: number, cfg: CompiledConfig): SnapAttack | null {
  const s = prevF.fsm;
  if (s.kind !== 'Attacking') return null;
  const atk = cfg.attacks.get(s.attackId)!;
  const e = g - s.enteredAt;
  if (e >= atk.total) return null; // ended in step 3 (a new attack started in step 4 is in Startup_Phase)
  return { enteredAt: s.enteredAt, active: e >= atk.startup && e < atk.startup + atk.active, contactUsed: s.contactUsed };
}

/** Independent strict-overlap oracle; returns the intersection center in world units, or null. */
function oracleHit(A: FighterState, T: FighterState, cfg: CompiledConfig): { x: number; y: number } | null {
  const hb = cfg.jab.hitboxFx;
  const ax = A.x + A.facing * hb.ox;
  const [hLo, hHi] = [2 * ax - hb.w, 2 * ax + hb.w];
  const [tLo, tHi] = [2 * T.x - cfg.hurtFx.w, 2 * T.x + cfg.hurtFx.w];
  const [hyLo, hyHi] = [2 * hb.oy - hb.h, 2 * hb.oy + hb.h];
  const [tyLo, tyHi] = [2 * cfg.hurtFx.centerY - cfg.hurtFx.h, 2 * cfg.hurtFx.centerY + cfg.hurtFx.h];
  const xl = Math.max(hLo, tLo);
  const xh = Math.min(hHi, tHi);
  const yl = Math.max(hyLo, tyLo);
  const yh = Math.min(hyHi, tyHi);
  if (!(xl < xh && yl < yh)) return null;
  return { x: (xl + xh) / 4 / 1000, y: (yl + yh) / 4 / 1000 };
}

interface TickRecord {
  prev: SimulationState;
  next: SimulationState;
  events: GameEvent[];
  trace: FsmTransitionRecord[];
}

function run(cfg: CompiledConfig, masks: Array<[number, number]>, visit: (r: TickRecord) => void): void {
  let s = createInitialState(cfg);
  for (const [pm, am] of masks) {
    const r = step(s, tickInput(pm, am), cfg, { trace: true });
    visit({ prev: s, next: r.state, events: r.events, trace: r.trace! });
    s = r.state;
  }
}

const hitEvents = (evs: GameEvent[]) => evs.filter((e): e is Extract<GameEvent, { type: 'hit-landed' }> => e.type === 'hit-landed');

// Feature: project-ring, Property 13: Hits happen exactly on active overlaps
// A hit-landed event for attacker A on Tick g occurs iff, in the post-movement snapshot, A was
// Attacking in the Active_Phase with an unused contact and its mirrored Hitbox strictly
// overlapped the opponent's Hurtbox; otherwise Health is unchanged and no hit-landed event is
// emitted. (Validates: Requirements 10.1, 10.2, 10.7, 10.9)
test.prop([arbConfig({ aiEnabled: false }), arbMaskPairs(1, 600)])('Property 13: hits happen exactly on active overlaps', (raw, masks) => {
  const cfg = compile(raw);
  let hitsSeen = 0;
  run(cfg, masks, ({ prev, next, events }) => {
    const g = next.gameplayTick;
    const expected: string[] = [];
    if (prev.result === null) {
      for (const i of [0, 1] as const) {
        const sa = snapshotAttack(prev.fighters[i], g, cfg);
        if (sa && sa.active && !sa.contactUsed && oracleHit(next.fighters[i], next.fighters[1 - i]!, cfg)) expected.push(next.fighters[i].id);
      }
    }
    const got = hitEvents(events).map((e) => e.attacker);
    hitsSeen += got.length;
    if (!deepEqualStrict(got, expected)) expect(got, `hit attackers on Tick ${g}`).toEqual(expected);
    if (expected.length === 0) {
      expect(next.fighters.map((f) => f.health)).toEqual(prev.fighters.map((f) => f.health));
    }
  });
  return hitsSeen >= 0;
});

// Feature: project-ring, Property 14: Damage and contact accounting
// Each attack instance produces at most one hit-landed event; each event's damage equals
// max(1, roundHalfUp(base)); each target's Health decrease over a Tick equals
// min(previous Health, sum of that Tick's damages against it); each hitPos equals the center
// of the Hitbox-Hurtbox intersection. (Validates: Requirements 10.3, 10.4, 10.5, 35.7)
test.prop([arbConfig({ aiEnabled: false }), arbMaskPairs(1, 600)])('Property 14: damage and contact accounting', (raw, masks) => {
  const cfg = compile(raw);
  const expectedDamage = Math.max(1, Math.floor(cfg.jab.damage + 0.5));
  const instances = new Set<string>();
  run(cfg, masks, ({ prev, next, events }) => {
    const sums = [0, 0];
    for (const e of hitEvents(events)) {
      const ai = e.attacker === 'player' ? 0 : 1;
      const key = `${e.attacker}@${snapshotAttack(prev.fighters[ai], next.gameplayTick, cfg)!.enteredAt}`;
      expect(instances.has(key), `second contact for ${key}`).toBe(false);
      instances.add(key);
      expect(e.damage).toBe(expectedDamage);
      expect(e.at).toBe(next.gameplayTick);
      expect(e.attackId).toBe('jab');
      const pos = oracleHit(next.fighters[ai], next.fighters[1 - ai]!, cfg);
      expect(e.hitPos).toEqual(pos);
      sums[1 - ai]! += e.damage;
    }
    for (const i of [0, 1]) {
      expect(prev.fighters[i]!.health - next.fighters[i]!.health).toBe(Math.min(prev.fighters[i]!.health, sums[i]!));
    }
  });
});

// Feature: project-ring, Property 15: Combat resolution is order-independent
// For any post-movement snapshot, resolving hits with the attacker loop in reverse order
// produces the same Fighter states (Health, FSM, contactUsed) as the normal order, and when
// both Fighters have qualifying overlaps both hits apply. (Validates: Requirements 10.6, 35.4)
const arbFsm = (cfg: CompiledConfig, g: number) =>
  fc.oneof(
    fc.constant({ kind: 'Idle' as const, enteredAt: g - 3 }),
    fc.constantFrom(-1 as const, 1 as const).map((dir) => ({ kind: 'Walking' as const, enteredAt: g - 2, dir })),
    fc.record({
      e: fc.integer({ min: 0, max: cfg.jab.total - 1 }),
      contactUsed: fc.boolean(),
    }).map(({ e, contactUsed }) => {
      const phase = e < cfg.jab.startup ? 'startup' : e < cfg.jab.startup + cfg.jab.active ? 'active' : 'recovery';
      return { kind: 'Attacking' as const, enteredAt: g - e, attackId: 'jab', phase, contactUsed } as const;
    }),
    fc.integer({ min: 1, max: 30 }).map((u) => ({ kind: 'HitStun' as const, enteredAt: g - 1, until: g + u })),
  );

const arbSnapshot = arbConfig().chain((raw) => {
  const cfg = compile(raw);
  const g = 500;
  const S = cfg.minSeparationFx;
  return fc
    .record({
      d: fc.integer({ min: S, max: Math.max(S, Math.min(cfg.ring.maxFx - cfg.ring.minFx, Math.ceil(cfg.jab.connectRange2 / 2) + 50)) }),
      leftT: fc.integer({ min: 0, max: 1000 }),
      playerLeft: fc.boolean(),
      f0: arbFsm(cfg, g),
      f1: arbFsm(cfg, g),
      h0: fc.integer({ min: 0, max: cfg.maxHealth }),
      h1: fc.integer({ min: 0, max: cfg.maxHealth }),
    })
    .map((r) => ({ cfg, g, ...r }));
});

test.prop([arbSnapshot])('Property 15: hit resolution does not depend on processing order', ({ cfg, g, d, leftT, playerLeft, f0, f1, h0, h1 }) => {
  const base = createInitialState(cfg);
  const left = cfg.ring.minFx + Math.floor((leftT * (cfg.ring.maxFx - cfg.ring.minFx - d)) / 1000);
  const xs = playerLeft ? [left, left + d] : [left + d, left];
  base.fighters[0] = { ...base.fighters[0], x: xs[0]!, facing: xs[1]! > xs[0]! ? 1 : -1, health: Math.max(1, h0), fsm: { ...f0 } };
  base.fighters[1] = { ...base.fighters[1], x: xs[1]!, facing: xs[0]! > xs[1]! ? 1 : -1, health: Math.max(1, h1), fsm: { ...f1 } };

  const a = cloneState(base);
  const b = cloneState(base);
  const hitsA = detectHits(a.fighters, cfg);
  const hitsB = detectHits(b.fighters, cfg);
  applyHits(a.fighters, hitsA, new EventCollector(), newFsmTickContext(g));
  applyHits(b.fighters, [...hitsB].reverse(), new EventCollector(), newFsmTickContext(g));
  expect(b.fighters).toStrictEqual(a.fighters);

  const qualifies = (i: 0 | 1) => {
    const f = base.fighters[i].fsm;
    return f.kind === 'Attacking' && f.phase === 'active' && !f.contactUsed && oracleHit(base.fighters[i], base.fighters[1 - i]!, cfg) !== null;
  };
  expect(hitsA.map((h) => h.attacker)).toEqual(([0, 1] as const).filter(qualifies));
  if (qualifies(0) && qualifies(1)) {
    const dmg = Math.max(1, Math.floor(cfg.jab.damage + 0.5));
    expect(a.fighters[0].health).toBe(Math.max(0, base.fighters[0].health - dmg));
    expect(a.fighters[1].health).toBe(Math.max(0, base.fighters[1].health - dmg));
    for (const f of a.fighters) expect(f.fsm.kind).not.toBe('Attacking'); // both attacks end (D3, D4)
  }
});

// Feature: project-ring, Property 28: Zero hit-stun hits never enter HitStun
// For any config whose jab has hitStun = 0 and any command sequence, no Fighter ever enters
// HitStun; on each Tick with a landed hit, an Attacking target becomes Idle (or Defeated at
// Health 0) and any other target keeps its FSM state, while Health and hit-landed events
// follow Property 14. (Validates: Requirements 10.10, 10.11)
const arbZeroStun = arbConfig({ aiEnabled: false }).map((c) => {
  c.attacks[0]!.hitStun = 0;
  return c;
});

test.prop([arbZeroStun, arbMaskPairs(1, 600)])('Property 28: zero hit-stun hits never enter HitStun', (raw, masks) => {
  const cfg = compile(raw);
  const dmg = Math.max(1, Math.floor(cfg.jab.damage + 0.5));
  run(cfg, masks, ({ prev, next, events, trace }) => {
    expect(trace.some((t) => t.to === 'HitStun')).toBe(false);
    for (const f of next.fighters) expect(f.fsm.kind).not.toBe('HitStun');
    for (const e of hitEvents(events)) {
      expect(e.damage).toBe(dmg);
      const ti = e.target === 'player' ? 0 : 1;
      const step7 = trace.filter((t) => t.fighter === e.target && t.step === 7);
      // The target is Attacking in the snapshot if its attack continues, or if it started one in step 4.
      const startedNow = trace.some((t) => t.fighter === e.target && t.step === 4 && t.to === 'Attacking');
      const targetAttacking = startedNow || snapshotAttack(prev.fighters[ti], next.gameplayTick, cfg) !== null;
      if (targetAttacking) {
        expect(step7).toEqual([expect.objectContaining({ from: 'Attacking', to: 'Idle', trigger: 'hit-no-stun', ok: true })]);
        expect(['Idle', 'Defeated']).toContain(next.fighters[ti].fsm.kind);
      } else {
        expect(step7).toEqual([]); // Idle or Walking keep their state
      }
    }
  });
});
