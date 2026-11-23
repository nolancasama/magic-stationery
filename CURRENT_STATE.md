# Current State

## Status
Built directly by Claude at the user's request (no router; the user has chosen "Claude directly" for every
stage). Plan reviews and specs: `SPEC.md` §1 (Level 1), §6 (Level 2), §7 (Level 3); decisions with reasons in
`DESIGN_DECISIONS.md` (latest: 2026-11-24 verification pass).

**Live (pushed, `main` ab0fcf4):** core systems, Level 1 (Stationery Store), Level 2 (Classroom), town hub.
Public repo nolancasama/magic-stationery, GitHub Pages (Actions workflow: unit tests + build, then deploy).

**Committed locally, NOT pushed (2026-11-24):** the fix pass (user plan "Bug Fixes, Movement Improvements,
Speech Recognition, and Unfinished Work"), Level 3 (the Zoo), and the verification fixes below. The user asked
to push to live when finished; the push waits for the re-run in Next Steps 2.

**Now:** Level 4 (Supermarket) — the user said "stop tests for now, proceed on next level" (2026-11-24).

**Models:**
- Sketch model (`public/models/sketch-model.bin`, 138 Quick, Draw! classes): int8 top-1 79.9%, top-3 93.2%.
- Glyph model (`public/models/glyph-model.bin`, 0-9 / a-z / A-Z / scribble): top-1 80.9%, top-3 96.4% on
  unseen writers; Level 2 characters accepted first try 93-100%.

## What Exists
- `src/recognition/` — preprocessing, int8 CNN, `Recognizer`, `vocab.ts`, `shapeRules.ts` (long-thin: ruler,
  bamboo), `policy.ts`, `glyphs.ts`, `examples.ts` (+ `examples.json`).
- `src/speech/` — `match.ts` (times by value, `couldGrow`), `recognition.ts` (continuous sessions), `phrases.ts`.
- `src/ui/ask.ts` (speech prompt: settle after "eight…", continuation session, tip with listen button),
  `src/ui/drawPanel.ts` (writing mode, pen widths; input only while a script awaits `next()`).
- `src/world/characters.ts` — gaze, grips, `sit`; key steering glides round corners (`roundCorner`), route
  walks end rather than walk on the spot (`ROUTE_SLIDE_MIN`).
- `src/world/areas/` — `room.ts` (`RoomArea`), `store.ts`, `classroom.ts`, `zoo.ts`, `town.ts`.
- `src/game/` — `game.ts` (one controller for every room; `inLevelRoom` drives per-frame updates and gaze),
  `levels/store.ts`, `school.ts`, `zoo.ts`, `levels/index.ts` (unlock order shop → classroom → zoo),
  `save.ts` (`ms.save.v1`: `store`, `school`, `zoo`), `cast.ts`.
- Scripts: `cast-shots.mjs`, `view-shots.mjs`, `montage.mjs`, `school-shots.mjs`, `pass-shots.mjs` (town with
  the zoo open, students seated, classroom door, Class 4-1 sign).
- Tests: 112 unit; e2e `fixes.spec.ts` (6 speech-prompt tests with a scripted fake recogniser, WASD/corner,
  pen widths, gaze), `store.spec.ts` (2), `school.spec.ts`, `zoo.spec.ts` (own 480 s timeout).

## Verification (exact — 2026-11-24)
- Final build: tsc clean, 112 unit tests pass; e2e WASD (incl. gliding round the table corner), pen widths and
  the Level 3 playthrough pass.
- Build before the movement change (same except `characters.ts` steering/route slide and `inLevelRoom`): all six
  speech tests, gaze, Level 1 by speaking, Level 1 in tap mode and Level 2 passed.
- **Not re-run on the final build:** gaze, Levels 1 and 2. Risk is low (the route change only ends a blocked
  walk early; `inLevelRoom` is identical for shop/classroom) but unobserved.
- Fixed this pass: the Zoo stood frozen (`Game.update` listed rooms by name, without the zoo); the player stuck
  on table corners; the e2e "hang" was the test's fake recogniser bypassed (Chromium 153 has an unprefixed
  `SpeechRecognition`).
- Screenshots not yet taken this pass: Class 4-1 sign, classroom door, students sitting, town with the zoo open.

## Known Issues
- Another session's e2e (esl-social-life) running at the same time starves SwiftShader: tests time out
  (one speech test did). Run e2e when the machine is otherwise idle. Full suite ~14 min; zoo test ~5 min.
- The pen's speech bubble covers the canvas's top-left corner (hides line starts there; drawing still works).
- Draw calls: restored shop ~132, restored classroom ~74; zoo not measured.
- Thin lines read small from the overview camera; drawn desks look spindly.
- Real Chromebook touchpad, microphone and Chrome continuous recognition untested (fake recogniser only).
- Zoo: debug `?scene=zoo&fill=1` shows animals static (life loops start only in the level script).
- Deferred: Level 2 timetable; zoo giraffes/fish/ducks.

## Next Steps
1. Level 4, the Supermarket (SPEC §5): write SPEC §8, then build (area, host, objects, script, phrases,
   vocab, save section, e2e test).
2. When the user allows tests: on an idle machine, rebuild and run gaze + `store.spec.ts` + `school.spec.ts`
   (then the whole suite); `node scripts/pass-shots.mjs http://127.0.0.1:4181/ .tmp/shots/pass` with
   `npm run preview -- --port 4181` running, and judge the shots.
3. Push to live (the user asked for it when finished); confirm the Pages deploy.
4. Then the Gym (SPEC §5).
