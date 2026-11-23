# Magic Stationery: Restore the World

**Play: https://nolancasama.github.io/magic-stationery/** (Chrome / Chromebook; allow the microphone)

A browser 3D English adventure for Japanese grade 4 (MEXT *Let's Try! 2*). The world has been erased.
Ms. Penny lends you a magic pen: draw the missing things, and they come to life.

- **Draw** with a mouse, touchpad or finger. A small neural network trained on Google's Quick, Draw!
  drawings recognises even rough drawings and guesses while you draw ("Is it a … pencil?"). Then your
  own drawing comes to life in the world: fish swim, birds flap, scissors snip, books open, elephants
  walk. Draw something else and it appears anyway — a rabbit hops round the shop — but it doesn't
  finish the job.
- **Write** numbers and letters: a second small network reads handwriting, and your writing stays on
  the classroom clock and the alphabet strip.
- **Speak** to the people: "Do you have a pen?", "Yes, I do." / "No, I don't." (the true answer depends
  on what you have restored), "What time is it?" — "It's eight thirty.", "Do you like elephants?",
  "What animal do you like?" — "I like pandas.", "What do you want?" — "I want apples, please.",
  "How many?" — "Three, please.", "Here you are.", "Let's play soccer!" — "Yes, let's!", "What sport do
  you like?" — "I like baseball." Speaking comes first; tap choices appear after a few tries, when the
  microphone is blocked, or when a teacher turns the microphone off.
- **Count** at the supermarket: put the right number of apples, oranges or eggs into a customer's basket.
- **Play** at the gym: your own balls, rackets and bat are kicked, shot, hit and bounced by the town's people.
- **Restore** the place: everything you bring back spreads colour into the place, adds a layer to the
  music and brings people back.

Built: the town and all five places — Level 1 Penny's Stationery, Level 2 Ms. Mori's Classroom, Level 3
Mr. Oka's Zoo, Level 4 Green's Supermarket and Level 5 the Gym (the sports festival ends the game).

## Run

```sh
npm install
npm run dev        # http://localhost:5181
npm run build      # static site in dist/ (relative paths: any folder or GitHub Pages)
npm test           # unit tests (run from PowerShell on Windows; Git Bash breaks vitest here)
npm run e2e        # Playwright at 1366x768: plays Levels 1-3 end to end, plus speech, walking and pen checks
```

Walk by clicking the floor, or with WASD / the arrow keys.

Teacher settings (⚙️): microphone on/off, drawing help (Extra = trace stencil from the start), touchpad
pen (click to put the pen down / lift it), Japanese help, voice speed, music, sound effects, reset.

Debug views: `?e2e=1&scene=store` (or `school`, `zoo`, `market`, `gym`) shows a place erased; add `&fill=1` for it fully
restored. `?models=1` shows premade 3D models instead of the child's drawings.

## How it is made

- Three.js, Vite, TypeScript; no UI framework. Everything is procedural: merged vertex-coloured
  primitives, Web Audio synthesis, inline SVG. No webfonts, CDNs or downloaded assets (school networks
  block them); the model file is served from the game's own folder.
- Chromebook budget: no shadows or post-processing, pixel ratio ≤ 1.5 with an automatic drop to 1,
  ~100 draw calls.
- Sketch model: `tools/sketch-model/` (data download, dataset build with the game's own rasteriser,
  PyTorch training, int8 export, evaluation). Inference is plain TypeScript (`src/recognition/model.ts`).
- Handwriting model: the same format and runtime for 0-9, a-z and A-Z (`public/models/glyph-model.bin`,
  built by `tools/sketch-model/build-glyphs.ts`).
- Design: `SPEC.md` (the plan review and the five levels), `DESIGN_DECISIONS.md` (why), `CURRENT_STATE.md`
  (what is true now).

## Credits

- Drawings for training and hint pictures: **The Quick, Draw! Dataset** by Google, licensed
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) —
  https://github.com/googlecreativelab/quickdraw-dataset
- Handwriting for training: **UJI Pen Characters v2** (UCI Machine Learning Repository), licensed
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) —
  https://archive.ics.uci.edu/dataset/177/uji+pen+characters+version+2 — and **EMNIST** (NIST) —
  https://www.nist.gov/itl/products-and-services/emnist-dataset
- Speech recognition and synthesis: the browser's Web Speech API.
