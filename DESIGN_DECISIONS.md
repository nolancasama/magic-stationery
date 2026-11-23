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
