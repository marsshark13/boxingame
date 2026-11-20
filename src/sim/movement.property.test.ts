// Feature: project-ring, Property 12: Movement and separation model
// For any two in-bounds positions at least minSeparation apart and any pair of movement
// intents, movement gives each Fighter a displacement between 0 and its boundary-limited
// intent, in the intended direction; a Fighter is shortened only if it moved toward the
// opponent and the Fighters would otherwise be closer than minSeparation after the boundary
// limit; the shortenings sum to the shortfall and match a reference model of D39; a Fighter
// moving away or standing still is never displaced; and with no constraint active the
// displacement is exactly the intended walk speed. (Validates: Requirements 7.1, 7.4, 7.5, 7.6)
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { resolveMovement } from './movement';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Independent reference of D38 + D39, indexed [player, ai]. */
function reference(x: [number, number], d: [number, number], S: number, B0: number, B1: number) {
  const c: [number, number] = [clamp(x[0] + d[0], B0, B1), clamp(x[1] + d[1], B0, B1)];
  const L = x[0] < x[1] ? 0 : 1;
  const R = 1 - L;
  const t = [0, 0];
  t[L] = Math.max(0, c[L]! - x[L]!);
  t[R] = Math.max(0, x[R]! - c[R]!);
  const short = S - (c[R]! - c[L]!);
  const share = [0, 0];
  if (short > 0) {
    if (t[L]! > 0 && t[R]! > 0) {
      const base = Math.floor(short / 2);
      const extra = short - 2 * base;
      const larger = t[L]! > t[R]! ? L : t[R]! > t[L]! ? R : 0; // ties: the Player_Fighter (index 0)
      share[L] = base + (larger === L ? extra : 0);
      share[R] = base + (larger === R ? extra : 0);
      for (const k of [L, R]) {
        if (share[k]! > t[k]!) {
          share[1 - k]! += share[k]! - t[k]!;
          share[k] = t[k]!;
        }
      }
    } else if (t[L]! > 0) share[L] = short;
    else share[R] = short;
  }
  const out: [number, number] = [c[0], c[1]];
  out[L] = c[L]! - share[L]!;
  out[R] = c[R]! + share[R]!;
  return { clamped: c, toward: t, short, share, out };
}

const arbScene = fc
  .record({
    S: fc.integer({ min: 1, max: 2000 }),
    B0: fc.integer({ min: -10000, max: 0 }),
    extra: fc.integer({ min: 1, max: 8000 }),
    gapT: fc.oneof(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 0, max: 1000 })), // per mille of free width
    posT: fc.oneof(fc.constantFrom(0, 1000), fc.integer({ min: 0, max: 1000 })), // walls are common
    playerLeft: fc.boolean(),
    d0: fc.oneof(fc.constant(0), fc.integer({ min: -400, max: 400 })),
    d1: fc.oneof(fc.constant(0), fc.integer({ min: -400, max: 400 })),
  })
  .map((g) => {
    const W = g.S + g.extra;
    const B1 = g.B0 + W;
    const D = g.S + Math.floor((g.gapT * (W - g.S)) / 1000);
    const left = g.B0 + Math.floor((g.posT * (W - D)) / 1000);
    const right = left + D;
    const x: [number, number] = g.playerLeft ? [left, right] : [right, left];
    return { S: g.S, B0: g.B0, B1, x, d: [g.d0, g.d1] as [number, number] };
  });

test.prop([arbScene])('Property 12: movement matches the boundary-then-separation model', ({ S, B0, B1, x, d }) => {
  const got = resolveMovement(x, d, S, B0, B1);
  const ref = reference(x, d, S, B0, B1);
  expect(got).toEqual(ref.out);

  for (const i of [0, 1]) {
    const disp = got[i]! - x[i]!;
    const lim = ref.clamped[i]! - x[i]!; // boundary-limited intent
    if (d[i]! > 0) expect(disp >= 0 && disp <= lim).toBe(true);
    else if (d[i]! < 0) expect(disp <= 0 && disp >= lim).toBe(true);
    else expect(disp).toBe(0);
    const shortened = got[i] !== ref.clamped[i];
    if (shortened) expect(ref.toward[i]! > 0 && ref.short > 0).toBe(true);
    if (ref.toward[i] === 0) expect(got[i]).toBe(ref.clamped[i]); // moving away or still: never displaced
  }
  const totalShortening = Math.abs(got[0] - ref.clamped[0]) + Math.abs(got[1] - ref.clamped[1]);
  expect(totalShortening).toBe(Math.max(0, ref.short));
  if (ref.short <= 0 && ref.clamped[0] === x[0] + d[0] && ref.clamped[1] === x[1] + d[1]) {
    expect(got).toEqual([x[0] + d[0], x[1] + d[1]]); // no constraint: exactly the intended speed
  }
  // Invariants (Req 7 c10).
  for (const v of got) expect(Number.isInteger(v) && v >= B0 && v <= B1).toBe(true);
  expect(Math.abs(got[1] - got[0])).toBeGreaterThanOrEqual(S);
});
