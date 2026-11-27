# Design Decisions

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.

For each significant decision, record:

- Date
- What was decided or changed
- Why
- Previous approach, if relevant
- Rejected alternatives, if useful

Only record decisions that may be useful to understand later.

Git is the source of truth for detailed code-change history.

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

## 2026-11-23 — The plan review (user plan "Magic Stationery — Restore the World")

Claude reviewed the plan as product lead, at the user's request ("accept, reject, modify, or add"),
and implemented it directly without the router (user instruction). The full verdict is in `SPEC.md` §1.
In short:

- **Accepted:** the core loop, five areas and their vocabulary, forgiving recognition with funny wrong
  objects, restoration as visible colour/movement/sound, persistence, a mic-free path, reusable systems,
  staged delivery, the invention phase deferred.
- **Modified:** own recognition pipeline instead of "a Quick, Draw! model" (below); speech-first with taps
  as the rescue plus a teacher mic-off switch (instead of an equal mic-free choice); automatic placement in
  Level 1 (placement is the Supermarket's mechanic); one drawing fills a display (quantities are Level 4's);
  small custom physics instead of an engine.
- **Added:** truthful yes/no (the answer depends on what has been restored), crayon colour as gameplay and
  as the object's colour, "This is for you." (*Let's Try! 2* Unit 5), live guessing while drawing, the
  living doodle fallback, the drawing help ladder, a touchpad pen mode, adaptive music.
- **Built now:** Stage 1 + Stage 2 (core systems and the complete Stationery Store), and the town with all
  five places; four are "Coming soon".

## 2026-11-23 — Sketch recognition: an own small CNN, not a ready-made model

- **What:** a 4-block CNN (32-64-128-128 → FC 256 → 138 classes, ~12 M multiply-adds, int8 weights,
  ~0.6 MB) trained on Quick, Draw! simplified drawings that the original game recognised, run in plain
  TypeScript on the CPU. Training pipeline in `tools/sketch-model/` (download → build-dataset → train →
  pick-examples → eval-policy).
- **Why:**
  - Google publishes the dataset only; there is no Quick, Draw! inference API.
  - Ten of the plan's nouns are not dataset categories (pen, notebook, ruler, desk, bamboo, orange,
    tomato, milk, egg, tennis ball), so the game needs its own aliases and rules around any model anyway.
  - A small class set chosen for the game (all five levels' words + things children draw for fun +
    scribble/shape classes) is more accurate than 345 classes, and the shape classes give "unclear" a
    real meaning.
  - No ML library (TF.js is >1 MB and would compete with Three.js for the Chromebook GPU).
  - The training rasteriser is the game's own `strokes.ts` + `raster.ts` run under Node, so a child's
    drawing is preprocessed exactly like the training data.
- **Rejected:** ml5.js DoodleNet (345 classes, TF.js dependency, no control over preprocessing or classes,
  model hosted on a CDN that school networks may block); a server API (privacy, network).

## 2026-11-23 — Forgiving decision policy

- Weighted aliases per word (`vocab.ts`): e.g. a pencil may look like a crayon or a marker; an eraser like
  a square. A word is accepted if it is top-1, has ≥ 20% weighted probability, or a strong alias is in the
  top three with ≥ 5%.
- A *surprise* (the wrong thing appears and plays) needs ≥ 38% confidence in a non-shape class. Scribbles
  and plain shapes are *unclear*. Very little ink is not a miss at all.
- The third non-accepted attempt is always accepted "with the pen's help". Every child can finish.
- Why: the plan's "avoid repeatedly rejecting ambiguous drawings". A false acceptance costs nothing; a false
  rejection teaches that a child's drawing was wrong (the sibling games' speech lesson applied to drawing).

## 2026-11-23 — Ruler, notebook, schoolbag

- Ruler: geometric rule (principal-axis aspect ratio ≥ ~3), because the dataset has no rulers. Any long thin
  drawing counts.
- Notebook → the dataset's "book"; schoolbag → "backpack", modelled as a Japanese randoseru (red by default).
- Hint pictures for ruler and notebook are hand-drawn strokes in `examples.ts`; the others are real dataset
  drawings the model recognises confidently (`pick-examples.ts`).

