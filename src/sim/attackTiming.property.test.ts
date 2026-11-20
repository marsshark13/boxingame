// Feature: project-ring, Property 10: Attack timing
// For any generated jab definition (S, A, R in D2 ranges) and any Tick N on which an
// Able_To_Act Fighter receives a jab, the Fighter is Attacking with phase startup on
// N..N+S-1, active on N+S..N+S+A-1, recovery on N+S+A..N+S+A+R-1, and Idle on N+S+A+R
// (where it can accept a new command) unless a landed hit ended the attack earlier; an
// uninterrupted attack therefore lasts exactly S+A+R Ticks.
// (Validates: Requirements 5.3, 5.7, 9.2, 9.3, 9.4, 9.5)
//
// Setup: the AI is disabled and receives no commands, so nothing can hit the player and the
// attack is never interrupted. Early endings by a landed hit are covered by Properties 13-15.
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { createInitialState } from './state';
import { step } from './step';
import { CMD } from './types';
import { arbConfig, arbMask, arbTickMasks, compile, tickInput } from '../test/sim';

const arbCase = fc.record({
  raw: arbConfig({ aiEnabled: false }),
  prefix: arbTickMasks(0, 200).map((ms) => ms.map((m) => m & ~CMD.Jab)), // keeps the player Able_To_Act
  jabMask: arbMask.map((m) => m | CMD.Jab),
  during: fc.array(arbMask, { minLength: 181, maxLength: 181 }), // longer than any S+A+R
  endMask: arbMask,
});

test.prop([arbCase])('Property 10: phases follow the Attack_Definition Tick by Tick', ({ raw, prefix, jabMask, during, endMask }) => {
  const cfg = compile(raw);
  const { startup: S, active: A, recovery: R, total } = cfg.jab;
  expect(total).toBe(S + A + R);

  let s = createInitialState(cfg);
  for (const m of prefix) s = step(s, tickInput(m), cfg).state;
  expect(['Idle', 'Walking']).toContain(s.fighters[0].fsm.kind);

  const N = s.gameplayTick + 1;
  s = step(s, tickInput(jabMask), cfg).state;
  for (let t = N; t < N + total; t++) {
    if (t > N) s = step(s, tickInput(during[t - N - 1]!), cfg).state;
    expect(s.gameplayTick).toBe(t);
    const f = s.fighters[0].fsm;
    const e = t - N;
    const phase = e < S ? 'startup' : e < S + A ? 'active' : 'recovery';
    expect(f).toMatchObject({ kind: 'Attacking', attackId: 'jab', enteredAt: N, phase });
    expect(s.fighters[0].lastJabStartAt).toBe(N);
  }

  // Tick N+S+A+R: the attack ends in step 3 and step 4 can accept a new command (unless the
  // player's jabs already defeated the AI, after which commands are ignored, Req 13 c3).
  const accepting = s.result === null;
  const end = step(s, tickInput(endMask), cfg, { trace: true });
  expect(end.state.gameplayTick).toBe(N + total);
  expect(end.trace).toContainEqual(
    expect.objectContaining({ fighter: 'player', from: 'Attacking', to: 'Idle', trigger: 'attack-end', step: 3, at: N + total, ok: true }),
  );
  const f = end.state.fighters[0].fsm;
  if (accepting && endMask & CMD.Jab) expect(f).toMatchObject({ kind: 'Attacking', enteredAt: N + total, phase: 'startup' });
  else expect(['Idle', 'Walking']).toContain(f.kind);
});
