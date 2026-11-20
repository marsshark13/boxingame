// Configuration schema and cross-field checks (design §2.7, §7.4; task 4.2).
//
// - Every issue is collected (zod safeParse returns all field issues; cross-field checks
//   append to the same list), each naming the setting: `config.<path>` for game settings and
//   `attacks[<id or index>].<field>` for Attack_Definitions (Req 5 c5).
// - Values are never adjusted or defaulted (Req 7 c11, D22).
// - Spatial cross-field checks run on compiled Fx values, so a value that rounds across a
//   limit is judged exactly as the simulation will use it (design §7.4).
// Jab reachability (Req 15 c7-c8) needs the compiled boxes and runs in compile.ts.
import { z } from 'zod';
import { toFx } from '../fixed';
import type { AttackDefinition } from '../types';

export interface GameConfig {
  ring: { min: number; max: number };
  start: { player: number; ai: number };
  minSeparation: number;
  walkSpeed: number;
  hurtbox: { w: number; h: number; centerY: number };
  maxHealth: number;
  ai: { enabled: boolean; reactionDelay: number; attackInterval: number };
  seed: number;
  attacks: AttackDefinition[];
}

export interface ConfigError {
  /** The failing setting, e.g. `config.maxHealth` or `attacks[jab].startup` or `attacks[2].id`. */
  setting: string;
  message: string;
}

export function formatConfigError(e: ConfigError): string {
  return `${e.setting}: ${e.message}`;
}

export type ValidationResult = { ok: true; config: GameConfig } | { ok: false; errors: ConfigError[] };

/** Attack Tick-field ranges (D2). */
export const TICK_RANGES = {
  startup: [1, 60],
  active: [1, 60],
  recovery: [0, 60],
  hitStun: [0, 120],
  blockStun: [0, 120],
} as const;

export const UINT32_MAX = 4294967295;

// --- Field schema builders --------------------------------------------------------------

const missingOr = (msg: string) => (iss: { input: unknown }) => (iss.input === undefined ? 'missing' : msg);

const finite = () => z.number({ error: missingOr('must be a finite number') });
const intRange = (lo: number, hi: number) =>
  finite().refine((v) => Number.isInteger(v) && v >= lo && v <= hi, { error: `must be an integer ${lo}-${hi}` });
const nonNegative = () => finite().refine((v) => v >= 0, { error: 'must be greater than or equal to 0' });
const positive = () => finite().refine((v) => v > 0, { error: 'must be greater than 0' });
const obj = <S extends z.ZodRawShape>(shape: S) => z.object(shape, { error: missingOr('must be an object') });

const attackSchema = obj({
  id: z
    .string({ error: missingOr('must be a string') })
    .refine((s) => s.length >= 1 && s.length <= 32, { error: 'must be 1-32 characters' }),
  startup: intRange(...TICK_RANGES.startup),
  active: intRange(...TICK_RANGES.active),
  recovery: intRange(...TICK_RANGES.recovery),
  damage: nonNegative(),
  staminaCost: nonNegative(),
  guardDamage: nonNegative(),
  hitStun: intRange(...TICK_RANGES.hitStun),
  blockStun: intRange(...TICK_RANGES.blockStun),
  hitbox: obj({
    offset: obj({ x: nonNegative(), y: nonNegative() }),
    size: obj({ w: positive(), h: positive() }),
  }),
});

const configSchema = obj({
  ring: obj({ min: finite(), max: finite() }),
  start: obj({ player: finite(), ai: finite() }),
  minSeparation: positive(),
  walkSpeed: positive(),
  hurtbox: obj({ w: positive(), h: positive(), centerY: finite() }),
  maxHealth: intRange(1, 1000),
  ai: obj({
    enabled: z.boolean({ error: missingOr('must be true or false') }),
    reactionDelay: intRange(0, 120),
    attackInterval: intRange(1, 600),
  }),
  seed: intRange(0, UINT32_MAX),
  attacks: z.array(attackSchema, { error: missingOr('must be an array') }),
});

// --- Validation -------------------------------------------------------------------------

function isValidId(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 1 && v.length <= 32;
}

/**
 * Registry labels: an attack is named by its id when the id is valid and this is its first
 * occurrence, otherwise by its registry position (Req 5 c5).
 */
function attackLabels(rawAttacks: unknown): string[] {
  if (!Array.isArray(rawAttacks)) return [];
  const seen = new Set<string>();
  return rawAttacks.map((a, i) => {
    const id = a !== null && typeof a === 'object' ? (a as { id?: unknown }).id : undefined;
    if (isValidId(id) && !seen.has(id)) {
      seen.add(id);
      return id;
    }
    return String(i);
  });
}

function settingFor(path: readonly PropertyKey[], labels: readonly string[]): string {
  if (path.length === 0) return 'config';
  if (path[0] === 'attacks') {
    if (path.length === 1) return 'attacks';
    const i = path[1] as number;
    const rest = path.slice(2).map(String);
    return [`attacks[${labels[i] ?? String(i)}]`, ...rest].join('.');
  }
  return ['config', ...path.map(String)].join('.');
}

