# Current State

## Status
New project (2026-11-23). Built directly by Claude at the user's request (no router), from the user's plan
"Magic Stationery — Restore the World". The plan review (accepted / modified / added / deferred) is
`SPEC.md` §1; decisions with reasons are in `DESIGN_DECISIONS.md`.

**Built:** Stage 1 (core systems) + Stage 2 (Level 1, the Stationery Store, complete) + the town hub with
all five places (four "Coming soon"). Public repo nolancasama/magic-stationery with GitHub Pages
(Actions workflow), published at the user's request on 2026-11-23.

**The sketch model is being retrained** (the first run's weights were lost: its output folder vanished
from the session scratchpad before export; `train.py` now creates its folder and checkpoints `best.pt`
every epoch, output in `.tmp/model-out`). Until `public/models/sketch-model.bin` is committed, the game
runs without a recogniser: every drawing is accepted (the designed fallback), no live guesses or surprises.

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
Verification in progress (see Next Steps).

## Known Issues
- Drawing usability on a real Chromebook touchpad has not been tried (only mouse/touch simulation).
- Speech recognition has only been exercised through the test hook, not a real microphone.

## Next Steps
1. The user plays Level 1 on a Chromebook (`npm run dev`, or a build in any folder).
2. Level 2 (Classroom): digit/letter recogniser, clock, alphabet strip, desks/chairs (SPEC.md §5).
