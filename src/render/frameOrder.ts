// Frame-order contract for R3F's single rAF loop (design §3.2, Q11; Req 1 c5, Req 34 c4).
//
// R3F runs useFrame subscribers in ascending priority order and renders automatically
// after them unless some subscriber has a priority > 0. So:
// - the SimulationTicker runs first in every frame (TICKER_PRIORITY = -1), advancing the
//   simulation before anything reads it;
// - every visual callback (FighterView, CameraRig, ...) uses VISUAL_PRIORITY = 0 and
//   reads the states the ticker just produced;
// - nothing uses a positive priority, so R3F keeps its automatic render.
// Verified against the installed R3F version by frameOrder.test.tsx (task 2.1).
export const TICKER_PRIORITY = -1;
export const VISUAL_PRIORITY = 0;
