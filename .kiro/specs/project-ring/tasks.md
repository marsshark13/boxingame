# Implementation Plan: Project RING

## Overview

Project RING is built in four phases that follow the design: M1 Playable Prototype (design sections 1–14), P2 Full Combat (Part 2), P3 Match Structure and Menus (Part 3), and P4 Presentation and Polish (Part 4). The implementation language is TypeScript throughout. The pure simulation (`src/sim`) and the fixed-step loop (`src/loop`) are built and tested first in the Vitest `sim` (Node) project; the browser shell (`src/input`, `src/render`, `src/ui`, `src/app`) is wired around them afterwards. Each later phase adds state fields, FSM rows, and work inside existing Tick pipeline steps without redesigning earlier code, and keeps earlier properties running as a regression suite.

Conventions: "Property N" refers to the design's Correctness Properties section. Property-based tests use `fast-check` via `@fast-check/vitest` with at least 100 runs, read `FC_SEED`, and carry the tag comment `// Feature: project-ring, Property N: <name>` (design section 13.1). Requirement references use `R.C` (requirement R, acceptance criterion C).

## Tasks

### M1 – Playable Prototype

- [x] 1. Set up the project, tooling, and architecture enforcement
  - [x] 1.1 Scaffold the Vite + React + TypeScript application
    - Create the Vite React-TS project in the workspace root with `base: './'` in `vite.config.ts`, no SSR, and no runtime `import.meta.env` values
    - Install runtime dependencies: `three`, `@react-three/fiber`, `react`, `react-dom`, `zustand`, `zod`; dev dependencies: `typescript`, `tailwindcss` (with PostCSS config and `src/index.css` directives), `vitest`, `jsdom`, `fast-check`, `@fast-check/vitest`, `@react-three/test-renderer`, `@testing-library/react`, `@playwright/test`, `eslint`, `@typescript-eslint/*`
    - Create the directory skeleton of design §1.2 (`src/sim`, `src/sim/config`, `src/sim/ai`, `src/loop`, `src/input`, `src/render`, `src/ui`, `src/app`, `bench/`, `e2e/`) with placeholder `index.ts` files where needed
    - Add `index.html` with a `#boot-status` element and self-hosted font setup (no CDN or Google Fonts)
    - _Requirements: 14.1, 14.2, 14.4, 14.5_
  - [x] 1.2 Configure the Vitest `sim` and `ui` projects and property-test helpers
    - `vitest.config.ts` (or workspace file) with project `sim` (`environment: 'node'`, includes `src/sim/**`, `src/loop/**`, `src/input/inputSampler*`, `src/render/cameraMath*`, and later the pure presentation modules) and project `ui` (`environment: 'jsdom'`, includes `src/ui/**`, `src/app/**`, `src/render/**/*.test.tsx`)
    - Create `src/test/fc.ts`: `fc.configureGlobal({ numRuns: 100 })`, `FC_SEED` env replay, and a helper that prints seed and path on failure
    - Add npm scripts `test` (`vitest --run`), `typecheck`, `lint`, `build`, `preview`, `bench`, `e2e`
    - _Requirements: 15.2, 15.3, 15.4, 15.5_
  - [x] 1.3 Add ESLint import and global restrictions and `tsconfig.sim.json`
    - ESLint `no-restricted-imports` for `src/sim/**` and `src/loop/**`: ban `react`, `react-dom`, `three`, `three/*`, `@react-three/*`, `zustand`, and relative imports into `src/render`, `src/ui`, `src/app`, `src/input`
    - ESLint `no-restricted-globals` / `no-restricted-properties` for the same scope: `window`, `document`, `navigator`, `performance`, `Date`, `requestAnimationFrame`, `AudioContext`, `setTimeout`, `Math.random`, and transcendental `Math` functions (`Math.pow`, `Math.sin`, `Math.cos`, `Math.exp`, `Math.log`) per design §14.2
    - Encode the allowed import direction of design §1.4 for the other modules (`render → sim types, ui/stores`; `ui → sim types`; `input → sim command constants`; `loop → nothing`)
    - `tsconfig.sim.json` with `"lib": ["ES2022"]`, `"types": []`, covering `src/sim` and `src/loop`; include it in `npm run typecheck`
    - _Requirements: 2.1, 2.3, 15.5_
  - [x]* 1.4 Write the architecture smoke test
    - Node test that imports `src/sim/index.ts` and asserts `typeof window === 'undefined'` and that the import succeeds; a lint fixture that proves a banned import in `src/sim` fails ESLint
    - _Requirements: 2.1, 2.3, 15.5_

- [x] 2. Verify React Three Fiber `useFrame` priority ordering (design Q11)
  - [x] 2.1 Implement and test the frame-order contract
    - Create `src/render/frameOrder.ts` exporting `TICKER_PRIORITY` and `VISUAL_PRIORITY` constants used by every later `useFrame` call
    - Write `src/render/frameOrder.test.tsx` with `@react-three/test-renderer`: a callback registered with `useFrame(cb, -1)` runs before priority-0 callbacks in the same frame, and R3F's automatic render still happens (render not taken over)
    - If the installed R3F version fails this test, switch to the design fallback: ticker at priority 1, visual callbacks after it, and one final callback that calls `gl.render` manually; update the constants and the test accordingly
    - _Requirements: 1.5, 34.4_

- [x] 3. Implement core simulation types, fixed-point helpers, and the PRNG
  - [x] 3.1 Define the M1 types and fixed-point helpers
    - `src/sim/types.ts`: `FighterId`, `CommandType`, `FighterCommand`, `TickInput`, `CMD` bit constants, `CommandMask`, `M1_ENABLED_MASK`, `GTick`, `AttackPhase`, `FsmState` union (Idle, Walking, Attacking, HitStun, Defeated), `FighterState`, `RngState`, `PlayerObservation`, `ObservationHistory`, `MatchResult`, `SimulationState` (version 1, ruleset `'m1'`, `tick`, `gameplayTick`, `hitStopRemaining`, `matchStartAt`, `seed`, `configFingerprint`, `rng`, `fighters`, `history`, `result`), `StepResult`, `GameEvent` (M1), `AttackDefinition`, `CompiledAttack`, `DeepReadonly`
    - `src/sim/fixed.ts`: `toFx`, `fromFx`, `i32` (normalizes `-0`), `roundHalfUp`
    - _Requirements: 2.2, 2.6, 4.1, 4.2, 4.7, 5.1, 3.2_
  - [x] 3.2 Implement the sfc32 PRNG
    - `src/sim/rng.ts`: splitmix32 seeding of four uint32 words from a 32-bit seed, 12 warm-up steps, `next(rng)` using only `Math.imul`, `+`, `>>>`, `|`, `^`; state stored as `[a, b, c, d]`
    - _Requirements: 3.2_
  - [x]* 3.3 Write unit tests for fixed-point helpers and sfc32
    - sfc32 known-answer vectors for seeds 0, 1, and 4,294,967,295; `i32(-0)` is `0`; `roundHalfUp` at `.5` boundaries
    - _Requirements: 3.2_

- [x] 4. Implement configuration defaults, validation, compilation, and fingerprint
  - [x] 4.1 Create the default config and the M1 Attack_Registry
    - `src/sim/config/defaults.ts` (ring, start positions, `minSeparation`, `walkSpeed`, hurtbox, `maxHealth`, `ai.enabled`, `ai.reactionDelay`, `ai.attackInterval`, seed) and `src/sim/config/attacks.ts` (jab only), in world units
    - _Requirements: 5.1, 5.2, 9.1, 11.1_
  - [x] 4.2 Implement zod schemas and cross-field checks
    - `src/sim/config/schema.ts`: field ranges of design §2.7 and D2 Tick ranges for attacks; unique ids; exactly one jab with strictly lowest startup; empty registry error `attacks: empty registry`; ring width, start-position, and separation checks of design §7.4 run on compiled Fx values
    - Collect every issue (zod `safeParse` plus appended cross-field errors), each naming the setting or `attacks[id or index].field`; never adjust or default values
    - _Requirements: 5.4, 5.5, 5.6, 7.7, 7.11, 9.1, 11.9, 12.4, 12.5, 3.2_
  - [x] 4.3 Implement config compilation, jab reachability, and fingerprint
    - `src/sim/config/compile.ts`: convert to Fx once; build `CompiledAttack` (`hitboxFx`, `total`, `reachFx`, `connectRange2`, `nearEdge2`, `reach {dLo, dHi}`); refuse with `attacks[jab]: cannot connect at any distance >= minSeparation` or `attacks[jab]: near edge exceeds minSeparation; AI jab distances would miss` (design §8.4)
    - `src/sim/fingerprint.ts`: FNV-1a 32-bit over canonical JSON of the validated config (sorted keys, attacks in registry order, authored world-unit numbers); store on the compiled config
    - _Requirements: 15.7, 15.8, 3.8, 5.3_
  - [x]* 4.4 Write property test for Property 22: Attack definition validation reports every invalid field
    - **Property 22: Attack definition validation reports every invalid field**
    - **Validates: Requirements 5.4, 5.5**
  - [x]* 4.5 Write property test for Property 26: Jab reachability matches brute-force overlap
    - **Property 26: Jab reachability matches brute-force overlap**
    - Use the `arbReachConfig` generator of design §13.2
    - **Validates: Requirements 15.7, 15.8**
  - [x]* 4.6 Write unit tests for configuration validation and fingerprint
    - Ring width equal to and below `minSeparation`; each start position out of bounds and too close; `maxHealth` 0, 1001, 1.5; `reactionDelay` 121; `attackInterval` 0 and 601; non-boolean `ai.enabled`; seed out of range; missing jab; jab not strictly fastest; no vertical overlap; near edge beyond `minSeparation`; every Req 5 c5 rejection case and several errors reported together
    - FNV-1a known-answer vector; key order does not change the fingerprint; changing one value does
    - _Requirements: 5.5, 5.6, 7.7, 7.11, 9.1, 11.9, 15.1, 15.8, 3.8_

