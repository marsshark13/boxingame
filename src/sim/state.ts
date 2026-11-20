// Initial state, state copy, and clone (design §2.1, §2.4, §10.3; task 5.1).
//
// Field order is fixed here and in copyStateInto, so states built by any path have the same
// key order. copyStateInto writes into preallocated objects and allocates only when an FSM
// state changes kind or a result appears, which keeps per-Tick garbage near zero (Req 34 c2).
import type { CompiledConfig } from './config/compile';
import { HISTORY_SIZE, initHistory, observe } from './observation';
import { seedSfc32 } from './rng';
import type { DeepReadonly, FighterState, FsmState, MatchResult, PlayerObservation, SimulationState } from './types';

/** Tick 0, the Match-start snapshot (Req 4 c9, 11 c1, 13 c1). */
export function createInitialState(cfg: CompiledConfig): SimulationState {
  const px = cfg.start.playerFx;
  const ax = cfg.start.aiFx;
  const player: FighterState = {
    id: 'player',
    x: px,
    facing: ax > px ? 1 : -1,
    health: cfg.maxHealth,
    fsm: { kind: 'Idle', enteredAt: 0 },
    lastJabStartAt: null,
  };
  const ai: FighterState = {
    id: 'ai',
    x: ax,
    facing: px > ax ? 1 : -1,
    health: cfg.maxHealth,
    fsm: { kind: 'Idle', enteredAt: 0 },
    lastJabStartAt: null,
  };
  return {
    version: 1,
    ruleset: 'm1',
    tick: 0,
    gameplayTick: 0,
    hitStopRemaining: 0,
    matchStartAt: 0,
    seed: cfg.seed,
    configFingerprint: cfg.fingerprint,
    rng: seedSfc32(cfg.seed),
    fighters: [player, ai],
    history: initHistory(observe(player, 0)),
    result: null,
  };
}

function copyFsm(src: DeepReadonly<FsmState>, dst: FsmState): FsmState {
  if (dst.kind === src.kind) {
    Object.assign(dst, src); // same kind -> same key set
    return dst;
  }
  return { ...(src as FsmState) };
}

function copyFighterInto(dst: FighterState, src: DeepReadonly<FighterState>): void {
  dst.id = src.id;
  dst.x = src.x;
  dst.facing = src.facing;
  dst.health = src.health;
  dst.fsm = copyFsm(src.fsm, dst.fsm);
  dst.lastJabStartAt = src.lastJabStartAt;
}

function copyResult(src: DeepReadonly<MatchResult> | null, dst: MatchResult | null): MatchResult | null {
  if (src === null) return null;
  if (dst !== null && dst.kind === src.kind) {
    Object.assign(dst, src);
    return dst;
  }
  return { ...(src as MatchResult) };
}

/** Overwrites every field of `next` with `prev`, reusing `next`'s objects. `next` must not alias `prev`. */
export function copyStateInto(next: SimulationState, prev: DeepReadonly<SimulationState>): void {
  if ((next as unknown) === prev) throw new Error('copyStateInto: next and prev must be different objects');
  next.version = prev.version;
  next.ruleset = prev.ruleset;
  next.tick = prev.tick;
  next.gameplayTick = prev.gameplayTick;
  next.hitStopRemaining = prev.hitStopRemaining;
  next.matchStartAt = prev.matchStartAt;
  next.seed = prev.seed;
  next.configFingerprint = prev.configFingerprint;
  next.rng[0] = prev.rng[0];
  next.rng[1] = prev.rng[1];
  next.rng[2] = prev.rng[2];
  next.rng[3] = prev.rng[3];
  copyFighterInto(next.fighters[0], prev.fighters[0]);
  copyFighterInto(next.fighters[1], prev.fighters[1]);
  const he = next.history.entries;
  const pe = prev.history.entries;
  for (let i = 0; i < HISTORY_SIZE; i++) Object.assign(he[i]!, pe[i]!);
  next.history.head = prev.history.head;
  next.history.count = prev.history.count;
  next.result = copyResult(prev.result, next.result);
}

function cloneFighter(f: DeepReadonly<FighterState>): FighterState {
  return {
    id: f.id,
    x: f.x,
    facing: f.facing,
    health: f.health,
    fsm: { ...(f.fsm as FsmState) },
    lastJabStartAt: f.lastJabStartAt,
  };
}

/** A fully independent deep copy. */
export function cloneState(s: DeepReadonly<SimulationState>): SimulationState {
  return {
    version: s.version,
    ruleset: s.ruleset,
    tick: s.tick,
    gameplayTick: s.gameplayTick,
    hitStopRemaining: s.hitStopRemaining,
    matchStartAt: s.matchStartAt,
    seed: s.seed,
    configFingerprint: s.configFingerprint,
    rng: [s.rng[0], s.rng[1], s.rng[2], s.rng[3]],
    fighters: [cloneFighter(s.fighters[0]), cloneFighter(s.fighters[1])],
    history: {
      entries: s.history.entries.map((e) => ({ ...(e as PlayerObservation) })),
      head: s.history.head,
      count: s.history.count,
    },
    result: s.result === null ? null : { ...(s.result as MatchResult) },
  };
}
