// Feature: project-ring, Property 23: Input sampling model
// For any interleaving of key events and sampleTick calls, the sampler's output matches a
// reference model: each non-repeat press of J yields exactly one Jab on the next sample (only
// the first-arriving attack press per sample counts); A/Left or D/Right yields the direction
// on every sample after its press and before its release, never on the first sample after its
// release, and never for a press and release between two samples (D43); both directions held
// yields neither; after blur nothing is delivered until a new press; unmapped codes never
// produce commands. (Validates: Requirements 8.5, 8.6, 8.7, 8.8, 8.9, 8.10)
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { InputSampler } from './inputSampler';
import { CMD } from '../sim/types';

const MAPPED = ['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'KeyJ'] as const;
const UNMAPPED = ['KeyQ', 'KeyK', 'Space', 'ShiftLeft', 'Enter', 'Escape', 'KeyS'] as const;

type Ev =
  | { t: 'down'; code: string; repeat: boolean }
  | { t: 'up'; code: string }
  | { t: 'blur' }
  | { t: 'sample' };

/** arbKeyEvents (design §13.2). */
const arbKeyEvents: fc.Arbitrary<Ev[]> = fc.array(
  fc.oneof(
    { weight: 4, arbitrary: fc.record({ t: fc.constant('down' as const), code: fc.constantFrom<string>(...MAPPED), repeat: fc.boolean() }) },
    { weight: 1, arbitrary: fc.record({ t: fc.constant('down' as const), code: fc.constantFrom<string>(...UNMAPPED), repeat: fc.boolean() }) },
    { weight: 4, arbitrary: fc.record({ t: fc.constant('up' as const), code: fc.constantFrom<string>(...MAPPED, ...UNMAPPED) }) },
    { weight: 1, arbitrary: fc.constant({ t: 'blur' as const }) },
    { weight: 5, arbitrary: fc.constant({ t: 'sample' as const }) },
  ),
  { maxLength: 400 },
);

/**
 * Reference model in terms of "presses": a press of key k is a non-repeat keydown while k is
 * not held (since the last release or blur). The model replays the timeline per sample.
 */
function reference(events: Ev[]): number[] {
  const held = new Set<string>();
  let jabPressedSinceSample = false;
  const out: number[] = [];
  for (const e of events) {
    if (e.t === 'down') {
      if (e.repeat || !(MAPPED as readonly string[]).includes(e.code) || held.has(e.code)) continue;
      held.add(e.code);
      if (e.code === 'KeyJ') jabPressedSinceSample = true;
    } else if (e.t === 'up') {
      held.delete(e.code);
    } else if (e.t === 'blur') {
      held.clear();
      jabPressedSinceSample = false;
    } else {
      const left = held.has('KeyA') || held.has('ArrowLeft');
      const right = held.has('KeyD') || held.has('ArrowRight');
      let m = jabPressedSinceSample ? CMD.Jab : 0;
      if (left && !right) m |= CMD.MoveLeft;
      if (right && !left) m |= CMD.MoveRight;
      out.push(m);
      jabPressedSinceSample = false;
    }
  }
  return out;
}

test.prop([arbKeyEvents])('Property 23: the sampler matches the input model', (events) => {
  const s = new InputSampler();
  const got: number[] = [];
  for (const e of events) {
    if (e.t === 'down') s.keyDown(e.code, e.repeat);
    else if (e.t === 'up') s.keyUp(e.code);
    else if (e.t === 'blur') s.blur();
    else got.push(s.sampleTick());
  }
  expect(got).toEqual(reference(events));
  for (const m of got) expect(m & ~(CMD.MoveLeft | CMD.MoveRight | CMD.Jab)).toBe(0); // unmapped keys never appear
});
