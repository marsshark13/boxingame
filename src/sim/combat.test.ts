// Task 7.9: combat outcomes and Req 35 M1 rules (Req 10, 11 c6-c8, 15 c1 b/e, 15 c7, 35 c4-c12, D3, D4, D6, D7, D41).
import { describe, expect, it } from 'vitest';
import { detectHits } from './combat';
import type { CompiledConfig } from './config/compile';
import { createInitialState } from './state';
import { step } from './step';
import { CMD, type FighterState, type FsmState, type SimulationState } from './types';
import { cfgWith, tickInput } from '../test/sim';

const cfg = cfgWith((c) => (c.ai.enabled = false)); // jab: S4 A2 R8, damage 4, hitStun 14; Connect_Range 0.95
const WARM = 20;

/** A state at Gameplay_Tick WARM with the given Fighter overrides; `g` is the next Tick. */
function scene(
  over: { p?: Partial<FighterState>; a?: Partial<FighterState> },
  c: CompiledConfig = cfg,
): { s: SimulationState; g: number } {
  let s = createInitialState(c);
  for (let i = 0; i < WARM; i++) s = step(s, [], c).state;
  Object.assign(s.fighters[0], over.p);
  Object.assign(s.fighters[1], over.a);
  s.fighters[0].facing = s.fighters[1].x > s.fighters[0].x ? 1 : -1;
  s.fighters[1].facing = s.fighters[0].x > s.fighters[1].x ? 1 : -1;
  return { s, g: WARM + 1 };
}

/** A jab whose phase on Tick g is e Ticks after entry. */
const jabAt = (g: number, e: number): FsmState => ({ kind: 'Attacking', enteredAt: g - e, attackId: 'jab', phase: 'startup', contactUsed: false });

describe('hit detection (Req 10 c1-c3, c7, c9; Req 15 c1 b)', () => {
  it('overlap in the Active_Phase lands a hit', () => {
    const { s, g } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450 } });
    const r = step(s, [], cfg);
    expect(r.events).toEqual([
      { type: 'hit-landed', at: g, attacker: 'player', target: 'ai', attackId: 'jab', damage: 4, hitPos: expect.any(Object) },
    ]);
    expect(r.state.fighters[1].health).toBe(96);
    expect(r.state.fighters[1].fsm).toStrictEqual({ kind: 'HitStun', enteredAt: g, until: g + 14 });
    expect(r.state.fighters[0].fsm).toMatchObject({ kind: 'Attacking', phase: 'active', contactUsed: true });
  });
  it('reports the hit position as the intersection center in world units (Req 10 c5)', () => {
    // Hitbox x: 2*(-450+500) ± 400 = [-300, 500]; Hurtbox x: 900 ± 500 = [400, 1400] -> [400, 500] -> 0.225
    // Hitbox y: 2900 ± 250 = [2650, 3150]; Hurtbox y: 1800 ± 1800 = [0, 3600] -> [2650, 3150] -> 1.45
    const { s } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450 } });
    const ev = step(s, [], cfg).events[0];
    expect(ev?.type === 'hit-landed' && ev.hitPos).toEqual({ x: 0.225, y: 1.45 });
  });
  it('no overlap: nothing happens', () => {
    const { s } = scene({ p: { x: -500, fsm: jabAt(WARM + 1, 4) }, a: { x: 500 } }); // d = 1000 >= 950
    const r = step(s, [], cfg);
    expect(r.events).toEqual([]);
    expect(r.state.fighters[1].health).toBe(100);
  });
  it.each([
    ['startup', 3],
    ['recovery', 6],
  ])('overlap during the %s phase does nothing', (_p, e) => {
    const { s } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, e) }, a: { x: 450 } });
    const r = step(s, [], cfg);
    expect(r.events).toEqual([]);
    expect(r.state.fighters[1].health).toBe(100);
  });
  it('edges exactly touching do not overlap (d = Connect_Range)', () => {
    expect(step(scene({ p: { x: 0, fsm: jabAt(WARM + 1, 4) }, a: { x: 950 } }).s, [], cfg).events).toEqual([]);
    expect(step(scene({ p: { x: 0, fsm: jabAt(WARM + 1, 4) }, a: { x: 949 } }).s, [], cfg).events).toHaveLength(1);
  });
  it('the second overlapping Active_Phase Tick of the same attack registers nothing (Req 10 c3)', () => {
    let { s } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450 } });
    const r1 = step(s, [], cfg);
    s = r1.state;
    const r2 = step(s, [], cfg);
    expect(r1.events).toHaveLength(1);
    expect(r2.state.fighters[0].fsm).toMatchObject({ phase: 'active' });
    expect(r2.events).toEqual([]);
    expect(r2.state.fighters[1].health).toBe(96);
  });
  it('mirrors the Hitbox by facing: a player on the right hits leftward', () => {
    const { s } = scene({ p: { x: 450, fsm: jabAt(WARM + 1, 4) }, a: { x: -450 } });
    const r = step(s, [], cfg);
    expect(r.events).toHaveLength(1);
    expect(r.state.fighters[1].health).toBe(96);
  });
});

