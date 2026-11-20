// createMatch: the entry point for starting a Match (design §2.7; Req 5 c4; task 9.2).
// Nothing is produced until the whole configuration validates and compiles.
import { loadConfig } from './config/compile';
import type { ConfigError } from './config/schema';
import { MatchDriver } from './driver';

export type CreateMatchResult = { ok: true; driver: MatchDriver } | { ok: false; errors: ConfigError[] };

export function createMatch(rawConfig: unknown): CreateMatchResult {
  const r = loadConfig(rawConfig);
  if (!r.ok) return { ok: false, errors: r.errors };
  return { ok: true, driver: new MatchDriver(r.config) };
}
