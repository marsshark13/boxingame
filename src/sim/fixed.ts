// Fixed-point and integer helpers (design §2.1; task 3.1).
// Positions and spatial values are integer Fx: 1 world unit = 1000 Fx. Only integer
// add/sub/compare run in the hot path, so replays are bit-identical (Req 3 c1).
import type { Fx } from './types';

export const FX_PER_UNIT = 1000;

/** Truncates to a 32-bit integer and normalizes -0 to 0. Every integer written to state passes through it. */
export function i32(x: number): number {
  return x | 0;
}

/** World units (authored with up to 3 decimals) -> Fx. Applied once, at config compile. */
export function toFx(v: number): Fx {
  return i32(Math.round(v * FX_PER_UNIT));
}

/** Fx -> world units (Renderer and event payloads). */
export function fromFx(x: Fx): number {
  return x / FX_PER_UNIT;
}

/** Round half up for x >= 0 (D5, Req 35 c7): 0.5 -> 1, 1.5 -> 2, 0.49 -> 0. */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