function get(o: unknown, ...keys: string[]): unknown {
  let cur = o;
  for (const k of keys) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** Validates a raw (untrusted) config. Produces the parsed config only if there are no errors. */
export function validateConfig(raw: unknown): ValidationResult {
  const rawAttacks = get(raw, 'attacks');
  const labels = attackLabels(rawAttacks);
  const errors: ConfigError[] = [];
  const invalid = new Set<string>(); // settings with a field error, for skipping dependent checks

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      const setting = settingFor(iss.path, labels);
      errors.push({ setting, message: iss.message });
      invalid.add(iss.path.map(String).join('.'));
    }
  }
  // A path is unusable when it, one of its descendants, or one of its ancestors had a field error.
  const bad = (...paths: string[]) =>
    paths.some((p) =>
      [...invalid].some((q) => q === '' || q === p || q.startsWith(`${p}.`) || p.startsWith(`${q}.`)),
    );
  const okNum = (...keys: string[]): number | null => (bad(keys.join('.')) ? null : (get(raw, ...keys) as number));

  // --- Registry checks (Req 5 c5-c6, Req 9 c1) ---
  if (Array.isArray(rawAttacks)) {
    if (rawAttacks.length === 0) {
      errors.push({ setting: 'attacks', message: 'empty registry' });
    } else {
      const firstIndex = new Map<string, number>();
      rawAttacks.forEach((a, i) => {
        const id = get(a, 'id');
        if (!isValidId(id)) return;
        const first = firstIndex.get(id);
        if (first === undefined) firstIndex.set(id, i);
        else errors.push({ setting: `attacks[${i}].id`, message: `duplicate identifier '${id}' (first used at attacks[${first}])` });
      });
      const attackOk = (i: number) => !bad(`attacks.${i}`);
      const jabIdx = firstIndex.get('jab');
      if (jabIdx === undefined) {
        errors.push({ setting: 'attacks', message: "missing 'jab' Attack_Definition (Req 9 c1)" });
      } else if (attackOk(jabIdx)) {
        const jabStartup = get(rawAttacks[jabIdx], 'startup') as number;
        rawAttacks.forEach((a, i) => {
          if (i === jabIdx || !attackOk(i)) return;
          const s = get(a, 'startup') as number;
          if (s <= jabStartup) {
            errors.push({
              setting: 'attacks[jab].startup',
              message: `must be strictly lower than the startup of every other attack (attacks[${labels[i]}] has ${s}; Req 9 c1)`,
            });
          }
        });
      }
      // Sizes that round to 0 Fx would make a zero-width box in the simulation.
      rawAttacks.forEach((a, i) => {
        for (const k of ['w', 'h'] as const) {
          if (bad(`attacks.${i}.hitbox.size.${k}`)) continue;
          const v = get(a, 'hitbox', 'size', k);
          if (typeof v === 'number' && v > 0 && toFx(v) <= 0) {
            errors.push({ setting: `attacks[${labels[i]}].hitbox.size.${k}`, message: 'must be at least 0.001 world units' });
          }
        }
      });
    }
  }

  // --- Spatial values that must stay positive after conversion to Fx ---
  for (const keys of [['minSeparation'], ['walkSpeed'], ['hurtbox', 'w'], ['hurtbox', 'h']]) {
    const v = okNum(...keys);
    if (v !== null && toFx(v) <= 0) errors.push({ setting: `config.${keys.join('.')}`, message: 'must be at least 0.001 world units' });
  }

  // --- Ring and start positions, on compiled Fx values (design §7.4; Req 7 c7, c11) ---
  const rMin = okNum('ring', 'min');
  const rMax = okNum('ring', 'max');
  const sep = okNum('minSeparation');
  const ringOk = rMin !== null && rMax !== null;
  if (ringOk && sep !== null && toFx(rMax) - toFx(rMin) <= toFx(sep)) {
    errors.push({ setting: 'config.ring', message: `width (${rMax - rMin}) must be greater than minSeparation (${sep})` });
  }
  const sp = okNum('start', 'player');
  const sa = okNum('start', 'ai');
  if (ringOk) {
    const lo = toFx(rMin);
    const hi = toFx(rMax);
    if (sp !== null && (toFx(sp) < lo || toFx(sp) > hi)) errors.push({ setting: 'config.start.player', message: 'outside ring boundary' });
    if (sa !== null && (toFx(sa) < lo || toFx(sa) > hi)) errors.push({ setting: 'config.start.ai', message: 'outside ring boundary' });
  }
  if (sp !== null && sa !== null && sep !== null && Math.abs(toFx(sa) - toFx(sp)) < toFx(sep)) {
    errors.push({ setting: 'config.start', message: `distance (${Math.abs(sa - sp)}) below minSeparation (${sep})` });
  }

  if (errors.length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, config: parsed.data as GameConfig };
}
