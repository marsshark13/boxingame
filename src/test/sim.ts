// Shared simulation test helpers and generators (design §13.2).
// Generators build valid configs constructively, including the jab reachability rules of
// design §8.4, and bias toward small rings, low maxHealth, and aligned hitboxes so that
// walls, hits, and defeats happen often.
import fc from 'fast-check';
import { expect } from 'vitest';
import { loadConfig, type CompiledConfig } from '../sim/config/compile';
import { defaultConfig } from '../sim/config/defaults';
import type { GameConfig } from '../sim/config/schema';
import {
  COMMAND_BITS,
  type CommandMask,
  type CommandType,
  type FighterCommand,
  type FighterId,
  type SimulationState,
  type TickInput,
} from '../sim/types';

// --- Config helpers ---------------------------------------------------------------------

export function compile(raw: unknown): CompiledConfig {
  const r = loadConfig(raw);
  if (!r.ok) throw new Error(`config refused: ${r.errors.map((e) => `${e.setting}: ${e.message}`).join('; ')}`);
  return r.config;
}

/** The default config compiled, with optional edits. */
export function cfgWith(edit?: (c: GameConfig) => void): CompiledConfig {
  const c = defaultConfig();
  edit?.(c);
  return compile(c);
}

// --- Equality ---------------------------------------------------------------------------

/**
 * Deep equality for plain data with Object.is on primitives (so 0 and -0 differ), the same
 * own enumerable keys, and the same array lengths. Much faster than toStrictEqual; tests call
 * expectSame(), which falls back to toStrictEqual only to print a diff on mismatch.
 */
export function deepEqualStrict(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqualStrict(a[i], bb[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqualStrict((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

/**
 * Per-Tick comparison for long runs (design §14.2 mitigation): every field of both states
 * except the 120 older history slots. Those slots are only ever written as "newest entry",
 * so comparing entries[head] on every Tick plus one full deepEqualStrict at the end covers them.
 */
export function sameCompact(a: SimulationState, b: SimulationState): boolean {
  return (
    a.tick === b.tick &&
    a.gameplayTick === b.gameplayTick &&
    a.hitStopRemaining === b.hitStopRemaining &&
    a.matchStartAt === b.matchStartAt &&
    a.seed === b.seed &&
    a.configFingerprint === b.configFingerprint &&
    a.version === b.version &&
    a.ruleset === b.ruleset &&
    deepEqualStrict(a.rng, b.rng) &&
    deepEqualStrict(a.fighters, b.fighters) &&
    deepEqualStrict(a.result, b.result) &&
    a.history.head === b.history.head &&
    a.history.count === b.history.count &&
    deepEqualStrict(a.history.entries[a.history.head], b.history.entries[b.history.head])
  );
}

export function expectSame(actual: unknown, expected: unknown, message?: string): void {
  if (deepEqualStrict(actual, expected)) return;
  expect(actual, message).toStrictEqual(expected);
  throw new Error(`${message ?? 'values differ'} (deepEqualStrict)`); // e.g. -0 vs 0, which toStrictEqual may accept
}

// --- Commands ---------------------------------------------------------------------------

const COMMAND_ORDER = Object.keys(COMMAND_BITS) as CommandType[];

/** List-form commands for a mask, in a fixed order. */
export function maskToCommands(fighter: FighterId, mask: CommandMask): FighterCommand[] {
  const out: FighterCommand[] = [];
  for (const type of COMMAND_ORDER) if (mask & COMMAND_BITS[type]) out.push({ fighter, type });
  return out;
}

export function tickInput(playerMask: CommandMask, aiMask: CommandMask = 0): TickInput {
  return [...maskToCommands('player', playerMask), ...maskToCommands('ai', aiMask)];
}

// --- Generators -------------------------------------------------------------------------

export interface ArbConfigOptions {
  /** Fix ai.enabled; otherwise generated. */
  aiEnabled?: boolean;
}

const perMille = fc.integer({ min: 0, max: 1000 });

/** arbConfig (design §13.2): a valid raw GameConfig in world units. */
export function arbConfig(opts: ArbConfigOptions = {}): fc.Arbitrary<GameConfig> {
  return fc
    .record({
      S: fc.integer({ min: 500, max: 2000 }),
      W: fc.oneof({ weight: 3, arbitrary: fc.integer({ min: 4000, max: 6000 }) }, { weight: 1, arbitrary: fc.integer({ min: 4000, max: 20000 }) }),
      ringMin: fc.integer({ min: -10000, max: 0 }),
      walk: fc.integer({ min: 10, max: 200 }),
      hw: fc.integer({ min: 200, max: 1000 }),
      hh: fc.integer({ min: 1000, max: 2500 }),
      w: fc.integer({ min: 50, max: 800 }),
      h: fc.integer({ min: 50, max: 600 }),
      oxT: perMille,
      oyT: perMille,
      gap: fc.oneof({ weight: 3, arbitrary: fc.integer({ min: 0, max: 600 }) }, { weight: 1, arbitrary: fc.integer({ min: 0, max: 3000 }) }),
      posT: perMille,
      playerLeft: fc.boolean(),
      startup: fc.oneof(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 1, max: 60 })),
      active: fc.oneof(fc.integer({ min: 1, max: 4 }), fc.integer({ min: 1, max: 60 })),
      recovery: fc.oneof(fc.integer({ min: 0, max: 10 }), fc.integer({ min: 0, max: 60 })),
      damage: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 50000 }).map((n) => n / 1000)),
      hitStun: fc.oneof({ weight: 2, arbitrary: fc.constant(0) }, { weight: 2, arbitrary: fc.integer({ min: 0, max: 30 }) }, { weight: 1, arbitrary: fc.integer({ min: 0, max: 120 }) }),
      blockStun: fc.integer({ min: 0, max: 120 }),
      maxHealth: fc.oneof({ weight: 3, arbitrary: fc.integer({ min: 1, max: 20 }) }, { weight: 1, arbitrary: fc.integer({ min: 1, max: 1000 }) }),
      reactionDelay: fc.integer({ min: 0, max: 120 }),
      attackInterval: fc.oneof(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 1, max: 600 })),
      seed: fc.integer({ min: 0, max: 0xffffffff }),
      aiEnabled: opts.aiEnabled === undefined ? fc.boolean() : fc.constant(opts.aiEnabled),
    })
    .map((g): GameConfig => {
      const cy = Math.floor(g.hh / 2);
      // Strict far and near edges around minSeparation (design §8.4): 2S - w - hw < 2ox < 2S + w + hw.
      const oxMin = Math.max(0, Math.floor((2 * g.S - g.w - g.hw) / 2) + 1);
      const oxMax = Math.ceil((2 * g.S + g.w + g.hw) / 2) - 1;
      const ox = oxMin + Math.floor((g.oxT * (oxMax - oxMin)) / 1000);
      // Vertical overlap: |oy - cy| < (h + hh) / 2.
      const vr = Math.ceil((g.h + g.hh) / 2) - 1;
      const oyMin = Math.max(0, cy - vr);
      const oy = oyMin + Math.floor((g.oyT * (cy + vr - oyMin)) / 1000);
      const D = g.S + Math.min(g.gap, g.W - g.S);
      const left = g.ringMin + Math.floor((g.posT * (g.W - D)) / 1000);
      const right = left + D;
      const u = (fx: number) => fx / 1000;
      return {
        ring: { min: u(g.ringMin), max: u(g.ringMin + g.W) },
        start: { player: u(g.playerLeft ? left : right), ai: u(g.playerLeft ? right : left) },
        minSeparation: u(g.S),
        walkSpeed: u(g.walk),
        hurtbox: { w: u(g.hw), h: u(g.hh), centerY: u(cy) },
        maxHealth: g.maxHealth,
        ai: { enabled: g.aiEnabled, reactionDelay: g.reactionDelay, attackInterval: g.attackInterval },
        seed: g.seed,
        attacks: [
          {
            id: 'jab',
            startup: g.startup,
            active: g.active,
            recovery: g.recovery,
            damage: g.damage,
            staminaCost: 60,
            guardDamage: 60,
            hitStun: g.hitStun,
            blockStun: g.blockStun,
            hitbox: { offset: { x: u(ox), y: u(oy) }, size: { w: u(g.w), h: u(g.h) } },
          },
        ],
      };
    });
}

