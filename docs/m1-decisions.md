# M1 implementation decisions

Decisions approved by the project owner before implementation. They complement the approved
specifications in `.kiro/specs/project-ring/` and do not change them.

## Provisional M1 defaults (approved provisionally; do not change silently)

The spec gives no Part 1 values for these settings. They are encoded in
`src/sim/config/defaults.ts` and must not be changed without the owner's approval.

| Setting | Value |
|---|---|
| `ring.min` / `ring.max` | −3 / +3 world units |
| `start.player` / `start.ai` | −1.5 / +1.5 world units |
| `walkSpeed` | 0.04 world units per Tick |
| `maxHealth` | 100 |
| `ai.reactionDelay` | 12 Ticks |
| `ai.attackInterval` | 45 Ticks |
| `seed` | 1 |

Hurtbox (`w 0.5`, `h 1.8`, `centerY 0.9`), `minSeparation 0.8`, and the jab definition are
taken from design §P2.4.4, which states them as the Part 1 default geometry.

## Toolchain pins

All versions are pinned exactly (`.npmrc` `save-exact=true`).

| Package | Version | Note |
|---|---|---|
| typescript | 6.0.3 | TypeScript 7 is not supported by typescript-eslint 8.73 (`<6.1.0`) |
| tailwindcss, @tailwindcss/postcss | 4.3.5 | v4 through its PostCSS plugin; `src/index.css` uses `@import "tailwindcss"` |
| zod | 4.6.7 | |
| react, react-dom | 19.3.1 | R3F 9.8.2 requires `>=19 <19.4` |
| @react-three/fiber | 9.8.2 | |
| vite | 8.3.8 | |
| vitest | 5.1.1 | Projects configured with `test.projects` |
| jsdom | 29.1.1 | jsdom 30+ requires Node ≥ 22.22.2; this machine has Node 22.17.0 |
| @fontsource-variable/inter | 5.3.0 | Self-hosted; SIL OFL 1.1 in `public/licenses/` |

## Working agreements

- Implement M1 only (tasks 1–16). No P2, P3, or P4 code or tests.
- Stop for approval at Task 10 and Task 16.
- Commit after each completed task or task group; never commit failing or unverified work.
- Optional (`*`) M1 test tasks are implemented where practical.

## Verification results

- **Design Q11 (Task 2):** on @react-three/fiber 9.8.2, `useFrame(cb, -1)` runs before
  priority-0 callbacks in the same frame and R3F's automatic render still runs
  (`internal.priority === 0`). The design's primary approach is kept; the fallback was not
  needed. Verified through R3F's real loop (`advance`), because test-renderer's
  `advanceFrames` calls subscribers directly and never renders.
