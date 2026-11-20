// JSON serialization and strict parsing of the Simulation_State (design §10.1; Req 3 c4, c6,
// c8, c9; Req 12 c11; task 9.1).
//
// parseSimulationState never touches any existing state: it builds a fresh one or returns an
// error. Checks run in three stages so a state from another configuration is reported as a
// configuration mismatch rather than as an invalid state (Property 25):
//   1. JSON syntax, exact shape, and configuration-independent ranges and consistency;
//   2. configFingerprint against the active validated config (D42) -> 'config-mismatch';
//   3. configuration-dependent consistency (ring, Health, registry, attack timing, seed).
import { z } from 'zod';
import type { CompiledConfig } from './config/compile';
import { HISTORY_SIZE, observe } from './observation';
import type { FsmState, GTick, SimulationState } from './types';

export type ParseResult =
  | { ok: true; state: SimulationState }
  | { ok: false; error: 'invalid-Simulation_State'; issues: string[] }
  | { ok: false; error: 'config-mismatch'; issues: string[] };

export function serialize(state: SimulationState): string {
  return JSON.stringify(state);
}

// --- Stage 1: shape -----------------------------------------------------------------------

const I32_MIN = -2147483648;
const I32_MAX = 2147483647;
// JSON can spell -0, which no reachable state contains (every integer passes through i32()).
const noNegZero = (v: number) => !Object.is(v, -0);
const int = () => z.number().int().min(I32_MIN).max(I32_MAX).refine(noNegZero, { error: 'must not be -0' });
const nat = () => z.number().int().min(0).max(I32_MAX).refine(noNegZero, { error: 'must not be -0' });
const uint32 = () => z.number().int().min(0).max(4294967295).refine(noNegZero, { error: 'must not be -0' });
const facing = z.union([z.literal(1), z.literal(-1)]);
const fighterId = z.enum(['player', 'ai']);
const phase = z.enum(['startup', 'active', 'recovery']);
const fsmKind = z.enum(['Idle', 'Walking', 'Attacking', 'HitStun', 'Defeated']);
const attackId = z.string().min(1).max(32);

const fsmSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('Idle'), enteredAt: nat() }),
  z.strictObject({ kind: z.literal('Walking'), enteredAt: nat(), dir: facing }),
  z.strictObject({ kind: z.literal('Attacking'), enteredAt: nat(), attackId, phase, contactUsed: z.boolean() }),
  z.strictObject({ kind: z.literal('HitStun'), enteredAt: nat(), until: nat() }),
  z.strictObject({ kind: z.literal('Defeated'), enteredAt: nat() }),
]);

const fighterSchema = z.strictObject({
  id: fighterId,
  x: int(),
  facing,
  health: nat(),
  fsm: fsmSchema,
  lastJabStartAt: nat().nullable(),
});

const observationSchema = z.strictObject({
  at: nat(),
  x: int(),
  facing,
  fsm: fsmKind,
  attackId: attackId.nullable(),
  phase: phase.nullable(),
});

const resultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('win'), winner: fighterId, at: nat() }),
  z.strictObject({ kind: z.literal('draw'), at: nat() }),
]);

const stateSchema = z.strictObject({
  version: z.literal(1),
  ruleset: z.literal('m1'),
  tick: nat(),
  gameplayTick: nat(),
  hitStopRemaining: nat(),
  matchStartAt: nat(),
  seed: uint32(),
  configFingerprint: uint32(),
  rng: z.tuple([uint32(), uint32(), uint32(), uint32()]),
  fighters: z.tuple([fighterSchema, fighterSchema]),
  history: z.strictObject({
    entries: z.array(observationSchema).length(HISTORY_SIZE),
    head: z.number().int().min(0).max(HISTORY_SIZE - 1),
    count: z.number().int().min(1).max(HISTORY_SIZE),
  }),
  result: resultSchema.nullable(),
});

const sameObs = (a: SimulationState['history']['entries'][number], b: SimulationState['history']['entries'][number]) =>
  a.at === b.at && a.x === b.x && a.facing === b.facing && a.fsm === b.fsm && a.attackId === b.attackId && a.phase === b.phase;

