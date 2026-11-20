// Task 2.1: verifies the frame-order contract (design §3.2, Q11) on the installed R3F.
// Uses R3F's real frame loop (`advance`), not test-renderer's `advanceFrames`, which calls
// subscribers directly and never renders, so it could not show the automatic render.
import { useEffect } from 'react';
import { advance, useFrame, useThree, type RootState } from '@react-three/fiber';
import ReactThreeTestRenderer from '@react-three/test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { TICKER_PRIORITY, VISUAL_PRIORITY } from './frameOrder';

function Probe({ name, priority, log }: { name: string; priority: number; log: string[] }) {
  useFrame(() => {
    log.push(name);
  }, priority);
  return null;
}

function CaptureState({ onState }: { onState: (get: () => RootState) => void }) {
  const get = useThree((s) => s.get);
  useEffect(() => onState(get), [get, onState]);
  return null;
}

describe('R3F useFrame priority contract', () => {
  it('uses a ticker priority below the visual priority, and no positive priorities', () => {
    expect(TICKER_PRIORITY).toBeLessThan(VISUAL_PRIORITY);
    expect(TICKER_PRIORITY).toBeLessThanOrEqual(0);
    expect(VISUAL_PRIORITY).toBeLessThanOrEqual(0);
  });

  it('runs the ticker before visual callbacks in every frame and keeps the automatic render', async () => {
    const log: string[] = [];
    let getState: (() => RootState) | null = null;

    // Visual probes are mounted before the ticker, so mount order cannot explain the result.
    const renderer = await ReactThreeTestRenderer.create(
      <>
        <Probe name="visual-a" priority={VISUAL_PRIORITY} log={log} />
        <Probe name="visual-b" priority={VISUAL_PRIORITY} log={log} />
        <Probe name="ticker" priority={TICKER_PRIORITY} log={log} />
        <CaptureState onState={(get) => (getState = get)} />
      </>,
    );
    expect(getState).not.toBeNull();
    const state = getState!();

    // Render not taken over: no subscriber with priority > 0 is registered.
    expect(state.internal.priority).toBe(0);

    const render = vi.spyOn(state.gl, 'render').mockImplementation(() => {
      log.push('render');
    });

    advance(1000, true, state);
    advance(1016, true, state);

    expect(log).toEqual(['ticker', 'visual-a', 'visual-b', 'render', 'ticker', 'visual-a', 'visual-b', 'render']);
    expect(render).toHaveBeenCalledTimes(2);

    await renderer.unmount();
  });
});