- [x] 5. Implement state, observation history, FSM table, and the Tick pipeline skeleton
  - [x] 5.1 Implement initial state, state copy, and the observation ring buffer
    - `src/sim/state.ts`: `createInitialState(cfg)` (Tick 0 snapshot, Idle@0, max Health, facing from positions, `rng = seedSfc32(seed)`, `configFingerprint`), `copyStateInto(next, prev)` with fixed field order and no allocation, `cloneState`
    - `src/sim/observation.ts`: `HISTORY_SIZE = 121`, `initHistory`, `pushObservation` (slot reuse), `observe`, `observationFor(h, k, startAt)` with the Match-start fallback
    - _Requirements: 4.9, 11.1, 12.9, 12.10, 12.11, 13.1, 3.8_
  - [x] 5.2 Implement the M1 transition table and `transition()`
    - `src/sim/fsm.ts`: `Trigger` type, `TransitionRule`, exported `M1_TRANSITIONS` data, `RULE_INDEX`, `transition()` that checks rule and step, enforces one transition per Fighter per step, sets `enteredAt = g` (HitStun refresh keeps it), and records to an opt-in trace; `activeTable(cfg)` returning the table for the current mode
    - _Requirements: 4.2, 4.5, 4.6, 4.7, 4.8, 4.10_
  - [x] 5.3 Implement `stepInto`/`step` with steps 1–5 and 10
    - `src/sim/step.ts`: `EventCollector` (player, ai, global queues; D10 flush), tick counters, step 1 Hit_Stop no-op, step 2b command intake (drop unknown fighters/types, `M1_ENABLED_MASK`, zero masks after a result or for Defeated), step 3 `advanceTimers` (phase recompute, `attack-end`, `stun-end`), step 4 `selectAction` (jab > movement > Idle, `lastJabStartAt`), step 5 no-op, step 10 observation push and flush; `step()` pure wrapper with optional trace
    - `src/sim/index.ts`: export `step`, `stepInto`, types, and config entry points
    - _Requirements: 1.1, 2.2, 2.4, 2.7, 4.10, 4.11, 7.2, 7.3, 7.4, 7.9, 9.2, 9.3, 9.4, 9.6, 35.1, 35.2, 35.12_
  - [x]* 5.4 Write property test for Property 7: Invalid commands are ignored
    - **Property 7: Invalid commands are ignored**
    - Use `arbTickInputs(len)` with junk entries
    - **Validates: Requirements 2.2, 2.7**
  - [x]* 5.5 Write property test for Property 10: Attack timing
    - **Property 10: Attack timing**
    - **Validates: Requirements 5.3, 5.7, 9.2, 9.3, 9.4, 9.5**
  - [x]* 5.6 Write property test for Property 20: Observation history ring buffer
    - **Property 20: Observation history ring buffer**
    - **Validates: Requirements 12.9, 12.10**
  - [x]* 5.7 Write unit tests for initial state and non-combat FSM rules
    - Initial state is Idle, max Health, facing each other, `tick` 0; table-driven scenarios for `move`, `stop`, `attack`, `attack-end`; jab during Attacking discarded; Walking with both directions goes Idle
    - _Requirements: 4.9, 11.1, 13.1, 15.1_

- [x] 6. Implement movement, separation, and facing (pipeline step 6)
  - [x] 6.1 Implement `applyMovement` and `updateFacing` and wire them into step 6
    - `src/sim/movement.ts`: boundary limit first (D38), then separation shortening only toward-movement with the D39 split (odd 1 Fx to the larger toward-mover, Player_Fighter on ties, share cap with remainder to the other Fighter), defensive clamp, `i32` writes; per-Fighter displacement inputs so P2 speeds plug in later; `updateFacing` at the end of step 6
    - _Requirements: 7.1, 7.4, 7.5, 7.6, 7.8, 7.10, 35.1_
  - [x]* 6.2 Write property test for Property 12: Movement and separation model
    - **Property 12: Movement and separation model**
    - **Validates: Requirements 7.1, 7.4, 7.5, 7.6**
  - [x]* 6.3 Write property test for Property 11: State invariants
    - **Property 11: State invariants**
    - **Validates: Requirements 1.1, 4.1, 7.8, 7.10, 11.2**
  - [x]* 6.4 Write unit tests for clamping and separation
    - Walk into left and right walls; walk into the opponent (exact `minSeparation`); even shortfall; odd shortfall with unequal and equal toward-movement; share above one Fighter's toward-movement; the wall-and-opponent case of design §7.2
    - _Requirements: 7.5, 7.6, 15.1_

- [x] 7. Implement jab hit detection, damage, and Health-zero rules (pipeline steps 7–8)
  - [x] 7.1 Implement the two-phase Combat_Resolver and wire it into step 7
    - `src/sim/combat.ts`: doubled-Fx Hitbox (mirrored by facing) and Hurtbox, strict `overlap`, `intersectionCenter`, `detectHits` (reads only; active phase, unused contact), `applyHits` (mark `contactUsed` first, `max(1, roundHalfUp(base))` damage, Health clamp, HitStun entry or `until` refresh, D41 zero-stun handling, `hit-landed` event with `hitPos` in world units)
    - Skip step 7 once a result exists
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 11.2, 35.4, 35.7, 35.8, 5.3_
  - [x] 7.2 Implement the step 8 Health-zero check and M1 result
    - `checkHealthZero`: Health 0 → Defeated (overrides HitStun from step 7), `fighter-defeated` events, `result` win or draw with `match-result` global event
    - _Requirements: 11.6, 11.7, 11.8, 13.3, 35.9, 35.10, 4.10_
  - [x]* 7.3 Write property test for Property 13: Hits happen exactly on active overlaps
    - **Property 13: Hits happen exactly on active overlaps**
    - **Validates: Requirements 10.1, 10.2, 10.7, 10.9**
  - [x]* 7.4 Write property test for Property 14: Damage and contact accounting
    - **Property 14: Damage and contact accounting**
    - **Validates: Requirements 10.3, 10.4, 10.5, 35.7**
  - [x]* 7.5 Write property test for Property 15: Combat resolution is order-independent
    - **Property 15: Combat resolution is order-independent**
    - **Validates: Requirements 10.6, 35.4**
  - [x]* 7.6 Write property test for Property 28: Zero hit-stun hits never enter HitStun
    - **Property 28: Zero hit-stun hits never enter HitStun**
    - **Validates: Requirements 10.10, 10.11**
  - [x]* 7.7 Write property test for Property 8: FSM transitions follow the table
    - **Property 8: FSM transitions follow the table**
    - **Validates: Requirements 4.5, 4.7, 4.8, 35.2**
  - [x]* 7.8 Write property test for Property 9: Commands to a Fighter that cannot act have no effect
    - **Property 9: Commands to a Fighter that cannot act have no effect**
    - **Validates: Requirements 4.6, 4.11, 7.9, 9.6**
  - [x]* 7.9 Write unit tests for combat outcomes and Req 35 M1 rules
    - Overlap in active → hit; no overlap; overlap in startup and recovery; edges touching; second overlap Tick of the same attack; Trade (both apply, both attacks end, event order); Health zero during a HitStun-causing hit → Defeated; simultaneous Health 0 → draw; HitStun refresh; zero-stun jab on Attacking, Idle, Walking, and HitStun targets
    - Default-config reachability: jab connects at `minSeparation`, at `dHi`, and at every 1 Fx step in `[minSeparation, Connect_Range)` through `detectHits`
    - _Requirements: 10.2, 10.6, 10.7, 10.10, 15.1, 15.7, 35.9, 35.10, 35.12_

- [x] 8. Implement the M1 AI_Controller inside step 2
  - [x] 8.1 Implement `decideAi` and wire it into step 2a
    - `src/sim/ai/m1Ai.ts`: `decideAi(state: DeepReadonly<SimulationState>, rng, cfg) -> { mask, rng }` per design §9.2 (no commands after a result; approach while `2d ≥ connectRange2`; jab when Able_To_Act and the attack interval has passed since `lastJabStartAt ?? matchStartAt`; player read only through `observationFor(T − 1 − D)`); returns the received rng unchanged
    - In `stepInto` step 2a call `decideAi(prev, [...prev.rng], cfg)` when `cfg.ai.enabled`, commit the returned rng, and drop external `ai` commands in step 2b while the AI is enabled
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.10, 12.13, 12.14, 2.2, 3.7, 35.1_
  - [x]* 8.2 Write property test for Property 18: AI decision model
    - **Property 18: AI decision model**
    - **Validates: Requirements 12.2, 12.3, 12.4, 12.7**
  - [x]* 8.3 Write property test for Property 19: AI sees the player only through the delayed observation
    - **Property 19: AI sees the player only through the delayed observation**
    - **Validates: Requirements 12.5, 12.10, 12.13**
  - [x]* 8.4 Write property test for Property 27: M1 AI leaves the PRNG unchanged
    - **Property 27: M1 AI leaves the PRNG unchanged**
    - **Validates: Requirements 12.6, 12.14**
  - [x]* 8.5 Write property test for Property 16: Defeat and post-result stability
    - **Property 16: Defeat and post-result stability**
    - **Validates: Requirements 4.10, 11.6, 11.7, 13.3, 35.9, 12.8**
  - [x]* 8.6 Write property test for Property 17: Event order and scope
    - **Property 17: Event order and scope**
    - **Validates: Requirements 2.4, 35.12**
  - [x]* 8.7 Write unit tests for AI placement in the Tick
    - AI decision runs before intake in step 2; an external `ai` command is dropped while the AI is enabled and accepted with `ai.enabled = false`; the AI uses the same acceptance rules as the player (approach ignored while not Able_To_Act)
    - _Requirements: 12.1, 2.2, 15.1, 35.1_

- [x] 9. Implement serialization, `createMatch`, and the MatchDriver
  - [x] 9.1 Implement JSON serialization and strict parsing
    - `src/sim/serialize.ts`: `serialize(state)` via `JSON.stringify`; `parseSimulationState(json, cfg)` checks shape, integer ranges, finiteness, history length 121, `head`/`count` ranges, consecutive `at` values ending at `gameplayTick`; returns `invalid-Simulation_State` or `config-mismatch` (fingerprint compare) without touching the caller's state
    - _Requirements: 3.4, 3.6, 3.8, 3.9, 12.11_
  - [x] 9.2 Implement `createMatch` and `MatchDriver`
    - `createMatch(rawConfig)` in `src/sim/index.ts` returns `{ ok: true, driver } | { ok: false, errors }` and produces nothing until validation passes
    - `src/sim/driver.ts`: two preallocated state buffers swapped each Tick, `tick(playerMask)` (builds `TickInput` from the player mask only, calls `stepInto`, appends to a reused frame event array), `beginFrame()`, `view()` returning `{ prev, curr, alpha }` as `DeepReadonly`, `setAlpha`, `restart()` (fresh initial state copied into both buffers)
    - _Requirements: 1.5, 2.2, 2.4, 5.4, 12.12, 13.4, 13.5, 13.6_
  - [x]* 9.3 Write property test for Property 1: Determinism (with AI)
    - **Property 1: Determinism (with AI)**
    - Include the 1–600 Tick variant and the up-to-10,800 Tick variant (design §13.2); compare with `Object.is` deep equality
    - **Validates: Requirements 3.1, 3.3, 3.7**
  - [x]* 9.4 Write property test for Property 2: Serialization round trip
    - **Property 2: Serialization round trip**
    - Also assert that no reached state contains `-0`
    - **Validates: Requirements 3.4, 12.11**
  - [x]* 9.5 Write property test for Property 3: Restore equivalence
    - **Property 3: Restore equivalence**
    - **Validates: Requirements 3.5**
  - [x]* 9.6 Write property test for Property 4: Invalid serialized states are rejected
    - **Property 4: Invalid serialized states are rejected**
    - **Validates: Requirements 3.6**
  - [x]* 9.7 Write property test for Property 25: Configuration fingerprint mismatch is rejected
    - **Property 25: Configuration fingerprint mismatch is rejected**
    - **Validates: Requirements 3.8, 3.9**
  - [x]* 9.8 Write property test for Property 21: Restart identity
    - **Property 21: Restart identity**
    - **Validates: Requirements 12.12, 13.4, 13.6**

