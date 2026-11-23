# Magic Stationery: Restore the World — Spec

Source: the user's plan "Game Development Prompt: Magic Stationery — Restore the World" (2026-11-23),
reviewed by Claude as product/design lead. This file records what was accepted, changed, added and
deferred, and is the reference for building the five levels. `DESIGN_DECISIONS.md` records the why
of later choices; `CURRENT_STATE.md` says what is built.

Audience: Japanese grade 4 (MEXT *Let's Try! 2*: Unit 4 "What time is it?", Unit 5 "Do you have a
pen?", Unit 6 lowercase alphabet, Unit 7 "What do you want?"). Primary device: school Chromebooks
(1366×768, touchpad, sometimes touchscreen), Chrome.

## 1. Verdict on the plan

**Accepted as written:** the core loop (explore → NPC clue → draw → recognise → magical 3D
transformation → restored world), forgiving recognition, funny wrong-object reactions, the five
areas and their vocabulary, restoration that adds colour, movement and sound, persistence, a
microphone-free path, reusable systems across levels, staged delivery, and deferring the
"invention" phase while keeping its systems reusable.

**Modified:**

1. *Recognition.* There is no Quick, Draw! inference API (the dataset is files only), and ten of the
   plan's nouns are not dataset categories: pen, notebook, ruler, desk, bamboo, orange, tomato, milk,
   egg, tennis ball (plus shuttlecock, badminton racket, hoop, net, letters and digits). So the game
   trains its **own** small CNN on 138 relevant categories (§2) and adds a pipeline around it:
   aliases (schoolbag→backpack, notebook→book, desk→table, pen→marker/pencil, badminton racket→tennis
   racquet), a geometric rule recogniser for simple shapes (ruler = a long thin shape; later egg,
   net), and crayon colour (later orange/tomato/tennis ball). Letters and digits get their own
   constrained recogniser in Level 2, never the object model.
2. *Speech is speech-first, taps are a rescue* (sibling-game classroom lesson: offered a voluntary
   mic-free toggle, most students tick it). Miss 1 "try again", miss 2 the sentence is read aloud,
   miss 3 the choices become tappable; permission/hardware errors switch to taps at once; silence
   never counts. A **teacher** setting turns the microphone off for a class without mics, so the
   whole game is completable without one, as the plan requires.
3. *Placement in Level 1 is automatic*: a restored object flies to its display slot. Free placement
   by the player arrives with the Supermarket's baskets (Level 4), where it is the new mechanic.
   Touchpad drag-and-drop in 3D is the hardest input on a Chromebook; Level 1 spends that budget on
   drawing.
4. *Quantities in Level 1*: one drawing fills a display (the magic copies it). Drawing several of the
   same object is the Supermarket's mechanic.
5. *Physics* is a small custom integrator (spheres on planes/boxes), not a physics engine: enough for
   bounce/roll/kick, cheap on Chromebooks, no large dependency.

**Added:**

1. *Truthful yes/no.* Customers ask the player "Do you have a ruler?"; the right answer depends on
   the world: "Yes, I do." only if it has been restored. A wrong answer gets a friendly "Really?" and
   a second chance. This gives "Yes, I do / No, I don't" a real meaning instead of a quiz.
2. *Colour as gameplay.* The magic pen draws in crayon colours. Shape is recognised from the lines;
   the colour comes from the crayon chosen. Crayons, books, the schoolbag and other "tintable"
   objects take the child's colour (the plan's "preserve characteristics of the drawing"), and the
   crayon-box task asks for colours ("Do you have a red crayon?").
3. *"This is for you."* — the *Let's Try! 2* Unit 5 giving phrase — when handing a drawn object to a
   customer.
4. *Live guessing.* While the child draws, the pen's bubble guesses ("Is it a … pencil?"), like the
   original Quick, Draw!, so recognition feedback is continuous, not a verdict at the end.
5. *Living doodle.* Any recognised category without a hand-built 3D model becomes the child's own
   drawing as a paper cut-out that hops and wobbles. Every recognisable drawing does something.
6. *Help ladder for drawing:* attempt 1 free; after a miss the example drawing is shown; after two a
   dotted stencil to trace; after three the pen's magic finishes the drawing (always completable).
   A teacher setting can show stencils from the start.
7. *Touchpad pen mode* (optional toggle): click once to put the pen down, click again to lift it, for
   children who cannot hold the touchpad button while moving.
8. *Adaptive music*: layers join as the area is restored, so the world audibly comes back to life.

**Rejected / deferred:**

