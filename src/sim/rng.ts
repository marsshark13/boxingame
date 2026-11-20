// sfc32 PRNG, stored in the Simulation_State (design §2.1; Req 3 c2; task 3.2).
//
// - Seeding: splitmix32 expands the 32-bit seed into the four sfc32 words, then 12 outputs
//   are discarded as warm-up.
// - Only Math.imul, +, |, ^, <<, and >>> are used, so every engine produces the same bits.
// - The state is [a, b, c, d] of unsigned 32-bit integers (JSON-friendly, never negative).
// M1 draws no random values (Req 12 c14); the PRNG exists so determinism and round-trip
// properties cover it from day one.
import type { RngState } from './types';

export const RNG_WARMUP = 12;

/** splitmix32 step (constants 0x9e3779b9, 0x21f0aaad, 0x735a2d97). Returns [new state, output]. */
function splitmix32(state: number): [number, number] {
  const s = (state + 0x9e3779b9) | 0;
  let t = s ^ (s >>> 16);
  t = Math.imul(t, 0x21f0aaad);
  t ^= t >>> 15;
  t = Math.imul(t, 0x735a2d97);
  t ^= t >>> 15;
  return [s, t >>> 0];
}

/** Builds the sfc32 state for a uint32 seed (0..4,294,967,295). */
export function seedSfc32(seed: number): RngState {
  let s = seed | 0;
  const words: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [ns, out] = splitmix32(s);
    s = ns;
    words.push(out);
  }
  const rng = words as RngState;
  for (let i = 0; i < RNG_WARMUP; i++) next(rng);
  return rng;
}

/** Advances `rng` in place and returns the next uint32 output. */
export function next(rng: RngState): number {
  let a = rng[0] | 0;
  let b = rng[1] | 0;
  let c = rng[2] | 0;
  let d = rng[3] | 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  rng[0] = a >>> 0;
  rng[1] = b >>> 0;
  rng[2] = c >>> 0;
  rng[3] = d >>> 0;
  return t >>> 0;
}
