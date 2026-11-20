// Task 5.7: initial state and non-combat FSM rules (Req 4 c5-c9, 7 c2-c4, 9 c2-c4, 11 c1, 13 c1, 15 c1 a).
import { describe, expect, it } from 'vitest';
import { M1_TRANSITIONS, newFsmTickContext, transition } from './fsm';
import { HISTORY_SIZE, observe } from './observation';
import { seedSfc32 } from './rng';
import { createInitialState } from './state';
import { step } from './step';
import { CMD, type FsmTransitionRecord, type SimulationState } from './types';
import { cfgWith, tickInput } from '../test/sim';

const cfg = cfgWith((c) => (c.ai.enabled = false));

function run(masks: number[], from?: SimulationState): { s: SimulationState; trace: FsmTransitionRecord[] } {
  let s = from ?? createInitialState(cfg);
  const trace: FsmTransitionRecord[] = [];
  for (const m of masks) {
    const r = step(s, tickInput(m), cfg, { trace: true });
    trace.push(...r.trace!);
    s = r.state;
  }
  return { s, trace };
}

describe('initial state (Req 4 c9, 11 c1, 13 c1)', () => {
  const s = createInitialState(cfg);
  it('is the Tick 0 Match-start snapshot', () => {
    expect(s.version).toBe(1);
    expect(s.ruleset).toBe('m1');
    expect(s.tick).toBe(0);
    expect(s.gameplayTick).toBe(0);
    expect(s.hitStopRemaining).toBe(0);
    expect(s.matchStartAt).toBe(0);
    expect(s.result).toBeNull();
  });
  it('places both Fighters at their start positions, Idle, at maximum Health, facing each other', () => {
    const [p, a] = s.fighters;
    expect(p).toStrictEqual({ id: 'player', x: -1500, facing: 1, health: 100, fsm: { kind: 'Idle', enteredAt: 0 }, lastJabStartAt: null });
    expect(a).toStrictEqual({ id: 'ai', x: 1500, facing: -1, health: 100, fsm: { kind: 'Idle', enteredAt: 0 }, lastJabStartAt: null });
  });
  it('faces correctly when the player starts on the right', () => {
    const swapped = createInitialState(cfgWith((c) => (c.start = { player: 2, ai: -1 })));
    expect(swapped.fighters[0].facing).toBe(-1);
    expect(swapped.fighters[1].facing).toBe(1);
  });
  it('stores the seed, its PRNG state, and the config fingerprint (Req 3 c2, c8)', () => {
    expect(s.seed).toBe(1);
    expect(s.rng).toEqual(seedSfc32(1));
    expect(s.configFingerprint).toBe(cfg.fingerprint);
  });
  it('holds only the Match-start observation', () => {
    expect(s.history.count).toBe(1);
    expect(s.history.head).toBe(0);
    expect(s.history.entries).toHaveLength(HISTORY_SIZE);
    for (const e of s.history.entries) expect(e).toStrictEqual(observe(s.fighters[0], 0));
  });
  it('contains no UI fields (Req 2 c6)', () => {
    expect(Object.keys(s).sort()).toEqual(
      ['configFingerprint', 'fighters', 'gameplayTick', 'hitStopRemaining', 'history', 'matchStartAt', 'result', 'rng', 'ruleset', 'seed', 'tick', 'version'].sort(),
    );
  });
  it('first processed Tick is Tick 1 with both Fighters Idle before commands (Req 4 c9)', () => {
    const r = step(s, [], cfg);
    expect(r.state.tick).toBe(1);
    expect(r.state.gameplayTick).toBe(1);
    expect(r.state.fighters.map((f) => f.fsm.kind)).toEqual(['Idle', 'Idle']);
  });
});

describe('M1 transition table', () => {
  it('declares the 15 rules of design §6.1, with Defeated having none outgoing', () => {
    expect(M1_TRANSITIONS).toHaveLength(15);
    expect(M1_TRANSITIONS.filter((r) => r.from === 'Defeated')).toEqual([]);
    expect(Object.isFrozen(M1_TRANSITIONS)).toBe(true);
  });
});