- Levels 2–5 content is deferred (the plan itself says to start with the Stationery Store). The
  town shows all five places; the four not built say "Coming soon".
- No post-processing (bloom etc.) and no real-time shadows: Chromebook budget (dpr ≤ 1.5, ~100 draw
  calls, blob shadows), as in the sibling 3D games.
- No CDN, webfont or third-party asset: school networks block them. Everything is procedural (merged
  vertex-coloured primitives, Web Audio, inline SVG); the model file is served from the game's own
  origin.

## 2. Sketch recognition

- **Data:** Quick, Draw! simplified drawings (Google, CC BY 4.0), only those the original game
  recognised, ~6,000 per category plus a wobbled/partial copy of half of them (touchpad roughness).
  Download and build scripts: `tools/sketch-model/` (data is not committed).
- **Shared preprocessing:** `src/recognition/strokes.ts` + `raster.ts` turn strokes into a 32×32
  anti-aliased image. The training scripts run these *same files* under Node, so a child's drawing is
  prepared exactly like the training drawings.
- **Model:** 4 conv blocks (32-64-128-128, 3×3, max-pool) → FC 256 → 138 classes, ≈12 M multiply-adds,
  int8 weights (~0.4 MB), temperature-calibrated. Runs in plain TypeScript on the CPU (the GPU stays
  free for the 3D scene).
- **Decision policy** (`src/recognition/policy.ts`), given the task's target:
  - target (or alias) is top-1, or has a reasonable share (≈ top-3) → **accepted**;
  - another *known, fun* category is confidently top-1 → **surprise**: it appears and plays
    (a rabbit hops round the shop) but does not complete the task;
  - scribbles, plain shapes, too little ink, low confidence → **unclear**: gentle retry;
  - non-accepted attempts climb the help ladder (§1 Added 6); the third always succeeds.
- **Rules** (`shapeRules.ts`): geometric recognisers for targets the dataset lacks (ruler first).

## 3. Level 1 — Stationery Store (vertical slice)

Ms. Penny's stationery shop, erased: grey, empty shelves with faint outlines of what is missing.

0. **Arrival.** The town is grey. The shop door is the only bright thing.
1. **The magic pen.** Ms. Penny: "Hello! Can I help you?" The player asks **"Do you have a pen?"**
   "Yes, I do! A magic pen. Draw, and it comes to life!"
2. **Pencils** (first drawing, example shown from the start). One pencil drawn; the magic fills the
   pencil cup. Pencils spin up and drop in one by one.
3. **Erasers and scissors** (two objects, either order: click an outline). Eraser bounces and
   squashes; scissors snip.
4. **First customer, Ken.** "Do you have a pencil?" → truthful **"Yes, I do."** He takes one and pays.
   "Do you have a ruler?" → **"No, I don't."** The player draws a ruler (long thin shape) and says
   **"This is for you."**
5. **Crayons for Yui.** "Do you have crayons?" → "No, I don't." "I like red and blue!" The child draws
   crayons; each takes the colour it was drawn in and drops into the crayon box. Colour words.
6. **Books and notebooks.** A book flaps like a bird onto the shelf and the shelf fills; a notebook
   fills the notebook stand.
7. **The schoolbag (finale).** Taro: "Do you have a schoolbag?" → "No, I don't." → draw it (a red
   randoseru by default; any colour drawn). He asks for a pencil, an eraser, a notebook → "Yes, I do."
   each time; they fly into the bag. The shop is restored: full colour, music, customers browse and
   buy. Back to town; the shop now glows in colour.

Each restored object keeps its slot through reloads. Customers keep visiting a restored shop.

## 4. Architecture (shared by all levels)

```
src/recognition/  strokes, raster, model (CNN), recognizer, vocab, shapeRules, policy
src/objects/      registry (kind → model, intro, idle, tint, sound), models/*, doodle, transform
src/world/        engine (renderer, adaptive dpr), materials (restore colour), area, slots,
                  characters (NPC/player), effects (sparkles), areas/town + areas/store
src/game/         state + save (versioned localStorage), levels registry, scripted flow helpers
                  (say / ask / draw / wait), levels/store.ts
src/speech/       recognition wrapper, phrase matching (accent variants), tts
src/audio/        Web Audio sfx + adaptive music
src/ui/           hud, dialogue, ask prompt, draw panel, settings (teacher), styles
```

- A level = an area scene (slots, NPCs, props) + an async script using the shared helpers.
- The recogniser never knows about levels; the policy takes a target and returns a decision. The
  future invention phase calls the recogniser with no target and spawns whatever was drawn, through
  the same object registry, behaviours and physics.