/** Configuration-independent consistency (stage 1). */
function structuralIssues(s: SimulationState): string[] {
  const out: string[] = [];
  const g = s.gameplayTick;
  if (g > s.tick) out.push('gameplayTick: greater than tick');
  if (s.hitStopRemaining !== 0) out.push('hitStopRemaining: must be 0 (no Hit_Stop in M1)');
  if (s.matchStartAt > g) out.push('matchStartAt: after gameplayTick');
  if (s.fighters[0].id !== 'player' || s.fighters[1].id !== 'ai') out.push('fighters: must be [player, ai]');

  const [p, a] = s.fighters;
  if (p.x === a.x) out.push('fighters: same position');
  if (p.facing !== (a.x > p.x ? 1 : -1) || a.facing !== (p.x > a.x ? 1 : -1)) out.push('fighters: facing does not point at the opponent');
  for (const f of s.fighters) {
    const st: FsmState = f.fsm;
    if (st.enteredAt > g) out.push(`${f.id}.fsm.enteredAt: after gameplayTick`);
    if (st.kind === 'HitStun' && (st.until <= g || st.until > g + 1000)) out.push(`${f.id}.fsm.until: out of range`);
    if (f.lastJabStartAt !== null && f.lastJabStartAt > g) out.push(`${f.id}.lastJabStartAt: after gameplayTick`);
    if (st.kind === 'Defeated' && (f.health !== 0 || s.result === null)) out.push(`${f.id}: Defeated needs Health 0 and a result`);
  }

  // Result consistency (Req 11 c6-c8).
  const defeated = s.fighters.map((f) => f.fsm.kind === 'Defeated');
  if (s.result === null) {
    if (defeated[0] || defeated[1]) out.push('result: missing for a Defeated Fighter');
  } else {
    if (s.result.at > g || s.result.at < 1) out.push('result.at: out of range');
    const expect =
      s.result.kind === 'draw' ? [true, true] : s.result.winner === 'player' ? [false, true] : [true, false];
    if (defeated[0] !== expect[0] || defeated[1] !== expect[1]) out.push('result: does not match the Defeated Fighters');
  }

  // History (design §10.1).
  const h = s.history;
  const elapsed = g - s.matchStartAt;
  if (h.count !== Math.min(elapsed + 1, HISTORY_SIZE)) out.push('history.count: inconsistent with gameplayTick');
  if (h.head !== elapsed % HISTORY_SIZE) out.push('history.head: inconsistent with gameplayTick');
  for (let off = 0; off < h.count; off++) {
    const e = h.entries[(h.head - off + HISTORY_SIZE) % HISTORY_SIZE]!;
    if (e.at !== g - off) {
      out.push('history.entries: valid entries are not consecutive Gameplay_Ticks ending at gameplayTick');
      break;
    }
  }
  for (const [i, e] of h.entries.entries()) {
    if ((e.fsm === 'Attacking') !== (e.attackId !== null) || (e.attackId === null) !== (e.phase === null)) {
      out.push(`history.entries[${i}]: attackId/phase must be set exactly when Attacking`);
      break;
    }
  }
  if (!sameObs(h.entries[h.head]!, observe(p, g))) out.push('history: newest entry is not the player observation');
  return out;
}

/** Configuration-dependent consistency (stage 3). */
function configIssues(s: SimulationState, cfg: CompiledConfig): string[] {
  const out: string[] = [];
  const g: GTick = s.gameplayTick;
  if (s.seed !== cfg.seed) out.push('seed: differs from the configured seed');
  for (const f of s.fighters) {
    if (f.x < cfg.ring.minFx || f.x > cfg.ring.maxFx) out.push(`${f.id}.x: outside the Ring_Boundary`);
    if (f.health > cfg.maxHealth) out.push(`${f.id}.health: above maxHealth`);
    if (f.fsm.kind === 'Attacking') {
      const atk = cfg.attacks.get(f.fsm.attackId);
      if (atk === undefined) out.push(`${f.id}.fsm.attackId: not in the Attack_Registry`);
      else {
        const e = g - f.fsm.enteredAt;
        const ph = e < atk.startup ? 'startup' : e < atk.startup + atk.active ? 'active' : 'recovery';
        if (e >= atk.total || ph !== f.fsm.phase) out.push(`${f.id}.fsm.phase: inconsistent with the attack timing`);
      }
    }
    if (f.fsm.kind === 'HitStun' && f.fsm.until > g + 120) out.push(`${f.id}.fsm.until: beyond the maximum hit-stun`);
  }
  if (Math.abs(s.fighters[1].x - s.fighters[0].x) < cfg.minSeparationFx) out.push('fighters: closer than minSeparation');
  for (const e of s.history.entries) {
    if (e.attackId !== null && !cfg.attacks.has(e.attackId)) {
      out.push('history.entries: attackId not in the Attack_Registry');
      break;
    }
  }
  return out;
}

/**
 * Parses and validates a serialized Simulation_State against the active compiled config.
 * Malformed JSON, a missing or extra field, a wrong type, a non-finite or out-of-range number,
 * or an inconsistent state gives 'invalid-Simulation_State' (Req 3 c6); a state from a
 * different validated config gives 'config-mismatch' (Req 3 c9, D42).
 */
export function parseSimulationState(json: string, cfg: CompiledConfig): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: 'invalid-Simulation_State', issues: [`malformed JSON: ${(e as Error).message}`] };
  }
  const parsed = stateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'invalid-Simulation_State',
      issues: parsed.error.issues.map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`),
    };
  }
  const state = parsed.data as SimulationState;
  const s1 = structuralIssues(state);
  if (s1.length > 0) return { ok: false, error: 'invalid-Simulation_State', issues: s1 };
  if (state.configFingerprint !== cfg.fingerprint) {
    return {
      ok: false,
      error: 'config-mismatch',
      issues: [`configFingerprint ${state.configFingerprint} differs from the active configuration (${cfg.fingerprint})`],
    };
  }
  const s3 = configIssues(state, cfg);
  if (s3.length > 0) return { ok: false, error: 'invalid-Simulation_State', issues: s3 };
  return { ok: true, state };
}
