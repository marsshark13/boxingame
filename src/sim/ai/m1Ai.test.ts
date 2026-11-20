// Task 8.7: AI placement in the Tick and decision examples (Req 12 c1-c8, c10; Req 2 c2; Req 35 c1; D40).
import { describe, expect, it } from 'vitest';
import { createInitialState } from '../state';
import { step } from '../step';
import { CMD, type RngState, type SimulationState } from '../types';
import { decideAi } from './m1Ai';
import { cfgWith, tickInput } from '../../test/sim';

const cfg = cfgWith(); // AI enabled; reaction delay 12; attack interval 45; Connect_Range 0.95
const copy = (s: SimulationState): RngState => [s.rng[0], s.rng[1], s.rng[2], s.rng[3]];

function runTo(s: SimulationState, n: number, mask = 0, c = cfg): SimulationState {
  for (let i = 0; i < n; i++) s = step(s, tickInput(mask), c).state;
  return s;
}

describe('AI decisions (Req 12 c3, c4)', () => {
  it('approaches the player one step per Tick while at least Connect_Range away', () => {
    let s = createInitialState(cfg);
    expect(decideAi(s, copy(s), cfg).mask).toBe(CMD.MoveLeft);
    s = step(s, [], cfg).state;
    expect(s.fighters[1].fsm).toStrictEqual({ kind: 'Walking', enteredAt: 1, dir: -1 });
    expect(s.fighters[1].x).toBe(1500 - 40);
  });
  it('stops inside Connect_Range and jabs once the attack interval has passed since Match start', () => {
    const near = cfgWith((c) => (c.start = { player: -0.45, ai: 0.45 })); // d = 900 < 950
    let s = createInitialState(near);
    const masks: number[] = [];
    for (let t = 1; t <= 46; t++) {
      masks.push(decideAi(s, copy(s), near).mask);
      s = step(s, [], near).state;
    }
    expect(masks.slice(0, 44).every((m) => m === 0)).toBe(true); // T = 1..44: interval not reached, no movement
    expect(masks[44]).toBe(CMD.Jab); // T = 45 - 0 >= 45
    expect(s.fighters[1].lastJabStartAt).toBe(45);
  });
  it('measures the next jab from the previous jab start', () => {
    const near = cfgWith((c) => {
      c.start = { player: -0.45, ai: 0.45 };
      c.ai.attackInterval = 20; // longer than the jab's 14 Ticks
    });
    let s = createInitialState(near);
    const jabTicks: number[] = [];
    for (let t = 1; t <= 70; t++) {
      if (decideAi(s, copy(s), near).mask === CMD.Jab) jabTicks.push(t);
      // keep the player out of HitStun-free action: the player just stands
      s = step(s, [], near).state;
    }
    expect(jabTicks.slice(0, 3)).toEqual([20, 40, 60]);
  });
  it('approaches at exactly Connect_Range (strict jab side)', () => {
    const edge = cfgWith((c) => (c.start = { player: -0.475, ai: 0.475 })); // d = 950 = Connect_Range
    const s = createInitialState(edge);
    expect(decideAi(s, copy(s), edge).mask).toBe(CMD.MoveLeft);
  });
});

describe('delayed observation (Req 12 c5, c10, c13; D32)', () => {
  it('reacts to the player reactionDelay + 1 Ticks after the player moves', () => {
    const c = cfgWith((x) => {
      x.ai.reactionDelay = 5;
      x.start = { player: -0.45, ai: 0.45 }; // inside range: AI stands
    });
    let s = createInitialState(c);
    // The player walks away (left) from Tick 1. Its distance first reaches 950 at the end of
    // Tick 2 (900 + 2*40 = 980 >= 950). The AI sees that on Tick 2 + 5 + 1 = 8.
    const decisions: number[] = [];
    for (let t = 1; t <= 9; t++) {
      decisions.push(decideAi(s, copy(s), c).mask);
      s = step(s, tickInput(CMD.MoveLeft), c).state;
    }
    expect(decisions.slice(0, 7).every((m) => m !== CMD.MoveLeft)).toBe(true);
    expect(decisions[7]).toBe(CMD.MoveLeft);
  });
  it('uses the Match-start observation before enough history exists', () => {
    const c = cfgWith((x) => (x.ai.reactionDelay = 120));
    let s = createInitialState(c);
    s = runTo(s, 30, CMD.MoveRight); // the player walks toward the AI, but the AI still sees Tick 0
    const obsX = -1500;
    const want = obsX > s.fighters[1].x ? CMD.MoveRight : CMD.MoveLeft;
    const d = Math.abs(obsX - s.fighters[1].x);
    expect(decideAi(s, copy(s), c).mask).toBe(2 * d >= c.jab.connectRange2 ? want : 0);
  });
});

describe('AI placement in the Tick (D40, Req 35 c1)', () => {
  it('decides from the state at the end of T-1, before this Tick’s player commands are applied', () => {
    const s = runTo(createInitialState(cfg), 3);
    const expected = decideAi(s, copy(s), cfg).mask;
    // Whatever the player does on Tick T, the AI's command for T is the same.
    const a = step(s, tickInput(CMD.MoveRight), cfg).state.fighters[1];
    const b = step(s, tickInput(CMD.Jab), cfg).state.fighters[1];
    expect(expected).toBe(CMD.MoveLeft);
    expect(a.x).toBe(b.x);
    expect(a.x).toBe(s.fighters[1].x - 40);
  });
  it('the AI’s commands use the same acceptance rules as the player’s (approach ignored while not Able_To_Act)', () => {
    let s = createInitialState(cfg);
    s.fighters[1].fsm = { kind: 'HitStun', enteredAt: 0, until: 10 };
    expect(decideAi(s, copy(s), cfg).mask).toBe(CMD.MoveLeft); // still issues the approach (Req 12 c3)
    s = step(s, [], cfg).state;
    expect(s.fighters[1].x).toBe(1500); // ignored in step 4 (Req 7 c9)
    expect(s.fighters[1].fsm.kind).toBe('HitStun');
  });
  it('issues no regular jab while not Able_To_Act (Req 12 c7)', () => {
    const near = cfgWith((c) => (c.start = { player: -0.45, ai: 0.45 }));
    const s = runTo(createInitialState(near), 50, 0, near);
    s.fighters[1].fsm = { kind: 'HitStun', enteredAt: 50, until: 60 };
    s.fighters[1].lastJabStartAt = null;
    expect(decideAi(s, copy(s), near).mask).toBe(0);
  });
  it('issues no commands once a result exists (Req 12 c8)', () => {
    const s = createInitialState(cfg);
    s.result = { kind: 'win', winner: 'player', at: 0 };
    expect(decideAi(s, copy(s), cfg).mask).toBe(0);
  });
  it('an external AI command is accepted only with ai.enabled = false', () => {
    const off = cfgWith((c) => (c.ai.enabled = false));
    const s = createInitialState(off);
    expect(step(s, tickInput(0, CMD.MoveRight), off).state.fighters[1].x).toBe(1540);
    const on = createInitialState(cfg);
    expect(step(on, tickInput(0, CMD.MoveRight), cfg).state.fighters[1].x).toBe(1460); // AI approached instead
  });
});
