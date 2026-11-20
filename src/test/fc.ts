// Property-test configuration shared by every Vitest project (design §13.1, task 1.2).
//
// - Every property runs at least FC_MIN_RUNS (100) generated cases (Req 15 c2).
// - `FC_SEED` (and optionally `FC_PATH`) replay a reported failure exactly:
//     $env:FC_SEED="123"; $env:FC_PATH="4:2"; npx vitest --run <file>
// - Failures report the test name (Vitest), the shrunk counterexample, and the seed
//   and path (fast-check), satisfying Req 15 c4. `assertProperty` adds a replay line.
import fc from 'fast-check';

export const FC_MIN_RUNS = 100;

function parseSeed(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new Error(`FC_SEED must be an integer, got "${raw}"`);
  return n | 0;
}

export const FC_SEED = parseSeed(process.env['FC_SEED']);
export const FC_PATH = process.env['FC_PATH']?.trim() || undefined;

fc.configureGlobal({
  numRuns: FC_MIN_RUNS,
  ...(FC_SEED !== undefined ? { seed: FC_SEED } : {}),
  ...(FC_SEED !== undefined && FC_PATH !== undefined ? { path: FC_PATH } : {}),
});

/** Formats the environment variables that replay a failed run. */
export function replayHint(seed: number, path: string | undefined): string {
  return path === undefined ? `FC_SEED=${seed}` : `FC_SEED=${seed} FC_PATH=${path}`;
}

/**
 * Runs a property like `fc.assert`, but on failure throws an error whose message holds
 * fast-check's full report (counterexample, seed, path) followed by an explicit replay line.
 */
export function assertProperty<Ts>(property: fc.IProperty<Ts>, params?: fc.Parameters<Ts>): void {
  const details = fc.check(property, params);
  if (!details.failed) return;
  const report = fc.defaultReportMessage(details) ?? 'Property failed';
  throw new Error(`${report}\n\nReplay with: ${replayHint(details.seed, details.counterexamplePath ?? undefined)}`);
}
