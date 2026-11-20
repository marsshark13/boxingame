// Task 4.6: configuration validation and fingerprint unit tests.
// Req 5 c5-c6, 7 c7, 7 c11, 9 c1, 11 c9, 15 c1(d), 15 c8, 3 c8.
import { describe, expect, it } from 'vitest';
import { canonicalJson, configFingerprint, fnv1a32 } from '../fingerprint';
import { defaultConfig, DEFAULT_CONFIG } from './defaults';
import { loadConfig } from './compile';
import { TICK_RANGES, type ConfigError, type GameConfig } from './schema';

type Mutable = Record<string, unknown>;

function errorsFor(mutate: (c: GameConfig & Mutable) => void): ConfigError[] {
  const c = defaultConfig() as GameConfig & Mutable;
  mutate(c);
  const r = loadConfig(c);
  expect(r.ok, 'expected the config to be refused').toBe(false);
  if (r.ok) return [];
  expect('config' in r).toBe(false); // nothing produced (Req 5 c4)
  return r.errors;
}
const settings = (errs: ConfigError[]) => errs.map((e) => e.setting);
const jab = (c: GameConfig) => c.attacks[0] as unknown as Mutable & { hitbox: { offset: Mutable; size: Mutable } };

describe('default configuration', () => {
  it('validates and compiles', () => {
    const r = loadConfig(defaultConfig());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.config;
    expect(c.ring).toEqual({ minFx: -3000, maxFx: 3000 });
    expect(c.start).toEqual({ playerFx: -1500, aiFx: 1500 });
    expect(c.minSeparationFx).toBe(800);
    expect(c.walkSpeedFx).toBe(40);
    expect(c.hurtFx).toEqual({ w: 500, h: 1800, centerY: 900 });
    expect(c.maxHealth).toBe(100);
    expect(c.ai).toEqual({ enabled: true, reactionDelay: 12, attackInterval: 45 });
    expect(c.seed).toBe(1);
    expect(c.jab.hitboxFx).toEqual({ ox: 500, oy: 1450, w: 400, h: 250 });
    expect(c.jab.total).toBe(14);
    expect(c.jab.reachFx).toBe(700);
    expect(c.jab.connectRange2).toBe(1900); // Connect_Range 0.95
    expect(c.jab.nearEdge2).toBe(100);
    expect(c.jab.reach).toEqual({ dLo: 800, dHi: 949 });
  });

  it('records the provisional M1 defaults exactly', () => {
    expect(DEFAULT_CONFIG.ring).toEqual({ min: -3, max: 3 });
    expect(DEFAULT_CONFIG.start).toEqual({ player: -1.5, ai: 1.5 });
    expect(DEFAULT_CONFIG.walkSpeed).toBe(0.04);
    expect(DEFAULT_CONFIG.maxHealth).toBe(100);
    expect(DEFAULT_CONFIG.ai.reactionDelay).toBe(12);
    expect(DEFAULT_CONFIG.ai.attackInterval).toBe(45);
    expect(DEFAULT_CONFIG.seed).toBe(1);
  });

  it('is frozen, and defaultConfig() returns independent copies', () => {
    expect(Object.isFrozen(DEFAULT_CONFIG)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CONFIG.attacks[0]?.hitbox.size)).toBe(true);
    const a = defaultConfig();
    a.maxHealth = 5;
    expect(defaultConfig().maxHealth).toBe(100);
  });

  it('compiled config is immutable', () => {
    const r = loadConfig(defaultConfig());
    if (!r.ok) throw new Error('default config refused');
    expect(Object.isFrozen(r.config)).toBe(true);
    expect(Object.isFrozen(r.config.source.attacks[0])).toBe(true);
    expect(Object.isFrozen(r.config.jab)).toBe(true);
  });
});

