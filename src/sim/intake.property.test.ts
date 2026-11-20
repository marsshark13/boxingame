// Feature: project-ring, Property 7: Invalid commands are ignored
// For any state and valid TickInput, adding any number of entries with unknown fighters or
// unknown types (and, in M1, P2 command types, and, while ai.enabled, entries for the
// AI_Fighter) produces the same next state and events as the input without them.
// (Validates: Requirements 2.2, 2.7)
import { fc, test } from '@fast-check/vitest';
import { createInitialState } from './state';
import { step } from './step';
import type { TickInput } from './types';
import { arbConfig, arbJunkEntry, arbMask, compile, expectSame, maskToCommands } from '../test/sim';

/** arbTickInputs: per Tick, the valid masks plus junk entries and their insertion points. */
const arbTickInputs = fc.integer({ min: 1, max: 600 }).chain((len) =>
  fc.array(
    fc.record({
      player: arbMask,
      ai: arbMask,
      junk: fc.array(fc.tuple(arbJunkEntry, fc.nat()), { maxLength: 4 }),
      aiWhileEnabled: arbMask,
    }),
    { minLength: len, maxLength: len },
  ),
);

test.prop([arbConfig(), arbTickInputs])('Property 7: junk command entries never change the outcome', (raw, ticks) => {
  const cfg = compile(raw);
  let s = createInitialState(cfg);
  for (const t of ticks) {
    const valid: TickInput = [...maskToCommands('player', t.player), ...(cfg.ai.enabled ? [] : maskToCommands('ai', t.ai))];
    const noisy: unknown[] = [...valid];
    const junk: Array<[unknown, number]> = [...t.junk];
    if (cfg.ai.enabled) for (const c of maskToCommands('ai', t.aiWhileEnabled)) junk.push([c, t.junk.length]);
    for (const [entry, pos] of junk) noisy.splice(pos % (noisy.length + 1), 0, entry);

    const clean = step(s, valid, cfg);
    const dirty = step(s, noisy as unknown as TickInput, cfg);
    expectSame(dirty.state, clean.state, `state at Tick ${clean.state.tick}`);
    expectSame(dirty.events, clean.events, `events at Tick ${clean.state.tick}`);
    s = clean.state;
  }
});