- [ ] 10. Checkpoint – simulation core
  - Checkpoint – ensure all tests pass (`vitest --run`), ask the user if questions arise.

- [ ] 11. Implement the fixed-timestep Simulation_Loop
  - [ ] 11.1 Implement `FixedStepLoop`
    - `src/loop/fixedStepLoop.ts` per design §3.1: `frame(nowMs)` with accumulator, 5-Tick cap (D1) that zeroes the accumulator, invalid or non-positive deltas add 0, alpha in `[0, 1)`; `pause()`; `resume(nowMs)`
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - [ ]* 11.2 Write property test for Property 6: Accumulator model
    - **Property 6: Accumulator model**
    - Use the `arbFrameTimes` generator
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**
  - [ ]* 11.3 Write property test for Property 5: Frame-rate independence
    - **Property 5: Frame-rate independence**
    - Drive `FixedStepLoop` + `MatchDriver` at 30, 60, and 144 Hz with jitter and compare against direct stepping
    - **Validates: Requirements 1.8**
  - [ ]* 11.4 Write unit tests for loop examples
    - Exactly 6 Ticks of backlog runs 5 and zeroes the accumulator; pause then resume after 10 s runs 0 extra Ticks; `NaN` and `Infinity` timestamps add 0
    - _Requirements: 1.3, 1.6, 1.7_

- [ ] 12. Implement the keyboard Input_System
  - [ ] 12.1 Implement the keymap and the pure `InputSampler`
    - `src/input/keymap.ts`: `KeyboardEvent.code` → command bit (`KeyA`, `ArrowLeft`, `KeyD`, `ArrowRight`, `KeyJ`), a binding list reused later by the Controls screen
    - `src/input/inputSampler.ts`: edge-latched attack presses (first-arriving per sample, `repeat` ignored, consumed on the next `sampleTick`), level-sampled movement from the held set at sample time (D43), both directions → neither, `blur()`/`reset()` clears all keys, unmapped codes ignored
    - _Requirements: 8.1, 8.2, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10_
  - [ ] 12.2 Implement the DOM keyboard adapter
    - `src/input/domKeyboard.ts`: the only DOM-bound input file; `window` `keydown`, `keyup`, and `blur` listeners forwarding to the sampler; returns a disposer
    - _Requirements: 8.5, 8.7_
  - [ ]* 12.3 Write property test for Property 23: Input sampling model
    - **Property 23: Input sampling model**
    - Use the `arbKeyEvents` generator
    - **Validates: Requirements 8.5, 8.6, 8.7, 8.8, 8.9, 8.10**
  - [ ]* 12.4 Write unit tests for D43 and key mapping
    - Hold D across three samples; press and release D between samples gives nothing; press and release J between samples gives one Jab; Shift and Caps Lock do not change mapping
    - _Requirements: 8.1, 8.2, 8.5, 8.6_

- [ ] 13. Implement the renderer: camera math, ring, placeholder fighters, and the ticker
  - [ ] 13.1 Implement pure camera math
    - `src/render/cameraMath.ts`: pan target `m`, required half-extents, distance `D = max(sH/tH, sV/tV, Dmin)`, camera position and look-at, zoom-out immediate and zoom-in eased (design §12.3)
    - _Requirements: 6.4, 6.5, 6.6_
  - [ ]* 13.2 Write property test for Property 24: Camera keeps both Fighters framed
    - **Property 24: Camera keeps both Fighters framed**
    - **Validates: Requirements 6.5, 6.6**
  - [ ] 13.3 Implement the scene and ring geometry
    - `src/render/Scene.tsx` (lights, one directional shadow light with Fighters only casting) and `src/render/Ring.tsx` (floor, apron, four posts, 12 rope instances in one `InstancedMesh` with semi-transparent front ropes, background plane), centered on the Ring_Boundary
    - _Requirements: 6.1, 34.5_
  - [ ] 13.4 Implement `FighterView` and `CameraRig`
    - `src/render/FighterView.tsx`: four meshes sharing one fixed-color material (player `#d64545`, AI `#3f6fd6`), lead-arm pose by phase, HitStun tilt, Defeated lying down, `x = lerp(prev.x, curr.x, alpha) / 1000`, `scale.x = facing`, transforms set imperatively in `useFrame(VISUAL_PRIORITY)` with no React state per frame
    - `src/render/CameraRig.tsx`: perspective camera (FOV 35°) using `cameraMath` each frame; Canvas with `resize={{ debounce: 0, scroll: false }}` and `dpr={[1, 2]}`
    - _Requirements: 6.2, 6.4, 6.5, 6.6, 6.7, 6.8, 1.5, 2.5_
  - [ ] 13.5 Implement `SimulationTicker`
    - `src/render/SimulationTicker.tsx`: `useFrame(cb, TICKER_PRIORITY)`; reads `performance.now()`, calls `loop.frame`, runs `driver.tick(sampler.sampleTick())` per Tick, `driver.setAlpha(alpha)`, then publishes at most one HUD snapshot (wired in task 14)
    - _Requirements: 1.2, 1.5, 2.3, 34.7_
  - [ ]* 13.6 Write scene-graph tests with `@react-three/test-renderer`
    - Scene has floor, 4 posts, 12 rope instances; two Fighter groups with distinct fixed colors; `prev` and `curr` deep-equal to clones after several frames; FighterView x equals the lerp of prev and curr
    - _Requirements: 6.1, 6.2, 2.5, 1.5, 6.8_

- [ ] 14. Implement the HUD, stores, and app boot wiring
  - [ ] 14.1 Implement the Zustand stores and HUD snapshot publishing
    - `src/ui/stores.ts`: `useUiStore` (`screen: 'boot' | 'fight' | 'unsupported' | 'load-failed'`) and `useHudStore` (`health`, `maxHealth`, `result`); `publishHudSnapshotIfChanged(curr)` with shallow compare, called once per frame by `SimulationTicker`
    - _Requirements: 2.6, 11.5, 34.7_
  - [ ] 14.2 Implement `Hud`, `HealthBar`, and `ResultOverlay`
    - `src/ui/Hud.tsx`, `src/ui/HealthBar.tsx` (left "PLAYER", right "AI" filling from the right, width `100 × health / maxHealth %`), `src/ui/ResultOverlay.tsx` ("YOU WIN", "AI WINS", "DRAW", restart prompt; Enter key and click call `driver.restart()`), Tailwind overlay above the canvas
    - _Requirements: 11.3, 11.4, 11.5, 13.2, 13.4, 13.5_
  - [ ] 14.3 Implement boot, error screens, and the game runtime
    - `src/app/BootGate.tsx` (WebGL2 check before mounting the Canvas, ErrorBoundary), `src/ui/UnsupportedScreen.tsx`, `src/ui/LoadFailedScreen.tsx` (lists config errors), inline load-failure script and boot timeout in `index.html` that clears `#boot-status` on mount, `src/app/GameRuntime.tsx` (creates `MatchDriver` from the default config via `createMatch`, `FixedStepLoop`, `InputSampler` + `domKeyboard`; provides `driverRef` context; auto-starts the fight), `src/app/App.tsx`, `src/app/main.tsx`
    - _Requirements: 13.1, 14.3, 14.5, 14.7, 14.8, 5.4_
  - [ ]* 14.4 Write UI unit tests (jsdom)
    - Health bar widths and labels; result overlay text for win, loss, and draw; restart on Enter and on click hides the label; HUD store updated at most once per simulated frame; Simulation_State has no UI fields; WebGL2-missing screen renders without a Canvas
    - _Requirements: 11.3, 11.4, 13.2, 13.4, 13.5, 34.7, 2.6, 14.7_

- [ ] 15. Add browser tests and the Tick benchmark for M1
  - [ ] 15.1 Set up Playwright and the e2e build mode
    - `playwright.config.ts` with projects for Chromium, Firefox, and Edge (`channel: 'msedge'`), a static server for `dist/` at root and under `/game/`; `--mode e2e` build with a low-`maxHealth` config and an e2e hook exposing `tick`, `curr`, and `renderer.info.render.calls`
    - _Requirements: 14.1, 14.2, 14.6_
  - [ ]* 15.2 Write Playwright smoke tests
    - Auto-start; result and restart; no WebGL2 within 2 s; load failure when the main chunk is aborted; same-origin requests only; subdirectory hosting; resize updates canvas and camera aspect by the next frame; full match with no `pageerror`; draw calls ≤ 100; a 60-second frame-time trace reported (non-gating) for the M1 baseline
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 14.1, 14.2, 14.4, 14.6, 14.7, 14.8, 6.7, 34.1, 34.2, 34.5_
  - [ ] 15.3 Implement the Tick benchmark
    - `bench/tick.bench.ts`: `MatchDriver` with AI, aggressive scripted player, 600 warm-up Ticks, 3,600 measured Ticks with `performance.now()`, mean and max per Tick (thresholds mean < 1 ms, max < 4 ms; warn-only in CI), heap growth via `process.memoryUsage()`
    - _Requirements: 34.3_
  - [ ]* 15.4 Write test-harness self-checks
    - A deliberately failing fixture property (excluded from the default run, run by a dedicated script) that asserts the output contains the test name, counterexample, and seed; a script that runs `vitest --run` and checks the exit code and a run time under 60 s
    - _Requirements: 15.3, 15.4_

- [ ] 16. Checkpoint – M1 complete
  - Checkpoint – ensure all tests pass (`vitest --run`), ask the user if questions arise.

### P2 – Full Combat

- [ ] 17. Extend types, state, config, and serialization for P2
  - [ ] 17.1 Add the combat mode flag and P2 state and event types
    - `src/sim/types.ts`: `CombatMode`, `ALL_COMMANDS_MASK`, `FsmStateP2` (Blocking with `blockStunUntil`, Slipping with `invulnUntil`/`until`, GuardBroken with `until`), Attacking flags `landed` and `lowStamina`, `FighterStateP2Fields`, `PlayerObservationP2.attackEnteredAt`, `AiMemory`, `SimulationState` `version: 2` with `aiMemory`, P2 Game_Events (`attack-blocked`, `guard-break`, `slip-evaded`, `counterpunch`, `combo`) with attacker ownership
    - `src/sim/state.ts`: P2 initial values (Stamina and Guard at max in `'p2'`, 0 in `'m1'`) and copy of all new fields; step 2b uses `cfg.enabledMask`; every P2 hook guarded by `cfg.p2 !== null` so `'m1'` reproduces Part 1 bit for bit
    - _Requirements: 4.3, 2.2, 17.12, 19.5, 12.9_
  - [ ] 17.2 Add the cross, hook, and uppercut and the P2 config schema
    - `src/sim/config/attacks.ts` and `defaults.ts`: cross, hook, uppercut and the P2 defaults of design P2.4.4 (Stamina, Guard, slip, combo, counter, cancel windows, follow-ups)
    - `src/sim/config/p2Schema.ts`: P2.1.6 field ranges, optional Cancel_Window checks (`0 ≤ start ≤ end ≤ recovery − 1`, rejected when `recovery = 0`), 0–4 follow-up ids in the registry, registry relations R1–R7 (design P2.4.2) each naming the punch type and relation; all errors collected
    - `src/sim/config/compile.ts`: `compileP2` (`blockWalkFx`, `costInt`, `guardDamageInt`, per-attack `reach`), `enabledMask`; fingerprint includes `combat` and every P2 field
    - _Requirements: 5.1, 5.2, 16.1, 16.2, 16.3, 16.4, 16.8, 17.3, 17.5, 17.7, 17.9, 17.10, 17.12, 18.1, 18.3, 19.7, 20.5, 20.11, 20.15, 20.16, 21.2, 21.3, 21.4_
  - [ ] 17.3 Extend `parseSimulationState` for version 2
    - Reject any other version; add the P2.1.4 parse checks (Stamina and Guard ranges, combo counter, Input_Buffer id and age, Blocking/Slipping/GuardBroken timer consistency, GuardBroken implies Guard 0, `postSlip` order, `landed` implies `contactUsed`)
    - _Requirements: 3.6, 3.9_
  - [ ]* 17.4 Write property test for Property 44: Registry and Cancel_Window validation
    - **Property 44: Registry and Cancel_Window validation**
    - Use the `arbRegistryCorruption` generator
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.8, 20.5, 20.11**
  - [ ]* 17.5 Write unit tests for P2 configuration
    - One failing config per relation R1–R7; Cancel_Window `end < start`, `end = recovery`, `recovery = 0` with a window, 5 follow-ups, unknown follow-up id; each P2.1.6 field just below and above its range and non-integer; every default punch has a non-empty connect interval
    - _Requirements: 16.8, 17.7, 18.3, 19.7, 20.11, 20.16_