describe('Trade and interrupted attacks (Req 10 c6, c8; D3, D4; Req 35 c4, c12)', () => {
  it('both hits apply, both attacks end, player events first', () => {
    const { s, g } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450, fsm: jabAt(WARM + 1, 5) } });
    const r = step(s, [], cfg, { trace: true });
    expect(r.events.map((e) => e.type === 'hit-landed' && e.attacker)).toEqual(['player', 'ai']);
    expect(r.state.fighters.map((f) => f.health)).toEqual([96, 96]);
    for (const f of r.state.fighters) expect(f.fsm).toStrictEqual({ kind: 'HitStun', enteredAt: g, until: g + 14 });
  });
  it('a hit on a Fighter in Startup_Phase ends its attack, which registers nothing later (Req 10 c8)', () => {
    let { s } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450, fsm: jabAt(WARM + 1, 1) } });
    s = step(s, [], cfg).state;
    expect(s.fighters[1].fsm.kind).toBe('HitStun');
    let aiHits = 0;
    for (let i = 0; i < 30; i++) {
      const r = step(s, [], cfg);
      aiHits += r.events.filter((e) => e.type === 'hit-landed' && e.attacker === 'ai').length;
      s = r.state;
    }
    expect(aiHits).toBe(0);
  });
});

describe('Health-zero rules (Req 11 c6-c8, Req 35 c9, c10; D6, D7)', () => {
  it('Health 0 from a HitStun-causing hit gives Defeated on that Tick, with events in D10 order', () => {
    const { s, g } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450, health: 3 } });
    const r = step(s, [], cfg, { trace: true });
    expect(r.state.fighters[1].health).toBe(0);
    expect(r.state.fighters[1].fsm).toStrictEqual({ kind: 'Defeated', enteredAt: g });
    expect(r.state.result).toEqual({ kind: 'win', winner: 'player', at: g });
    expect(r.events.map((e) => e.type)).toEqual(['hit-landed', 'fighter-defeated', 'match-result']);
    expect(r.trace!.filter((t) => t.fighter === 'ai').map((t) => `${t.from}>${t.to}@${t.step}`)).toEqual([
      'Idle>HitStun@7',
      'HitStun>Defeated@8',
    ]);
  });
  it('a player defeat makes the AI the winner', () => {
    const { s, g } = scene({ p: { x: -450, health: 1 }, a: { x: 450, fsm: jabAt(WARM + 1, 4) } });
    expect(step(s, [], cfg).state.result).toEqual({ kind: 'win', winner: 'ai', at: g });
  });
  it('simultaneous Health 0 is a draw with both Fighters Defeated', () => {
    const { s, g } = scene({ p: { x: -450, health: 4, fsm: jabAt(WARM + 1, 4) }, a: { x: 450, health: 2, fsm: jabAt(WARM + 1, 4) } });
    const r = step(s, [], cfg);
    expect(r.state.fighters.map((f) => f.fsm.kind)).toEqual(['Defeated', 'Defeated']);
    expect(r.state.result).toEqual({ kind: 'draw', at: g });
    expect(r.events.map((e) => `${e.type}:${'attacker' in e ? e.attacker : 'fighter' in e ? e.fighter : 'match'}`)).toEqual([
      'hit-landed:player',
      'fighter-defeated:player',
      'hit-landed:ai',
      'fighter-defeated:ai',
      'match-result:match',
    ]);
  });
  it('Health never drops below 0 (Req 11 c2)', () => {
    const big = cfgWith((c) => {
      c.ai.enabled = false;
      c.attacks[0]!.damage = 50;
    });
    const { s } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450, health: 3 } }, big);
    expect(step(s, [], big).state.fighters[1].health).toBe(0);
  });
  it('rounds damage half up with a minimum of 1 (Req 35 c7, D5)', () => {
    for (const [base, dealt] of [
      [0, 1],
      [0.4, 1],
      [2.5, 3],
      [2.49, 2],
    ] as const) {
      const c = cfgWith((x) => {
        x.ai.enabled = false;
        x.attacks[0]!.damage = base;
      });
      const { s } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450 } }, c);
      expect(step(s, [], c).state.fighters[1].health).toBe(100 - dealt);
    }
  });
  it('after a result, commands are ignored and Health stays unchanged (Req 13 c3)', () => {
    const { s } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450, health: 3 } });
    let st = step(s, [], cfg).state;
    const frozen = st.fighters.map((f) => [f.x, f.health]);
    for (let i = 0; i < 60; i++) st = step(st, tickInput(CMD.Jab | CMD.MoveRight, CMD.Jab | CMD.MoveLeft), cfg).state;
    expect(st.fighters.map((f) => [f.x, f.health])).toEqual(frozen);
    expect(st.fighters[1].fsm.kind).toBe('Defeated');
  });
});

