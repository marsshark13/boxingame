// Fighter_FSM transition table and transition() (design §6; Req 4 c5-c8, c10; task 5.2).
// All state changes go through transition(), which accepts a change only if the declared
// table has a rule for (from, to, trigger) in the current Tick-processing step, and at most
// one transition per Fighter per step (Req 4 c5).
import type { CompiledConfig } from './config/compile';
import type { FighterState, FsmKind, FsmState, FsmTransitionRecord, GTick, TransitionStep, Trigger } from './types';

export type { Trigger, TransitionStep } from './types';

export interface TransitionRule {
  readonly from: FsmKind;
  readonly to: FsmKind;
  readonly trigger: Trigger;
  readonly step: TransitionStep;
}

export const M1_TRANSITIONS: readonly TransitionRule[] = Object.freeze([
  { from: 'Idle', to: 'Walking', trigger: 'move', step: 4 }, // Req 7 c2
  { from: 'Idle', to: 'Attacking', trigger: 'attack', step: 4 }, // Req 9 c2
  { from: 'Walking', to: 'Attacking', trigger: 'attack', step: 4 }, // Req 9 c2, D9
  { from: 'Walking', to: 'Idle', trigger: 'stop', step: 4 }, // Req 7 c3, c4
  { from: 'Attacking', to: 'Idle', trigger: 'attack-end', step: 3 }, // Req 9 c4
  { from: 'Idle', to: 'HitStun', trigger: 'hit', step: 7 }, // Req 10 c4
  { from: 'Walking', to: 'HitStun', trigger: 'hit', step: 7 },
  { from: 'Attacking', to: 'HitStun', trigger: 'hit', step: 7 }, // Req 10 c8, D3
  { from: 'HitStun', to: 'HitStun', trigger: 'hit', step: 7 }, // refresh, Req 35 c8
  { from: 'Attacking', to: 'Idle', trigger: 'hit-no-stun', step: 7 }, // D41, D3
  { from: 'HitStun', to: 'Idle', trigger: 'stun-end', step: 3 },
  { from: 'Idle', to: 'Defeated', trigger: 'health-zero', step: 8 }, // Req 11 c6, 35 c9
  { from: 'Walking', to: 'Defeated', trigger: 'health-zero', step: 8 },
  { from: 'Attacking', to: 'Defeated', trigger: 'health-zero', step: 8 },
  { from: 'HitStun', to: 'Defeated', trigger: 'health-zero', step: 8 }, // D6
  // Defeated has no outgoing rules (Req 4 c10).
  // D41: a zero hit-stun hit on Idle, Walking, or HitStun changes Health only (no rule, no transition).
]);

export const ruleKey = (from: FsmKind, to: FsmKind, trigger: Trigger) => `${from}>${to}:${trigger}`;

function indexRules(rules: readonly TransitionRule[]): ReadonlyMap<string, TransitionRule> {
  const m = new Map<string, TransitionRule>();
  for (const r of rules) m.set(ruleKey(r.from, r.to, r.trigger), r);
  return m;
}

export const RULE_INDEX: ReadonlyMap<string, TransitionRule> = indexRules(M1_TRANSITIONS);

/** The transition table for the configured mode. M1 has one table. */
export function activeTable(_cfg: CompiledConfig): readonly TransitionRule[] {
  return M1_TRANSITIONS;
}

/** Per-Tick FSM bookkeeping: the current Gameplay_Tick, the per-Fighter step guard, and the optional trace. */
export interface FsmTickContext {
  readonly g: GTick;
  /** Last step in which each Fighter ([player, ai]) transitioned this Tick; 0 = none yet. */
  readonly lastStep: [number, number];
  readonly trace: FsmTransitionRecord[] | undefined;
}

export function newFsmTickContext(g: GTick, trace?: FsmTransitionRecord[]): FsmTickContext {
  return { g, lastStep: [0, 0], trace };
}

/**
 * Applies `to` if the table has a rule for it in `step` and the Fighter has not yet
 * transitioned in this step. Returns false and leaves the state unchanged otherwise; the
 * trace records the violation, which is a code defect (design §6.3).
 */
export function transition(f: FighterState, to: FsmState, trigger: Trigger, step: TransitionStep, ctx: FsmTickContext): boolean {
  const i = f.id === 'player' ? 0 : 1;
  const rule = RULE_INDEX.get(ruleKey(f.fsm.kind, to.kind, trigger));
  const ok = rule !== undefined && rule.step === step && ctx.lastStep[i] < step;
  ctx.trace?.push({ fighter: f.id, from: f.fsm.kind, to: to.kind, trigger, step, at: ctx.g, ok });
  if (!ok) return false;
  ctx.lastStep[i] = step;
  f.fsm = to;
  return true;
}