- [ ] 18. Implement P2 action selection, Input_Buffer, cancels, and Blocking movement
  - [ ] 18.1 Add `P2_TRANSITIONS` and the P2 Able_To_Act rule
    - `src/sim/fsm.ts`: new triggers (`block`, `slip`, `cancel`, `slip-end`, `guard-break`, `guard-recover`) and the P2.5.4 rows; `activeTable` returns `M1_TRANSITIONS ++ P2_TRANSITIONS` in `'p2'`; `ableToAct(f, g)` includes Blocking with `blockStunUntil ≤ g`
    - _Requirements: 4.3, 4.5, 4.8_
  - [ ] 18.2 Implement step 3 P2 sub-steps and step 4 `selectActionP2`
    - `src/sim/p2/actions.ts`: highest attack bit only (uppercut > hook > cross > jab); priority new attack > buffered attack > slip (Stamina ≥ cost, otherwise keep state and position) > block > movement > Idle (D9); D33 Blocking → Walking; bufferable states and single-slot Input_Buffer with replacement (D12); cancels into permitted follow-ups inside an open Cancel_Window after a landed hit (D13); `started` local record; `lastAttackStartAt`
    - Step 3 sub-steps (c) slip end, (d) guard recover, (f) Input_Buffer expiry at `g − receivedAt ≥ 6`, (g) `postSlip` expiry
    - _Requirements: 35.2, 35.3, 16.5, 16.6, 16.7, 17.1, 17.2, 17.6, 17.11, 18.1, 18.2, 18.6, 18.7, 20.1, 20.2, 20.3, 20.4, 20.6, 20.15, 7.12, 4.6, 4.11, 9.5_
  - [ ] 18.3 Use per-Fighter movement speeds in step 6
    - Walking uses `walkSpeedFx`, Able_To_Act Blocking uses `blockWalkFx`, all others 0; D39 cap now reachable
    - _Requirements: 7.1, 7.12, 17.10, 17.11_
  - [ ]* 18.4 Write property test for Property 30: Action selection follows the priority model
    - **Property 30: Action selection follows the priority model**
    - **Validates: Requirements 35.2, 35.3, 16.5, 16.7, 17.1, 17.2, 17.10, 7.1, 7.12, 18.1, 18.2**
  - [ ]* 18.5 Write property test for Property 31: Commands to a Fighter that cannot act only buffer or cancel
    - **Property 31: Commands to a Fighter that cannot act only buffer or cancel**
    - **Validates: Requirements 16.6, 17.6, 17.11, 18.7, 4.6, 4.11, 7.9**
  - [ ]* 18.6 Write property test for Property 32: Input_Buffer window
    - **Property 32: Input_Buffer window**
    - **Validates: Requirements 20.1, 20.2, 20.3, 20.4**
  - [ ]* 18.7 Write property test for Property 33: Cancels only after a landed hit inside the window
    - **Property 33: Cancels only after a landed hit inside the window**
    - **Validates: Requirements 20.6, 9.5**
  - [ ]* 18.8 Write unit tests for action priority, buffering, Blocking, and cancels
    - All four attack bits start the uppercut; buffered vs new on the same Tick; slip + block with and without enough Stamina; Input_Buffer start on r+5 and discard on r+6; GuardBroken discards; Blocking entry and `blockWalkMultiplier` 0, 0.5, 1; D33 release; cancel on first and last window Tick, not one Tick outside; non-permitted command inside the window discarded
    - _Requirements: 35.2, 35.3, 20.1, 20.3, 20.4, 20.6, 17.1, 17.10, 7.12_

- [ ] 19. Implement Stamina and Guard resources (pipeline step 5)
  - [ ] 19.1 Implement `resourcesStep`
    - `src/sim/p2/resources.ts`: attack cost deduction with `lowStamina` flag (before deduction, minimum 0), slip cost, Stamina regeneration in Idle/Walking/Blocking when nothing started (D16), Guard regeneration when not GuardBroken and `g − lastBlockedAt > regenDelay`, clamps at max; wire into step 5
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.6, 18.1, 17.9, 17.12_
  - [ ]* 19.2 Write property test for Property 29: Resource bounds
    - **Property 29: Resource bounds**
    - **Validates: Requirements 19.6, 17.6, 17.12, 19.5**
  - [ ]* 19.3 Write property test for Property 42: Resource accounting model
    - **Property 42: Resource accounting model**
    - **Validates: Requirements 19.1, 19.3, 19.4, 18.1, 17.9**
  - [ ]* 19.4 Write unit tests for Stamina and Guard regeneration
    - Low-Stamina attack start reaches 0; no regeneration on attack and slip start Ticks; regeneration while Blocking in Block_Stun; cancel deducts the follow-up cost once; Guard delay 0 and 90; never while GuardBroken; clamp at max
    - _Requirements: 19.1, 19.2, 19.3, 17.9_

- [ ] 20. Implement P2 contact outcomes, damage pipeline, combos, and Counterpunches (pipeline step 7)
  - [ ] 20.1 Implement snapshot capture and contact classification with block and slip-evade outcomes
    - `src/sim/p2/outcomes.ts`: phase A captures each target's FSM kind, phase, slip invulnerability, and each attacker's `postSlip`; phase B classifies slip-evade (Slipping, invulnerable, not uppercut) > block (Blocking) > landed
    - Block: chip `roundHalfUp(damage × chipFraction)`, Guard reduction by `guardDamageInt`, `attack-blocked` event, Block_Stun reset to `g + blockStun`, Guard 0 → GuardBroken until `g + breakTicks` with `guard-break` event; `lastBlockedAt`
    - Slip-evade: `slip-evaded` event, no resource change, `postSlip` window `e+1 … e+W`; contact marked used
    - Slipping and GuardBroken targets struck by a landed hit leave their state (HitStun, or Idle per D41); D17 `pendingGuardRecovery`
    - _Requirements: 35.4, 35.5, 35.8, 10.3, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 18.3, 18.4, 18.5, 18.8, 20.14_
  - [ ] 20.2 Implement the landed-hit damage pipeline, combo counter, and Counterpunches
    - `landedDamage`: `max(1, roundHalfUp(base × k^(n−1) × L × C))` with repeated multiplication in that order; combo counter set to 1, incremented with a `combo` event, or unchanged for zero-stun hits on HitStun targets (D41, D44); Counterpunch classification from the snapshot (startup or recovery target, or first hit in the post-slip window; never in a Trade) with `counterpunch` event and effective hit-stun `roundHalfUp(hitStun × hitStunMultiplier)`
    - Combo reset of the opponent's counter when its target leaves HitStun (step 3) or goes Defeated (step 8); step 8 Defeated also from Blocking, Slipping, GuardBroken
    - _Requirements: 35.6, 35.7, 19.2, 20.7, 20.8, 20.9, 20.10, 20.12, 20.13, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 21.8, 35.9_
  - [ ]* 20.3 Write property test for Property 34: Contact outcome classification
    - **Property 34: Contact outcome classification**
    - Use the `arbP2Snapshot` generator
    - **Validates: Requirements 35.5, 18.3, 18.4, 18.5, 10.3**
  - [ ]* 20.4 Write property test for Property 35: Block effects
    - **Property 35: Block effects**
    - **Validates: Requirements 17.3, 17.4, 17.5, 35.7, 35.8**
  - [ ]* 20.5 Write property test for Property 36: GuardBroken lifecycle
    - **Property 36: GuardBroken lifecycle**
    - **Validates: Requirements 17.6, 17.7, 17.8**
  - [ ]* 20.6 Write property test for Property 41: Slip lifecycle
    - **Property 41: Slip lifecycle**
    - **Validates: Requirements 18.6, 18.8**
  - [ ]* 20.7 Write property test for Property 37: Landed damage model
    - **Property 37: Landed damage model**
    - **Validates: Requirements 35.7, 19.2, 20.10, 21.3**
  - [ ]* 20.8 Write property test for Property 38: Combo scaling never increases damage
    - **Property 38: Combo scaling never increases damage**
    - **Validates: Requirements 20.10, 35.7**
  - [ ]* 20.9 Write property test for Property 39: Combo counter model
    - **Property 39: Combo counter model**
    - **Validates: Requirements 20.7, 20.8, 20.9, 20.12, 20.13**
  - [ ]* 20.10 Write property test for Property 40: Counterpunch classification
    - **Property 40: Counterpunch classification**
    - **Validates: Requirements 21.1, 21.2, 21.4, 21.5, 21.6, 21.7, 21.8, 35.6**
  - [ ]* 20.11 Write property test for Property 43: Combat resolution is order-independent and role-symmetric
    - **Property 43: Combat resolution is order-independent and role-symmetric**
    - **Validates: Requirements 35.4, 20.13, 10.6**
  - [ ]* 20.12 Write unit tests for block, GuardBroken, slip, counter, combo, and Trade
    - Cases of design P2.11.1: chip rounding (0.5 → 1, 0.49 → 0); Guard clamp; Block_Stun reset not added; GuardBroken duration and recovery, hit with H > 0 and H = 0; invulnerable vs jab/cross/hook, uppercut lands; one `slip-evaded` per instance; post-slip window edges; both counter conditions apply multipliers once; the P2.8.4 combo example; Trade gives no counter and both combo counters 1
    - _Requirements: 17.3, 17.5, 17.7, 17.8, 18.3, 18.5, 21.2, 21.5, 20.8, 20.12, 35.6_
  - [ ]* 20.13 Write P2 scenario tests
    - `src/sim/p2/scenarios.test.ts` with `ai.enabled = false`: combo chain, block until guard break then punish, slip and counter, Trade with a post-slip window, low-Stamina fight, chip damage to Health 0 while blocking; assert full event lists and selected fields per Tick
    - _Requirements: 17.5, 17.8, 19.4, 20.8, 21.2, 35.6, 11.7_

