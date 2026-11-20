// Loop properties (task 11): Properties 6 and 5.
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { FixedStepLoop, MAX_TICKS_PER_FRAME, TICK_MS } from './fixedStepLoop';
import { MatchDriver } from '../sim/driver';
import { cloneState } from '../sim/state';
import type { SimulationState } from '../sim/types';
import { arbConfig, arbTickMasks, compile, deepEqualStrict, expectSame } from '../test/sim';

type LoopEvent = { type: 'frame'; dt: number } | { type: 'pause' } | { type: 'resume'; dt: number } | { type: 'badStamp'; stamp: number };

/** arbFrameTimes (design §13.2): steady 30/60/144 Hz with jitter, gaps, zero, negative, non-finite, pause and resume. */
const arbFrameTimes: fc.Arbitrary<LoopEvent[]> = fc.array(
  fc.oneof(
    { weight: 10, arbitrary: fc.record({ hz: fc.constantFrom(30, 60, 144), jitter: fc.double({ min: -0.3, max: 0.3, noNaN: true }) }).map(({ hz, jitter }) => ({ type: 'frame' as const, dt: (1000 / hz) * (1 + jitter) })) },
    { weight: 2, arbitrary: fc.double({ min: 100, max: 10_000, noNaN: true }).map((dt) => ({ type: 'frame' as const, dt })) },
    { weight: 1, arbitrary: fc.constantFrom(0, -5, -1000).map((dt) => ({ type: 'frame' as const, dt })) },
    { weight: 1, arbitrary: fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY).map((stamp) => ({ type: 'badStamp' as const, stamp })) },
    { weight: 1, arbitrary: fc.constant({ type: 'pause' as const }) },
    { weight: 1, arbitrary: fc.double({ min: 0, max: 20_000, noNaN: true }).map((dt) => ({ type: 'resume' as const, dt })) },
  ),
  { minLength: 1, maxLength: 300 },
);

// Feature: project-ring, Property 6: Accumulator model
// For any sequence of frame timestamps and pause/resume events, FixedStepLoop.frame matches a
// reference model: invalid or non-positive deltas add 0; ticks = floor(acc / TICK_MS) and the
// remainder is carried when that is at most 5; otherwise exactly 5 Ticks run and the
// accumulator becomes 0; paused frames return 0 Ticks with accumulator 0; the first frame after
// resume counts only time since resume; and alpha is always in [0, 1).
// (Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7)
test.prop([arbFrameTimes, fc.double({ min: 0, max: 1e6, noNaN: true })])('Property 6: the loop matches the accumulator model', (events, t0) => {
  const loop = new FixedStepLoop();
  // Reference model, written from Req 1 c2-c7.
  let acc = 0;
  let last: number | null = null;
  let paused = false;
  let t = t0;
  const refFrame = (now: number) => {
    if (paused) {
      acc = 0;
      last = now;
      return 0;
    }
    let dt = last === null ? 0 : now - last;
    last = now;
    if (!(Number.isFinite(dt) && dt > 0)) dt = 0;
    acc += dt;
    const n = Math.floor(acc / TICK_MS);
    if (n > 5) {
      acc = 0;
      return 5;
    }
    acc = Math.max(0, acc - n * TICK_MS);
    return n;
  };

  for (const ev of events) {
    if (ev.type === 'pause') {
      loop.pause();
      paused = true;
      acc = 0;
      continue;
    }
    if (ev.type === 'resume') {
      t += ev.dt;
      loop.resume(t);
      paused = false;
      acc = 0;
      last = t;
      continue;
    }
    const now = ev.type === 'badStamp' ? ev.stamp : (t += ev.dt);
    const wasPaused = paused;
    const want = refFrame(now);
    const got = loop.frame(now);
    expect(got.ticks).toBe(want);
    expect(Number.isInteger(got.ticks) && got.ticks >= 0 && got.ticks <= MAX_TICKS_PER_FRAME).toBe(true);
    expect(got.alpha >= 0 && got.alpha < 1).toBe(true);
    expect(loop.accumulatorMs).toBe(acc);
    expect(loop.accumulatorMs >= 0 && loop.accumulatorMs < TICK_MS).toBe(true);
    if (wasPaused) expect(got).toEqual({ ticks: 0, alpha: 0 });
    else expect(got.alpha).toBe(Math.min(acc / TICK_MS, 1 - Number.EPSILON));
  }
});

// Feature: project-ring, Property 5: Frame-rate independence
// For any config, any per-Tick player command sequence indexed by Tick number, and any frame
// schedule at 30, 60, or 144 Hz with jitter that never exceeds the 5-Tick cap, the sequence of
// states produced through FixedStepLoop + MatchDriver equals the sequence produced by stepping
// directly, Tick for Tick. (Validates: Requirements 1.8)
const arbSchedule = fc.record({
  hz: fc.constantFrom(30, 60, 144),
  jitter: fc.array(fc.double({ min: -0.3, max: 0.3, noNaN: true }), { minLength: 1, maxLength: 64 }),
  start: fc.double({ min: 0, max: 1e6, noNaN: true }),
});

test.prop([arbConfig({ aiEnabled: true }), arbTickMasks(1, 600), arbSchedule])(
  'Property 5: the same per-Tick commands give the same states at any frame rate',
  (raw, masks, { hz, jitter, start }) => {
    const cfg = compile(raw);
    // Reference: direct stepping, one state per Tick.
    const ref = new MatchDriver(cfg);
    const states: SimulationState[] = [cloneState(ref.curr)];
    for (const m of masks) {
      ref.tick(m);
      states.push(cloneState(ref.curr));
    }

    const loop = new FixedStepLoop();
    const d = new MatchDriver(cfg);
    let t = start;
    loop.frame(t); // first frame: no time has elapsed
    let k = 0; // Ticks run so far
    for (let f = 0; k < masks.length; f++) {
      t += (1000 / hz) * (1 + jitter[f % jitter.length]!);
      const { ticks } = loop.frame(t);
      expect(ticks).toBeLessThanOrEqual(MAX_TICKS_PER_FRAME);
      for (let i = 0; i < ticks && k < masks.length; i++) {
        d.tick(masks[k]!); // the command for Tick k + 1, independent of which frame runs it
        k++;
        if (!deepEqualStrict(d.curr, states[k])) expectSame(d.curr, states[k], `Tick ${k} at ${hz} Hz`);
      }
      // After a frame, prev and curr are the two most recent states (Req 1 c5).
      if (k > 0) expect(deepEqualStrict(d.prev, states[k - 1]) && deepEqualStrict(d.curr, states[k])).toBe(true);
    }
  },
);
