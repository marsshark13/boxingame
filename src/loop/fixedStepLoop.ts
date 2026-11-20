// Fixed-timestep Simulation_Loop (design §3.1; Req 1 c2-c7; D1; task 11.1).
//
// A small pure class: it never reads a clock. The caller passes the frame timestamp in
// milliseconds, and frame() answers how many Ticks to run and the interpolation fraction.
// The Game_Simulation itself never sees elapsed time (Req 1 c1).

/** One Tick of 1/60 s, in milliseconds. */
export const TICK_MS = 1000 / 60;

/** D1: at most 5 Ticks per display frame; the excess accumulated time is discarded. */
export const MAX_TICKS_PER_FRAME = 5;

export interface FrameResult {
  /** Whole Ticks to run this frame, 0..5. */
  ticks: number;
  /** Interpolation fraction accumulator / TICK_MS, in [0, 1) (Req 1 c5). */
  alpha: number;
}

export class FixedStepLoop {
  private acc = 0; // ms, in [0, TICK_MS) after every frame()
  private lastMs: number | null = null;
  private paused = false;

  /** Returns how many Ticks to run this frame and the interpolation alpha. */
  frame(nowMs: number): FrameResult {
    if (this.paused) {
      // Req 1 c4: accumulator held at zero, no Ticks; keep the last timestamp current.
      this.acc = 0;
      this.lastMs = nowMs;
      return { ticks: 0, alpha: 0 };
    }
    let dt = this.lastMs === null ? 0 : nowMs - this.lastMs;
    this.lastMs = nowMs;
    if (!Number.isFinite(dt) || dt <= 0) dt = 0; // Req 1 c7: zero, negative, NaN, Infinity add 0
    this.acc += dt; // Req 1 c2
    let ticks = Math.floor(this.acc / TICK_MS);
    if (ticks > MAX_TICKS_PER_FRAME) {
      // Req 1 c3, D1: exactly 5 Ticks and the accumulator is reset.
      ticks = MAX_TICKS_PER_FRAME;
      this.acc = 0;
    } else {
      this.acc -= ticks * TICK_MS; // remainder carried to the next frame (Req 1 c2)
      if (this.acc < 0) this.acc = 0; // guard against float residue
    }
    const alpha = Math.min(this.acc / TICK_MS, 1 - Number.EPSILON); // Req 1 c5: [0, 1)
    return { ticks, alpha };
  }

  pause(): void {
    this.paused = true;
    this.acc = 0;
  }

  /** Resumes counting from `nowMs`, so paused time is never counted (Req 1 c6). */
  resume(nowMs: number): void {
    this.paused = false;
    this.acc = 0;
    this.lastMs = nowMs;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Current accumulator in milliseconds (for tests and diagnostics). */
  get accumulatorMs(): number {
    return this.acc;
  }
}
