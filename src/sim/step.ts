// Tick resolution pipeline (design §5; Req 35 c1; task 5.3).
//
// stepInto(prev, next, input, cfg) advances exactly one Tick of 1/60 s (Req 1 c1). It reads
// only `prev`, the Tick's player commands, and the compiled config (Req 2 c3, Req 3 c3).
import type { CompiledConfig } from './config/compile';
import { newFsmTickContext, transition, type FsmTickContext } from './fsm';
import { recordObservation } from './observation';
import { cloneState, copyStateInto } from './state';
import {
  CMD,
  COMMAND_BITS,
  M1_ENABLED_MASK,
  type CommandMask,
  type DeepReadonly,
  type FighterId,
  type FighterState,
  type FsmTransitionRecord,
  type GameEvent,
  type GTick,
  type SimulationState,
  type StepResult,
  type TickInput,
} from './types';

// --- Event collection (design §5.4, D10) ------------------------------------------------

/** Per-owner event queues; flush() returns player events, then AI events, then match-level events. */
export class EventCollector {
  private player: GameEvent[] | null = null;
  private ai: GameEvent[] | null = null;
  private global: GameEvent[] | null = null;

  push(owner: FighterId, ev: GameEvent): void {
    if (owner === 'player') (this.player ??= []).push(ev);
    else (this.ai ??= []).push(ev);
  }

  pushGlobal(ev: GameEvent): void {
    (this.global ??= []).push(ev);
  }

  flush(): GameEvent[] {
    const out: GameEvent[] = [];
    if (this.player) out.push(...this.player);
    if (this.ai) out.push(...this.ai);
    if (this.global) out.push(...this.global);
    return out;
  }
}

// --- Step 2b: command intake (Req 2 c2, c7; Req 4 c10; Req 11 c7; Req 13 c3) -------------

function fighterIndex(v: unknown): 0 | 1 | -1 {
  return v === 'player' ? 0 : v === 'ai' ? 1 : -1;
}

function commandBit(v: unknown): number {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(COMMAND_BITS, v)
    ? COMMAND_BITS[v as keyof typeof COMMAND_BITS]
    : 0;
}

/** Builds both Fighters' masks for this Tick. Invalid entries are dropped silently. */
export function intakeMasks(next: SimulationState, input: TickInput, aiMask: CommandMask, cfg: CompiledConfig): [number, number] {
  const mask: [number, number] = [0, aiMask];
  if (Array.isArray(input)) {
    for (const c of input as readonly unknown[]) {
      if (c === null || typeof c !== 'object') continue;
      const i = fighterIndex((c as { fighter?: unknown }).fighter);
      const bit = commandBit((c as { type?: unknown }).type);
      if (i === -1 || bit === 0) continue; // unknown fighter or type
      if (i === 1 && cfg.ai.enabled) continue; // external AI commands only when the AI is disabled (D40)
      mask[i] |= bit;
    }
  }
  for (const i of [0, 1] as const) {
    mask[i] &= M1_ENABLED_MASK; // P2 commands are dropped in M1
    if (next.result !== null || next.fighters[i].fsm.kind === 'Defeated') mask[i] = 0;
  }
  return mask;
}

// --- Step 3: timers (design §8.1) --------------------------------------------------------

export function advanceTimers(f: FighterState, cfg: CompiledConfig, ctx: FsmTickContext): void {
  const g = ctx.g;
  const s = f.fsm;
  if (s.kind === 'Attacking') {
    const atk = cfg.attacks.get(s.attackId);
    if (atk === undefined) throw new Error(`advanceTimers: unknown attack '${s.attackId}'`);
    const e = g - s.enteredAt;
    if (e >= atk.total) {
      transition(f, { kind: 'Idle', enteredAt: g }, 'attack-end', 3, ctx); // Req 9 c4
    } else {
      s.phase = e < atk.startup ? 'startup' : e < atk.startup + atk.active ? 'active' : 'recovery'; // Req 9 c3
    }
  } else if (s.kind === 'HitStun' && g >= s.until) {
    transition(f, { kind: 'Idle', enteredAt: g }, 'stun-end', 3, ctx);
  }
}

// --- Step 4: action selection (D9: jab > movement > Idle in M1) --------------------------

export function ableToAct(f: DeepReadonly<FighterState>): boolean {
  return f.fsm.kind === 'Idle' || f.fsm.kind === 'Walking';
}

