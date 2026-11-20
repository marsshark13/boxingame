// Architecture smoke test (task 1.4; Req 2 c1, c3; Req 15 c5).
// Runs in the Vitest `sim` project (environment: node). If anything reachable from the
// public simulation entry point imported React, Three.js, or touched the DOM at import
// time, this import would fail or `window` would have to exist.
import { describe, expect, it } from 'vitest';

describe('Game_Simulation architecture', () => {
  it('imports src/sim/index.ts in Node with no DOM globals', async () => {
    const mod = await import('./index');
    expect(mod).toBeTypeOf('object');
    expect('window' in globalThis).toBe(false);
    expect('document' in globalThis).toBe(false);
    expect(typeof (globalThis as Record<string, unknown>)['window']).toBe('undefined');
  });
});