- [ ] 21. Checkpoint – P2 combat core
  - Checkpoint – ensure all tests pass (`vitest --run`), ask the user if questions arise.

- [ ] 22. Implement difficulty profiles and the P2 AI_Controller
  - [ ] 22.1 Add difficulty profiles, validation, and selection
    - `DifficultyProfile` for Easy, Normal, Hard in `defaults.ts`; `p2Schema.ts` checks every field, reaction-delay bands (20–40, 12–19, 6–11), `block + slip ≤ 1`, Easy ≤ Normal ≤ Hard ordering for block, slip, combo, counter, weights > 0, low-Stamina threshold and multiplier; errors name the level and parameter
    - `createMatch(rawConfig, { difficulty })` defaults to Normal; the selected level and all profiles enter the fingerprint
    - _Requirements: 22.1, 22.2, 22.3, 22.8, 22.10, 22.11, 3.9_
  - [ ] 22.2 Implement `decideAiP2` and wire it into step 2a
    - `src/sim/ai/p2Ai.ts`: weighted `pick(u)` with precompiled uint32 thresholds; defense draw on the observed Startup_Phase entry within that attack's Connect_Range; counterpunch decision on the observed Recovery_Phase entry within jab range; combo decision at own Cancel_Window open after a landed hit; regular attack under the (low-Stamina-adjusted) interval from `lastAttackStartAt`; low-Stamina retreat unless at the wall; D18 priority with one action plus a held block; fixed draw counts (defense 1, counter 2, combo 2, regular 1); returns `{ mask, rng, memory }`
    - Step 2a in `'p2'` commits `rng` and `aiMemory`
    - _Requirements: 22.4, 22.5, 22.6, 22.7, 22.8, 22.9, 12.2, 12.4, 12.5, 12.6, 12.7, 12.13, 3.7_
  - [ ]* 22.3 Write property test for Property 45: Difficulty profile validation
    - **Property 45: Difficulty profile validation**
    - Use the `arbDifficultyProfiles` generator
    - **Validates: Requirements 22.2, 22.3, 22.8, 22.11**
  - [ ]* 22.4 Write property test for Property 46: P2 AI decision model
    - **Property 46: P2 AI decision model**
    - **Validates: Requirements 22.4, 22.5, 22.7, 22.8, 22.9, 12.2, 12.5, 12.13**
  - [ ]* 22.5 Write property test for Property 47: AI PRNG draw accounting
    - **Property 47: AI PRNG draw accounting**
    - **Validates: Requirements 3.7, 12.6, 22.4, 22.5, 22.6**
  - [ ]* 22.6 Write property test for Property 48: Weighted choice thresholds
    - **Property 48: Weighted choice thresholds**
    - **Validates: Requirements 22.6, 22.4**
  - [ ]* 22.7 Write unit tests and golden scenarios for the P2 AI
    - Delay band edges per level; `block + slip = 1` accepted and `1.0001` rejected; ordering violations; defense on `k + D + 1` exactly; block held until the observed attack ends; counter only inside jab range; combo with probability 1 and 0; low-Stamina retreat, wall stop, `ceil(interval × m)`; priority collisions; one 3,600-Tick golden-hash fight per Difficulty_Level
    - _Requirements: 22.3, 22.4, 22.5, 22.7, 22.8, 22.9, 22.11_

- [ ] 23. Extend the browser shell for P2
  - [ ] 23.1 Add the P2 key bindings
    - `src/input/keymap.ts`: `KeyK` cross, `KeyL` hook, `KeyI` uppercut, `KeyS`/`ArrowDown` block (level-sampled), `Space` slip (edge-latched); `domKeyboard.ts` calls `preventDefault()` for Space and arrow keys
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.9_
  - [ ] 23.2 Add difficulty selection to the UI store and runtime
    - `useUiStore.difficulty` (default `'normal'`); a minimal pre-fight difficulty selector on the M1-style screen (design P2-Q17, replaced by the Main_Menu in P3); `GameRuntime` passes the level to `createMatch` and shows LoadFailedScreen naming the level and parameter on failure, leaving the selection unchanged
    - _Requirements: 2.6, 22.10, 22.11_
  - [ ] 23.3 Add P2 placeholder poses to `FighterView`
    - Blocking (both arms raised), Slipping (torso leaned 20° away), GuardBroken (arms lowered, torso tilted); lead arm extends to each attack's own Hitbox_Reach
    - _Requirements: 6.8, 4.3_
  - [ ]* 23.4 Extend input tests for P2 keys
    - Extend Property 23's reference model and generator with K, L, I, S, Down, Space; unit tests for block level-sampling and first-arriving attack or slip press
    - _Requirements: 8.3, 8.4, 8.5, 8.6, 8.9_

- [ ] 24. Extend M1 regression properties to `'p2'` mode and the benchmark
  - [ ]* 24.1 Run the Part 1 properties over P2 configs
    - Per design P2.11.4: Properties 1–4, 21, 25 over `arbP2Config` and full masks (Property 4 adds P2 parse corruptions, Property 25 adds a difficulty change); Property 7 drops only unknown entries; Property 8 checks the P2 table; Properties 11 and 12 with per-Fighter speeds; Property 13 generalized to all contact events; Property 10 for all four punches; Property 17 with P2 ownership
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.9, 4.8, 5.7, 7.10, 10.9, 15.6_
  - [ ] 24.2 Add the P2 benchmark run
    - `bench/tick.bench.ts`: AI on Hard against an aggressive scripted player using all commands; same thresholds
    - _Requirements: 34.3_

- [ ] 25. Checkpoint – P2 complete
  - Checkpoint – ensure all tests pass (`vitest --run`), ask the user if questions arise.

### P3 – Match Structure and Menus

- [ ] 26. Decision gate – confirm the open questions that block P3
  - [ ] 26.1 Confirm P3-Q3, P3-Q7, P3-Q9, and P3-Q11 with the user before implementing P3
    - Ask the user to confirm or change each item; use the design's recommended resolution as the default: P3-Q3 the round timer runs on a Tick exactly when the phase after step 3 is `'fighting'` (including the Knockdown Tick and the last rise Tick); P3-Q7 ranges `riseBase` 2–10, `riseIncrease` 0–8, `riseVariance` 0–8, scoring weights 0–1,000,000; P3-Q9 `aiMemory.heldBlockFor = null` at round start; P3-Q11 Match seed wraps modulo 2^32
    - Record the confirmed choices as named constants and schema ranges in `src/sim/config/p3Schema.ts` and `src/sim/p3/rounds.ts` so the following tasks use them
    - _Requirements: 25.1, 23.11, 26.7, 25.9, 28.6_

- [ ] 27. Extend types, state, config, and serialization for the `'match'` ruleset
  - [ ] 27.1 Add the ruleset flag, KnockedDown, and round, Knockdown, and score state
    - `src/sim/types.ts`: ruleset `'match'`; `KnockedDown` FSM member; round state (`number`, `phase` `'announce' | 'fighting' | 'knockdown' | 'between' | 'ended'`, `timer`, `startAt`, `acceptFromAt`), Knockdown_Count state, `score` with per-round `FighterRoundStats` and nullable points, `historyStartAt`, FighterState `matchKnockdowns`, `roundKnockdowns`, `riseCount`, `teleportedAt`; `MatchResult` with method, round, `roundTime`; P3 events (`knockdown`, `knockdown-count`, `round-start`, `round-end`, `match-end`) with P3.1.5 ownership; `version: 3`
    - `src/sim/fsm.ts`: `P3_TRANSITIONS` (P3.1.2) and the `'match'` table `M1 ++ P2 ++ P3` without `health-zero → Defeated` rows
    - `src/sim/state.ts`: `createInitialState` for `'match'` (round 1 announce at `a = 0`, full timer, max resources, zeroed statistics)
    - _Requirements: 4.4, 4.5, 4.8, 25.1, 25.2, 26.1_
  - [ ] 27.2 Implement the P3 config schema
    - `src/sim/config/p3Schema.ts`: P3.1.7 ranges for rounds (`duration` 1,800–10,800, `interval` 0–3,600, `betweenRecovery` 0–`maxHealth`), Knockdown fields (separation, rise base/increase/variance, recovery fraction and penalty), scoring weights; cross-field `K ≥ minSeparation` and ring width `≥ 2 × minSeparation` in Fx; `'match'` requires `combat: 'p2'`; all errors collected naming the setting; fingerprint includes `ruleset` and every P3 field
    - _Requirements: 25.8, 23.10, 23.11, 23.12, 26.7_
  - [ ] 27.3 Extend `parseSimulationState` for version 3
    - Reject other versions and inconsistent round, Knockdown, score, and `historyStartAt` fields (P3.1.6)
    - _Requirements: 3.6, 3.9_
  - [ ]* 27.4 Write property test for Property 64: P3 configuration refusal
    - **Property 64: P3 configuration refusal**
    - **Validates: Requirements 25.8, 23.10**
  - [ ]* 27.5 Write unit tests for P3 configuration
    - Each P3.1.7 field just below and above its range and non-integer; `'match'` with `combat: 'm1'`; several errors reported together; no state produced
    - _Requirements: 25.8, 23.10_

- [ ] 28. Implement Knockdowns, the Knockdown_Count, rising, and repositioning
  - [ ] 28.1 Implement Knockdown entry in step 8
    - `src/sim/p3/knockdown.ts` `knockdownEntry`: Health 0 (landed or chip, D20) → KnockedDown instead of Defeated; round and Match totals +1; `knockdown` event with round and `roundTime`; standing Attacking or HitStun Fighter → Idle (D21 freeze); both combo counters 0 and both Input_Buffers cleared; rise count with one PRNG draw per fallen Fighter (player first) and clamp 2–10; `reposition` (preferred side, opposite side, farther end, ties to preferred end; neither moves in a double knockdown; `teleportedAt`); round phase `'knockdown'`; returns `kd`
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.11, 23.14, 23.17, 23.23, 35.9, 35.10, 3.7_
  - [ ] 28.2 Implement the Knockdown_Count and rise in step 3 sub-step (h)
    - Count `1 + floor((g − a) / 60)` with `knockdown-count` events for 2–10; rise to Idle on `a + 60(r − 1)` for `r ≤ 9` with the rise Health formula clamped to 1–max, Stamina kept, Guard 0 → `guard.recovery` (D34), timers, `pendingGuardRecovery`, and `postSlip` cleared, combo counters 0, Input_Buffers cleared; phase back to `'fighting'` when the last Fighter rises
    - Step 2b zeroes both masks and step 2a skips the AI unless `prev.round.phase === 'fighting'`; step 7 runs only while `'fighting'`; `leftRight` recomputed every Tick
    - _Requirements: 23.2, 23.12, 23.13, 23.14, 23.15, 23.18, 23.19, 23.20, 23.21, 23.22_
  - [ ]* 28.3 Write property test for Property 49: Knockdown repositioning model
    - **Property 49: Knockdown repositioning model**
    - Use the `arbKnockdownGeometry` generator
    - **Validates: Requirements 23.3, 23.4, 23.5, 23.6, 23.7, 23.8, 23.17**
  - [ ]* 28.4 Write property test for Property 50: Rise count and PRNG draw order
    - **Property 50: Rise count and PRNG draw order**
    - **Validates: Requirements 23.11, 3.7**
  - [ ]* 28.5 Write property test for Property 51: Knockdown_Count timeline
    - **Property 51: Knockdown_Count timeline**
    - **Validates: Requirements 23.2, 23.12, 23.15, 24.1**
  - [ ]* 28.6 Write property test for Property 52: Rise effects
    - **Property 52: Rise effects**
    - **Validates: Requirements 23.12, 23.18, 23.19, 23.20, 23.21, 23.22, 23.23**
  - [ ]* 28.7 Write unit tests for Knockdowns
    - Landed and chip Knockdowns; Health 0 during a HitStun-causing hit; standing Attacking and HitStun → Idle; one repositioning case per branch including side swap and `K` exactly at the boundary; rise count from known PRNG words with clamps; `riseVariance = 0` still draws; rise on `startAt + 60(r − 1)` for r = 2 and 9; no event for count 1; rise Health below 1 and above max; Guard 0 and 300; commands on the rise Tick discarded
    - _Requirements: 23.1, 23.3, 23.4, 23.5, 23.6, 23.11, 23.12, 23.15, 23.19, 23.20, 23.22_

