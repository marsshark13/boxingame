// Task 9: createMatch, MatchDriver, and serialization examples (Req 1 c5, 2 c4, 3 c4, c6, c9, 5 c4, 13 c4-c6).
import { describe, expect, it } from 'vitest';
import { defaultConfig } from './config/defaults';
import { MatchDriver } from './driver';
import { createMatch } from './match';
import { parseSimulationState, serialize } from './serialize';
import { createInitialState } from './state';
import { CMD } from './types';
import { cfgWith } from '../test/sim';

describe('createMatch (Req 5 c4)', () => {
  it('returns a driver for a valid config', () => {
    const r = createMatch(defaultConfig());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.driver.curr.tick).toBe(0);
  });
  it('returns every error and no driver for an invalid config', () => {
    const c = defaultConfig();
    c.maxHealth = 0;
    c.attacks[0]!.startup = 0;
    const r = createMatch(c);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.setting).sort()).toEqual(['attacks[jab].startup', 'config.maxHealth']);
    expect('driver' in r).toBe(false);
  });
});

describe('MatchDriver double buffering (design §2.1)', () => {
  const cfg = cfgWith();
  it('keeps prev and curr as the two most recent states', () => {
    const d = new MatchDriver(cfg);
    d.tick(0);
    d.tick(CMD.MoveRight);
    expect(d.prev.tick).toBe(1);
    expect(d.curr.tick).toBe(2);
    for (let i = 0; i < 5; i++) d.tick(0);
    expect([d.prev.tick, d.curr.tick]).toEqual([6, 7]);
    expect(d.prev).not.toBe(d.curr);
  });
  it('collects a frame’s events across catch-up Ticks and clears them on beginFrame', () => {
    const near = cfgWith((c) => {
      c.start = { player: -0.45, ai: 0.45 };
      c.ai.attackInterval = 1;
    });
    const d = new MatchDriver(near);
    d.beginFrame();
    const perTick: number[] = [];
    for (let i = 0; i < 10; i++) perTick.push(d.tick(0).length);
    expect(d.frameEvents.length).toBe(perTick.reduce((a, b) => a + b, 0));
    expect(d.frameEvents.length).toBeGreaterThan(0);
    d.beginFrame();
    expect(d.frameEvents).toEqual([]);
  });
  it('view() exposes prev, curr, and alpha', () => {
    const d = new MatchDriver(cfg);
    d.tick(0);
    d.setAlpha(0.25);
    const v = d.view();
    expect(v.prev).toBe(d.prev);
    expect(v.curr).toBe(d.curr);
    expect(v.alpha).toBe(0.25);
  });
  it('restart resets both buffers to the initial state, with the initial seed (Req 13 c4, D8)', () => {
    const d = new MatchDriver(cfg);
    for (let i = 0; i < 300; i++) d.tick(i % 3 === 0 ? CMD.Jab | CMD.MoveRight : CMD.MoveRight);
    d.restart();
    const s0 = createInitialState(cfg);
    expect(d.curr).toStrictEqual(s0);
    expect(d.prev).toStrictEqual(s0);
    expect(d.frameEvents).toEqual([]);
    d.tick(CMD.MoveRight); // commands are processed on the very next Tick (Req 13 c5)
    expect(d.curr.fighters[0].fsm.kind).toBe('Walking');
  });
});

describe('parseSimulationState examples (Req 3 c4, c6, c9)', () => {
  const cfg = cfgWith();
  const s = createInitialState(cfg);
  const json = serialize(s);
  it('accepts its own serialization', () => {
    const r = parseSimulationState(json, cfg);
    expect(r.ok && r.state).toStrictEqual(s);
  });
  it.each([
    ['malformed JSON', json.slice(0, -1)],
    ['a non-object', '42'],
    ['an extra field', JSON.stringify({ ...s, screen: 'fight' })],
    ['another version', JSON.stringify({ ...s, version: 2 })],
    ['-0 spelled in JSON', json.replace('"gameplayTick":0', '"gameplayTick":-0')],
    ['a non-finite stand-in', json.replace('"tick":0', '"tick":1e999')],
    ['Health above maxHealth', JSON.stringify({ ...s, fighters: [{ ...s.fighters[0], health: 101 }, s.fighters[1]] })],
    ['a Fighter outside the ring', JSON.stringify({ ...s, fighters: [{ ...s.fighters[0], x: -3001 }, s.fighters[1]] })],
  ])('rejects %s as invalid-Simulation_State', (_name, bad) => {
    const r = parseSimulationState(bad, cfg);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid-Simulation_State');
  });
  it('rejects a state from another configuration as config-mismatch (D42)', () => {
    const other = cfgWith((c) => (c.maxHealth = 99));
    const r = parseSimulationState(json, other);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('config-mismatch');
  });
});
