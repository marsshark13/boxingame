// Validated config -> CompiledConfig (design §2.1, §2.5, §8.4; task 4.3).
// Converts every spatial value to Fx exactly once, derives the attack boxes and reach, runs
// the jab reachability checks (Req 15 c7-c8), and computes the fingerprint (D42).
import { toFx } from '../fixed';
import { configFingerprint } from '../fingerprint';
import type { AttackDefinition, AttackId, CompiledAttack, Fx } from '../types';
import { validateConfig, type ConfigError, type GameConfig } from './schema';

export interface CompiledConfig {
  /** The validated authored config (world units). Deep-frozen. */
  readonly source: Readonly<GameConfig>;
  readonly ring: { readonly minFx: Fx; readonly maxFx: Fx };
  readonly start: { readonly playerFx: Fx; readonly aiFx: Fx };
  readonly minSeparationFx: Fx;
  readonly walkSpeedFx: Fx;
  /** Hurtbox, centered on the Fighter's x; `centerY` is the box center height. */
  readonly hurtFx: { readonly w: Fx; readonly h: Fx; readonly centerY: Fx };
  readonly maxHealth: number;
  readonly ai: { readonly enabled: boolean; readonly reactionDelay: number; readonly attackInterval: number };
  readonly seed: number;
  /** Attack_Registry by id (first occurrence; duplicates are rejected by validation). */
  readonly attacks: ReadonlyMap<AttackId, CompiledAttack>;
  /** Attack_Registry in registry order. */
  readonly attackList: readonly CompiledAttack[];
  readonly jab: CompiledAttack;
  /** uint32 FNV-1a fingerprint of the validated config (D42). */
  readonly fingerprint: number;
}

export type LoadResult = { ok: true; config: CompiledConfig } | { ok: false; errors: ConfigError[] };

export interface HurtboxFx {
  w: Fx;
  h: Fx;
  centerY: Fx;
}

export interface ReachInfo {
  /** Hitbox and Hurtbox overlap vertically; independent of distance. */
  vertical: boolean;
  /** 2*ox + w + hurt.w, doubled Fx: far-edge bound (2d must be strictly below it). */
  connectRange2: number;
  /** 2*ox - w - hurt.w, doubled Fx: near-edge bound (2d must be strictly above it). */
  nearEdge2: number;
  /** Integer Fx distances in [minSeparation, ring width] at which the attack connects, or null. */
  reach: { dLo: Fx; dHi: Fx } | null;
}

/**
 * Connect interval of an attack facing its opponent (design §8.4). With the attacker at 0
 * and the target at distance d > 0, strict overlap reduces to: vertical overlap, 2d > nearEdge2,
 * and 2d < connectRange2.
 */
export function computeReach(
  hb: { ox: Fx; oy: Fx; w: Fx; h: Fx },
  hurt: HurtboxFx,
  minSeparationFx: Fx,
  ringWidthFx: Fx,
): ReachInfo {
  const connectRange2 = 2 * hb.ox + hb.w + hurt.w;
  const nearEdge2 = 2 * hb.ox - hb.w - hurt.w;
  const vertical = Math.abs(2 * hb.oy - 2 * hurt.centerY) < hb.h + hurt.h;
  const dLo = Math.max(minSeparationFx, Math.floor(nearEdge2 / 2) + 1);
  const dHi = Math.min(ringWidthFx, Math.ceil(connectRange2 / 2) - 1);
  return { vertical, connectRange2, nearEdge2, reach: vertical && dLo <= dHi ? { dLo, dHi } : null };
}

function compileAttack(def: AttackDefinition, hurt: HurtboxFx, sFx: Fx, widthFx: Fx): CompiledAttack {
  const hitboxFx = Object.freeze({
    ox: toFx(def.hitbox.offset.x),
    oy: toFx(def.hitbox.offset.y),
    w: toFx(def.hitbox.size.w),
    h: toFx(def.hitbox.size.h),
  });
  const r = computeReach(hitboxFx, hurt, sFx, widthFx);
  return Object.freeze({
    ...def,
    hitboxFx,
    total: def.startup + def.active + def.recovery,
    reachFx: hitboxFx.ox + Math.floor(hitboxFx.w / 2),
    connectRange2: r.connectRange2,
    nearEdge2: r.nearEdge2,
    reach: r.reach === null ? null : Object.freeze(r.reach),
  });
}

/** Compiles a config that already passed validateConfig. Adds the jab reachability checks. */
export function compileConfig(cfg: GameConfig): LoadResult {
  const source = deepFreeze(JSON.parse(JSON.stringify(cfg)) as GameConfig);
  const ring = { minFx: toFx(source.ring.min), maxFx: toFx(source.ring.max) };
  const minSeparationFx = toFx(source.minSeparation);
  const widthFx = ring.maxFx - ring.minFx;
  const hurtFx = { w: toFx(source.hurtbox.w), h: toFx(source.hurtbox.h), centerY: toFx(source.hurtbox.centerY) };

  const attackList = source.attacks.map((a) => compileAttack(a, hurtFx, minSeparationFx, widthFx));
  const attacks = new Map<AttackId, CompiledAttack>();
  for (const a of attackList) if (!attacks.has(a.id)) attacks.set(a.id, a);
  const jab = attacks.get('jab');
  if (jab === undefined) return { ok: false, errors: [{ setting: 'attacks', message: "missing 'jab' Attack_Definition (Req 9 c1)" }] };

  // Req 15 c8: the jab must connect at some distance >= minSeparation.
  if (jab.reach === null) {
    return { ok: false, errors: [{ setting: 'attacks[jab]', message: 'cannot connect at any distance >= minSeparation' }] };
  }
  // Req 15 c7: every distance at which the AI jabs ([minSeparation, Connect_Range)) must connect.
  if (jab.nearEdge2 >= 2 * minSeparationFx) {
    return { ok: false, errors: [{ setting: 'attacks[jab]', message: 'near edge exceeds minSeparation; AI jab distances would miss' }] };
  }

  const config: CompiledConfig = Object.freeze({
    source,
    ring: Object.freeze(ring),
    start: Object.freeze({ playerFx: toFx(source.start.player), aiFx: toFx(source.start.ai) }),
    minSeparationFx,
    walkSpeedFx: toFx(source.walkSpeed),
    hurtFx: Object.freeze(hurtFx),
    maxHealth: source.maxHealth,
    ai: source.ai,
    seed: source.seed,
    attacks,
    attackList: Object.freeze(attackList),
    jab,
    fingerprint: configFingerprint(source),
  });
  return { ok: true, config };
}

/** Validates and compiles a raw config. Nothing is produced unless every check passes (Req 5 c4). */
export function loadConfig(raw: unknown): LoadResult {
  const v = validateConfig(raw);
  if (!v.ok) return v;
  return compileConfig(v.config);
}

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}
