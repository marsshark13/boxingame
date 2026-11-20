// Feature: project-ring, Property 26: Jab reachability matches brute-force overlap
// For any generated jab hitbox, hurtbox, minSeparation, and ring width, the config is accepted
// exactly when brute-force strict overlap over every Fx distance in [minSeparation, ring width]
// finds at least one hit and every distance in [minSeparation, Connect_Range) within the ring
// width hits; when accepted, [dLo, dHi] equals the set of hitting distances, and the AI's jab
// condition 2d < connectRange2 with d >= minSeparation implies a hit.
// (Validates: Requirements 15.7, 15.8)
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { loadConfig } from './compile';
import { defaultConfig } from './defaults';

/** arbReachConfig (design §13.2): unconstrained jab hitbox, hurtbox, minSeparation, and ring width (Fx). */
const arbReachConfig = fc.record({
  S: fc.integer({ min: 100, max: 2000 }),
  extraWidth: fc.integer({ min: 1, max: 6000 }),
  ox: fc.oneof(fc.integer({ min: 0, max: 3000 }), fc.integer({ min: 0, max: 600 })),
  oy: fc.integer({ min: 0, max: 3000 }),
  w: fc.integer({ min: 1, max: 1500 }),
  h: fc.integer({ min: 1, max: 1500 }),
  hw: fc.integer({ min: 1, max: 1500 }),
  hh: fc.integer({ min: 1, max: 3000 }),
  cy: fc.integer({ min: -500, max: 3000 }),
});

test.prop([arbReachConfig])('Property 26: accepted exactly when brute-force reachability holds', (g) => {
  const W = g.S + g.extraWidth;
  const cfg = defaultConfig();
  cfg.minSeparation = g.S / 1000;
  cfg.ring = { min: 0, max: W / 1000 };
  cfg.start = { player: 0, ai: W / 1000 };
  cfg.hurtbox = { w: g.hw / 1000, h: g.hh / 1000, centerY: g.cy / 1000 };
  cfg.attacks[0]!.hitbox = { offset: { x: g.ox / 1000, y: g.oy / 1000 }, size: { w: g.w / 1000, h: g.h / 1000 } };

  // Brute force with the strict doubled-Fx overlap test of design §8.2, attacker at 0 facing +x.
  const hits = (d: number) => Math.abs(2 * g.ox - 2 * d) < g.w + g.hw && Math.abs(2 * g.oy - 2 * g.cy) < g.h + g.hh;
  const connectRange2 = 2 * g.ox + g.w + g.hw;
  const hitting: number[] = [];
  let aiDistancesAllHit = true;
  for (let d = g.S; d <= W; d++) {
    const hit = hits(d);
    if (hit) hitting.push(d);
    if (2 * d < connectRange2 && !hit) aiDistancesAllHit = false;
  }
  const expectAccepted = hitting.length > 0 && aiDistancesAllHit;

  const r = loadConfig(cfg);
  expect(r.ok).toBe(expectAccepted);
  if (!r.ok) {
    expect(r.errors.map((e) => e.setting)).toEqual(['attacks[jab]']);
    return;
  }
  const jab = r.config.jab;
  expect(jab.reach).not.toBeNull();
  const { dLo, dHi } = jab.reach!;
  // The hitting set is exactly the integer interval [dLo, dHi].
  expect(hitting[0]).toBe(dLo);
  expect(hitting[hitting.length - 1]).toBe(dHi);
  expect(hitting.length).toBe(dHi - dLo + 1);
  // The AI's jab condition implies a hit.
  for (let d = g.S; d <= W; d++) if (2 * d < jab.connectRange2) expect(hits(d)).toBe(true);
});
