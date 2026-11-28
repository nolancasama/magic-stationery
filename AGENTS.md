# Agent Instructions

Keep implementation changes scoped to the requested work. Read relevant existing code and design documents before changing user-facing behavior. Do not commit or push unless explicitly instructed.

## Testing

Follow the machine-wide workflow at `C:/Users/nolan/.claude/testing/TESTING_WORKFLOW.md` before writing or running browser tests. The repository contains its reusable implementation in `tests/support/`; it needs no machine-local files to run.

The preview port is **4181**, or **4281** in a git worktree (`.git` is a file). `PREVIEW_PORT` overrides it. Global setup verifies served HTML against the current `dist/index.html` before probing the renderer; a mismatch fails with `WRONG_SERVER`. `BASE_URL` selects an external server and skips the local build identity comparison.

All browser runs must use the npm scripts below, which acquire the machine-wide lock **before building**. Never bypass the lock, run alongside another browser suite, or stop another agent's run. Hardware Chromium is the default; verify and report `[WebGL UNMASKED_RENDERER]`, worker count, elapsed time and result. Use SwiftShader only for compatibility or an unavailable GPU. The viewport remains 1366 x 768 at device scale factor 1.

| Tier / check | Command | Scope |
| --- | --- | --- |
| 1 Functional | `npm run e2e` | `tests/e2e/` |
| 2 Visual | `npm run e2e:visual` | `tests/visual/` |
| 3 Performance | `npm run e2e:perf` | `tests/perf/` |
| 4 Full regression | `npm run e2e:full` | Functional, visual, perf and `tests/soak/` |
| Compatibility | `npm run e2e:compat` | Functional with SwiftShader |
| Reusable kit | `npm run test:kit` | Node self-tests for lock and server identity |
| Types | `npm run typecheck` | TypeScript checks |
| Unit | `npm test` | `src/**/*.test.ts` only |

For an affected functional spec, use e.g. `npm run e2e -- tests/e2e/fixes.spec.ts`. Empty visual/perf/soak tiers are allowed. Run visual tests when rendering, layout, art, camera or UI appearance changes; performance tests when frame cost can change. Full regression is for releases, major cross-system changes or an explicit request.

### Test map

| Spec | Coverage | Source areas |
| --- | --- | --- |
| `tests/e2e/fixes.spec.ts` | Six speech-prompt regressions (slow time answers, continuation, hints, tap rescue); keyboard/click movement and blocking; per-stroke pen widths and undo; shopkeeper gaze | `src/speech/`, `src/ui/ask.ts`, `src/ui/drawPanel.ts`, `src/draw/`, `src/world/characters.ts`, `src/game/game.ts` |
| `tests/e2e/store.spec.ts` | Level 1 speech playthrough, surprise drawing, mic-off tap rescue, restored displays, draw-call budget, saved drawings and reload | `src/game/levels/store.ts`, `src/game/save.ts`, `src/game/game.ts`, `src/world/areas/store.ts`, `src/recognition/`, `src/objects/`, `src/ui/`, `src/speech/` |
| `tests/e2e/school.spec.ts` | Level 2 desks/chairs, real handwriting, wrong-letter/time recovery, clock/ABC/bell, draw-call budget and persistence | `src/game/levels/school.ts`, `src/game/save.ts`, `src/world/areas/classroom.ts`, `src/recognition/glyphs.ts`, `src/ui/`, `src/speech/`, `src/objects/` |
| `tests/e2e/zoo.spec.ts` | Level 3 animals/food, recognition, favourite-animal answers, restoration and draw-call budget | `src/game/levels/zoo.ts`, `src/world/areas/zoo.ts`, `src/recognition/`, `src/objects/living.ts`, `src/game/game.ts`, `src/ui/`, `src/speech/` |
| `tests/support/kit.selftest.mjs` | Lock serialization, stale recovery, waiting timeout, nesting, unavailable lock directory and server identity | `tests/support/test-lock.mjs`, `tests/support/server-identity.ts` |

| `tests/e2e/market.spec.ts` | Level 4 supermarket: restoration, counting handoffs accepted on the first answer | `src/game/levels/market.ts`, `src/game/levels/counting.ts`, `src/world/areas/market.ts`, `src/objects/market.ts`, `src/ui/ask.ts`, `src/speech/` |
| `tests/e2e/gym.spec.ts` | Level 5 gym: restoration and the sports festival start (visits the market first: Taro regression) | `src/game/levels/gym.ts`, `src/world/areas/gym.ts`, `src/objects/gym.ts`, `src/world/characters.ts`, `src/game/save.ts` |

The town (`src/world/areas/townLayout.ts`, `town.ts`) and the debug panel have unit tests (`townLayout.test.ts`) but no dedicated e2e spec. Town changes run all of Tier 1 because every level starts from the town. `MS_SHOTS=<dir>` makes market.spec and the door test in fixes.spec save screenshots (evidence only, still functional tests).

The pen-width screenshot in `fixes.spec.ts` accompanies functional assertions for controls, stored widths and undo, so it remains in Tier 1. Triangle and draw-call checks also remain functional.

Run **all of Tier 1** after changes to shared/core systems: the game loop/controller, input and movement, save/progress, speech/audio, scene/level loading, renderer setup, shared UI shell, drawing/recognition pipelines, shared object/character systems, build configuration, or browser test setup. For localized changes, run the mapped specs and specs for direct consumers first.

One worker is the default. `PW_WORKERS=2` is eligible here: the recorded identical 13/13 results improved from 361 s (GPU, one worker) to 201 s (two workers), with +37% CPU work. The wrapper samples background CPU and falls back to one worker above 30%; never use more than two. See the 2026-11-28 decision in `DESIGN_DECISIONS.md`.

The lock's read-only semantic state is its `holder` JSON record and `tickets/*.json` queue under `AGENT_TEST_LOCK_DIR` (default: `<LOCALAPPDATA or homedir>/agent-test-lock`); file modification times are heartbeats. The kit harness establishes a running holder and queued ticket before checking serialization or waiter timeout. Lock-directory write failure logs `TEST_LOCK_UNAVAILABLE` and runs unlocked as required by the workflow fallback.

Wait on semantic state rather than readiness sleeps when editing a test; keep timed-mechanic waits with a comment. Existing gameplay harness state is exposed through `window.__ms.state()` and the existing `window.__ms.game` surface. Desktop FPS is a GTX 1080 measurement, never a Chromebook estimate. Do not replace evidence or update snapshots to make a test pass. Stop after the required checks pass.