- [ ] 29. Implement the Round_Manager, KO, TKO, and Match end (pipeline step 9)
  - [ ] 29.1 Implement the round timeline and Match end
    - `src/sim/p3/rounds.ts` `roundStep` (P3.2.2): 120-Tick announcement with `round-start` on its last Tick; timer decrement only when `timerRuns`; TKO on a third round Knockdown (D19, draw if both); KO at count 10; round end by time on the first Tick the timer is 0 with no count running (`round-end` event, GuardBroken → Idle); between-round interval; `startNextRound` reset list (P3.5.2, including `aiMemory` per the 26.1 decision, history reset with `count = 0` and `historyStartAt`), between-round Health recovery, Stamina and Guard to max, `roundKnockdowns` 0; decision after round 3; `endMatch` with one `match-end` event
    - Ended-phase gate at the top of `stepInto`: while `prev.round.phase === 'ended'` only Tick counters and the observation advance
    - AI regular-attack reference `lastAttackStartAt ?? round.acceptFromAt`
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 25.9, 25.10, 25.11, 25.12, 35.11, 12.4_
  - [ ]* 29.2 Write property test for Property 53: Commands have no effect outside the fighting phase
    - **Property 53: Commands have no effect outside the fighting phase**
    - **Validates: Requirements 23.14, 23.22, 24.6, 25.2, 25.3, 25.4, 25.5**
  - [ ]* 29.3 Write property test for Property 54: Match outcome model
    - **Property 54: Match outcome model**
    - **Validates: Requirements 23.1, 24.1, 24.2, 24.3, 24.5, 25.6, 25.7**
  - [ ]* 29.4 Write property test for Property 55: Round timer accounting
    - **Property 55: Round timer accounting**
    - **Validates: Requirements 25.1, 25.3, 25.4, 23.2, 23.13, 24.5, 35.11**
  - [ ]* 29.5 Write property test for Property 56: Round transition model
    - **Property 56: Round transition model**
    - **Validates: Requirements 25.2, 25.5, 25.9, 25.10, 25.11, 25.12, 24.4**
  - [ ]* 29.6 Write unit tests for rounds, KO, TKO, and the ended phase
    - KO at 540 Ticks; TKO on the third Knockdown with no count; double KO draw; double knockdown with one rise; third Knockdown for both and for one; 600 Ticks after `match-end` with random masks change nothing; announcement discards commands; first decrement on `acceptFromAt`; interval 0 and 3,600; recovery clamp; every reset-list field; the Req 35 c11 cases (rise ends the round, no rise → KO, third Knockdown → TKO)
    - _Requirements: 24.1, 24.2, 24.3, 24.6, 25.2, 25.5, 25.9, 35.11_

- [ ] 30. Implement the Scoring_System
  - [ ] 30.1 Implement statistic hooks, round points, decision, and Match totals
    - `src/sim/p3/scoring.ts`: hooks for thrown (in `startAttack` and `cancelInto`), landed, damage (Health actually removed), blocked, counters, Knockdowns scored, wired into steps 4, 7, and 8; `scoreRound` (10-9 or 10-10 by weighted performance, minus round Knockdowns, minimum 6) at round end and for the final round on KO or TKO; `decisionTotals`; `matchTotals` with integer `landingPct`
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.9, 26.10, 26.11, 26.12, 26.13, 30.5_
  - [ ]* 30.2 Write property test for Property 57: Scoring statistics accounting
    - **Property 57: Scoring statistics accounting**
    - **Validates: Requirements 26.1, 26.2, 26.3, 26.4, 26.5, 26.6**
  - [ ]* 30.3 Write property test for Property 58: Round points and decision model
    - **Property 58: Round points and decision model**
    - Use the `arbRoundStats` generator
    - **Validates: Requirements 26.7, 26.8, 26.9, 26.10, 26.11, 26.12, 26.13**
  - [ ]* 30.4 Write unit tests for scoring
    - Each hook once per event; overkill counts only the Health removed; chip not in `damage`; 10-9, 9-10, 10-10; deductions 1–3; KO round scored and later rounds `null`; decision win, loss, draw; `landingPct` for 0 thrown, 1/3, 1/2, 2/3
    - _Requirements: 26.3, 26.8, 26.9, 26.11, 26.12, 30.5_
  - [ ]* 30.5 Write P3 scenario tests
    - `src/sim/p3/scenarios.test.ts`: knockdown and rise then round end and interval; three Knockdowns (TKO); KO with `riseBase = 10`; double knockdown from a Trade with one rise; full three-round decision with known points; the Req 35 c11 case; one AI-enabled golden-hash Match per Difficulty_Level
    - _Requirements: 23.2, 24.1, 24.2, 24.3, 25.6, 26.12, 35.11_

- [ ] 31. Implement MatchSession and the seed policy
  - [ ] 31.1 Implement `MatchSession`
    - `src/sim/p3/session.ts`: `start(level)` builds a fresh `MatchDriver` with seed `(s + n) mod 2^32` (per the 26.1 decision) and its own compiled config and fingerprint; a refused config returns `{ ok: false, errors }` and does not advance `n`
    - _Requirements: 28.6, 29.5, 30.7, 22.10, 22.11_
  - [ ]* 31.2 Write property test for Property 59: Seed policy
    - **Property 59: Seed policy**
    - **Validates: Requirements 28.6, 29.5, 30.7, 13.6**
  - [ ]* 31.3 Run the Part 1–2 properties in `'match'` mode
    - Per design P3.9.3: Properties 1–4 and 25 over `arbMatchConfig` (Property 4 adds the P3.1.6 corruptions); Property 8 with the `'match'` table; Property 11 adds `roundKnockdowns ≤ 3`; Property 17 with P3 ownership; Property 20 from `historyStartAt`; Properties 31 and 46 restricted to `'fighting'` Ticks
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 4.8, 7.10, 12.9, 15.6_

- [ ] 32. Checkpoint – P3 simulation
  - Checkpoint – ensure all tests pass (`vitest --run`), ask the user if questions arise.

