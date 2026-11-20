// Feature: project-ring, Property 22: Attack definition validation reports every invalid field
// For any valid Attack_Registry and any non-empty set of field corruptions, loading the config
// fails and reports exactly the corrupted fields, each labeled with the attack id, or with its
// registry position when the id is the corrupted field. (Validates: Requirements 5.4, 5.5)
//
// createMatch (task 9.2) refuses exactly when loadConfig refuses; this property targets loadConfig.
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { loadConfig } from './compile';
import { defaultConfig } from './defaults';
import { TICK_RANGES, type GameConfig } from './schema';
import type { AttackDefinition } from '../types';

type TickField = keyof typeof TICK_RANGES;
const TICK_FIELDS = Object.keys(TICK_RANGES) as TickField[];
const NUM_FIELDS = ['damage', 'staminaCost', 'guardDamage', 'hitbox.offset.x', 'hitbox.offset.y'] as const;
const SIZE_FIELDS = ['hitbox.size.w', 'hitbox.size.h'] as const;
const FIELDS = ['id', ...TICK_FIELDS, ...NUM_FIELDS, ...SIZE_FIELDS] as const;
type Field = (typeof FIELDS)[number];

const MISSING = Symbol('missing');
type Corruption = { attack: number; field: Field; kind: number };

const thousandths = (lo: number, hi: number) => fc.integer({ min: lo, max: hi }).map((n) => n / 1000);

/** A valid non-jab attack whose startup is strictly greater than the jab's. */
const arbOtherAttack = (id: string, jabStartup: number): fc.Arbitrary<AttackDefinition> =>
  fc.record({
    id: fc.constant(id),
    startup: fc.integer({ min: jabStartup + 1, max: 60 }),
    active: fc.integer({ min: 1, max: 60 }),
    recovery: fc.integer({ min: 0, max: 60 }),
    damage: thousandths(0, 50_000),
    staminaCost: thousandths(0, 200_000),
    guardDamage: thousandths(0, 200_000),
    hitStun: fc.integer({ min: 0, max: 120 }),
    blockStun: fc.integer({ min: 0, max: 120 }),
    hitbox: fc.record({
      offset: fc.record({ x: thousandths(0, 2000), y: thousandths(0, 3000) }),
      size: fc.record({ w: thousandths(1, 2000), h: thousandths(1, 2000) }),
    }),
  });

const arbRegistry = fc
  .record({
    jabStartup: fc.integer({ min: 1, max: 40 }),
    ids: fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9_]{0,31}$/).filter((s) => s !== 'jab'), { maxLength: 3 }),
  })
  .chain(({ jabStartup, ids }) => {
    const jab = { ...defaultConfig().attacks[0]!, startup: jabStartup };
    return fc.tuple(...ids.map((id) => arbOtherAttack(id, jabStartup))).map((others) => [jab, ...others]);
  });

const arbCase = arbRegistry.chain((attacks) => {
  const pairs = attacks.flatMap((_, i) =>
    FIELDS.filter((f) => !(f === 'id' && i === 0)) // the jab's id stays: removing it is a registry-level error
      .map((field) => ({ attack: i, field })),
  );
  return fc
    .uniqueArray(fc.constantFrom(...pairs), { minLength: 1, maxLength: 6, selector: (p) => `${p.attack}:${p.field}` })
    .chain((chosen) =>
      fc.tuple(...chosen.map((p) => fc.nat({ max: 99 }).map((kind): Corruption => ({ ...p, kind })))).map((cs) => ({ attacks, corruptions: cs })),
    );
});

function setPath(obj: Record<string, unknown>, path: string, v: unknown) {
  const keys = path.split('.');
  let cur = obj;
  for (const k of keys.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
  const last = keys[keys.length - 1]!;
  if (v === MISSING) delete cur[last];
  else cur[last] = v;
}
function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj);
}

function corruptValue(field: Field, current: unknown, kind: number): unknown {
  if ((TICK_FIELDS as readonly string[]).includes(field)) {
    const [lo, hi] = TICK_RANGES[field as TickField];
    const opts = [MISSING, Number.NaN, Number.POSITIVE_INFINITY, Math.min(Number(current), hi - 1) + 0.5, lo - 1, hi + 1];
    return opts[kind % opts.length];
  }
  if ((NUM_FIELDS as readonly string[]).includes(field)) {
    const opts = [MISSING, Number.NaN, Number.NEGATIVE_INFINITY, -(Number(current) + 1)];
    return opts[kind % opts.length];
  }
  // size fields
  const opts = [MISSING, Number.NaN, Number.POSITIVE_INFINITY, 0, -(Number(current) + 0.5)];
  return opts[kind % opts.length];
}

test.prop([arbCase])('Property 22: every corrupted field is reported, and only those', ({ attacks, corruptions }) => {
  const cfg = defaultConfig();
  cfg.attacks = JSON.parse(JSON.stringify(attacks)) as GameConfig['attacks'];
  const regs = cfg.attacks as unknown as Record<string, unknown>[];

  // Apply id corruptions first, so duplicates only copy ids that stay valid and first-seen.
  const idBroken = new Set<number>();
  for (const c of corruptions.filter((c) => c.field === 'id')) {
    if (c.kind % 2 === 0) {
      setPath(regs[c.attack]!, 'id', MISSING);
    } else {
      const sources = regs.map((_, j) => j).filter((j) => j < c.attack && !idBroken.has(j));
      setPath(regs[c.attack]!, 'id', regs[sources[c.kind % sources.length]!]!['id']); // jab (0) always qualifies
    }
    idBroken.add(c.attack);
  }
  for (const c of corruptions.filter((c) => c.field !== 'id')) {
    setPath(regs[c.attack]!, c.field, corruptValue(c.field, getPath(regs[c.attack]!, c.field), c.kind));
  }

  const label = (i: number) => (idBroken.has(i) ? String(i) : (attacks[i]!.id as string));
  const expected = new Set(corruptions.map((c) => `attacks[${label(c.attack)}].${c.field}`));

  const r = loadConfig(cfg);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(new Set(r.errors.map((e) => e.setting))).toEqual(expected);
});
