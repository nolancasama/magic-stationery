# Current State

## Status
New project (2026-11-23). Built directly by Claude at the user's request (no router), from the user's plan
"Magic Stationery — Restore the World". The plan review (accepted / modified / added / deferred) is
`SPEC.md` §1; decisions with reasons are in `DESIGN_DECISIONS.md`.

**Built:** Stage 1 (core systems) + Stage 2 (Level 1, the Stationery Store, complete) + the town hub with
all five places (four "Coming soon"). Public repo nolancasama/magic-stationery with GitHub Pages
(Actions workflow), published at the user's request on 2026-11-23.

**Sketch model installed** (`public/models/sketch-model.bin`, 414 KB): int8 test top-1 79.9%, top-3 93.2%,
top-5 96.0% on 138 classes; the TypeScript pipeline gives top-1 79.5% on 11,040 held-out drawings (parity
with PyTorch) at ~31 ms per drawing on the desktop. First-try acceptance of genuine drawings: pencil 95%,
eraser 94%, scissors 96%, book/notebook 100%, crayon 90%, schoolbag 95%, ruler 100%; other things wrongly
accepted ≤ 1% (ruler 9%, any long thin shape, by design). The first training run was lost at export (see
DESIGN_DECISIONS); the retrain is deterministic and reproduced it exactly.

## What Exists
- `src/recognition/` — sketch pipeline: `strokes.ts` + `raster.ts` (shared with training), `model.ts`
  (int8 CNN forward pass in plain TS), `recognizer.ts`, `vocab.ts` (word → model labels with weights),
  `shapeRules.ts` (ruler = long thin shape), `policy.ts` (accept / surprise / unclear + help ladder),
  `examples.ts` (+ generated `examples.json`). Model: `public/models/sketch-model.bin`.
- `tools/sketch-model/` — reproducible training pipeline (see its README).
- `src/objects/` — Level 1 models (`stationery.ts`), surprise creatures/things with behaviours
  (`surprises.ts`), the living doodle (`doodle.ts`), per-kind entrances (`registry.ts`), the
  transformation (`transform.ts`).
- `src/world/` — engine (adaptive dpr), materials (erased-grey patch + colour wave, magic reveal, ghost),
  parts (merged primitives), characters (chibi rigs + poses), nav (grid A*), effects (particles),
  `areas/store.ts`, `areas/town.ts`.
- `src/game/` — `game.ts` (controller + shared helpers), `levels/store.ts` (Level 1 script),
  `levels/index.ts` (place → level registry), `save.ts` (`ms.save.v1`), `cast.ts`.
- `src/speech/` — recognition/TTS wrappers (ported from monster-island), phrases + matcher.
- `src/ui/` — HUD, dialogue, ask prompt (speech ladder), draw panel, screens (title, teacher settings,
  completion album).

## Current Work
Verified 2026-11-23: tsc, 44 unit tests (incl. TS-vs-PyTorch parity), both e2e tests (Level 1 by speech with
the rabbit surprise + reload; mic-off tap mode), full-playthrough screenshot pass at 1366x768 judged by
Claude (`scripts/full-shots.mjs`). Peak 101 draw calls (restored shop + 3 shoppers). Live:
https://nolancasama.github.io/magic-stationery/

Fixed after the screenshot pass: customers froze outside the door (collision outside the room); conversation
camera now over the player's shoulder with a line-of-sight check; ambient shoppers keep clear of scenes;
crayon palette pushed out of the draw panel by the hint card; spent Next button now hides; town labels
under the objective bar.

## Known Issues
- Drawing usability on a real Chromebook touchpad has not been tried (mouse/touch simulation only).
- Speech recognition only exercised through the test hook, not a real microphone.
- Inference ~31 ms/drawing on the desktop; untested on a slow Chromebook (live guesses run only in pauses).

## Next Steps
1. The user plays Level 1 on a Chromebook and reports feel (drawing, speech, pacing).
2. Level 2 (Classroom): digit/letter recogniser, clock, alphabet strip, desks/chairs (SPEC.md §5).
