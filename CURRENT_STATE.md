# Current State

## Status
Built directly by Claude at the user's request (no router) — Level 1 from the user's plan "Magic Stationery —
Restore the World" (2026-11-23), Level 2 on 2026-11-23 ("Claude directly" again, chosen by the user). The plan
review is `SPEC.md` §1; Level 2 is `SPEC.md` §6; decisions with reasons are in `DESIGN_DECISIONS.md`.

**Built:** core systems, Level 1 (the Stationery Store), Level 2 (Ms. Mori's Classroom, opens once the shop is
finished), the town hub (zoo, market, gym "Coming soon"). Public repo nolancasama/magic-stationery with GitHub
Pages (Actions workflow).

**Models:**
- Sketch model (`public/models/sketch-model.bin`, 414 KB, 138 Quick, Draw! classes): int8 top-1 79.9%,
  top-3 93.2%; first-try acceptance of genuine drawings 90-100% per Level 1 word.
- Glyph model (`public/models/glyph-model.bin`, 393 KB, 0-9 / a-z / A-Z / scribble; UJI Pen Characters v2 +
  EMNIST thinned to strokes): int8 top-1 80.9%, top-3 96.4% on unseen writers. With the policy, real
  handwriting of the Level 2 characters is accepted first try 93-100%; other characters wrongly accepted
  0.3-6.3% (mostly intended look-alikes). Training data lives outside the repo (see tools README).

## What Exists
- `src/recognition/` — `strokes.ts` + `raster.ts` (shared with training), `model.ts` (int8 CNN in plain TS),
  `recognizer.ts` (used by both models), `vocab.ts`, `shapeRules.ts`, `policy.ts` (objects), `glyphs.ts`
  (characters: constrained policy, look-alikes, "12" splitting, hand-made worksheet-style examples),
  `examples.ts` (+ `examples.json`).
- `tools/sketch-model/` — reproducible pipelines for both models (`build-dataset.ts`, `build-glyphs.ts`,
  shared `augment.ts`, `train.py`, `eval-policy.ts`, `eval-glyphs.ts`, `pick-examples.ts`).
- `src/world/areas/` — `room.ts` (the `RoomArea` interface), `store.ts`, `classroom.ts` (clock face and
  alphabet strip are single canvas textures with the child's handwriting painted in), `town.ts`.
- `src/objects/` — Level 1 models, `furniture.ts` (desk, chair), surprises, living drawings, registry.
- `src/game/` — `game.ts` (one controller for every room: `room`/`place`, drawFor, writeGlyph, restore,
  saveGlyph, npcEnter…), `levels/store.ts`, `levels/school.ts`, `levels/index.ts` (registry + unlock order),
  `save.ts` (`ms.save.v1`, now with a `school` section; old saves load unchanged), `cast.ts` (+ Ms. Mori).
- `src/ui/` — draw panel has a writing mode (worksheet lines, "Write the letter d!"); dialogue supports
  `{shown|spoken}` so letter names are spoken correctly.
- Tests: 71 unit tests; e2e `tests/e2e/store.spec.ts` (2) and `school.spec.ts` (full Level 2 with real
  handwriting, a wrong letter and a wrong time). Screenshot pass: `scripts/school-shots.mjs`.

## Current Work
**Level 2 committed + pushed to `main` (2026-11-23, live via GitHub Pages at the user's request).** Verified
before commit: tsc, 71 unit tests, all 3 e2e tests (Level 2 playthrough, Level 1 regression, mic-off), Claude
judged the screenshots (erased/restored room, writing panel with stencil, clock with handwriting, arrival,
album).

Also fixed by the room refactor: the player character was missing inside the shop (stayed in the town scene).
Level 1's e2e draw-call limit was raised 130 → 140 for it (+7 calls).

## Known Issues
- Draw calls: restored shop ~132 (with the player now visible), restored classroom ~74. Merge static display
  items if a Chromebook struggles.
- Students stand at their places at the end of Level 2 (no sitting pose yet).
- Thin lines read small from the overview camera (faithful line weight) — the drawn desks look spindly.
- Writing and drawing on a real Chromebook touchpad not tried; speech only via the test hook, not a real mic.
- Timetable (SPEC §5) deferred.

## Next Steps
1. The user plays Levels 1-2 on a Chromebook and reports feel (writing with a touchpad, speech, pacing).
2. Level 3 (Zoo, SPEC.md §5): animals with species behaviours, "Do you like …?".