- Test hook `window.__ms` only with `?e2e=1`; Playwright drives the real UI with TTS/speech stubs.

## 5. Levels 2–5 (designed, not built)

- **Classroom — BUILT (2026-11-23), see §6.** Original design: chairs/desks into marked places; "What
  time is it?" — write digits on a blank clock (digit recogniser); missing lowercase letters on the
  alphabet strip (letter recogniser, constrained to the expected letter); timetable from NPC answers
  (deferred). Bell rings, students sit.
- **Zoo — BUILT (2026-11-23), see §7** (elephants, monkeys, pandas, penguins). Original design:
  animals with species behaviours (monkeys climb and eat the bananas you draw, elephants
  trumpet and spray, giraffes browse, penguins slide and dive, fish swim, ducks paddle, pandas sit and
  eat bamboo — bamboo by stencil/rule). "Do you like elephants?", "What animal do you like?".
- **Supermarket — BUILT (2026-11-24), see §8.** Original design: quantities ("three apples"), placement
  into baskets, colour disambiguation for orange/tomato, egg by shape rule, milk by stencil; customers shop
  and check out.
- **Gym — BUILT (2026-11-24), see §9.** Original design: physics objects (balls bounce, roll, are kicked),
  rackets used by NPCs; hoop and net by guided construction; the sports festival starts.

## 6. Level 2 — Classroom (built)

Ms. Mori's classroom, erased: faint outlines of four desks and chairs, a clock with ticks but no numbers
or hands, four blank cards in the alphabet strip. Opens once the Stationery Store is finished.

1. **Good morning.** Ms. Mori: "Oh! Good morning!" → the player says **"Good morning!"** The children
   come at eight thirty.