const COMMON_MASKS = [0, 1, 2, 3, 4, 5, 6, 7, 1 | 4, 2 | 4];

/** One Tick mask: common M1 combinations, or any of the 8 bits. */
export const arbMask: fc.Arbitrary<CommandMask> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...COMMON_MASKS) },
  { weight: 1, arbitrary: fc.integer({ min: 0, max: 255 }) },
);

/** arbTickMasks: `min..max` masks built from runs (held keys, idle stretches, jab spam). */
export function arbTickMasks(min = 1, max = 600): fc.Arbitrary<CommandMask[]> {
  return fc.integer({ min, max }).chain((len) =>
    len === 0
      ? fc.constant<CommandMask[]>([])
      : fc
      .array(fc.record({ mask: arbMask, n: fc.integer({ min: 1, max: 40 }) }), { minLength: 1, maxLength: len })
      .map((runs) => {
        const out: number[] = [];
        let r = 0;
        while (out.length < len) {
          const run = runs[r % runs.length]!;
          for (let k = 0; k < run.n && out.length < len; k++) out.push(run.mask);
          r++;
        }
        return out;
      }),
  );
}

/** Pairs of masks (player, ai) for configs with the AI disabled. */
export function arbMaskPairs(min = 1, max = 600): fc.Arbitrary<Array<[CommandMask, CommandMask]>> {
  return fc.integer({ min, max }).chain((len) =>
    fc.tuple(arbTickMasks(len, len), arbTickMasks(len, len)).map(([p, a]) => p.map((m, i): [number, number] => [m, a[i]!])),
  );
}

/** Entries that must be ignored by intake (Req 2 c7; and P2 types in M1). */
export const arbJunkEntry: fc.Arbitrary<unknown> = fc.oneof(
  fc.record({ fighter: fc.constantFrom('referee', '', 'Player', 'AI', null, 42), type: fc.constantFrom<CommandType>('jab', 'move-left', 'move-right') }),
  fc.record({ fighter: fc.constantFrom<FighterId>('player', 'ai'), type: fc.constantFrom('kick', '', 'JAB', 'toString', '__proto__', null, 7) }),
  fc.record({ fighter: fc.constantFrom<FighterId>('player', 'ai'), type: fc.constantFrom<CommandType>('cross', 'hook', 'uppercut', 'block', 'slip') }),
  fc.constantFrom(null, undefined, 5, 'jab', [], {}),
);