/** Returns the Fighter's movement direction for step 6: -1, 0, or +1. */
export function selectAction(f: FighterState, mask: CommandMask, cfg: CompiledConfig, ctx: FsmTickContext): -1 | 0 | 1 {
  // Not Able_To_Act: attack commands are discarded (Req 4 c11, M1) and movement ignored (Req 7 c9).
  if (!ableToAct(f)) return 0;
  const g = ctx.g;
  if (mask & CMD.Jab) {
    // Req 9 c2: Attacking on Tick N, the first Startup_Phase Tick.
    transition(f, { kind: 'Attacking', enteredAt: g, attackId: cfg.jab.id, phase: 'startup', contactUsed: false }, 'attack', 4, ctx);
    f.lastJabStartAt = g;
    return 0;
  }
  const left = (mask & CMD.MoveLeft) !== 0;
  const right = (mask & CMD.MoveRight) !== 0;
  const dir: -1 | 0 | 1 = left === right ? 0 : left ? -1 : 1; // both directions = no movement (Req 7 c4)
  if (dir !== 0) {
    if (f.fsm.kind === 'Walking') f.fsm.dir = dir; // direction change is a field update, not a transition
    else transition(f, { kind: 'Walking', enteredAt: g, dir }, 'move', 4, ctx); // Req 7 c2
    return dir;
  }
  if (f.fsm.kind === 'Walking') transition(f, { kind: 'Idle', enteredAt: g }, 'stop', 4, ctx); // Req 7 c3
  return 0;
}

// --- The pipeline -----------------------------------------------------------------------

/**
 * Advances one Tick from `prev` into `next` (which is overwritten) and returns exactly this
 * Tick's Game_Events in D10 order (Req 2 c4). `trace`, if given, receives every FSM transition
 * attempt (test-only).
 */
export function stepInto(
  prev: DeepReadonly<SimulationState>,
  next: SimulationState,
  input: TickInput,
  cfg: CompiledConfig,
  trace?: FsmTransitionRecord[],
): GameEvent[] {
  copyStateInto(next, prev);
  const ev = new EventCollector();
  next.tick += 1;

  // (1) Hit_Stop check [P4]. M1: hitStopRemaining is always 0, so this falls through.
  if (next.hitStopRemaining > 0) {
    next.hitStopRemaining -= 1;
    return ev.flush();
  }
  next.gameplayTick += 1;
  const g: GTick = next.gameplayTick;
  const ctx = newFsmTickContext(g, trace);

  // (2a) AI_Controller decision and PRNG commit (D40): task 8.
  const aiMask: CommandMask = 0;

  // (2b) Command intake and validation.
  const mask = intakeMasks(next, input, aiMask, cfg);

  // (3) Timer advancement: attack phase, HitStun expiry.
  advanceTimers(next.fighters[0], cfg, ctx);
  advanceTimers(next.fighters[1], cfg, ctx);

  // (4) Action selection per Fighter.
  const moveDir: [-1 | 0 | 1, -1 | 0 | 1] = [
    selectAction(next.fighters[0], mask[0], cfg, ctx),
    selectAction(next.fighters[1], mask[1], cfg, ctx),
  ];
  void moveDir; // consumed by step 6 (task 6)

  // (5) Stamina deduction [P2]. M1: no-op.
  // (6) Movement, separation, facing: task 6.
  // (7) Hit detection and outcomes: task 7.
  // (8) Health-zero checks: task 7.
  // (9) Round timer and round end [P3]. M1: no-op.

  // (10) Game_Event emission and end-of-Gameplay_Tick bookkeeping (Req 12 c9).
  recordObservation(next.history, next.fighters[0], g);
  return ev.flush();
}

export interface StepOptions {
  /** Collect the FSM transition trace into StepResult.trace (tests only). */
  trace?: boolean;
}

/** Pure wrapper: returns a new state and leaves `state` untouched. Shares all logic with stepInto. */
export function step(state: DeepReadonly<SimulationState>, input: TickInput, cfg: CompiledConfig, opts?: StepOptions): StepResult {
  const next = cloneState(state);
  const trace: FsmTransitionRecord[] | undefined = opts?.trace ? [] : undefined;
  const events = stepInto(state, next, input, cfg, trace);
  return trace ? { state: next, events, trace } : { state: next, events };
}
