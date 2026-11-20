// Combat_Resolver: pipeline steps 7 and 8 (design §5.3, §8.2-8.3; Req 10, 11 c6-c8, 35 c4-c10; task 7).
//
// Step 7 is two-phase so results cannot depend on which Fighter is processed first
// (Req 35 c4, D4): detectHits() only reads the post-movement snapshot; applyHits() then writes.
// Boxes use doubled Fx coordinates (value x 2) so half-sizes stay exact for odd Fx sizes.
import type { CompiledConfig } from './config/compile';
import { roundHalfUp } from './fixed';
import { transition, type FsmTickContext } from './fsm';
import type { EventCollector } from './step';
import type { CompiledAttack, DeepReadonly, FighterState, FsmState, GTick, SimulationState } from './types';

/** Axis-aligned box in doubled Fx: center (cx2, cy2) and half-extents (hw2, hh2). */
export interface Box2 {
  cx2: number;
  cy2: number;
  hw2: number;
  hh2: number;
}

/** The attack's Hitbox, offset from the attacker and mirrored by facing (Req 10 c1). */
export function hitboxOf(A: DeepReadonly<FighterState>, atk: CompiledAttack): Box2 {
  const hb = atk.hitboxFx;
  return { cx2: 2 * (A.x + A.facing * hb.ox), cy2: 2 * hb.oy, hw2: hb.w, hh2: hb.h };
}

/** The configured Hurtbox, centered on the Fighter (Req 10 c1). */
export function hurtboxOf(T: DeepReadonly<FighterState>, cfg: CompiledConfig): Box2 {
  return { cx2: 2 * T.x, cy2: 2 * cfg.hurtFx.centerY, hw2: cfg.hurtFx.w, hh2: cfg.hurtFx.h };
}

/** Strict overlap: positive intersection on both axes, so touching edges do not overlap (Req 10 c2). */
export function overlap(a: Box2, b: Box2): boolean {
  return Math.abs(a.cx2 - b.cx2) < a.hw2 + b.hw2 && Math.abs(a.cy2 - b.cy2) < a.hh2 + b.hh2;
}

/** Center of the intersection of two overlapping boxes, in world units (Req 10 c5). */
export function intersectionCenter(a: Box2, b: Box2): { x: number; y: number } {
  const xlo = Math.max(a.cx2 - a.hw2, b.cx2 - b.hw2);
  const xhi = Math.min(a.cx2 + a.hw2, b.cx2 + b.hw2);
  const ylo = Math.max(a.cy2 - a.hh2, b.cy2 - b.hh2);
  const yhi = Math.min(a.cy2 + a.hh2, b.cy2 + b.hh2);
  return { x: (xlo + xhi) / 4 / 1000, y: (ylo + yhi) / 4 / 1000 };
}

type AttackingState = Extract<FsmState, { kind: 'Attacking' }>;

export interface PendingHit {
  attacker: 0 | 1;
  target: 0 | 1;
  atk: CompiledAttack;
  /** The attacker's Attacking state object captured in phase A. */
  att: AttackingState;
  pos: { x: number; y: number };
}

/**
 * Phase A (reads only): at most one pending hit per attacker, in player-then-AI order.
 * An attack can hit only in its Active_Phase and only once per instance (Req 10 c3, c7).
 */
export function detectHits(fs: readonly [FighterState, FighterState], cfg: CompiledConfig): PendingHit[] {
  const out: PendingHit[] = [];
  for (const i of [0, 1] as const) {
    const A = fs[i];
    const T = fs[1 - i]!;
    const s = A.fsm;
    if (s.kind !== 'Attacking' || s.phase !== 'active' || s.contactUsed) continue;
    const atk = cfg.attacks.get(s.attackId);
    if (atk === undefined) throw new Error(`detectHits: unknown attack '${s.attackId}'`);
    const hb = hitboxOf(A, atk);
    const hu = hurtboxOf(T, cfg);
    if (overlap(hb, hu)) out.push({ attacker: i, target: (1 - i) as 0 | 1, atk, att: s, pos: intersectionCenter(hb, hu) });
  }
  return out;
}

/** Landed-hit damage in M1: max(1, roundHalfUp(base)) (Req 35 c7, D5). */
export function landedDamage(atk: CompiledAttack): number {
  return Math.max(1, roundHalfUp(atk.damage));
}

/**
 * Phase B (writes): applies every pending hit. Contacts are marked used before any outcome,
 * so a Trade applies both hits (Req 10 c6, D4). Processing order affects only event order.
 */
export function applyHits(fs: [FighterState, FighterState], hits: readonly PendingHit[], ev: EventCollector, ctx: FsmTickContext): void {
  const g: GTick = ctx.g;
  for (const h of hits) h.att.contactUsed = true; // Req 10 c3
  for (const h of hits) {
    const A = fs[h.attacker];
    const T = fs[h.target];
    const dmg = landedDamage(h.atk);
    T.health = Math.max(0, T.health - dmg); // Req 10 c4, Req 11 c2
    const H = h.atk.hitStun;
    if (H > 0) {
      // Req 10 c11; an attack in progress ends (Req 10 c8, D3).
      if (T.fsm.kind === 'HitStun') {
        transition(T, { kind: 'HitStun', enteredAt: T.fsm.enteredAt, until: g + H }, 'hit', 7, ctx); // reset (Req 35 c8)
      } else {
        transition(T, { kind: 'HitStun', enteredAt: g, until: g + H }, 'hit', 7, ctx);
      }
    } else if (T.fsm.kind === 'Attacking') {
      transition(T, { kind: 'Idle', enteredAt: g }, 'hit-no-stun', 7, ctx); // D41: attack ends, no HitStun
    } // D41: Idle, Walking, HitStun keep their state; `until` untouched
    ev.push(A.id, { type: 'hit-landed', at: g, attacker: A.id, target: T.id, attackId: h.atk.id, damage: dmg, hitPos: h.pos });
  }
}

/** Step 7: hit detection and outcomes against one shared snapshot. Skipped once a result exists. */
export function combatStep(next: SimulationState, cfg: CompiledConfig, ev: EventCollector, ctx: FsmTickContext): void {
  if (next.result !== null) return;
  applyHits(next.fighters, detectHits(next.fighters, cfg), ev, ctx);
}

/**
 * Step 8: Health 0 -> Defeated, overriding HitStun set in step 7 (Req 35 c9, D6). One
 * Defeated Fighter means the other wins; both on the same Tick means a draw (Req 11 c6-c8, D7).
 */
export function checkHealthZero(next: SimulationState, ev: EventCollector, ctx: FsmTickContext): void {
  if (next.result !== null) return;
  const g = ctx.g;
  const zero = [false, false];
  for (const i of [0, 1] as const) {
    const f = next.fighters[i];
    if (f.health === 0 && f.fsm.kind !== 'Defeated') {
      transition(f, { kind: 'Defeated', enteredAt: g }, 'health-zero', 8, ctx);
      ev.push(f.id, { type: 'fighter-defeated', at: g, fighter: f.id });
      zero[i] = true;
    }
  }
  if (zero[0] && zero[1]) next.result = { kind: 'draw', at: g };
  else if (zero[0]) next.result = { kind: 'win', winner: 'ai', at: g };
  else if (zero[1]) next.result = { kind: 'win', winner: 'player', at: g };
  else return;
  ev.pushGlobal({ type: 'match-result', at: g, result: { ...next.result } });
}