describe('HitStun (Req 10 c11, Req 35 c8)', () => {
  it('a hit on a Fighter in HitStun resets the remaining HitStun and keeps its entry Tick', () => {
    const { s, g } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450, fsm: { kind: 'HitStun', enteredAt: WARM - 5, until: WARM + 3 } } });
    const r = step(s, [], cfg);
    expect(r.state.fighters[1].fsm).toStrictEqual({ kind: 'HitStun', enteredAt: WARM - 5, until: g + 14 });
  });
  it('lasts exactly hitStun Ticks, then Idle', () => {
    const start = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450 } });
    const g = start.g;
    let s = step(start.s, [], cfg).state;
    for (let t = g + 1; t < g + 14; t++) {
      s = step(s, [], cfg).state;
      expect(s.fighters[1].fsm.kind).toBe('HitStun');
    }
    s = step(s, [], cfg).state;
    expect(s.fighters[1].fsm).toStrictEqual({ kind: 'Idle', enteredAt: g + 14 });
  });
});

describe('zero hit-stun hits (D41, Req 10 c10)', () => {
  const zero = cfgWith((c) => {
    c.ai.enabled = false;
    c.attacks[0]!.hitStun = 0;
  });
  it('on an Attacking target: Health drops, the attack ends, the target is Idle', () => {
    const { s, g } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450, fsm: jabAt(WARM + 1, 1) } }, zero);
    const r = step(s, [], zero);
    expect(r.state.fighters[1].health).toBe(96);
    expect(r.state.fighters[1].fsm).toStrictEqual({ kind: 'Idle', enteredAt: g });
  });
  it('on an Idle target: state kept', () => {
    const { s } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450 } }, zero);
    const before = { ...s.fighters[1].fsm };
    const r = step(s, [], zero);
    expect(r.state.fighters[1].health).toBe(96);
    expect(r.state.fighters[1].fsm).toStrictEqual(before);
  });
  it('on a Walking target: state kept', () => {
    // AI walks away (right) 40 Fx to d = 940, still inside Connect_Range.
    const { s } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450, fsm: { kind: 'Walking', enteredAt: WARM - 2, dir: 1 } } }, zero);
    const r = step(s, tickInput(0, CMD.MoveRight), zero);
    expect(r.state.fighters[1].health).toBe(96);
    expect(r.state.fighters[1].fsm).toStrictEqual({ kind: 'Walking', enteredAt: WARM - 2, dir: 1 });
  });
  it('on a HitStun target: `until` unchanged', () => {
    const stun: FsmState = { kind: 'HitStun', enteredAt: WARM - 2, until: WARM + 6 };
    const { s } = scene({ p: { x: -450, fsm: jabAt(WARM + 1, 4) }, a: { x: 450, fsm: { ...stun } } }, zero);
    const r = step(s, [], zero);
    expect(r.state.fighters[1].health).toBe(96);
    expect(r.state.fighters[1].fsm).toStrictEqual(stun);
  });
});

describe('default-config jab reachability (Req 15 c7)', () => {
  const live = cfgWith(); // the real default config
  const S = live.minSeparationFx;
  const dHi = live.jab.reach!.dHi;

  function hitsAt(d: number, playerLeft: boolean): boolean {
    const s = createInitialState(live);
    const [p, a] = s.fighters;
    p.x = playerLeft ? 0 : d;
    a.x = playerLeft ? d : 0;
    p.facing = a.x > p.x ? 1 : -1;
    a.facing = p.x > a.x ? 1 : -1;
    p.fsm = { kind: 'Attacking', enteredAt: 0, attackId: 'jab', phase: 'active', contactUsed: false };
    return detectHits(s.fighters, live).some((h) => h.attacker === 0);
  }

  it('connects at minSeparation and at dHi', () => {
    expect(hitsAt(S, true)).toBe(true);
    expect(hitsAt(dHi, true)).toBe(true);
    expect(dHi).toBe(949);
  });
  it('connects at every Fx distance in [minSeparation, Connect_Range), from either side', () => {
    const misses: number[] = [];
    for (let d = S; 2 * d < live.jab.connectRange2; d++) if (!hitsAt(d, true) || !hitsAt(d, false)) misses.push(d);
    expect(misses).toEqual([]);
  });
  it('does not connect at Connect_Range itself', () => {
    expect(hitsAt(live.jab.connectRange2 / 2, true)).toBe(false);
  });
});