## 2026-11-23 — Colour comes from the crayon, not the model

- The model sees shape only. The drawing's dominant crayon colour tints "tintable" objects (crayons, books,
  the schoolbag …), which preserves something of the child's drawing (plan §4). Magic ink (the default)
  keeps natural colours.
- Yui's crayon task asks for colours by name. A crayon in the wrong colour still goes into the box (it is a
  crayon), Yui says which colour it is and asks again; after one wrong colour the wanted crayon gets a ★,
  after two it is preselected, after three the magic makes it the right colour.

## 2026-11-23 — Speech: classroom rules from the sibling games

Ported from monster-island (`speech/recognition.ts`, `tts.ts`, matcher rules):
- One press = one bounded session (7 s); a matching interim result is accepted at once; only the top
  hypothesis judges (others may only rescue a non-match).
- Miss 1 "try again", miss 2 the sentence is read aloud, miss 3 the cards become tappable. Silence never
  counts; after two silent sessions the sentence is modelled once. Permission/hardware errors, no
  recogniser, or the teacher's *Microphone: Off* go to tap mode at once.
- No voluntary mic-free toggle for students (esl-verbs lesson: most students take it). The teacher switch
  satisfies the plan's "complete without a microphone".
- Matching is by key words with accent/recogniser variants; e.g. "have a pen" is often heard as "happen".
- Yes/no answers are judged for truth after matching: "Yes, I do." about a missing ruler gets "Hmm… I can't
  see a ruler." and a second chance; after two wrong answers only the true answer is offered.

## 2026-11-23 — Rendering on Chromebooks

- Diorama camera (front wall cut away) per place: the whole room is visible, so a touchpad never has to
  steer a camera. Characters walk to what you click (grid A* + string pulling).
- Budget: no shadows (blob shadows), no post-processing, merged vertex-coloured parts, one particle draw
  call; pixel ratio ≤ 1.5, dropping to 1 for good after 4 s under 28 fps. Measured: empty shop 78 draw calls,
  fully restored shop with three shoppers 99 (SwiftShader, 1366×768).
- The 3D view renders every second frame while the drawing panel is open (the panel covers it), leaving the
  CPU to the pen and the live guesses.
- "Erased" is a shader patch on every world material: fade to pale grey by the place's restoration level; a
  colour wave spreads from each restored object. Things the child drew are always in full colour.

## 2026-11-23 — Placement, copies, and the shop coming alive

- One drawing fills its display: the drawn object lands first (its own entrance animation), then the magic
  copies hop out of it into the other places in varied colours.
- Restoration (8 displays) drives: the colour level, wall lamps, the window, the flowers on the plant, the
  sign, and the music layers (music box → bass → melody → percussion).
- Helped customers come back as shoppers who browse the displays and pay at the counter.

## 2026-11-23 — Published before the model was ready; training runs are protected

- The user asked to publish to GitHub Pages while the model was retraining. The first live build ships
  **without** a model file rather than with an untrained placeholder: the game's no-model fallback accepts
  every drawing at once, while a near-random model would reject each drawing twice before the help
  ladder accepted it. `model.test.ts` skips when the model is absent so CI can deploy.
- The first training run (79.9% top-1 / 93.2% top-3 int8 on 138 classes) was lost at export: its
  output folder disappeared from the session scratchpad and the weights were only in memory. `train.py`
  now creates its own output folder, checkpoints `best.pt` after every improving epoch, and can export
  from a checkpoint alone (`epochs = 0`); outputs go to the git-ignored `.tmp/model-out` in the project.

## 2026-11-24 — The child's own drawing is the object (user plan "Preserve and Animate the Player's Actual Drawing")

- **What:** recognition now only decides *what* a drawing is and *how it moves*; the thing that appears in the
  world is the child's artwork itself (`draw/art.ts`: strokes, colours, proportions, wobbles, tightly cropped,
  transparent; `objects/living.ts`: a textured plane with a small vertex shader for swim wiggle, wing flap and
  idle sway). The same object flies from the page into the world (`bringToLife`): no swap at the end.
