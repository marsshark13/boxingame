// Feature: project-ring, Property 21: Restart identity
// For any config, any player command sequence C, and any 1-100 restarts, each preceded by an
// arbitrary fight with its own random command sequence, replaying C after each restart
// produces after every Tick a state deep-equal to the corresponding Tick of the initial fight
// run with C, including rng, configFingerprint, and the observation history (which right
// after restart holds only the Match-start observation). (Validates: Requirements 12.12, 13.4, 13.6)
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { MatchDriver } from './driver';
import { cloneState, createInitialState } from './state';
import type { GameEvent, SimulationState } from './types';
import { arbConfig, arbTickMasks, compile, deepEqualStrict, expectSame } from '../test/sim';

const arbRestarts = fc.oneof(
  { weight: 4, arbitrary: fc.integer({ min: 1, max: 5 }) },
  { weight: 1, arbitrary: fc.integer({ min: 1, max: 100 }) },
);

test.prop([arbConfig(), arbTickMasks(1, 40), arbRestarts, fc.array(arbTickMasks(0, 40), { minLength: 100, maxLength: 100 })])(
  'Property 21: every restarted fight replays the initial fight exactly',
  (raw, C, restarts, fights) => {
    const cfg = compile(raw);
    const s0 = createInitialState(cfg);
    const d = new MatchDriver(cfg);
    const states: SimulationState[] = [];
    const events: GameEvent[][] = [];
    for (const m of C) {
      events.push([...d.tick(m)]);
      states.push(cloneState(d.curr));
    }
    for (let k = 0; k < restarts; k++) {
      for (const m of fights[k]!) d.tick(m); // an arbitrary fight first
      d.restart();
      expectSame(d.curr, s0, 'curr after restart');
      expectSame(d.prev, s0, 'prev after restart');
      expect(d.curr.history.count).toBe(1);
      C.forEach((m, i) => {
        const ev = d.tick(m);
        if (!deepEqualStrict(d.curr, states[i]) || !deepEqualStrict(ev, events[i])) {
          expectSame(d.curr, states[i], `restart ${k + 1}, Tick ${i + 1}`);
          expectSame(ev, events[i], `events, restart ${k + 1}, Tick ${i + 1}`);
        }
      });
    }
  },
);
