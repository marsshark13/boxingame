// Task 12.4: D43 and key mapping examples (Req 8 c1, c2, c5-c10).
import { describe, expect, it } from 'vitest';
import { InputSampler } from './inputSampler';
import { KEY_BINDINGS, bindingFor } from './keymap';
import { attachKeyboard, type KeyboardTarget } from './domKeyboard';
import { CMD } from '../sim/types';

describe('key mapping (Req 8 c1, c2, c10)', () => {
  it('maps A and Left to move-left, D and Right to move-right, J to jab', () => {
    expect(bindingFor('KeyA')?.bit).toBe(CMD.MoveLeft);
    expect(bindingFor('ArrowLeft')?.bit).toBe(CMD.MoveLeft);
    expect(bindingFor('KeyD')?.bit).toBe(CMD.MoveRight);
    expect(bindingFor('ArrowRight')?.bit).toBe(CMD.MoveRight);
    expect(bindingFor('KeyJ')?.bit).toBe(CMD.Jab);
  });
  it('leaves other keys unmapped in M1', () => {
    for (const code of ['KeyK', 'KeyL', 'KeyI', 'KeyS', 'ArrowDown', 'Space', 'Enter', 'KeyW']) expect(bindingFor(code)).toBeUndefined();
  });
  it('lists every binding once', () => {
    expect(KEY_BINDINGS.map((b) => b.action)).toEqual(['move-left', 'move-right', 'jab']);
  });
  it('Shift and Caps Lock do not change the mapping: events are matched by code', () => {
    const fake = fakeTarget();
    const s = new InputSampler();
    attachKeyboard(s, fake);
    fake.fire('keydown', { code: 'KeyJ', key: 'J', shiftKey: true, repeat: false });
    expect(s.sampleTick()).toBe(CMD.Jab);
    fake.fire('keyup', { code: 'KeyJ', key: 'J' });
    fake.fire('keydown', { code: 'KeyD', key: 'D', getModifierState: () => true, repeat: false }); // Caps Lock on
    expect(s.sampleTick()).toBe(CMD.MoveRight);
  });
});

describe('level keys (Req 8 c6, c8, D43)', () => {
  it('hold D across three samples: MoveRight on the samples before release, not after', () => {
    const s = new InputSampler();
    s.keyDown('KeyD');
    expect(s.sampleTick()).toBe(CMD.MoveRight);
    expect(s.sampleTick()).toBe(CMD.MoveRight);
    s.keyUp('KeyD');
    expect(s.sampleTick()).toBe(0);
  });
  it('press and release D between two samples gives nothing', () => {
    const s = new InputSampler();
    s.keyDown('KeyD');
    s.keyUp('KeyD');
    expect(s.sampleTick()).toBe(0);
  });
  it('both directions held give neither', () => {
    const s = new InputSampler();
    s.keyDown('KeyA');
    s.keyDown('ArrowRight');
    expect(s.sampleTick()).toBe(0);
    s.keyUp('KeyA');
    expect(s.sampleTick()).toBe(CMD.MoveRight);
  });
  it('two keys for one direction: releasing one keeps the direction', () => {
    const s = new InputSampler();
    s.keyDown('KeyA');
    s.keyDown('ArrowLeft');
    s.keyUp('KeyA');
    expect(s.sampleTick()).toBe(CMD.MoveLeft);
  });
});

describe('edge keys (Req 8 c5, c9)', () => {
  it('press and release J between two samples still gives one Jab', () => {
    const s = new InputSampler();
    s.keyDown('KeyJ');
    s.keyUp('KeyJ');
    expect(s.sampleTick()).toBe(CMD.Jab);
    expect(s.sampleTick()).toBe(0);
  });
  it('holding J gives one Jab; auto-repeat is ignored', () => {
    const s = new InputSampler();
    s.keyDown('KeyJ');
    expect(s.sampleTick()).toBe(CMD.Jab);
    s.keyDown('KeyJ', true);
    s.keyDown('KeyJ', true);
    expect(s.sampleTick()).toBe(0);
    s.keyUp('KeyJ');
    s.keyDown('KeyJ');
    expect(s.sampleTick()).toBe(CMD.Jab);
  });
  it('several J presses within one Tick give only one Jab', () => {
    const s = new InputSampler();
    s.keyDown('KeyJ');
    s.keyUp('KeyJ');
    s.keyDown('KeyJ');
    s.keyUp('KeyJ');
    expect(s.sampleTick()).toBe(CMD.Jab);
    expect(s.sampleTick()).toBe(0);
  });
  it('a jab press combines with held movement', () => {
    const s = new InputSampler();
    s.keyDown('KeyD');
    s.keyDown('KeyJ');
    expect(s.sampleTick()).toBe(CMD.MoveRight | CMD.Jab);
  });
});

describe('focus loss (Req 8 c7)', () => {
  it('blur releases every key and drops a latched press', () => {
    const s = new InputSampler();
    s.keyDown('KeyD');
    s.keyDown('KeyJ');
    s.blur();
    expect(s.sampleTick()).toBe(0);
    s.keyDown('KeyD', true); // the key is still physically held: only repeats arrive
    expect(s.sampleTick()).toBe(0);
    s.keyUp('KeyD');
    s.keyDown('KeyD');
    expect(s.sampleTick()).toBe(CMD.MoveRight);
  });
  it('the DOM adapter forwards blur and detaches cleanly', () => {
    const fake = fakeTarget();
    const s = new InputSampler();
    const dispose = attachKeyboard(s, fake);
    fake.fire('keydown', { code: 'KeyA', repeat: false });
    fake.fire('blur', {});
    expect(s.sampleTick()).toBe(0);
    dispose();
    expect(fake.count()).toBe(0);
    fake.fire('keydown', { code: 'KeyA', repeat: false });
    expect(s.sampleTick()).toBe(0);
  });
});

function fakeTarget(): KeyboardTarget & { fire(type: string, e: object): void; count(): number } {
  const listeners = new Map<string, Set<(e: never) => void>>();
  return {
    addEventListener(type: string, l: (e: never) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(l);
    },
    removeEventListener(type: string, l: (e: never) => void) {
      listeners.get(type)?.delete(l);
    },
    fire(type: string, e: object) {
      for (const l of listeners.get(type) ?? []) l(e as never);
    },
    count() {
      return [...listeners.values()].reduce((n, s) => n + s.size, 0);
    },
  } as KeyboardTarget & { fire(type: string, e: object): void; count(): number };
}