- [ ] 33. Implement the app shell, menus, pause, results, and the full Fight_HUD
  - [ ] 33.1 Implement the screen state machine and Match lifecycle in the runtime
    - `useUiStore`: `screen` (`boot`, `unsupported`, `load-failed`, `main-menu`, `controls`, `fight`, `results`), `difficulty`, `paused`, `matchEnded`, `results`
    - `GameRuntime.beginMatch(level)`: `session.start`, replace `driverRef`, `loop.resume(now)`, `sampler.reset()`, reset the label tracker, publish a fresh snapshot; quit to menu; BootGate goes to `'main-menu'` (D26) with the Canvas drawing the Ring without Fighters; `SimulationTicker` returns at once without a driver and stops after the Tick with `match-end`, calls `loop.pause()`, builds the results view, and starts the 1.5 s results hold timer (cleared on new Match or unmount)
    - Remove the temporary P2 difficulty selector; keep `ResultOverlay` only for `'m1'` builds
    - `FighterView` and `CameraRig` snap to `curr.x` when `teleportedAt` changed; KnockedDown placeholder pose
    - _Requirements: 28.1, 2.6, 23.9, 30.1, 22.10, 13.1_
  - [ ] 33.2 Implement the pure menu focus reducer
    - `src/ui/menuModel.ts` `reduceMenu` for Main_Menu, Pause_Menu, and Results_Screen: Up/Down and Tab focus, Left/Right on the selector, Enter/Space activate, hover and click, Controls and Back/Escape
    - _Requirements: 28.3, 28.8, 28.9, 28.10, 28.11, 29.3, 30.6_
  - [ ]* 33.3 Write property test for Property 61: Menu focus reducer
    - **Property 61: Menu focus reducer**
    - Use the `arbMenuActions` generator
    - **Validates: Requirements 28.3, 28.8, 28.9, 28.10, 28.11, 29.3, 30.6**
  - [ ] 33.4 Implement the Main_Menu and Controls screen
    - `src/ui/MainMenu.tsx`: Start Fight, Easy/Normal/Hard selector (Normal on load, last Match's level on return), Controls list generated from `keymap.ts` plus "Pause: Escape, P", visible focus indicator on exactly one item, keyboard and single-click mouse support
    - _Requirements: 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.8, 28.9, 28.10, 28.11_
  - [ ] 33.5 Implement the pause controller and Pause_Menu
    - `src/app/pauseController.ts` with injected loop, sampler, and store: Escape and P toggle (repeat ignored), `blur` and `visibilitychange` pause without auto-resume, inactive outside a Match or after `match-end`; pause calls `loop.pause()` and `sampler.reset()`, resume calls `sampler.reset()` and `loop.resume(now)`
    - `src/ui/PauseMenu.tsx`: Resume, Restart Match (new Match at the same level, no Results_Screen), Quit to Main Menu, Resume focused on open
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7, 29.8, 1.4, 1.6, 8.7_
  - [ ]* 33.6 Write property test for Property 62: Pause equivalence
    - **Property 62: Pause equivalence**
    - Use the `arbPauseEvents` generator
    - **Validates: Requirements 29.1, 29.2, 29.4, 29.7, 29.8, 1.4, 1.6**
  - [ ] 33.7 Implement the Results_Screen
    - `buildResultsView(curr)` (pure) and `src/ui/ResultsScreen.tsx`: winner or Draw, method, round; round points and totals on a decision; per-Fighter thrown, landed, Counterpunches, Knockdowns scored, landing percentage; Rematch and Main Menu via `reduceMenu`
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8_
  - [ ]* 33.8 Write property test for Property 63: Results view
    - **Property 63: Results view**
    - **Validates: Requirements 30.2, 30.3, 30.4, 30.5**
  - [ ] 33.9 Implement the full Fight_HUD
    - `src/ui/hudLabels.ts` (pure label tracker for combo ≥ 2, COUNTER, GUARD BREAK for Gameplay_Ticks `at … at + 59`, separate rows), pure `buildHudSnapshot(curr, labels)` and `hudEqual`; `src/ui/StaminaBar.tsx`, `src/ui/GuardBar.tsx`, `src/ui/RoundClock.tsx` (`ceil(timer / 60)`), round announcement, Knockdown_Count display, names and bars per side; the ticker calls `updateLabels` once and `setState` at most once per frame
    - _Requirements: 27.1, 27.2, 27.3, 27.4, 27.5, 27.6, 27.7, 27.8, 27.9, 27.10, 23.16, 34.7_
  - [ ]* 33.10 Write property test for Property 60: HUD snapshot and labels model
    - **Property 60: HUD snapshot and labels model**
    - **Validates: Requirements 27.2, 27.3, 27.4, 27.6, 27.7, 27.8, 27.9, 23.16**
  - [ ]* 33.11 Write UI tests (jsdom) for menus, pause, results, and HUD
    - Per design P3.9.4: initial focus and preselection; Controls list equals `keymap.ts` plus pause row; pause controller toggles, repeat ignored, blur and hidden never resume, no pause on menus or after `match-end`; Results_Screen for each method, a draw, and a decision table; HUD clock 90 at start and 0 only at timer 0; labels for 60 Ticks and same-Tick COUNTER plus GUARD BREAK; one `setState` per frame with five Ticks of events; snap-flag render test
    - _Requirements: 28.4, 28.5, 28.7, 29.1, 29.2, 29.8, 30.2, 30.3, 27.3, 27.9, 23.9, 34.7_

- [ ] 34. Add P3 browser tests and benchmark
  - [ ]* 34.1 Write P3 Playwright tests
    - Replace the M1 auto-start test with "Menu boot" (Main_Menu, Normal selected, no HUD, no Tick advance) and run "Result and restart" only in an `'m1'` e2e build; add full Match by KO, full Match by decision (`rounds.duration = 1800`, `interval = 0`), pause (Tick constant for 2 s, tab switch stays paused), and no `pageerror` in Chrome, Firefox, and Edge
    - _Requirements: 28.1, 28.4, 24.1, 25.6, 26.12, 29.1, 29.2, 29.4, 30.1, 30.3, 30.7, 14.6_
  - [ ] 34.2 Add the `'match'` benchmark run
    - `bench/tick.bench.ts`: `'match'` on Hard with Knockdowns and a round change inside the measured window; same thresholds
    - _Requirements: 34.3_

- [ ] 35. Checkpoint – P3 complete
  - Checkpoint – ensure all tests pass (`vitest --run`), ask the user if questions arise.

### P4 – Presentation and Polish

- [ ] 36. Decision gate – confirm the open questions that block P4
  - [ ] 36.1 Confirm P4-Q1, P4-Q4, and P4-Q5 with the user before implementing P4
    - Ask the user to confirm or change each item; use the design's recommended resolution as the default: P4-Q1 buffer attack presses on frozen Ticks for Able_To_Act Fighters too, with `receivedAt = g`; P4-Q4 vertical-only camera shake with fit padding that includes the current shake intensity; P4-Q5 blend duration configured per target state, HitStun default 0
    - Record the confirmed choices as named constants and defaults in `src/sim/p4/hitStop.ts`, `src/render/effects/shake.ts`, and `src/app/presentationConfig.ts` so the following tasks use them
    - _Requirements: 32.5, 6.5, 6.6, 32.7, 31.3_

- [ ] 37. Implement Hit_Stop in the simulation (pipeline step 1)
  - [ ] 37.1 Implement Hit_Stop value, frozen-Tick path, and validation
    - `src/sim/p4/hitStop.ts`: `landedHitStop` sets `hitStopRemaining` in step 7 to the maximum `hitStop` over the Tick's landed hits (blocked and slip-evaded never count); step 1 frozen path (before the ended-phase gate) decrements the counter, runs `frozenIntake` (attack presses buffered with `receivedAt = gameplayTick` in bufferable states per D12 and the 36.1 decision, everything else discarded), skips the AI, timers, movement, combat, round timer, and observation, and emits no events
    - `hitStop` integer 0–30 checked with the other Tick fields in `p2Schema.ts` (filled before fingerprinting); defaults jab 3, cross 4, hook 6, uppercut 8; round start sets `hitStopRemaining = 0`; parse rejects `hitStopRemaining` above the registry maximum or `gameplayTick > tick`
    - _Requirements: 32.2, 32.3, 32.4, 32.5, 32.6, 5.1, 5.5, 20.1, 20.4, 25.1, 25.9, 3.6_
  - [ ]* 37.2 Write property test for Property 65: Hit_Stop value and scope
    - **Property 65: Hit_Stop value and scope**
    - Use the `arbHitStopConfig` generator
    - **Validates: Requirements 32.2, 32.6**
  - [ ]* 37.3 Write property test for Property 66: Frozen Tick model
    - **Property 66: Frozen Tick model**
    - Use the `arbFrozenInputs` generator
    - **Validates: Requirements 32.3, 32.5, 25.1, 20.1, 20.4**
  - [ ]* 37.4 Write property test for Property 67: Hit_Stop shifts timestamps exactly
    - **Property 67: Hit_Stop shifts timestamps exactly**
    - **Validates: Requirements 32.2, 32.4, 4.7, 9.3**
  - [ ]* 37.5 Write unit tests for Hit_Stop
    - Jab with H = 3 freezes T+1…T+3; Trade with 4 and 8 gives 8; blocked, slip-evaded, and chip Knockdown give 0; H = 0 freezes nothing; frozen attack press buffered and started within g+1…g+5; slip, block, and movement bits change nothing; no AI call on frozen Ticks; round timer, Knockdown_Count, stun, buffer age, and history unchanged across 30 frozen Ticks; Match-ending hit freezes before the ended-phase gate; `hitStop` −1, 31, 2.5 rejected naming the attack
    - _Requirements: 32.2, 32.3, 32.5, 32.6, 5.5_
  - [ ]* 37.6 Run existing properties with Hit_Stop configs
    - Per design P4.6.2: Properties 1–4 and 25 with `arbHitStopConfig` (Property 4 adds P4.1.3 corruptions); Property 20 with frozen Ticks adding no entry; Properties 32 and 55 counted in Gameplay_Ticks with frozen Ticks inserted
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 12.9, 20.1, 25.1, 32.4_

- [ ] 38. Implement the presentation configuration
  - [ ] 38.1 Implement `presentationConfig.ts`
    - `src/app/presentationConfig.ts`: zod schema for blend Ticks per state (integer 0–6), effect lifetimes (100–1,000 ms), pool size (1–64), shake intensity (0–0.5) and duration (0–1,000 ms), master/music/sfx volumes (integer 0–100, defaults 80/60/80), pause attenuation (integer 0–100, default 50); validated at boot, every failing setting named on LoadFailedScreen, nothing defaulted
    - _Requirements: 31.3, 32.1, 32.7, 32.10, 33.4, 33.7_
  - [ ]* 38.2 Write property test for Property 74: P4 configuration validation
    - **Property 74: P4 configuration validation**
    - Use the `arbPresentationConfig` generator together with generated attack `hitStop` values
    - **Validates: Requirements 5.1, 5.5, 31.3, 32.1, 32.7, 32.10, 33.4, 33.7**
  - [ ]* 38.3 Write unit tests for presentation configuration
    - Each field just below and above its range and non-integer; several errors reported together; boot refused with LoadFailedScreen
    - _Requirements: 31.3, 32.1, 32.7, 32.10, 33.4, 33.7_

- [ ] 39. Implement the Animation_System and stylized models
  - [ ] 39.1 Implement the pure clip map, animation clock, and blend modules
    - `src/render/anim/clipMap.ts` (`clipFor(fsm, facing)`, distinct key per FSM state and punch, `attackId` + `enteredAt` key for Attacking, walk sign), `src/render/anim/animClock.ts` (segment from `curr.fsm.phase` with progress `clamp((gt − s0) / len, 0, 1)` from Simulation_State Ticks), `src/render/anim/blend.ts` (`BlendTrack` per Fighter, 0-Tick blend on Attacking entry, `blendTicks[kind]` otherwise, restart from the displayed pose, hold while `prev.gameplayTick === curr.gameplayTick`); include them in the Vitest `sim` project
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 31.7, 31.8_
  - [ ]* 39.2 Write property test for Property 68: Pose selection model
    - **Property 68: Pose selection model**
    - Use the `arbFrameSchedule` generator
    - **Validates: Requirements 31.1, 31.2, 31.7**
  - [ ]* 39.3 Write property test for Property 69: Blend and hold model
    - **Property 69: Blend and hold model**
    - **Validates: Requirements 31.3, 31.4, 31.5, 31.6, 31.8**
  - [ ] 39.4 Implement `FighterModel` with loading and fallback
    - Install `@react-three/drei`; `src/render/anim/FighterModel.tsx`: `useGLTF('fighter.glb')` inside `<Suspense>` with the placeholder `FighterView` as fallback, `SkeletonUtils.clone` for the second Fighter, per-Fighter cloned materials in the fixed colors, `fighter.anim.json` segment metadata, mixers evaluated with `update(0)` from `animClock` and `blend`; a load error, missing clip, or invalid metadata logs one warning and keeps the placeholder for the page session; snap flag honored; wire into `Scene.tsx`
    - _Requirements: 6.2, 6.3, 6.9, 31.1, 31.2, 31.9, 23.9, 34.6_
  - [ ]* 39.5 Write unit tests for animation
    - Distinct clip keys for every state and punch for both Fighters; cancel gives a new key; startup pose (`u = 0`) on the entry frame for alpha 0 and 0.99; segment switch on the boundary frame; 30/60/144 fps schedules agree; `blendTicks` 0 and 6; second change mid-blend; pose constant during Hit_Stop; GLB error, missing clip, and invalid metadata fall back with one warning
    - _Requirements: 31.1, 31.2, 31.3, 31.4, 31.6, 31.7, 31.8, 6.9_

- [ ] 40. Implement the Effects_System and camera shake
  - [ ] 40.1 Implement the pure effects pool and shake modules
    - `src/render/effects/effectsPool.ts`: slots preallocated at Match load for `maxActive`, `impact` per `hit-landed` and `blockSpark` per `attack-blocked` at `hitPos`, age vs lifetime, oldest-active recycling, `clear()` without reallocation
    - `src/render/effects/shake.ts`: trigger on `counterpunch` and `knockdown` with the greater intensity and the new duration, vertical-only offset reaching exactly 0 at and after the end (per the 36.1 decision)
    - _Requirements: 32.1, 32.7, 32.8, 32.9, 32.10, 32.11_
  - [ ]* 40.2 Write property test for Property 70: Effects pool and shake model
    - **Property 70: Effects pool and shake model**
    - Use the `arbPresentationEvents` generator
    - **Validates: Requirements 32.1, 32.7, 32.8, 32.9, 32.10, 32.11**
  - [ ] 40.3 Implement `EffectsLayer` and wire event consumption
    - `src/render/effects/EffectsLayer.tsx`: one `InstancedMesh` per effect type with capacity `maxActive`, per-instance matrices and age attribute; `SimulationTicker` hands the frame's frozen (dev builds) `readonly GameEvent[]` to `effects.consume(events, clockMs)` after the HUD update; presentation clock advances only while the Match runs and not while paused; `CameraRig` applies the shake offset and adds the intensity to fit padding
    - _Requirements: 32.1, 32.7, 32.8, 32.12, 6.5, 6.6, 34.5_
  - [ ]* 40.4 Write unit tests for effects and shake
    - Impact and block spark at `hitPos`; removal at exactly 100 and 1,000 ms; `maxActive` 1 and 64; the 65th request reuses the oldest slot of either type; `clear()` keeps the slot array; shake offset 0 at and after the duration and for duration 0; x and z offsets always 0; Property 24 rerun with shake offsets 0–0.5
    - _Requirements: 32.1, 32.7, 32.8, 32.9, 32.10, 32.11, 6.5, 6.6_

- [ ] 41. Implement the Audio_System
  - [ ] 41.1 Implement the pure sound map, volume, and audio director
    - `src/audio/soundMap.ts` (event → sound id; `hit_<attackId>` per punch, no generic hit; blocked, slip, counter, knockdown, count, round start, round end), `src/audio/volume.ts` (effective gains and pause attenuation), `src/audio/audioDirector.ts` (drops events before unlock without queueing, one `play` per mapped event in list order, no `play` while paused, `pauseSfx`/`resumeSfx`); add ESLint import rules `audio → sim (types only)` and `app → audio`; include in the Vitest `sim` project
    - _Requirements: 33.1, 33.2, 33.3, 33.4, 33.5, 33.6, 33.7, 33.8, 2.1_
  - [ ]* 41.2 Write property test for Property 72: Audio director model
    - **Property 72: Audio director model**
    - **Validates: Requirements 33.1, 33.2, 33.3, 33.5, 33.7, 33.8**
  - [ ]* 41.3 Write property test for Property 73: Effective volume
    - **Property 73: Effective volume**
    - **Validates: Requirements 33.4, 33.6, 33.7**
  - [ ] 41.4 Implement the Web Audio backend and wire it into the runtime
    - `src/audio/webAudioBackend.ts`: `AudioContext` with `latencyHint: 'interactive'`, `source → sfxGain → masterGain` and looping `<audio>` music through `musicGain`, capture-phase `keydown`/`pointerdown` unlock, at most 16 voices, pause and resume at recorded offsets, music attenuation while paused, no-op backend with one warning if the context cannot be created
    - `src/audio/assets.ts`: fetch and decode sound effects; a fetch, decode, or media error logs one warning naming the file and maps that sound to `null`
    - Wire `audio.consume(events)` into `SimulationTicker` after effects, and pause/resume hooks into `pauseController`
    - _Requirements: 33.1, 33.3, 33.4, 33.5, 33.6, 33.7, 33.8, 33.9, 29.9_
  - [ ]* 41.5 Write unit tests for audio
    - Events before unlock dropped and not replayed; one `play` per mapped event; `counter` plus `hit_*` for a Counterpunch; two events on one Tick give two plays; defaults 80/60/80 give 0.8, 0.6, 0.8; any 0 gives 0; paused music at attenuation 50 is half; fake context sees `resume()` on first `keydown` and `pointerdown`; failed fetch or decode warns once and other sounds play; throwing constructor gives a no-op backend
    - _Requirements: 33.1, 33.2, 33.4, 33.5, 33.7, 33.9_
  - [ ]* 41.6 Write property test for Property 71: Presentation is read-only
    - **Property 71: Presentation is read-only**
    - Compare runs with the Animation_System, Effects_System, and Audio_System (fake backend) enabled and disabled, and compare consumed states and event lists with clones taken before consumption
    - **Validates: Requirements 31.9, 32.12, 2.5**

- [ ] 42. Implement performance work and P4 performance checks
  - [ ] 42.1 Reduce draw calls and allocations and split the bundle
    - `Ring.tsx`: merge static parts with `BufferGeometryUtils.mergeGeometries` and vertex colors, separate transparent instanced mesh for front ropes; module-level scratch `Vector3`/`Quaternion`/`Matrix4` in every `useFrame` callback; reused frame event array cleared with `length = 0`; `vite.config.ts` `manualChunks` for `three` and `@react-three/*` with `modulepreload`; GLB and audio fetched after the Main_Menu mounts; `document.body.dataset.ready = 'true'` when menu handlers are attached
    - e2e instrumentation: `domKeyboard.ts` records `event.timeStamp` per attack press and `FighterModel` records the rAF timestamp of the first startup-pose frame
    - _Requirements: 34.1, 34.2, 34.4, 34.5, 34.6, 34.7, 14.4_
  - [ ] 42.2 Add the P4 benchmark run
    - `bench/tick.bench.ts`: `'match'` on Hard with default `hitStop` values so frozen Ticks are inside the 3,600 measured Ticks; report heap growth; same thresholds
    - _Requirements: 34.3_
  - [ ]* 42.3 Write P4 Playwright tests
    - Per design P4.6.3: 60-second frame-time trace (average fps, p99, max; gating only on the Reference_Desktop, report in CI); draw-call stress with both models, 64 effects, and a shake (≤ 100 every sampled frame); input-to-pose latency over 100 jab presses (≥ 95 within 50 ms, all within 100 ms); load time at 50 Mbit/s to `data-ready` within 5 s; audio latency ≤ 50 ms; audio unlock within 100 ms with nothing before a gesture; missing `fighter.glb` and one sound file with placeholders, one warning per file, and no `pageerror`
    - _Requirements: 34.1, 34.2, 34.4, 34.5, 34.6, 33.1, 33.3, 33.5, 33.9, 6.9, 14.6_

- [ ] 43. Final checkpoint – P4 complete
  - Checkpoint – ensure all tests pass (`vitest --run`), ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test tasks (property, unit, scenario, and browser tests) and can be skipped for a faster build; implementation tasks are never optional.
- Each property test implements exactly one Correctness Property from the design with at least 100 runs and the tag comment of design §13.1; failing runs must print the counterexample and the seed.
- M1 (tasks 1–16) is buildable and playable on its own: two placeholder Fighters, movement, jab, hit detection, health bars, the basic AI, the fixed timestep, and determinism tests.
- Each later phase keeps `'m1'` (and from P3 `'p2'`) behavior reproducible, so earlier properties keep running as a regression suite.
- Tasks 26.1 and 36.1 are decision gates; their default answers are the design's recommended resolutions.
- Frame-rate and load-time thresholds on the Reference_Desktop (Req 34 c1, c2, c4, c6) are checked by the Playwright tests as reports in CI; the gating run happens on the Reference_Desktop.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4", "2.1", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["3.3", "4.2"] },
    { "id": 5, "tasks": ["4.3"] },
    { "id": 6, "tasks": ["4.4", "4.5", "4.6", "5.1", "5.2"] },
    { "id": 7, "tasks": ["5.3"] },
    { "id": 8, "tasks": ["5.4", "5.5", "5.6", "5.7", "6.1"] },
    { "id": 9, "tasks": ["6.2", "6.3", "6.4", "7.1"] },
    { "id": 10, "tasks": ["7.2"] },
    { "id": 11, "tasks": ["7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9", "8.1"] },
    { "id": 12, "tasks": ["8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "9.1", "9.2"] },
    { "id": 13, "tasks": ["9.3", "9.4", "9.5", "9.6", "9.7", "9.8", "11.1", "12.1", "13.1", "14.1"] },
    { "id": 14, "tasks": ["11.2", "11.3", "11.4", "12.2", "12.3", "12.4", "13.2", "13.3", "14.2"] },
    { "id": 15, "tasks": ["13.4"] },
    { "id": 16, "tasks": ["13.5"] },
    { "id": 17, "tasks": ["13.6", "14.3"] },
    { "id": 18, "tasks": ["14.4", "15.1", "15.3"] },
    { "id": 19, "tasks": ["15.2", "15.4"] },
    { "id": 20, "tasks": ["17.1"] },
    { "id": 21, "tasks": ["17.2", "17.3"] },
    { "id": 22, "tasks": ["17.4", "17.5", "18.1"] },
    { "id": 23, "tasks": ["18.2"] },
    { "id": 24, "tasks": ["18.3"] },
    { "id": 25, "tasks": ["18.4", "18.5", "18.6", "18.7", "18.8", "19.1"] },
    { "id": 26, "tasks": ["19.2", "19.3", "19.4", "20.1"] },
    { "id": 27, "tasks": ["20.2"] },
    { "id": 28, "tasks": ["20.3", "20.4", "20.5", "20.6", "20.7", "20.8", "20.9", "20.10", "20.11", "20.12", "20.13", "22.1"] },
    { "id": 29, "tasks": ["22.2"] },
    { "id": 30, "tasks": ["22.3", "22.4", "22.5", "22.6", "22.7", "23.1", "23.2", "23.3"] },
    { "id": 31, "tasks": ["23.4", "24.1", "24.2"] },
    { "id": 32, "tasks": ["26.1"] },
    { "id": 33, "tasks": ["27.1"] },
    { "id": 34, "tasks": ["27.2", "27.3"] },
    { "id": 35, "tasks": ["27.4", "27.5", "28.1"] },
    { "id": 36, "tasks": ["28.2"] },
    { "id": 37, "tasks": ["28.3", "28.4", "28.5", "28.6", "28.7", "29.1"] },
    { "id": 38, "tasks": ["29.2", "29.3", "29.4", "29.5", "29.6", "30.1"] },
    { "id": 39, "tasks": ["30.2", "30.3", "30.4", "30.5", "31.1"] },
    { "id": 40, "tasks": ["31.2", "31.3", "33.1", "33.2"] },
    { "id": 41, "tasks": ["33.3", "33.4", "33.9"] },
    { "id": 42, "tasks": ["33.5", "33.10"] },
    { "id": 43, "tasks": ["33.6", "33.7"] },
    { "id": 44, "tasks": ["33.8", "33.11", "34.2"] },
    { "id": 45, "tasks": ["34.1"] },
    { "id": 46, "tasks": ["36.1"] },
    { "id": 47, "tasks": ["37.1"] },
    { "id": 48, "tasks": ["37.2", "37.3", "37.4", "37.5", "37.6", "38.1"] },
    { "id": 49, "tasks": ["38.2", "38.3", "39.1", "40.1", "41.1"] },
    { "id": 50, "tasks": ["39.2", "39.3", "39.4", "40.2", "41.2", "41.3"] },
    { "id": 51, "tasks": ["39.5", "40.3"] },
    { "id": 52, "tasks": ["40.4", "41.4"] },
    { "id": 53, "tasks": ["41.5", "41.6", "42.1"] },
    { "id": 54, "tasks": ["42.2", "42.3"] }
  ]
}
```
