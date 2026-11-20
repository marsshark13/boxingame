// Default GameConfig for M1, in world units (task 4.1).
//
// PROVISIONAL M1 DEFAULTS, approved by the project owner (docs/m1-decisions.md). The spec
// gives no Part 1 values for: ring, start positions, walkSpeed, maxHealth, ai.reactionDelay,
// ai.attackInterval, and seed. Do not change them without the owner's approval.
//
// Hurtbox, minSeparation, and the jab come from design §P2.4.4 ("Part 1 default geometry").
import { M1_ATTACKS } from './attacks';
import type { GameConfig } from './schema';

export const DEFAULT_CONFIG: GameConfig = deepFreeze({
  ring: { min: -3, max: 3 }, // provisional
  start: { player: -1.5, ai: 1.5 }, // provisional
  minSeparation: 0.8,
  walkSpeed: 0.04, // provisional; world units per Tick (2.4 units/s)
  hurtbox: { w: 0.5, h: 1.8, centerY: 0.9 },
  maxHealth: 100, // provisional
  ai: {
    enabled: true,
    reactionDelay: 12, // provisional; Ticks
    attackInterval: 45, // provisional; Ticks
  },
  seed: 1, // provisional
  attacks: M1_ATTACKS.map((a) => cloneJson(a)),
});

/** A fresh, mutable deep copy of the default config (for tests and variants). */
export function defaultConfig(): GameConfig {
  return cloneJson(DEFAULT_CONFIG);
}

/** Deep copy of plain JSON data. */
export function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function deepFreeze<T>(v: T): T {
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
    Object.freeze(v);
  }
  return v;
}
