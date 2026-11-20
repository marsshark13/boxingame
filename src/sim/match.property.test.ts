// Match-level properties (task 8): Properties 16 and 17.
import { fc, test } from '@fast-check/vitest';
import { expect } from 'vitest';
import { decideAi } from './ai/m1Ai';
import { createInitialState } from './state';
import { step } from './step';
import type { GameEvent, RngState } from './types';
import { arbConfig, arbMaskPairs, compile, tickInput } from '../test/sim';

// Feature: project-ring, Property 16: Defeat and post-result stability
// For any config and command sequence, on the Tick a Fighter's Health reaches 0 it is
// Defeated (never HitStun); a result is set on that Tick (winner if one Fighter, draw if both);
// and on every later Tick both Fighters' Health and positions are unchanged, Defeated Fighters
// stay Defeated, and the AI issues no commands.
// (Validates: Requirements 4.10, 11.6, 11.7, 13.3, 35.9, 12.8)
test.prop([arbConfig(), arbMaskPairs(1, 600)])('Property 16: defeats are final and freeze the fight', (raw, masks) => {
  const cfg = compile(raw);
  let s = createInitialState(cfg);
  for (const [pm, am] of masks) {
    const r = step(s, tickInput(pm, am), cfg);
    const n = r.state;
    const g = n.gameplayTick;
    if (s.result === null) {
      const zero = n.fighters.map((f) => f.health === 0);
      for (const i of [0, 1]) {
        if (zero[i]) expect(n.fighters[i]!.fsm).toStrictEqual({ kind: 'Defeated', enteredAt: g });
        else expect(n.fighters[i]!.fsm.kind).not.toBe('Defeated');
      }
      if (zero[0] && zero[1]) expect(n.result).toEqual({ kind: 'draw', at: g });
      else if (zero[0]) expect(n.result).toEqual({ kind: 'win', winner: 'ai', at: g });
      else if (zero[1]) expect(n.result).toEqual({ kind: 'win', winner: 'player', at: g });
      else expect(n.result).toBeNull();
    } else {
      expect(n.result).toStrictEqual(s.result);
      expect(n.fighters.map((f) => [f.x, f.health])).toEqual(s.fighters.map((f) => [f.x, f.health]));
      for (const i of [0, 1]) if (s.fighters[i]!.fsm.kind === 'Defeated') expect(n.fighters[i]!.fsm).toStrictEqual(s.fighters[i]!.fsm);
      expect(r.events).toEqual([]);
      if (cfg.ai.enabled) expect(decideAi(n, [...n.rng] as RngState, cfg).mask).toBe(0);
    }
    s = n;
  }
});

// Feature: project-ring, Property 17: Event order and scope
// For any config and command sequence, every event returned by a Tick has `at` equal to that
// Tick's Gameplay_Tick, and the list consists of all Player_Fighter-owned events, then all
// AI_Fighter-owned events, then match-level events, each group in processing-step order.
// (Validates: Requirements 2.4, 35.12)
function owner(e: GameEvent): number {
  switch (e.type) {
    case 'hit-landed':
      return e.attacker === 'player' ? 0 : 1;
    case 'fighter-defeated':
      return e.fighter === 'player' ? 0 : 1;
    case 'match-result':
      return 2;
  }
}
const STEP_OF: Record<GameEvent['type'], number> = { 'hit-landed': 7, 'fighter-defeated': 8, 'match-result': 8 };

test.prop([arbConfig(), arbMaskPairs(1, 600), fc.boolean()])('Property 17: events are scoped to their Tick and ordered by D10', (raw, masks) => {
  const cfg = compile(raw);
  let s = createInitialState(cfg);
  for (const [pm, am] of masks) {
    const r = step(s, tickInput(pm, am), cfg);
    const g = r.state.gameplayTick;
    for (const e of r.events) expect(e.at).toBe(g);
    const keys = r.events.map((e) => owner(e) * 100 + STEP_OF[e.type]);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    expect(r.events.filter((e) => e.type === 'match-result').length).toBeLessThanOrEqual(1);
    s = r.state;
  }
});
