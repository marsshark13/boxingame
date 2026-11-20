// M1 AI_Controller (design §9; Req 12; D32, D40; task 8.1).
//
// decideAi is a pure function of (Simulation_State at the end of Tick T-1, a copy of the PRNG
// state, compiled config). It reads the Player_Fighter only through the delayed observation
// for Tick T-1-D (Req 12 c5, c13) and its own Fighter without delay. It never modifies the
// state (Req 12 c2) and, in M1, draws no random values, so it returns the received PRNG
// state unchanged (Req 12 c14).
import type { CompiledConfig } from '../config/compile';
import { observationFor } from '../observation';
import { CMD, type CommandMask, type DeepReadonly, type FighterState, type RngState, type SimulationState } from '../types';

export interface AiDecision {
  mask: CommandMask;
  rng: RngState;
}

function ableToAct(f: DeepReadonly<FighterState>): boolean {
  return f.fsm.kind === 'Idle' || f.fsm.kind === 'Walking';
}

export function decideAi(s: DeepReadonly<SimulationState>, rng: RngState, cfg: CompiledConfig): AiDecision {
  if (s.result !== null) return { mask: 0, rng }; // Req 12 c8: nothing until restart
  const me = s.fighters[1]; // own state: current, no delay (Req 12 c5)
  const T = s.gameplayTick + 1; // the Tick being decided
  const obs = observationFor(s.history, T - 1 - cfg.ai.reactionDelay, s.matchStartAt);
  const d = Math.abs(obs.x - me.x); // the player only through the observation (Req 12 c13)
  if (2 * d >= cfg.jab.connectRange2) {
    // At least Connect_Range: one movement command toward the observed player (Req 12 c3).
    return { mask: obs.x > me.x ? CMD.MoveRight : CMD.MoveLeft, rng };
  }
  // Strictly inside Connect_Range: no movement (Req 12 c4).
  if (!ableToAct(me)) return { mask: 0, rng }; // Req 12 c7
  const ref = me.lastJabStartAt ?? s.matchStartAt; // previous jab or Match start
  return { mask: T - ref >= cfg.ai.attackInterval ? CMD.Jab : 0, rng };
}
