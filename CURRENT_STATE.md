# Current State

## Status
Levels 1-5 built directly by Claude; the 2026-11-24 fix pass went through the worker router (Codex implemented,
Claude reviewed and did acceptance). Plan reviews and specs: `SPEC.md` §1 (Level 1), §6 (Level 2), §7 (Level 3),
§8 (Level 4), §9 (Level 5); decisions in `DESIGN_DECISIONS.md` (latest: 2026-11-24 fix pass). All five places built.

**Live (`main` 3756b6b, deployed 2026-11-28):** https://nolancasama.github.io/magic-stationery/ — includes the
fix pass and the zoo rebuilt as a 24 x 18 m park (DESIGN_DECISIONS 2026-11-28); live site checked in a browser
(new zoo bounds, all anchors filled, follow camera, no page errors). Public repo, GitHub Pages via Actions.
Working clone: ~/Projects/magic-stationery.

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
  `zoo.ts`, `market.ts`, `gym.ts`, `levels/index.ts` (shop first, then any order; the gym's festival waits for `festivalOpen`),
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
- Zoo rebuild (2026-11-28): `world/areas/zooLayout.ts` is the single source of every zoo position, camera,
  anchor, climbing node/edge, rope (`ropePoint`), pool and POI (+ `zooLayout.test.ts`); `areas/zoo.ts` builds
  the scene from it; `levels/zooLife.ts` (+ pure `zooLifePlans.ts`) owns all animal motion and the script's
  beats (`zooIntro`, `feedMonkeys`, `feedPandas`, `startZooLife`, also started by `?scene=zoo&fill=1`);
  `RoomArea.follow` + follow camera in `game.ts`; `expandSlotSave` in `save.ts` (old zoo saves fill the new
  anchors with the child's own art); `NavMap` ovals + heap A*. Anchors: 2 elephants, 4 monkeys, 4 bananas,
  2 pandas, 6 bamboo, 5 penguins.
- Town redesign (2026-11-28, e295bd2, live): `world/areas/townLayout.ts` is the single source of the town
  (34 x 23 m neighbourhood, no fountain: shop row on the main street, lane, park, zoo forecourt, schoolyard
  with school + gym, zoo behind its fence) + `townLayout.test.ts`; `town.ts` builds it (district colour
  levels, flowers, lamps, balloons, sports-day flags/banner via `setLife`); town follow camera, 🗺️ map with
  quick travel, townsfolk strollers, town walk speed 2.6 in `game.ts`; `save.ts` `middleOpen` /
  `festivalOpen`; gym `festivalLater`; `scripts/town-shots.mjs` (stages start/middle/festival/done).
- Debug version: `?debug=1` panel (`ui/debugPanel.ts`, `game/debug.ts`, `debugUnlock` in `save.ts`): unlock
  everything, stage presets, finish/reset/go per place, speed, live stats. Checked in a browser.
- Tests: 207 unit (24 files); e2e `fixes.spec.ts` (speech, WASD, pens, gaze, 2 door-exit), `store.spec.ts` (2),
  `school.spec.ts`, `zoo.spec.ts`, `market.spec.ts`, `gym.spec.ts` (visits the market first: Taro regression).

## Verification (exact — 2026-11-28, town redesign + debug, commit e295bd2, deployed)
- tsc clean; 203 unit tests pass (incl. `townLayout.test.ts`, `progression.test.ts`); build OK.
- Full e2e 19/20 on the first build; the failure was fixes.spec WASD in the store (left-arrow glide 0.3 m
  short) and it passed 3/3 alone on the final build (load flake, not town code). Full suite not re-run on the
  final build (changes since: map framing, people block keys in town).
- Town screenshots judged (`scripts/town-shots.mjs`: start / middle / festival / done, follow camera at
  street, shops, market, zoo, yard, gym, and the map). Old-format saves (no town data) load; labels/stars,
  strollers, flowers, balloons, flags follow progress. In town: W moves 2.0 m north, → moves east; all five
  labels visible on the map; map click on the zoo enters it in ~1.4 s; no page errors.
- Draw calls (map view): start 24, middle 48, festival/done 74.

## Verification (exact — 2026-11-28, zoo rebuild, commit 3756b6b)
- tsc clean; 192 unit tests pass; build OK; full e2e 20/20 pass (12.9 min) on the final build.
- Screenshots judged (`?scene=zoo`, erased and `fill=1`): overview, gate, plaza, each habitat, follow camera.
- Motion sampled 40 s at speed 2: elephants never closer than 2.25 m, never in water/obstacles/outside roam,
  up to 15 m walked; penguins never below the surface outside the pool; pandas no collisions; monkeys
  99.6% of samples on the climbing structures (the rest are jump arcs). Penguin crowding on land after the
  rest-reservation fix: 15/392 sampled frames with a pair < 0.3 m (walk-pasts), was 141/395.
- Old-format completed zoo save (3 monkeys/bananas/bamboo/penguins): every anchor filled with the saved art,
  no ghosts, steps kept, stored save untouched.
- Draw calls (`fill=1`): zoo overview 118 (erased 74), exhibit views 42-72.

## Verification (exact — 2026-11-24, fix pass, commit 941bf4f)
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
- Town: real Chromebook performance unmeasured; townsfolk only stroll (no talking); the bus stop sign pole
  leans into the bottom of the follow view at the crosswalk.
- Counting camera: the crate and counter are in view but the customer's body hides their basket, so items are
  not seen landing. Fix idea: the customer holds the basket out toward the crate during counting (pose work).
- Objective pill text overflows into the HUD buttons when long with Japanese (seen: "The shop is open!…").
- Run e2e only on an idle machine (SwiftShader starvation). Full suite ~20 min.
- The pen's speech bubble covers the canvas's top-left corner.
- Thin lines read small from the overview camera; drawn desks look spindly.
- Real Chromebook touchpad, microphone and Chrome recognition untested (fake recogniser only).
- Zoo: penguins can briefly overlap while walking past each other (resting places are reserved).
- Zoo: performance on a real Chromebook unmeasured (SwiftShader only); the scene is ~118 draw calls.
- Deferred: Level 2 timetable; zoo giraffes/fish/ducks; a pool viewing window; birds.

## Codex / Delegated Work
- Zoo rebuild 2026-11-28: world slice (Codex, SUCCESS) and life slice (Codex; its run stalled when Codex usage
  ran out, output was complete and passing) both reviewed and accepted by Claude; Claude added the penguin
  rest reservation, panda-garden planting and the plaza camera. Nothing in flight.

## Next Steps
0. (Done 2026-11-28: town redesign + `?debug=1` committed e295bd2 and deployed; live site checked: town, map, debug panel, no page errors.)
1. (Done 2026-11-28: zoo rebuild committed 3756b6b and deployed. `.ai/` is local delegation scratch — never commit.)
2. On a real Chromebook: speak the short phrases ("Here you are.", "Do you have a pencil?", "Eight thirty.",
   "I like apples.") fluently and slowly; judge latency and the status line; turn mic off and finish a level.
3. Counting camera / basket pose (Known Issues 1); objective pill overflow.
4. Then SPEC TODOs in the user's priority order: drawing-recognition reliability, preserving/animating the
   child's drawings, restoration persistence, NPC behaviour polish. No open-ended invention phase.
