# Current State

## Status
Built directly by Claude at the user's request (no router; the user has chosen "Claude directly" for every
stage). Plan reviews and specs: `SPEC.md` §1 (Level 1), §6 (Level 2), §7 (Level 3), §8 (Level 4), §9 (Level 5);
decisions with reasons in `DESIGN_DECISIONS.md` (latest: 2026-11-24 Level 5, the Gym). All five places are built.

**Live (pushed and deployed 2026-11-24, `main` after 756cca5):** core systems, all five levels (Store, Classroom,
Zoo, Supermarket, Gym), town hub. https://nolancasama.github.io/magic-stationery/
Public repo nolancasama/magic-stationery, GitHub Pages (Actions workflow: unit tests + build, then deploy).
Pushed on the user's go-ahead before the e2e re-run, so Levels 4 and 5 are live but have not been played or e2e-tested.


The user (2026-11-24): "no tests for this session just make levels" — so Levels 4 and 5 have never been run;
only tsc/build, content checks of their hint drawings, and screenshots of their rooms.

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
- `src/world/areas/` — `room.ts` (`RoomArea`), `store.ts`, `classroom.ts`, `zoo.ts`, `market.ts`, `gym.ts`,
  `town.ts`.
- `src/game/` — `game.ts` (one controller for every room; `inLevelRoom` drives per-frame updates and gaze;
  `ROOM_PLACES`, `unitsOf`, `lockedWhy`; `pickSlot`/`cancelPick` for counting), `levels/store.ts`, `school.ts`,
  `zoo.ts`, `market.ts`, `gym.ts`, `levels/index.ts` (unlock order shop → classroom → zoo → supermarket → gym),
  `save.ts` (`ms.save.v1`: `store`, `school`, `zoo`, `market`, `gym`), `cast.ts` (+ Mr. Green, Coach Kato).
- Level 4 pieces: `objects/market.ts` (apple, orange, tomato, carrot, egg, milk, basket), vocab words + `round`
  / `oval` shape rules, hand-made hints in `examples.ts`, phrases (what do you want / how many / here you are /
  I want … / one … five, please), `Character.carry()` (basket in the left hand).
- Level 5 pieces: `objects/gym.ts` (soccer ball, basketball, hoop, racket, bat, play balls, goal), vocab words,
  hand-made hints (hoop traced: criss-cross net), phrases (yes, let's / what sport / I like soccer … / let's
  play), ball flights in `levels/gym.ts` (`flight`, `bounceOut`, `makeBall`).
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
- **Levels 4 and 5:** tsc clean, build OK, hand-made hints accepted by the model (content check); room
  screenshots judged (`.tmp/shots/market`, `.tmp/shots/gym`, `.tmp/shots/gym2`). Their level scripts, the
  counting mechanic, baskets, ball flights, held rackets/bats and the festival finale have never executed. No
  e2e test exists for either yet.

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
1. When the user allows tests (on an idle machine): write `tests/e2e/market.spec.ts` (playthrough: `clickSlot`
   the crate N times while the "Here you are." prompt is open, then `say`) and `gym.spec.ts` (draw five things,
   answer, "Let's play!"), run them and watch one playthrough of each in screenshots (baskets, flights, held
   rackets/bats, the festival); rebuild and run gaze + `store.spec.ts` + `school.spec.ts`, then the whole
   suite; `node scripts/pass-shots.mjs http://127.0.0.1:4181/ .tmp/shots/pass` with
   `npm run preview -- --port 4181` running, and judge the shots.
2. (Done 2026-11-24: pushed to live, Pages deploy succeeded.)
3. Measure draw calls in the restored supermarket and gym (Chromebook budget ~100-140).