describe('non-combat FSM rules (Req 15 c1 a)', () => {
  it('move: Idle + one direction -> Walking on that Tick (Req 7 c2)', () => {
    const { s, trace } = run([CMD.MoveRight]);
    expect(s.fighters[0].fsm).toStrictEqual({ kind: 'Walking', enteredAt: 1, dir: 1 });
    expect(trace).toEqual([{ fighter: 'player', from: 'Idle', to: 'Walking', trigger: 'move', step: 4, at: 1, ok: true }]);
  });
  it('Walking + the other direction stays Walking with a new direction (no transition)', () => {
    const { s, trace } = run([CMD.MoveRight, CMD.MoveLeft]);
    expect(s.fighters[0].fsm).toStrictEqual({ kind: 'Walking', enteredAt: 1, dir: -1 });
    expect(trace).toHaveLength(1);
  });
  it('stop: Walking + no movement -> Idle (Req 7 c3)', () => {
    const { s, trace } = run([CMD.MoveLeft, 0]);
    expect(s.fighters[0].fsm).toStrictEqual({ kind: 'Idle', enteredAt: 2 });
    expect(trace[1]).toEqual({ fighter: 'player', from: 'Walking', to: 'Idle', trigger: 'stop', step: 4, at: 2, ok: true });
  });
  it('Walking + both directions -> Idle (Req 7 c4)', () => {
    const { s } = run([CMD.MoveLeft, CMD.MoveLeft | CMD.MoveRight]);
    expect(s.fighters[0].fsm.kind).toBe('Idle');
  });
  it('Idle + both directions stays Idle with no transition', () => {
    const { s, trace } = run([CMD.MoveLeft | CMD.MoveRight]);
    expect(s.fighters[0].fsm).toStrictEqual({ kind: 'Idle', enteredAt: 0 });
    expect(trace).toEqual([]);
  });
  it('attack: Idle + jab -> Attacking in Startup_Phase on that Tick (Req 9 c2)', () => {
    const { s, trace } = run([0, 0, CMD.Jab]);
    expect(s.fighters[0].fsm).toStrictEqual({ kind: 'Attacking', enteredAt: 3, attackId: 'jab', phase: 'startup', contactUsed: false });
    expect(s.fighters[0].lastJabStartAt).toBe(3);
    expect(trace).toEqual([{ fighter: 'player', from: 'Idle', to: 'Attacking', trigger: 'attack', step: 4, at: 3, ok: true }]);
  });
  it('attack: Walking + jab + movement -> Attacking (jab outranks movement, D9)', () => {
    const { s } = run([CMD.MoveRight, CMD.MoveRight | CMD.Jab]);
    expect(s.fighters[0].fsm).toMatchObject({ kind: 'Attacking', enteredAt: 2 });
  });
  it('attack-end: Attacking -> Idle on Tick N+S+A+R in step 3 (Req 9 c4)', () => {
    const total = cfg.jab.total; // 14
    const { s, trace } = run([CMD.Jab, ...Array<number>(total).fill(0)]);
    expect(s.fighters[0].fsm).toStrictEqual({ kind: 'Idle', enteredAt: 1 + total });
    expect(trace.at(-1)).toEqual({ fighter: 'player', from: 'Attacking', to: 'Idle', trigger: 'attack-end', step: 3, at: 1 + total, ok: true });
  });
  it('a jab during Attacking is discarded and changes nothing (Req 4 c6, c11; Req 9 c6)', () => {
    const base = run([CMD.Jab, 0, 0]).s;
    const withJab = run([CMD.Jab, CMD.Jab, CMD.Jab | CMD.MoveLeft]).s;
    expect(withJab).toStrictEqual(base);
  });
  it('a new jab is accepted on the attack-end Tick itself', () => {
    const total = cfg.jab.total;
    const { s } = run([CMD.Jab, ...Array<number>(total - 1).fill(0), CMD.Jab]);
    expect(s.fighters[0].fsm).toMatchObject({ kind: 'Attacking', enteredAt: 1 + total, phase: 'startup' });
  });
});

describe('transition() guards (Req 4 c5, c6, c8)', () => {
  it('rejects an undeclared transition and leaves the state unchanged', () => {
    const s = createInitialState(cfg);
    const f = s.fighters[0];
    f.fsm = { kind: 'Defeated', enteredAt: 3 };
    const trace: FsmTransitionRecord[] = [];
    const ok = transition(f, { kind: 'Idle', enteredAt: 4 }, 'stun-end', 3, newFsmTickContext(4, trace));
    expect(ok).toBe(false);
    expect(f.fsm).toStrictEqual({ kind: 'Defeated', enteredAt: 3 });
    expect(trace).toEqual([{ fighter: 'player', from: 'Defeated', to: 'Idle', trigger: 'stun-end', step: 3, at: 4, ok: false }]);
  });
  it('rejects a declared rule used in the wrong step', () => {
    const f = createInitialState(cfg).fighters[0];
    expect(transition(f, { kind: 'Walking', enteredAt: 1, dir: 1 }, 'move', 3, newFsmTickContext(1))).toBe(false);
    expect(f.fsm.kind).toBe('Idle');
  });
  it('allows at most one transition per Fighter per step', () => {
    const f = createInitialState(cfg).fighters[0];
    const ctx = newFsmTickContext(1);
    expect(transition(f, { kind: 'Walking', enteredAt: 1, dir: 1 }, 'move', 4, ctx)).toBe(true);
    expect(transition(f, { kind: 'Idle', enteredAt: 1 }, 'stop', 4, ctx)).toBe(false);
    expect(f.fsm.kind).toBe('Walking');
  });
});

describe('command intake (Req 2 c2, c7; D40)', () => {
  it('drops external AI_Fighter commands while the AI is enabled', () => {
    const enabled = cfgWith();
    const r = step(createInitialState(enabled), tickInput(0, CMD.MoveLeft), enabled);
    expect(r.state.fighters[1].fsm.kind).toBe('Idle');
  });
  it('accepts external AI_Fighter commands when the AI is disabled', () => {
    const r = step(createInitialState(cfg), tickInput(0, CMD.MoveLeft), cfg);
    expect(r.state.fighters[1].fsm).toStrictEqual({ kind: 'Walking', enteredAt: 1, dir: -1 });
  });
  it('discards unknown fighters and types without error, processing the rest', () => {
    const input = [
      { fighter: 'referee', type: 'jab' },
      { fighter: 'player', type: 'kick' },
      { fighter: 'player', type: 'cross' },
      null,
      { fighter: 'player', type: 'jab' },
    ];
    const r = step(createInitialState(cfg), input as never, cfg);
    expect(r.state.fighters[0].fsm.kind).toBe('Attacking');
  });
  it('treats a non-array input as no command', () => {
    const r = step(createInitialState(cfg), null as never, cfg);
    expect(r.state.fighters[0].fsm.kind).toBe('Idle');
  });
  it('step() does not mutate its input state', () => {
    const s = createInitialState(cfg);
    const before = JSON.stringify(s);
    step(s, tickInput(CMD.Jab | CMD.MoveRight), cfg);
    expect(JSON.stringify(s)).toBe(before);
  });
});