- **Behaviour by category** (`behaviourOf`): swim, fly, hop, jump, walk, waddle, bounce (sphere physics on a
  proxy radius; the picture rolls), drive, rise, grow; anything else wobble-hops. Drawings mirror to face the
  way they move. Display entrances: spin (pencil, ruler), bounce (eraser), snip (scissors), drop (crayon),
  open/close (book: its width folds), flutter (notebook), hop (schoolbag).
- **Saved:** each display stores its artworks and which one each place shows (`arts`, `src` in the slot save,
  validated by `sanitizeArt`); a reload rebuilds the child's drawings. Saves from before this change fall back
  to their saved lines in magic ink.
- **Modifications to the plan:** long thin drawings (pencil, crayon, ruler) are rotated upright to stand in
  their display — a rotation only. Copies that fill a display are copies of the child's drawing (taking turns
  if they drew several). The faint ghost outlines of missing things stay (a hint effect). When Yui's crayon is
  the wrong colour three times, the pen's magic recolours that crayon's strokes (the only edit to artwork).
- **Premade models are kept, not deleted (user instruction):** `?models=1` (`game/config.ts`) switches back to
  the original models, tints and entrances, unchanged.
- **Measured:** fully restored shop in drawing mode 109 draw calls (models mode 99) at 1366×768 SwiftShader.
- **Rejected:** image-to-3D generation (too heavy for Chromebooks); a white sticker border/fill around drawings
  (it changed the child's style; the old "living doodle" did this).

## 2026-11-24 — Filled drawings, colouring in, and mechanics on the child's own objects (user questions)

- **Auto-fill (user preference over transparent):** closed areas the child leaves empty get a soft tint of
  their own main line colour (`fill.ts` `softTint`, 60% towards white); outside the drawing stays
  transparent. Lines are thickened 1.8× in the fill mask so small gaps still close; fills tuck under the
  lines (`growIntoLines`) so no gap shows. Recognition ignores fills (strokes only).
- **Colouring in:** a 🎨 Fill tool (paint bucket) in the draw panel: tap inside a closed shape to fill it
  with the selected crayon. Saved as seed points (`fills`), so it survives crops, upright rotation, saves
  and reloads, and Undo steps strokes and fills in order. Taps outside the drawing are refused ("Tap
  inside a closed shape!") — fills never paint a background. The child's fills win over the auto-fill.
- **Mechanics on player art:** `buildLiving({ hinge: true })` splits the drawing into two halves sharing one
  texture, hinged at the middle. Scissors: the halves swing open and shut (snip); book: the halves fold
  like covers. Fish wiggle, bird flap, ball roll and the rest remain whole-drawing motion + shader
  deformation. No body-part detection.
- Icon: 🎨 rather than 🪣 (U+1FAA3 renders as an empty box on some systems).

## 2026-11-23 — Level 2, the Classroom (built directly by Claude at the user's request)

- **What:** Ms. Mori's classroom. (1) "Good morning!" (2) Draw a desk and a chair; the magic fills four
  places. (3) Write 12, 3, 6 and 9 on the blank clock; the child's handwriting stays on the clock, the magic
  adds the other numbers and the hands. (4) "What time is it?" → "It's eight o'clock." (5) Ms. Mori says the
  ABC and stops at four blank cards; the child writes d, g, m, t. (6) Ken, Yui and Taro arrive ("Good
  morning!"; Taro wears the schoolbag the child drew in the shop), the clock reaches 8:30 ("It's eight
  thirty."), the school chime rings. The School opens once the shop is finished (the pen comes from Level 1).
- **Why:** *Let's Try! 2* Unit 4 (What time is it?) and Unit 6 (lowercase alphabet) with greetings, in a
  place every child knows. Writing is the level's new mechanic, the way drawing objects was Level 1's.
- **Time answers are truthful** (like yes/no in Level 1): the child reads the clock; a wrong time gets a hint
  about the short or long hand and a second chance; after two misses only the right sentence is offered.
- **Deferred:** the timetable from SPEC §5 (school subjects are *Let's Try! 2* Unit 7 territory and would make
  the level long); free placement of desks (still the Supermarket's mechanic).
- **Rejected:** writing all twelve clock numbers (tedious; four teach the clock layout); letters chosen at
  random (d/g/m/t are distinctive in print and cover ascender, descender and x-height shapes).

## 2026-11-23 — A second small CNN for written characters

- **What:** `public/models/glyph-model.bin`, same architecture/format/runtime as the sketch model, 63 labels
  (0-9, a-z, A-Z, scribble). Trained on UJI Pen Characters v2 (real pen strokes, writer-independent split)
  plus EMNIST ByClass thinned to one-pixel skeletons and traced into strokes, all rasterised by the game's
  own pipeline (`tools/sketch-model/build-glyphs.ts`). Policy in `src/recognition/glyphs.ts`: constrained to
  the asked character; the other case and look-alikes count (D for d, l/I for 1, g/q for 9); a confident other
  character is named ("That looks like b!"); the third attempt is accepted with the pen's help.
- **Why:** Quick, Draw! has no letters or digits, and the object model must never be asked to read them
  (SPEC §1). Same runtime means no new dependency and the same Chromebook cost (~0.4 MB, tens of ms).
- **Rejected:** template matching ($P recogniser) — no training, but weaker on children's variation and no
  calibrated "other letter" signal; EMNIST images used directly — scanned thick strokes do not look like a
  touchpad line, so they are thinned and redrawn with the game's pen instead.
- **Hint characters are hand-made** in the print style of Japanese elementary worksheets (single-storey g,
  t with a crossbar), not picked from adult handwriting; the panel shows worksheet lines while writing.
- **"12"** is written as two digits side by side on one page; strokes are grouped by horizontal overlap and
  each digit is judged on its own.

## 2026-11-23 — One controller for every room

- **What:** `world/areas/room.ts` (`RoomArea`: scene, nav, slots, writing spots, door, host spot, views) is
  implemented by the shop and the classroom; `Game` keeps `room`/`place` and all helpers (drawFor, restore,
  npcEnter, surprises, ambient life) work in whichever room is active. The save gains a `school` section
  (steps, slots, glyph art); old saves load unchanged.
- **Why:** levels 3-5 reuse the same helpers; a second copy of the controller per level would drift.
- **Rendering budget:** the clock face and the 26-card alphabet strip are each one canvas texture with the
  child's handwriting painted in (not 26+12 meshes).

## 2026-11-23 — Fix pass (user plan "Bug Fixes, Movement Improvements, Speech Recognition, and Unfinished Work")

Built directly by Claude at the user's request. Verdict on the plan: accepted, with these modifications.

- **Slow "eight … thirty" was a logic bug, not only endpointing.** The prompt accepted any matching interim
  result at once, so "eight" (before the pause) matched "It's eight o'clock." and the truth check then called
  the child wrong. Now: (1) a match that could still grow into another option (`couldGrow`: "eight" when
  8:30 is offered) waits for 3 s of quiet; (2) listening is continuous and all segments are joined; (3) if a
  browser still ends the session after "eight", one continuation session is started and the parts joined;
  (4) times are judged by value (`parseTime`: "8:30", "8 30", "830", "eight-thirty", "ate thirty", 7:15,
  10:45, 12:00), not by key words; (5) a tip with a listen button ("Try saying 'eight thirty' together.")
  appears only after a wrong attempt; taps remain the rescue. Rejected: tuning browser silence thresholds
  (not configurable in Chrome's recogniser).
- **Movement:** WASD + arrows, camera-relative (W = away from the camera), smooth acceleration and stopping,
  sliding along furniture, other people block a key-driven player; allowed exactly when clicking the floor
  is (never while drawing, speaking or in a scripted scene). Click-to-move kept unchanged. The diorama
  cameras are fixed, so no camera follow or clipping issue arises.
- **Gaze:** `Character.lookTarget` turns the head first (up to ±0.8 rad, with pitch) and the body only when
  the person is further round than `bodyTurn` (host 1.15 rad), so small moves never spin anyone; the host
  returns to her working direction after 1.5 s without a conversation. The speaker (or the person just
  spoken to) and the host watch the player; the player looks at whoever is talking.
- **Held items:** one grip rule (`Character.hold` + `GRIPS` per item): across the fist, perpendicular to the
  forearm, gripped a set fraction along the item (pencil 0.32, ruler 0.14, magic pen tip forward). Fixes
  items running up inside the arm. The magic pen is now re-attached after a reload (it was lost).
- **Accessories:** under a hat only a short fringe tucked under the brim is built and spiky hair becomes
  side spikes (no hair through the crown); the yellow hat's brim sits at its crown's rim. Glasses are fitted
  to the head radius: rims clear of the eyes, turned with the face's curve, a bridge, and temple arms that
  bow outside the cheeks to the ears.
- **Shop:** the notebook board faced the back wall (rotation sign); now it faces the customers, with a back
  support and a front ledge carrying the label (the sign no longer passes through the table). Notebook
  drawings lean at the board's slope.
- **Z-fighting at doors:** the door jamb ended exactly at the wall's end (z = 1.0) with coplanar faces; the
  jamb now wraps 2 cm past it (shop and classroom). Fixed at the geometry, no polygon offsets.
- **Class 4-1 sign:** centred over the door opening above the lintel, on both faces of the wall; the bell
  speaker moved beside the door.
- **Pen widths:** thin 5 / medium 9 (the original) / thick 16 / extra 26 canvas px, buttons in the panel's
  empty bottom-right corner showing their own line, the selected one marked. Width is per stroke, kept in the
  saved art (`ArtStroke.w`, only when not the default, so old saves are unchanged) and used by every renderer
  (living object, album, fills). Recognition uses only the points, so it is unaffected.
- **Level 2 finish:** "Sit down, please." — the students sit (new `sit` pose) and stay seated on return.

## 2026-11-23 — Level 3, the Zoo (built directly by Claude; the user chose the next level over more testing first)

- **What:** Mr. Oka's zoo: four enclosures (elephants with a pool, a monkey tree with a feeding stump, a panda
  garden, a penguin pool with ice floes), a visitors' path, a gate. Draw an elephant (they walk and spray
  water), Yui: "Do you like elephants?"; monkeys (hang and swing in the tree) and a banana (they eat it);
  a panda and bamboo (they munch); penguins (waddle and dive into the pool), Ken: "Do you like penguins?";
  the player asks Mr. Oka "What animal do you like?" and answers Taro "I like ___." Opens once the
  classroom is finished.
- **Why:** *Let's Try!* "Do you like …? Yes, I do / No, I don't" and "What animal do you like? I like …".
  "Do you like …?" is the child's preference, so both answers are right (unlike the shop's truthful
  "Do you have …?"), and the asker answers back ("Me too!" / "Oh! I like elephants!").
- **Life:** every restored animal runs its own loop while the player is at the zoo (elephants walk + spray,
  monkeys swing and hop, pandas rock and munch once bamboo exists, penguins waddle and dive), reusing the
  living-drawing behaviours with each pen as the roam area.
- **Bamboo** is not a Quick, Draw! category: the long-thin rule (like the ruler) plus partial credit for
  line / palm tree / tree / grass; hand-made hint with leaves kept tight so the hint itself passes the rule.
- **Deferred from SPEC §5:** giraffes, fish, ducks (four species keep the level a class-period long).

## 2026-11-24 — Verification pass: the zoo stood frozen, table corners held the player

Found by the first complete e2e run of the fix pass and the Zoo (built directly by Claude, continuing the
user's "Claude directly" work).

- **Rooms are "any level room", never a list of names.** `Game.update` updated rooms and characters only
  for `"store" || "school"`, so in the zoo nobody moved: the level script waited forever on the player's
  first walk and the zoo could not be played. Gaze had the same list. Both now use `inLevelRoom`
  (`area` is set and is not the town), so a new level cannot be left out.
- **Key steering glides round corners.** It tried the full step, then each axis alone. Against a table's
  rounded corner the axis steps were blocked or almost zero-length, so a child holding one arrow key
  stuck there. Now an axis slide must carry ≥ 25% of the step; otherwise the step is tried turned by up
  to ~70° either way (smallest turn first, shortened by its cosine). The player glides round convex
  corners and round people met at an angle; walking head-on into a wall or a person still stops (every
  turn is < 90°, so it still points into them).
- **Route walks cannot walk on the spot.** A route "slide" must carry ≥ 5% of the step, else the walk ends
  there. A zero-length slide used to count as a move, so a blocked walk could run forever and hang the
  script awaiting it.
- **Rejected:** circle-against-rectangle push-out (needs obstacle geometry in `Character`, which only has a
  boolean `collide`); the turned-step search gives the same feel with the existing interface.
- **E2E lesson:** Chromium 153+ has a native unprefixed `SpeechRecognition`, which the game prefers, so a
  test's fake recogniser must replace both names. The earlier "hang" was the real recogniser hearing
  silence in a headless browser; the game itself answered "I didn't hear you" correctly.

## 2026-11-24 — Level 4, the Supermarket (built directly by Claude; the user: "no tests for this session just make levels")

- **What:** Mr. Green's supermarket (SPEC §8): a checkout, a dairy fridge, a bread shelf, fruit and vegetable
  stands. Customers (Ken, Yui, Taro, Ms. Penny) come in with baskets; the child asks **"What do you want?"**,
  draws the food if its crate is empty, asks **"How many?"**, clicks the crate once per item (each hops into
  the basket, counted aloud) and says **"Here you are."** Last, the child shops: "I want ___, please." /
  "___, please." … "Thank you."
- **Why:** *Let's Try! 2* Unit 7 (What do you want?) with numbers and colours. The child says both sides: the
  questions as the shop helper, the answers as a customer. Counting into a basket is the level's new mechanic
  (placement and quantities were kept for the Supermarket since Level 1).
- **"Here you are." is the done signal:** the prompt stays open while the child clicks the display
  (`Game.pickSlot`: waits for display clicks without walking or moving the camera; `cancelPick` when they
  speak). Too few → the customer repeats the number; one too many hops straight back; after three short
  tries the magic counts out the rest (every child can finish). The customer's "Three, please." is shown in
  the prompt as well as spoken (grade-4 listeners).
- **Orange or tomato is the crayon's call:** neither is a Quick, Draw! category. Any round drawing counts
  (shape rule `round`, aspect up to ~1.5, plus round-ish labels); the dominant crayon decides. Red and round
  when an orange was asked → "that's a tomato!"; the wanted crayon gets a ★, then is preselected, then the
  magic recolours the drawing (the rule of Yui's crayon task). Egg: `oval` rule (aspect ~1.1-2.0) or a circle.
  Milk: a gable-top carton reads as a house to the model (the hint scores 92% house): aliases house, cup,
  mug, square; its hint shows from the start.
- **Answers are judged by the item or number word alone** ("Apples, please." and "Three, please." are
  correct answers); the questions need both key words (what + want, how + many). Number variants include
  recogniser homophones (to/too, for, tree/free).
- **Hint drawings are hand-made** (the dataset files are no longer on this PC), checked with the game's own
  model: apple 99%, carrot 100%, milk → house 92%; orange, tomato and egg pass their shape rules.
- **People carry baskets:** `Character.carry()` hangs an object from the left hand, kept upright whatever
  the arm does (an exact counter-rotation, Euler order ZYX), the same size for children and adults.
- **Places are lists, not names:** `ROOM_PLACES`, `unitsOf` and `lockedWhy` replace store/school/zoo
  branches in the town labels, colour levels and locked messages.
- **Rejected:** a red "orange" restoring the tomato crate instead (fun, but steps would complete out of
  order); hiding the number (too hard by ear alone at grade 4); a Done button for the basket (speech is the
  done signal); ceiling lamps over the stands (they hung between the camera and the crates).
- **Not run yet (the user's instruction, this session):** no test or playthrough has executed this level;
  only the room was judged from screenshots (erased, restored, the stands, the fridge, the checkout).

## 2026-11-24 — Level 5, the Gym, and the end of the game (built directly by Claude; no tests this session)

- **What:** Coach Kato's school gym on sports-festival day (SPEC §9): a ball cart, a ball rack, two backboards
  whose hoops are a display, a racket wall, a bat bucket, a soccer goal. Ken kicks the child's soccer ball into
  the goal, Yui shoots through the traced hoop, Taro and Coach Kato rally with the child's rackets, Ken hits a
  home run with the child's bat; then everyone from the town comes in and the player opens the festival with
  **"Let's play!"** — the whole town is restored.
- **Why:** *Let's Try! 1* Unit 5 / *Let's Try! 2* Unit 2 — "Let's play ___!" "Yes, let's!", "Do you like ___?",
  "What sport do you like?" "I like ___." The level's mechanic is the child's equipment in use: real arcs,
  bounces and rolls (small targeted flights in the level script rather than the free "bounce" behaviour, so
  a kick reaches the goal and a shot drops through the ring).
- **Hoop by guided construction:** the hoop is traced from a stencil shown from the start (help 2). A ring with
  a criss-cross net reads as a "basket" (99%); the first hint, a square grid net, read as a "calendar" (91%) and
  was replaced.
- **Forgiving words:** soccer ball and basketball accept any round drawing (`round` rule), the bat any long
  thin one (`longThin`), the racket also a lollipop shape. Sports answers are judged by the sport word alone.
- **Finale:** the guests (Ms. Penny, Ms. Mori, Mr. Oka, Mr. Green) enter through one held-open door; balls
  bounce up all over the gym; the town announcement thanks the player and invites them to revisit any place.
- **Rejected:** a volleyball net and a stage (cluttered the diorama; the rally reads without a net); ceiling
  equipment between the camera and the court.
- **Not run yet:** like Level 4, no test or playthrough has executed this level; the room was judged from
  screenshots (erased, restored, hoops, racket wall, goal, ball cart).

## 2026-11-24 — Fix pass: basket loop, speech latency, arms, crowding, doors, Taro, signs (routed; Codex implemented)

- **Basket "My basket is empty" loop — count first, then speak.** Root cause was the design, not a race: the
  "Here you are." prompt opened while the child also had to click the crate N times, so a child who spoke first
  got count 0 → "My basket is empty!" until the magic filled it on the third try. Now counting and speaking are
  two phases: a visible "n / N" counter while clicking, the prompt opens only when the basket is full, so the
  first valid "Here you are." always advances. Idle 8 s → the customer says "Click the apples, please!"; a
  second idle → the magic pen counts the rest. Pure state in `levels/counting.ts`.
  *Rejected:* keeping the simultaneous prompt and auto-filling on speech (removes the counting lesson).
- **Grocer serves from behind/beside the display:** per-slot `serve` positions in the market area data; Mr.
  Green walks the aisle behind the checkout (`GREEN_AISLE`) to reach them.
- **Speech:** measured with the scripted recogniser, the app added ~750 ms after a clean match; now ~500 ms
  (success hold 450 → 200 ms, endpoint 1500 → 1000 ms). Settling after a prefix ("eight…") only when a longer
  valid option exists; a recognised sentence prefix keeps listening (pauses are not misses). Status line:
  Listening… / I hear you… / Great! / Try again!. Session-id guard: one resolution per prompt. Real Chromebook
  engine latency is not measurable here and is likely most of what remains.
- **Arms:** one shared clamp keeps each arm outside the torso using the rig's own shirt/waist/skirt geometry
  and held-prop bounds (no blanket widening; rest poses stay close). Tested for every cast member and pose.
- **People don't overlap:** lightweight O(n²) separation inside `characters.ts` (≤ ~10 people): walkers steer
  round others, late arrivals at a shared spot stop at a free point, standing overlaps ease apart through
  collision-checked steps; the player and seated people are never pushed; personal space ≤ 0.83 m so
  conversations at ~0.85 m are untouched. *Rejected:* a physics engine (Chromebook cost).
- **Leaving by the door:** click the door (walk there if far) or walk up to it → "Do you want to leave?" Yes / No,
  with hysteresis (No keeps it shut until 1.6 m away). Yes uses the 🏠 handler. Only when no level script is
  running (the 🏠 already refuses mid-level), never while drawing or speaking.
- **Taro invisible in the gym:** a route left over from the supermarket resumed when his doorway walk ended and
  stranded him at the outside spawn. `npcEnter`/`npcLeave` now stop any pending movement first (shared fix for
  everyone who moves between rooms); the camera frames the visitor before dialogue.
- **Town signs** derive position from their facade; supermarket facade raised and gym fascia deepened to fit.
- **Soccer cart:** internal dividers removed; wire bars on the long walls only; ball anchors refitted inside.

## 2026-11-28 — The zoo rebuilt as a 24 x 18 m park (plan reviewed by Claude; layout by Claude; scene and animals routed to Codex)

The user's plan: the zoo (9.4 x 6.4 m, four 2.2 m pens in a row, elephants in 2.15 x 2.45 m) felt like display
pens. Accepted with these changes and additions:

- **One layout file is the contract.** `src/world/areas/zooLayout.ts` holds every position, size, camera,
  anchor, climbing node, rope and pool as plain data; the scene (`areas/zoo.ts`) builds exactly those
  structures and the animals (`levels/zooLife.ts`) move on exactly those numbers, so climbing and swimming
  line up by construction. `zooLayout.test.ts` checks reachability, clearances and spacing (it caught a
  watering hole that walled off the back of the elephant habitat; the pond now lies against the west fence
  with a 1.5 m way past it). *Rejected:* scaling the old coordinates; positions spread over three files.
- **Layout:** elephants on the whole west side (7.15 x 12.65 m, about twice any other habitat), a monkey
  island in a moat at the back centre, the panda garden back right, the penguin pool east beside the gate;
  a promenade along the front, a loop of paths round a central garden (four beds, a fountain), a back path
  and a side overlook. Paths are the corridors between habitats and raised beds, so routes follow them
  without a path-cost map; collision stays rectangles plus ovals.
- **The gate stays in the east fence** (near the front), like every room's door. *Rejected:* a front-centre
  entrance (a second door orientation through the shared door/NPC/exit code of every room, and an arch
  between the diorama camera and the zoo).
- **Saves:** saves keep drawings and per-anchor tints, never positions, so saved animals appear in the new
  habitats by themselves. The habitats hold more animals (4 monkeys, 4 bananas, 6 bamboo, 5 penguins); an
  older save is expanded on load (`expandSlotSave`, zoo only) with copies of the child's own drawings. The
  stored save is not rewritten; format and key unchanged.
- **Bigger drawn animals:** elephant drawings 1.9 x 1.5 m (were 1.1 x 0.9), pandas 0.85 m, bamboo 1.5 m; a
  toy-sized elephant in a big habitat looked lost. The drawing itself is never replaced or restyled.
- **No bamboo decor in the panda garden:** the level asks the child to draw bamboo, so their bamboo is the
  grove (six stalks in three clumps). The garden gets low walk-through planting instead.
- **Behaviour:** elephants follow a weighted activity loop on their own nav map (drink and spray at shores,
  mud bath, hay rack, shade, come to the visitors, greet each other) and keep >= 2.1 m apart by reserving
  destinations; monkeys move only along a climbing graph (walk, climb, branch, swing on ropes, hang-walk the
  rope bridge, jump), one per node; pandas wander slowly, rest long, munch at the clumps; penguins waddle,
  use ramps or the dive rock, swim at the surface inside the convex pool (the opaque water hides the rest)
  and reserve resting places so they do not stand on each other. Animals billboard to the camera every
  frame (flat drawings, moving cameras). The script awaits capped "beats" so each line matches what is seen
  ("they're spraying water", "they can swim", feeding, munching).
- **Follow camera only in big rooms:** `RoomArea.follow` (the zoo) makes the camera follow the player while
  they walk freely; any scripted focus takes over. A click that passes through a habitat's click box onto a
  path walks there (big rooms only). Small rooms are unchanged.
- **People:** Mr. Oka walks to each exhibit when the child clicks it and faces the player when he speaks;
  Yui appears on the path beside the elephants instead of walking 20 m from the gate; Ken and Taro come in by
  the gate (it is next to the penguins and the plaza). After the zoo is restored Mr. Oka does keeper rounds;
  visitors linger 4-8 s at exhibits. *Rejected:* a new zookeeper character (a new cast model for little gain).
- **Engine:** nav ovals; A* on a binary heap with a gallop string-pull (gate to far corner well under 5 ms);
  shortcuts keep the full clearance radius. The colour wave reaches the far corners of big rooms. One
  foliage material sways, water shimmers in the shader; no new lights or shadows.
- **Not done:** a viewing window into the pool, birds, a path-cost map, giraffes/fish/ducks (still deferred).
