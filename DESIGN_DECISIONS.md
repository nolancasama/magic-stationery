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
