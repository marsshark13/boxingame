// Game_Simulation public API (design §1.2). Pure TS: no React, Three, DOM, Web Audio, time, Math.random.
export * from './types';
export { step, stepInto, ableToAct, type StepOptions } from './step';
export { decideAi, type AiDecision } from './ai';
export { createInitialState, copyStateInto, cloneState } from './state';
export { HISTORY_SIZE, observationFor, observe } from './observation';
export { M1_TRANSITIONS, activeTable, type TransitionRule } from './fsm';
export { seedSfc32 } from './rng';
export { fromFx, toFx, FX_PER_UNIT } from './fixed';
export {
  DEFAULT_CONFIG,
  defaultConfig,
  formatConfigError,
  loadConfig,
  validateConfig,
  type CompiledConfig,
  type ConfigError,
  type GameConfig,
  type LoadResult,
} from './config';
