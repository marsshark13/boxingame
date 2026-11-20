// Task 3.3: sfc32 known-answer vectors and fixed-point helper unit tests (Req 3 c2).
import { describe, expect, it } from 'vitest';
import { next, RNG_WARMUP, seedSfc32 } from './rng';
import { clamp, fromFx, i32, roundHalfUp, toFx } from './fixed';
import type { RngState } from './types';

// --- Independent reference written with BigInt modular arithmetic ------------------------
const M32 = (1n << 32n) - 1n;
const u = (x: bigint) => x & M32;

function refSplitmix32(state: bigint): [bigint, bigint] {
  const s = u(state + 0x9e3779b9n);
  let t = s ^ (s >> 16n);
  t = u(t * 0x21f0aaadn);
  t ^= t >> 15n;
  t = u(t * 0x735a2d97n);
  t ^= t >> 15n;
  return [s, t];
}

/** sfc32 as in PractRand: tmp = a + b + counter++; a = b ^ (b >> 9); b = c + (c << 3); c = rotl(c, 21) + tmp. */
function refSfc32Step(w: bigint[]): bigint {
  const [a, b, c, d] = w as [bigint, bigint, bigint, bigint];
  const t = u(a + b + d);
  w[3] = u(d + 1n);
  w[0] = b ^ (b >> 9n);
  w[1] = u(c + (c << 3n));
  w[2] = u(u((c << 21n) | (c >> 11n)) + t);
  return t;
}

function refSeed(seed: number): bigint[] {
  let s = BigInt(seed >>> 0);
  const w: bigint[] = [];
  for (let i = 0; i < 4; i++) {
    const [ns, out] = refSplitmix32(s);
    s = ns;
    w.push(out);
  }
  for (let i = 0; i < RNG_WARMUP; i++) refSfc32Step(w);
  return w;
}

// --- Golden vectors (seed -> state after seeding, then the next 6 outputs) ---------------
const VECTORS: Array<{ seed: number; state: RngState; outputs: number[] }> = [
  {
    seed: 0,
    state: [3581349348, 3415017548, 458257046, 2141751582],
    outputs: [548183886, 1097162541, 2219297441, 1664216021, 3479288465, 3033988455],
  },
  {
    seed: 1,
    state: [4269307524, 2439480051, 1591552067, 3011703621],
    outputs: [1130556604, 2591592147, 3014952990, 960850752, 2734082507, 3058966613],
  },
  {
    seed: 4294967295,
    state: [2492668160, 1286403119, 4085013518, 2762329233],
    outputs: [2246433216, 2156899173, 2040853526, 3823104220, 1358629326, 3404600419],
  },
];

describe('sfc32', () => {
  it.each(VECTORS)('matches the known-answer vector for seed $seed', ({ seed, state, outputs }) => {
    const rng = seedSfc32(seed);
    expect(rng).toEqual(state);
    expect(outputs.map(() => next(rng))).toEqual(outputs);
  });

  it.each([0, 1, 4294967295, 0x9e3779b9, 123456789])('agrees with an independent BigInt reference for seed %i', (seed) => {
    const rng = seedSfc32(seed);
    const ref = refSeed(seed);
    expect(rng.map(BigInt)).toEqual(ref);
    for (let i = 0; i < 1000; i++) {
      expect(BigInt(next(rng))).toBe(refSfc32Step(ref));
    }
    expect(rng.map(BigInt)).toEqual(ref);
  });

  it('keeps every state word and output an unsigned 32-bit integer', () => {
    const rng = seedSfc32(4294967295);
    for (let i = 0; i < 2000; i++) {
      const out = next(rng);
      expect(Number.isInteger(out) && out >= 0 && out <= 0xffffffff).toBe(true);
      for (const w of rng) expect(Number.isInteger(w) && w >= 0 && w <= 0xffffffff).toBe(true);
    }
  });

  it('round-trips through JSON without change', () => {
    const rng = seedSfc32(42);
    const copy = JSON.parse(JSON.stringify(rng)) as RngState;
    expect(copy).toEqual(rng);
    expect(next(copy)).toBe(next(rng));
  });

  it('gives different streams for different seeds', () => {
    expect(seedSfc32(0)).not.toEqual(seedSfc32(1));
  });
});

describe('fixed-point helpers', () => {
  it('i32 normalizes -0 to 0', () => {
    expect(Object.is(i32(-0), 0)).toBe(true);
    expect(Object.is(i32(0 * -1), 0)).toBe(true);
    expect(i32(-1500)).toBe(-1500);
    expect(i32(3.7)).toBe(3);
  });

  it('roundHalfUp rounds .5 boundaries up and stays exact elsewhere', () => {
    expect(roundHalfUp(0)).toBe(0);
    expect(roundHalfUp(0.49)).toBe(0);
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(1.5)).toBe(2);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(3.4999)).toBe(3);
    expect(roundHalfUp(4)).toBe(4);
    expect(roundHalfUp(10.5)).toBe(11);
  });

  it('toFx converts authored world units (up to 3 decimals) to integer Fx', () => {
    expect(toFx(1)).toBe(1000);
    expect(toFx(0.95)).toBe(950);
    expect(toFx(0.001)).toBe(1);
    expect(toFx(-1.5)).toBe(-1500);
    expect(toFx(0.04)).toBe(40);
    expect(Object.is(toFx(-0.0001), 0)).toBe(true);
  });

  it('fromFx converts back to world units', () => {
    expect(fromFx(1500)).toBe(1.5);
    expect(fromFx(-40)).toBe(-0.04);
  });

  it('clamp limits to the inclusive range', () => {
    expect(clamp(-5, -3, 3)).toBe(-3);
    expect(clamp(5, -3, 3)).toBe(3);
    expect(clamp(1, -3, 3)).toBe(1);
  });
});
