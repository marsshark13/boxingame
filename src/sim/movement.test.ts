// Task 6.4: clamping and separation unit tests (Req 7 c1-c8; D38, D39; Req 15 c1 c).
import { describe, expect, it } from 'vitest';
import { resolveMovement } from './movement';
import { createInitialState } from './state';
import { step } from './step';
import { CMD, type SimulationState } from './types';
import { cfgWith, tickInput } from '../test/sim';

const S = 800;
const B0 = -3000;
const B1 = 3000;

function runSim(start: { player: number; ai: number }, masks: Array<[number, number]>): SimulationState {
  const cfg = cfgWith((c) => {
    c.ai.enabled = false;
    c.start = start;
  });
  let s = createInitialState(cfg);
  for (const [p, a] of masks) s = step(s, tickInput(p, a), cfg).state;
  return s;
}

describe('Ring_Boundary clamping (Req 7 c6)', () => {
  it('stops at the left wall and stays Walking with zero displacement', () => {
    const s1 = runSim({ player: -2.98, ai: 1 }, [[CMD.MoveLeft, 0]]);
    expect(s1.fighters[0].x).toBe(-3000);
    const s2 = runSim({ player: -2.98, ai: 1 }, [
      [CMD.MoveLeft, 0],
      [CMD.MoveLeft, 0],
    ]);
    expect(s2.fighters[0].x).toBe(-3000);
    expect(s2.fighters[0].fsm.kind).toBe('Walking');
  });
  it('stops at the right wall', () => {
    const s = runSim({ player: -1, ai: 2.99 }, [[0, CMD.MoveRight], [0, CMD.MoveRight]]);
    expect(s.fighters[1].x).toBe(3000);
  });
  it('moves exactly walkSpeed when nothing constrains it (Req 7 c1)', () => {
    const s = runSim({ player: -1.5, ai: 1.5 }, [[CMD.MoveRight, CMD.MoveRight]]);
    expect(s.fighters.map((f) => f.x)).toEqual([-1460, 1540]);
  });
  it('does not move on the Tick a Walking Fighter stops (Req 7 c3)', () => {
    const s = runSim({ player: -1.5, ai: 1.5 }, [[CMD.MoveRight, 0], [0, 0]]);
    expect(s.fighters[0].x).toBe(-1460);
  });
  it('does not move with both directions held (Req 7 c4)', () => {
    const s = runSim({ player: -1.5, ai: 1.5 }, [[CMD.MoveLeft | CMD.MoveRight, 0]]);
    expect(s.fighters[0].x).toBe(-1500);
  });
  it('ignores movement while not Able_To_Act (Req 7 c9)', () => {
    const s = runSim({ player: -1.5, ai: 1.5 }, [[CMD.Jab, 0], [CMD.MoveRight, 0], [CMD.MoveRight, 0]]);
    expect(s.fighters[0].x).toBe(-1500);
  });
});

describe('minimum separation (Req 7 c5, D39)', () => {
  it('walking into a standing opponent ends exactly at minSeparation and stays Walking', () => {
    // dist 820 -> 780 would be too close: the 20 Fx shortfall is taken from the walker
    const s = runSim({ player: -0.41, ai: 0.41 }, [[CMD.MoveRight, 0]]);
    expect(s.fighters[1].x - s.fighters[0].x).toBe(S);
    expect(s.fighters[0].x).toBe(-390);
    const s2 = runSim({ player: -0.41, ai: 0.41 }, [[CMD.MoveRight, 0], [CMD.MoveRight, 0]]);
    expect(s2.fighters[0].x).toBe(-390);
    expect(s2.fighters[0].fsm.kind).toBe('Walking');
  });
  it('splits an even shortfall equally', () => {
    expect(resolveMovement([-420, 420], [40, -40], S, B0, B1)).toEqual([-400, 400]);
  });
  it('gives the odd 1 Fx to the Player_Fighter when toward-movements are equal (player on the left)', () => {
    // dist 841 -> 761, short 39: player 20, ai 19
    expect(resolveMovement([-420, 421], [40, -40], S, B0, B1)).toEqual([-400, 400]);
  });
  it('gives the odd 1 Fx to the Player_Fighter when toward-movements are equal (player on the right)', () => {
    // player is R at 421 -> 381, ai is L at -420 -> -380; short 39: player 20, ai 19
    expect(resolveMovement([421, -420], [-40, 40], S, B0, B1)).toEqual([401, -399]);
  });
  it('gives the odd 1 Fx to the larger toward-mover', () => {
    // c = [-380, 391], short 29: L (40 toward) gets 15, R (30 toward) gets 14
    expect(resolveMovement([-420, 421], [40, -30], S, B0, B1)).toEqual([-395, 405]);
  });
  it('caps a share at the Fighter’s own toward-movement and moves the rest to the other', () => {
    // c = [-405, 370], short 25: halves 13 (R) / 12 (L); L moved only 5, so L 5, R 20
    expect(resolveMovement([-410, 410], [5, -40], S, B0, B1)).toEqual([-410, 390]);
  });
  it('shortens only the toward-mover when the other moves away', () => {
    // L walks away (left), R walks toward: c = [-460, 380], dist 840, no shortfall
    expect(resolveMovement([-420, 420], [-40, -40], S, B0, B1)).toEqual([-460, 380]);
    // L walks away 10, R walks toward 40: c = [-410, 360], dist 770, short 30 taken from R only
    expect(resolveMovement([-400, 400], [-10, -40], S, B0, B1)).toEqual([-410, 390]);
  });
  it('wall-and-opponent case (design §7.2): the Fighter at the wall is never pushed', () => {
    // L at the left wall walks left (away), R walks toward L.
    expect(resolveMovement([B0, B0 + 820], [-40, -40], S, B0, B1)).toEqual([B0, B0 + S]);
  });
  it('keeps the distance when both stand still at exactly minSeparation', () => {
    expect(resolveMovement([0, S], [0, 0], S, B0, B1)).toEqual([0, S]);
  });
});

describe('facing (Req 7 c8)', () => {
  it('points each Fighter at the opponent at the end of every Tick', () => {
    const s = runSim({ player: 1.5, ai: -1.5 }, [[CMD.MoveLeft, CMD.MoveRight]]);
    expect(s.fighters[0].facing).toBe(-1);
    expect(s.fighters[1].facing).toBe(1);
  });
});
