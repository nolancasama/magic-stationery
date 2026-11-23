# Magic Stationery: Restore the World

**Play: https://nolancasama.github.io/magic-stationery/** (Chrome / Chromebook; allow the microphone)

A browser 3D English adventure for Japanese grade 4 (MEXT *Let's Try! 2*). The world has been erased.
Ms. Penny lends you a magic pen: draw the missing things, and they come to life.

- **Draw** with a mouse, touchpad or finger. A small neural network trained on Google's Quick, Draw!
  drawings recognises even rough drawings, guesses while you draw ("Is it a … pencil?"), and turns the
  drawing into a 3D object with its own entrance. Draw something else and it appears anyway — a rabbit
  hops round the shop — but it doesn't finish the job.
- **Speak** to the people: "Do you have a pen?", "Yes, I do." / "No, I don't." (the true answer depends
  on what you have restored), "This is for you." Speaking comes first; tap choices appear after a few
  tries, when the microphone is blocked, or when a teacher turns the microphone off.
- **Restore** the place: every display you fill spreads colour back into the room, adds a layer to the
  music and brings customers back.

Built: the town (five places) and Level 1, the Stationery Store, complete. The Classroom, Zoo,
Supermarket and Gym are designed (`SPEC.md`) and shown as "Coming soon".

## Run

```sh
npm install
npm run dev        # http://localhost:5181
npm run build      # static site in dist/ (relative paths: any folder or GitHub Pages)
npm test           # unit tests (run from PowerShell on Windows; Git Bash breaks vitest here)
npm run e2e        # Playwright: plays Level 1 end to end at 1366x768
```

Teacher settings (⚙️): microphone on/off, drawing help (Extra = trace stencil from the start), touchpad
pen (click to put the pen down / lift it), Japanese help, voice speed, music, sound effects, reset.

Debug views: `?e2e=1&scene=store` (the empty shop), add `&fill=1` (fully restored).

## How it is made

- Three.js, Vite, TypeScript; no UI framework. Everything is procedural: merged vertex-coloured
  primitives, Web Audio synthesis, inline SVG. No webfonts, CDNs or downloaded assets (school networks
  block them); the model file is served from the game's own folder.
- Chromebook budget: no shadows or post-processing, pixel ratio ≤ 1.5 with an automatic drop to 1,
  ~100 draw calls.
- Sketch model: `tools/sketch-model/` (data download, dataset build with the game's own rasteriser,
  PyTorch training, int8 export, evaluation). Inference is plain TypeScript (`src/recognition/model.ts`).
- Design: `SPEC.md` (the plan review and the five levels), `DESIGN_DECISIONS.md` (why), `CURRENT_STATE.md`
  (what is true now).

## Credits

- Drawings for training and hint pictures: **The Quick, Draw! Dataset** by Google, licensed
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) —
  https://github.com/googlecreativelab/quickdraw-dataset
- Speech recognition and synthesis: the browser's Web Speech API.