describe('game setting validation', () => {
  it('ring width equal to minSeparation is refused (Req 7 c7)', () => {
    const errs = errorsFor((c) => {
      c.ring = { min: -0.4, max: 0.4 };
      c.start = { player: -0.4, ai: 0.4 };
    });
    expect(settings(errs)).toContain('config.ring');
  });
  it('ring width below minSeparation is refused (Req 7 c7)', () => {
    const errs = errorsFor((c) => {
      c.ring = { min: 0, max: 0.5 };
      c.start = { player: 0, ai: 0.5 };
    });
    expect(settings(errs)).toContain('config.ring');
  });
  it.each([
    ['player', -3.001],
    ['player', 3.5],
    ['ai', 3.001],
    ['ai', -4],
  ] as const)('start.%s at %d outside the ring is refused, not adjusted (Req 7 c11)', (who, v) => {
    const c = defaultConfig();
    c.start[who] = v;
    const r = loadConfig(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(settings(r.errors)).toContain(`config.start.${who}`);
    expect(c.start[who]).toBe(v);
  });
  it('start positions closer than minSeparation are refused (Req 7 c11)', () => {
    const errs = errorsFor((c) => {
      c.start = { player: 0, ai: 0.799 };
    });
    expect(settings(errs)).toEqual(['config.start']);
  });
  it('start positions exactly minSeparation apart are accepted', () => {
    const c = defaultConfig();
    c.start = { player: 0, ai: 0.8 };
    expect(loadConfig(c).ok).toBe(true);
  });
  it.each([0, 1001, 1.5, -1])('maxHealth %d is refused (Req 11 c9)', (v) => {
    expect(settings(errorsFor((c) => (c.maxHealth = v)))).toEqual(['config.maxHealth']);
  });
  it.each([1, 1000])('maxHealth %d is accepted', (v) => {
    const c = defaultConfig();
    c.maxHealth = v;
    expect(loadConfig(c).ok).toBe(true);
  });
  it.each([121, -1, 1.5])('ai.reactionDelay %d is refused', (v) => {
    expect(settings(errorsFor((c) => (c.ai.reactionDelay = v)))).toEqual(['config.ai.reactionDelay']);
  });
  it.each([0, 601, 2.5])('ai.attackInterval %d is refused', (v) => {
    expect(settings(errorsFor((c) => (c.ai.attackInterval = v)))).toEqual(['config.ai.attackInterval']);
  });
  it.each(['yes', 1, null])('non-boolean ai.enabled %s is refused', (v) => {
    expect(settings(errorsFor((c) => ((c.ai as Mutable).enabled = v)))).toEqual(['config.ai.enabled']);
  });
  it.each([-1, 4294967296, 1.5, Number.NaN])('seed %d is refused (Req 3 c2)', (v) => {
    expect(settings(errorsFor((c) => (c.seed = v)))).toEqual(['config.seed']);
  });
  it.each([0, 4294967295])('seed %d is accepted', (v) => {
    const c = defaultConfig();
    c.seed = v;
    expect(loadConfig(c).ok).toBe(true);
  });
  it.each([
    ['minSeparation', 0],
    ['walkSpeed', 0],
    ['walkSpeed', -0.04],
  ] as const)('%s %d is refused', (k, v) => {
    expect(settings(errorsFor((c) => (c[k] = v)))).toContain(`config.${k}`);
  });
  it('walkSpeed that rounds to 0 Fx is refused', () => {
    expect(settings(errorsFor((c) => (c.walkSpeed = 0.0004)))).toEqual(['config.walkSpeed']);
  });
  it('a missing group is reported by name', () => {
    expect(settings(errorsFor((c) => delete (c as Mutable).ai))).toEqual(['config.ai']);
  });
  it('a non-object config is refused', () => {
    const r = loadConfig(42);
    expect(r.ok).toBe(false);
  });
});

describe('Attack_Definition validation (Req 5 c5, c6; Req 15 c1 d)', () => {
  it('reports a missing field by attack id', () => {
    const errs = errorsFor((c) => delete jab(c).damage);
    expect(errs).toEqual([{ setting: 'attacks[jab].damage', message: 'missing' }]);
  });
  it.each(['damage', 'staminaCost', 'guardDamage', 'startup', 'hitStun'])('rejects NaN and Infinity in %s', (k) => {
    for (const v of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(settings(errorsFor((c) => (jab(c)[k] = v)))).toEqual([`attacks[jab].${k}`]);
    }
  });
  it.each(Object.keys(TICK_RANGES))('rejects a non-integer %s', (k) => {
    expect(settings(errorsFor((c) => (jab(c)[k] = 4.5)))).toEqual([`attacks[jab].${k}`]);
  });
  it.each(Object.entries(TICK_RANGES))('rejects %s just below and just above its D2 range', (k, [lo, hi]) => {
    expect(settings(errorsFor((c) => (jab(c)[k] = lo - 1)))).toEqual([`attacks[jab].${k}`]);
    expect(settings(errorsFor((c) => (jab(c)[k] = hi + 1)))).toEqual([`attacks[jab].${k}`]);
  });
  it('accepts every Tick field at its D2 bounds', () => {
    const c = defaultConfig();
    Object.assign(jab(c), { startup: 1, active: 60, recovery: 0, hitStun: 0, blockStun: 120 });
    expect(loadConfig(c).ok).toBe(true);
  });
  it.each(['damage', 'staminaCost', 'guardDamage'])('rejects negative %s', (k) => {
    expect(settings(errorsFor((c) => (jab(c)[k] = -0.5)))).toEqual([`attacks[jab].${k}`]);
  });
  it.each(['x', 'y'])('rejects a negative hitbox.offset.%s', (k) => {
    expect(settings(errorsFor((c) => (jab(c).hitbox.offset[k] = -0.1)))).toEqual([`attacks[jab].hitbox.offset.${k}`]);
  });
  it.each(['w', 'h'])('rejects hitbox.size.%s of 0 and below', (k) => {
    expect(settings(errorsFor((c) => (jab(c).hitbox.size[k] = 0)))).toEqual([`attacks[jab].hitbox.size.${k}`]);
    expect(settings(errorsFor((c) => (jab(c).hitbox.size[k] = -0.2)))).toEqual([`attacks[jab].hitbox.size.${k}`]);
  });
  it('rejects ids that are not 1-32 characters, naming the attack by position', () => {
    expect(settings(errorsFor((c) => (jab(c).id = '')))).toEqual(['attacks[0].id', 'attacks']);
    const errs = errorsFor((c) => c.attacks.push({ ...structuredCloneJab(c), id: 'x'.repeat(33), startup: 9 }));
    expect(settings(errs)).toEqual(['attacks[1].id']);
  });
  it('reports a missing id by registry position, together with that attack’s other errors', () => {
    const errs = errorsFor((c) => {
      const extra = { ...structuredCloneJab(c), startup: 10 } as Mutable;
      delete extra.id;
      extra.recovery = 61;
      c.attacks.push(extra as never);
    });
    expect(settings(errs).sort()).toEqual(['attacks[1].id', 'attacks[1].recovery']);
  });
  it('rejects duplicate identifiers', () => {
    const errs = errorsFor((c) => {
      c.attacks.push({ ...structuredCloneJab(c), id: 'cross', startup: 7 });
      c.attacks.push({ ...structuredCloneJab(c), id: 'cross', startup: 8 });
    });
    expect(errs).toEqual([{ setting: 'attacks[2].id', message: "duplicate identifier 'cross' (first used at attacks[1])" }]);
  });
  it('refuses an empty registry with a single empty-registry error (Req 5 c6)', () => {
    expect(errorsFor((c) => (c.attacks = []))).toEqual([{ setting: 'attacks', message: 'empty registry' }]);
  });
  it('reports several errors together', () => {
    const errs = errorsFor((c) => {
      jab(c).startup = 0;
      jab(c).damage = -1;
      jab(c).hitbox.size.w = 0;
      c.maxHealth = 0;
    });
    expect(settings(errs).sort()).toEqual(
      ['attacks[jab].damage', 'attacks[jab].hitbox.size.w', 'attacks[jab].startup', 'config.maxHealth'].sort(),
    );
  });
});

describe('jab registry rules (Req 9 c1)', () => {
  it('refuses a registry without a jab', () => {
    expect(errorsFor((c) => (jab(c).id = 'punch'))).toEqual([{ setting: 'attacks', message: "missing 'jab' Attack_Definition (Req 9 c1)" }]);
  });
  it('refuses a jab that is not strictly the fastest', () => {
    const errs = errorsFor((c) => c.attacks.push({ ...structuredCloneJab(c), id: 'cross', startup: 4 }));
    expect(settings(errs)).toEqual(['attacks[jab].startup']);
  });
  it('accepts a jab that is strictly the fastest', () => {
    const c = defaultConfig();
    c.attacks.push({ ...structuredCloneJab(c), id: 'cross', startup: 5 });
    expect(loadConfig(c).ok).toBe(true);
  });
});

describe('jab reachability (Req 15 c8, c7; design §8.4)', () => {
  it('refuses a jab with no vertical overlap', () => {
    expect(errorsFor((c) => (jab(c).hitbox.offset.y = 3))).toEqual([
      { setting: 'attacks[jab]', message: 'cannot connect at any distance >= minSeparation' },
    ]);
  });
  it('refuses a jab whose Connect_Range is not above minSeparation', () => {
    // connectRange2 = 2*100 + 200 + 500 = 900 -> Connect_Range 0.45 < 0.8
    expect(
      errorsFor((c) => {
        jab(c).hitbox.offset.x = 0.1;
        jab(c).hitbox.size.w = 0.2;
      }),
    ).toEqual([{ setting: 'attacks[jab]', message: 'cannot connect at any distance >= minSeparation' }]);
  });
  it('refuses a jab whose Connect_Range equals minSeparation (strict far edge)', () => {
    // connectRange2 = 2*450 + 200 + 500 = 1600 = 2*minSeparation
    expect(
      errorsFor((c) => {
        jab(c).hitbox.offset.x = 0.45;
        jab(c).hitbox.size.w = 0.2;
      }),
    ).toEqual([{ setting: 'attacks[jab]', message: 'cannot connect at any distance >= minSeparation' }]);
  });
  it('refuses a jab whose near edge is beyond minSeparation', () => {
    // nearEdge2 = 3000 - 400 - 500 = 2100 >= 1600; reach [1051, 1949] is non-empty
    expect(errorsFor((c) => (jab(c).hitbox.offset.x = 1.5))).toEqual([
      { setting: 'attacks[jab]', message: 'near edge exceeds minSeparation; AI jab distances would miss' },
    ]);
  });
});

describe('configuration fingerprint (D42, Req 3 c8)', () => {
  it('FNV-1a 32-bit matches known-answer vectors', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });
  it('canonical JSON sorts keys and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: [3, { d: 1, c: 2 }] })).toBe('{"a":[3,{"c":2,"d":1}],"b":1}');
  });
  it('is stable and stored on the compiled config', () => {
    const a = loadConfig(defaultConfig());
    const b = loadConfig(defaultConfig());
    if (!a.ok || !b.ok) throw new Error('default config refused');
    expect(a.config.fingerprint).toBe(b.config.fingerprint);
    expect(a.config.fingerprint).toBe(configFingerprint(a.config.source));
    expect(Number.isInteger(a.config.fingerprint) && a.config.fingerprint >= 0 && a.config.fingerprint <= 0xffffffff).toBe(true);
  });
  it('does not depend on key order in the authored config', () => {
    const c = defaultConfig();
    const reversed = reverseKeys(c);
    expect(Object.keys(reversed)[0]).toBe('attacks');
    const a = loadConfig(c);
    const b = loadConfig(reversed);
    if (!a.ok || !b.ok) throw new Error('config refused');
    expect(b.config.fingerprint).toBe(a.config.fingerprint);
  });
  it('ignores unknown keys, which validation strips', () => {
    const a = loadConfig(defaultConfig());
    const b = loadConfig({ ...defaultConfig(), comment: 'not a setting' });
    if (!a.ok || !b.ok) throw new Error('config refused');
    expect(b.config.fingerprint).toBe(a.config.fingerprint);
  });
  const mutations: Array<[string, (c: GameConfig) => void]> = [
    ['maxHealth', (c) => void (c.maxHealth = 99)],
    ['seed', (c) => void (c.seed = 2)],
    ['ai.enabled', (c) => void (c.ai.enabled = false)],
    ['jab.damage', (c) => void ((c.attacks[0] as { damage: number }).damage = 4.5)],
    ['ring.max', (c) => void (c.ring.max = 3.001)],
  ];
  it.each(mutations)('changes when %s changes', (_name, mutate) => {
    const base = loadConfig(defaultConfig());
    const c = defaultConfig();
    mutate(c);
    const changed = loadConfig(c);
    if (!base.ok || !changed.ok) throw new Error('config refused');
    expect(changed.config.fingerprint).not.toBe(base.config.fingerprint);
  });
});

function structuredCloneJab(c: GameConfig) {
  return JSON.parse(JSON.stringify(c.attacks[0])) as GameConfig['attacks'][number];
}

function reverseKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(reverseKeys) as T;
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).reverse()) out[k] = reverseKeys((v as Record<string, unknown>)[k]);
    return out as T;
  }
  return v;
}
