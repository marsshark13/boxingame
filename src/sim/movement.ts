// Movement, separation, and facing: pipeline step 6 (design §7; Req 7 c1-c10; D38, D39; task 6.1).
//
// All values are integer Fx. Because separation is always >= minSeparation > 0, the Fighters
// can never pass each other, so "left" and "right" are taken from the current positions.
import type { CompiledConfig } from './config/compile';
import { clamp, i32 } from './fixed';
import type { FighterState, Fx } from './types';

/**
 * Resolves one Tick of movement for both Fighters, indexed [player, ai].
 * `disp[i]` is Fighter i's intended displacement this Tick (0 unless it moves); per-Fighter
 * values let P2 plug in reduced Blocking speeds without changing this function.
 *
 * 1. The intended move is limited to the Ring_Boundary first (D38, Req 7 c6).
 * 2. If the Fighters would end closer than `S`, only movement toward the opponent is
 *    shortened, so the distance becomes exactly `S` (Req 7 c5). When both moved toward each
 *    other the shortfall is split in halves; an odd 1 Fx goes to the Fighter with the larger
 *    toward-movement, or to the Player_Fighter on a tie; a share above a Fighter's own
 *    toward-movement is capped and the rest goes to the other Fighter (D39).
 * 3. A defensive clamp, a no-op by construction (design §7.3).
 */
export function resolveMovement(
  x: readonly [Fx, Fx],
  disp: readonly [Fx, Fx],
  S: Fx,
  B0: Fx,
  B1: Fx,
): [Fx, Fx] {
  const L = x[0] <= x[1] ? 0 : 1;
  const R = 1 - L;
  const xLprev = x[L]!;
  const xRprev = x[R]!;

  // (a) boundary limit first
  let xL = clamp(xLprev + disp[L]!, B0, B1);
  let xR = clamp(xRprev + disp[R]!, B0, B1);

  // (b) separation: shorten only movement toward the opponent
  const tL = Math.max(0, xL - xLprev); // L's toward-movement (rightward)
  const tR = Math.max(0, xRprev - xR); // R's toward-movement (leftward)
  const short = S - (xR - xL);
  if (short > 0) {
    // short <= tL + tR (design §7.3)
    let sL: number;
    let sR: number;
    if (tL > 0 && tR > 0) {
      const lo = Math.floor(short / 2);
      const hi = short - lo;
      const lGetsHi = tL > tR || (tL === tR && L === 0); // index 0 is the Player_Fighter
      sL = lGetsHi ? hi : lo;
      sR = lGetsHi ? lo : hi;
      if (sL > tL) {
        sR += sL - tL;
        sL = tL;
      }
      if (sR > tR) {
        sL += sR - tR;
        sR = tR;
      }
    } else if (tL > 0) {
      sL = short;
      sR = 0;
    } else {
      sL = 0;
      sR = short;
    }
    xL -= sL;
    xR += sR;
  }

  // (c) defensive clamp
  const out: [Fx, Fx] = [0, 0];
  out[L] = i32(clamp(xL, B0, B1));
  out[R] = i32(clamp(xR, B0, B1));
  return out;
}

/** Applies step 6 movement to both Fighters. `dir[i]` is -1, 0, or +1 from step 4. */
export function applyMovement(fs: [FighterState, FighterState], dir: readonly [-1 | 0 | 1, -1 | 0 | 1], cfg: CompiledConfig): void {
  const v = cfg.walkSpeedFx;
  const [x0, x1] = resolveMovement(
    [fs[0].x, fs[1].x],
    [dir[0] * v, dir[1] * v],
    cfg.minSeparationFx,
    cfg.ring.minFx,
    cfg.ring.maxFx,
  );
  fs[0].x = x0;
  fs[1].x = x1;
}

/** Facing at the end of step 6: +1 if the opponent's position is greater, otherwise -1 (Req 7 c8). */
export function updateFacing(fs: [FighterState, FighterState]): void {
  fs[0].facing = fs[1].x > fs[0].x ? 1 : -1;
  fs[1].facing = fs[0].x > fs[1].x ? 1 : -1;
}
