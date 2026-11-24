# Current State

## Status
Levels 1-5 built directly by Claude; the 2026-11-24 fix pass went through the worker router (Codex implemented,
Claude reviewed and did acceptance). Plan reviews and specs: `SPEC.md` §1 (Level 1), §6 (Level 2), §7 (Level 3),
§8 (Level 4), §9 (Level 5); decisions in `DESIGN_DECISIONS.md` (latest: 2026-11-24 fix pass). All five places built.

**Live (`main` 3a84c9d):** https://nolancasama.github.io/magic-stationery/ — public repo, GitHub Pages via Actions.
**Uncommitted in the working tree (clone at ~/Projects/magic-stationery):** the whole 2026-11-24 fix pass — basket
counting phases, grocer staging, town signs, speech latency/status states, arm clamp, NPC separation, door exits,
Taro/npcEnter fix, soccer cart, market + gym e2e specs. Not committed or pushed (awaiting the user).

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
- Fix-pass pieces: `levels/counting.ts` (count-then-speak state), market `serve` spots + `GREEN_AISLE`,
  `countView` in `levels/market.ts`, `game/doorExit.ts` (door bubble hysteresis), `doorInsideX` in `room.ts`,
  arm clamp + people separation in `characters.ts`, speech timings/status in `ui/ask.ts`, `isSpeechPrefix` in
  `speech/match.ts`. Debug: `MS_SHOTS=<dir>` makes market.spec / the door test in fixes.spec save screenshots.
- Tests: 155 unit (16 files); e2e `fixes.spec.ts` (speech, WASD, pens, gaze, 2 door-exit), `store.spec.ts` (2),
  `school.spec.ts`, `zoo.spec.ts`, `market.spec.ts`, `gym.spec.ts` (visits the market first: Taro regression).

## Verification (exact — 2026-11-24, fix pass, uncommitted tree)
- tsc clean; 155 unit tests pass; build OK.
- e2e, all passing on the final tree: fixes.spec (14 incl. door exits) + market.spec (twice more, stable);
  store (speaking + tap mode), school, zoo; gym.spec (1).
- Harness trust: gym.spec failed with the `npcEnter` `c.stop()` fix removed and passed with it. market.spec
  asserts "Here you are." is refused while counting at 0 (the old flow would pass that check wrongly → fail).
- Screenshots judged: cast holding/giving poses (arms clear of torsos, all six), soccer cart (no dividers),
  Mr. Green staged at the egg fridge facing the player, counting counter, door bubble, town signs (in passing).
- Draw calls (`fill=1`): store 132, supermarket 122, gym 83.
- Speech latency (scripted fake recogniser only): app delay after a clean match 750 → 500 ms; "eight" alone
  3.78 → 3.53 s; wrong final 1.83 → 1.33 s. Real Chrome engine latency unmeasured.

## Known Issues
- Counting camera: the crate and counter are in view but the customer's body hides their basket, so items are
  not seen landing. Fix idea: the customer holds the basket out toward the crate during counting (pose work).
- Objective pill text overflows into the HUD buttons when long with Japanese (seen: "The shop is open!…").
- Run e2e only on an idle machine (SwiftShader starvation). Full suite ~20 min.
- The pen's speech bubble covers the canvas's top-left corner.
- Thin lines read small from the overview camera; drawn desks look spindly.
- Real Chromebook touchpad, microphone and Chrome recognition untested (fake recogniser only).
- Zoo: debug `?scene=zoo&fill=1` shows animals static (life loops start only in the level script).
- Deferred: Level 2 timetable; zoo giraffes/fish/ducks.

## Next Steps
1. User decision: commit and push the fix pass (`.ai/` holds delegation scratch — do not commit it).
2. On a real Chromebook: speak the short phrases ("Here you are.", "Do you have a pencil?", "Eight thirty.",
   "I like apples.") fluently and slowly; judge latency and the status line; turn mic off and finish a level.
3. Counting camera / basket pose (Known Issues 1); objective pill overflow.
4. Then SPEC TODOs in the user's priority order: drawing-recognition reliability, preserving/animating the
   child's drawings, restoration persistence, NPC behaviour polish. No open-ended invention phase.
