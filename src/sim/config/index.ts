// Configuration defaults, Attack_Registry, schemas, and compilation (design §1.2, §2.7).
export { JAB, M1_ATTACKS } from './attacks';
export { DEFAULT_CONFIG, defaultConfig, cloneJson } from './defaults';
export { validateConfig, formatConfigError, TICK_RANGES, UINT32_MAX } from './schema';
export type { GameConfig, ConfigError, ValidationResult } from './schema';
export { compileConfig, computeReach, loadConfig } from './compile';
export type { CompiledConfig, HurtboxFx, LoadResult, ReachInfo } from './compile';
