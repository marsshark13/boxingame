// Feature: project-ring, Property 20: Observation history ring buffer
// For any command sequence, after every Gameplay_Tick the history holds min(G+1, 121) valid
// entries for consecutive Gameplay_Ticks ending at the current one, the newest entry equals
// the Player_Fighter's end-of-Tick observation, and observationFor(k) returns the entry
// recorded at max(k, matchStartAt) for every k in [G-120, G] and every k below Match start.
// (Validates: Requirements 12.9, 12.10)
import { test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { HISTORY_SIZE, observationFor, observe } from './observation';
import { createInitialState } from './state';
import { step } from './step';
import type { PlayerObservation } from './types';
import { arbConfig, arbMaskPairs, compile, tickInput } from '../test/sim';

const sameObs = (a: PlayerObservation, b: PlayerObservation) =>
  a.at === b.at && a.x === b.x && a.facing === b.facing && a.fsm === b.fsm && a.attackId === b.attackId && a.phase === b.phase;

test.prop([arbConfig(), arbMaskPairs(1, 600)])('Property 20: the history is a correct 121-entry ring buffer', (raw, masks) => {
  const cfg = compile(raw);
  let s = createInitialState(cfg);
  const log: PlayerObservation[] = [observe(s.fighters[0], 0)];
  expect(s.history.entries).toHaveLength(HISTORY_SIZE);
  expect(s.history.count).toBe(1);

  for (const [pm, am] of masks) {
    s = step(s, tickInput(pm, am), cfg).state;
    const G = s.gameplayTick;
    log.push(observe(s.fighters[0], G));
    const h = s.history;

    expect(h.entries).toHaveLength(HISTORY_SIZE);
    expect(h.count).toBe(Math.min(G + 1, HISTORY_SIZE));
    expect(h.entries[h.head]).toStrictEqual(observe(s.fighters[0], G));

    let ok = true;
    for (let off = 0; off < h.count; off++) {
      if (h.entries[(h.head - off + HISTORY_SIZE) % HISTORY_SIZE]!.at !== G - off) ok = false;
    }
    for (let k = G - 120; k <= G; k++) {
      const got = observationFor(h, k, s.matchStartAt) as PlayerObservation;
      if (!sameObs(got, log[Math.max(k, s.matchStartAt)]!)) ok = false;
    }
    // k below Match start can only be asked while the Match-start entry is held (design §10.2).
    if (G - s.matchStartAt <= 120) {
      for (const k of [-1, -121, s.matchStartAt - 1]) {
        if (!sameObs(observationFor(h, k, s.matchStartAt) as PlayerObservation, log[s.matchStartAt]!)) ok = false;
      }
    }
    expect(ok, `history inconsistent after Gameplay_Tick ${G}`).toBe(true);
  }
});
