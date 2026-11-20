// Task 11.4: loop examples (Req 1 c2-c7, D1).
import { describe, expect, it } from 'vitest';
import { FixedStepLoop, TICK_MS } from './fixedStepLoop';

describe('FixedStepLoop', () => {
  it('runs no Ticks on the first frame', () => {
    expect(new FixedStepLoop().frame(1234)).toEqual({ ticks: 0, alpha: 0 });
  });

  it('runs one Tick per 1/60 s and carries the remainder (Req 1 c2)', () => {
    const loop = new FixedStepLoop();
    loop.frame(0);
    expect(loop.frame(TICK_MS * 1.5).ticks).toBe(1);
    expect(loop.accumulatorMs).toBeCloseTo(TICK_MS * 0.5, 9);
    expect(loop.frame(TICK_MS * 2).ticks).toBe(1); // 0.5 carried + 0.5 new
  });

  it('at 30 Hz runs two Ticks per frame, at 144 Hz mostly zero or one', () => {
    const l30 = new FixedStepLoop();
    l30.frame(0);
    expect(l30.frame(1000 / 30 + 0.001).ticks).toBe(2);
    const l144 = new FixedStepLoop();
    l144.frame(0);
    let total = 0;
    for (let i = 1; i <= 144; i++) total += l144.frame((1000 / 144) * i).ticks;
    expect(total).toBeGreaterThanOrEqual(59);
    expect(total).toBeLessThanOrEqual(60);
  });

  it('with exactly 6 Ticks of backlog runs 5 and zeroes the accumulator (Req 1 c3, D1)', () => {
    const loop = new FixedStepLoop();
    loop.frame(0);
    expect(loop.frame(6 * TICK_MS)).toEqual({ ticks: 5, alpha: 0 });
    expect(loop.accumulatorMs).toBe(0);
  });

  it('with exactly 5 Ticks of backlog runs all 5 and keeps the remainder', () => {
    const loop = new FixedStepLoop();
    loop.frame(0);
    expect(loop.frame(5 * TICK_MS + 1).ticks).toBe(5);
    expect(loop.accumulatorMs).toBeCloseTo(1, 9);
  });

  it('a hidden tab returning after a long gap runs exactly 5 Ticks, no fast-forward', () => {
    const loop = new FixedStepLoop();
    loop.frame(0);
    expect(loop.frame(60_000).ticks).toBe(5);
    // 1.01 Ticks: at t = 60,000 ms, (60000 + TICK_MS) - 60000 rounds just below TICK_MS (design §14.2).
    expect(loop.frame(60_000 + TICK_MS * 1.01).ticks).toBe(1);
  });

  it('pause holds the accumulator at zero and runs no Ticks (Req 1 c4)', () => {
    const loop = new FixedStepLoop();
    loop.frame(0);
    loop.frame(TICK_MS * 0.7);
    loop.pause();
    for (let t = 100; t <= 10_000; t += 100) expect(loop.frame(t)).toEqual({ ticks: 0, alpha: 0 });
    expect(loop.accumulatorMs).toBe(0);
  });

  it('pause, then resume after 10 s, runs 0 extra Ticks (Req 1 c6)', () => {
    const loop = new FixedStepLoop();
    loop.frame(0);
    loop.pause();
    loop.resume(10_000);
    expect(loop.frame(10_000).ticks).toBe(0);
    expect(loop.frame(10_000 + TICK_MS * 1.2).ticks).toBe(1); // only time since resume counts
  });

  it('resume without frames while paused counts only time since resume', () => {
    const loop = new FixedStepLoop();
    loop.frame(0);
    loop.pause();
    loop.resume(5000);
    expect(loop.frame(5000 + TICK_MS * 0.5).ticks).toBe(0);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])('a %s timestamp adds 0, and the next valid frame recovers (Req 1 c7)', (bad) => {
    const loop = new FixedStepLoop();
    loop.frame(0);
    expect(loop.frame(bad).ticks).toBe(0);
    expect(loop.accumulatorMs).toBe(0);
    expect(loop.frame(1000).ticks).toBe(0); // delta from a non-finite timestamp is non-finite: adds 0
    expect(loop.frame(1000 + TICK_MS * 1.01).ticks).toBe(1); // normal again
  });

  it('zero and negative deltas add 0 (Req 1 c7)', () => {
    const loop = new FixedStepLoop();
    loop.frame(100);
    expect(loop.frame(100).ticks).toBe(0);
    expect(loop.frame(50).ticks).toBe(0);
    expect(loop.accumulatorMs).toBe(0);
  });

  it('alpha stays in [0, 1) (Req 1 c5)', () => {
    const loop = new FixedStepLoop();
    loop.frame(0);
    const { alpha } = loop.frame(TICK_MS - 1e-9);
    expect(alpha).toBeGreaterThan(0.99);
    expect(alpha).toBeLessThan(1);
  });
});