2. **Desks and chairs.** Draw a desk (the model's "table"), then a chair; each drawing fills the four
   places (bounce / hop entrances).
3. **The clock.** Write **12, 3, 6, 9** (click each dashed circle; "12" is two digits side by side).
   The child's handwriting is painted onto the clock; the magic adds the other numbers and the hands
   spin to 8:00.
4. **What time is it?** → **"It's eight o'clock."** (truthful choice; "seven o'clock" gets a hint).
5. **The ABC.** Ms. Mori says the letters and stops at each blank: "a, b, c… Oh! d is missing!" The
   child writes **d, g, m, t**; then everyone says the whole ABC.
6. **The children come.** Ken ("Good morning!" → the player answers), Yui, Taro with the schoolbag the
   child drew in Level 1. The clock moves to 8:30; Ken: "What time is it?" → **"It's eight thirty."**
   The school chime rings, Ms. Mori: "Good morning, everyone!" Album of the child's desk, chair,
   numbers and letters.

Writing uses the glyph model (`src/recognition/glyphs.ts`, training in `tools/sketch-model/README.md`)
with the same help ladder as drawing (example → trace stencil → the pen helps on the third try).

## 7. Level 3 — Zoo (built)

Mr. Oka's zoo, erased: four empty enclosures with faint outlines of the missing animals. Opens once the
classroom is finished.

1. **Hello.** "Hello! Welcome to the zoo!" → the player says **"Hello!"**.
2. **Elephants** (draw an elephant; two walk and spray water). Yui: **"Do you like elephants?"** →
   "Yes, I do." / "No, I don't." — both right; "Me too!" / "Oh! I like elephants!".
3. **Monkeys** hang and swing in their tree. "They're hungry! Draw a **banana**!" — the bananas fly to them.
4. **Pandas** sit. "Pandas like **bamboo**. Make it long!" (long-thin rule) — they munch.
5. **Penguins** waddle and dive into the pool. Ken: **"Do you like penguins?"**
6. The player asks Mr. Oka **"What animal do you like?"** ("I like pandas!"). Taro asks the player, who
   answers **"I like ___."** from elephants / monkeys / pandas / penguins. Album of the child's animals.

## 8. Level 4 — Supermarket (built)

Mr. Green's supermarket, erased: empty fruit and vegetable crates and an empty dairy fridge with faint
outlines of the missing food. Opens once the zoo is finished. *Let's Try! 2* Unit 7 — **"What do you
want?" "I want ___, please." "How many?" "___, please." "Here you are." "Thank you."** — with numbers
one to five and colours.

**New mechanic: counting into a basket.** A customer comes in with a basket. The child asks what they
want (and draws it if the crate is empty), asks how many, clicks the display once per item — each one
hops into the basket and is counted aloud ("One! Two! Three!") — then says "Here you are." The customer's
"Three, please." is spoken and shown with the prompt; too few → "That's two. **Three**, please!"; one too
many hops back → "Oops! **Three**, please."; after three short tries the magic counts out the rest. The
shelves never run out (the magic restocks them).

1. **Hello.** "Hello! Welcome to my supermarket!" → **"Hello!"** The food is erased; customers are coming.
2. **Ken: apples.** **"What do you want?"** → "I want apples, please." Draw an **apple** (Quick, Draw!).
   **"How many?"** → "Three, please." Count three. **"Here you are."** → "Thank you!" Ken pays (the
   register beeps once per item) and browses.
3. **Yui: oranges.** Draw an **orange**: any round drawing, and the crayon decides. A red one is a tomato
   ("Red and round… that's a tomato! Oranges are **orange**."); another colour → "Oranges are orange!"
   After one wrong colour the orange crayon gets a ★, after two it is preselected, after three the magic
   recolours the drawing (Yui's crayon task, Level 1). "Two, please."
4. **Vegetables, Taro: tomatoes.** Draw a **tomato** (round + red; an orange one is "an orange!") and a
   **carrot** (Quick, Draw!). Taro: "I want tomatoes, please." … "Four, please."
5. **The fridge, Ms. Penny: eggs.** Draw **milk** (a carton; not a dataset category: house, cup, mug and
   square shapes count; the hint is shown from the start and traced after two misses) and an **egg** (oval
   shape rule, or a circle). Ms. Penny comes from her shop: "I want eggs, please." … "Five, please."
6. **Your shopping.** Mr. Green asks the player **"What do you want?"** → **"I want ___, please."**
   (apples / oranges / tomatoes / carrots / eggs) → **"How many?"** → **"___, please."** (one to five; the
   child's choice) → he counts them into the player's basket → "Here you are." → **"Thank you."** The
   supermarket is back; album of the child's food.

Speech: the child's answers are judged by the item or number word ("Apples, please." is a correct answer
too); the questions need both key words (what + want, how + many).

## 9. Level 5 — Gym (built)

Coach Kato's school gym on the day of the sports festival, erased: an empty ball cart, an empty ball rack,
bare backboards without hoops, an empty racket wall and bat bucket. Opens once the supermarket is finished;
the last place — restoring it restores the whole town. *Let's Try! 1* Unit 5 / *Let's Try! 2* Unit 2 —
**"Let's play soccer!" "Yes, let's!" "Do you like soccer?" "What sport do you like?" "I like ___."** —
with the sports vocabulary (soccer, basketball, tennis, baseball).

**New mechanic: the child's equipment is used.** Balls are thrown and kicked with real arcs, bounces and
rolls (the drawing spins as it rolls); people hold the drawn rackets and bats and play with them.

1. **Hello.** "Hello! Welcome to the gym! Today is the sports festival… but everything is erased!" →
   **"Hello!"**
2. **Soccer.** Draw a **soccer ball** (Quick, Draw!; any round drawing counts) → the cart fills, the balls
   bounce in. Ken: **"Let's play soccer!"** → **"Yes, let's!"** Ken kicks a ball into the goal ("Goal!").
   Ken: **"Do you like soccer?"** → "Yes, I do." / "No, I don't." — both right.
3. **Basketball.** Draw a **basketball** (the rack fills), then the **hoop** — guided construction: the
   ring and net are traced from a stencil shown from the start (a ring with a net reads as a basket to the
   model). Yui shoots: swish! Yui: **"What sport do you like?"** → **"I like ___."** (soccer / basketball /
   tennis / baseball).
4. **Tennis.** Draw a **racket** (Quick, Draw! "tennis racquet"; a lollipop shape counts). Taro: **"Let's
   play tennis!"** → **"Yes, let's!"** Taro and Coach Kato rally with the child's rackets.
5. **Baseball.** Draw a **bat** (Quick, Draw!, or any long thin drawing). The player asks Coach Kato
   **"What sport do you like?"** — "I like baseball!" She pitches, Ken bats: a home run out of the window.
6. **The sports festival.** Everyone from the town comes in (Ms. Penny, Ms. Mori, Mr. Oka, Mr. Green);
   the player opens the festival: **"Let's play!"** Confetti, music, the whole town is restored; album of the
   child's equipment.

Speech: answers are judged by the sport word alone ("Soccer." is a correct answer); "What sport do you like?"
needs sport + like; "Yes, let's!" needs yes.
