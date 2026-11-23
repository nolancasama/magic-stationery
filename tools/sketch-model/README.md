# Sketch model (training pipeline)

The game recognises drawings with a small CNN trained here on the
[Quick, Draw! dataset](https://github.com/googlecreativelab/quickdraw-dataset)
(Google, **CC BY 4.0**). Google publishes the data, not an inference API.

The training data is prepared with the game's own `src/recognition/strokes.ts`
and `raster.ts` (Node runs the `.ts` files directly), so training drawings are
rasterised exactly like a child's drawing in the browser.

## Reproduce (about 1 hour on an 8-core CPU)

```sh
# 1. ~3.5 MB of each category's simplified ndjson (~460 MB total; byte-range requests)
node tools/sketch-model/download.mjs <data>/qd-data 3500000
# 2. 32x32 rasters: up to 6000 recognised drawings per class + 3000 wobbled copies
node --max-old-space-size=8192 tools/sketch-model/build-dataset.ts <data>/qd-data <data>/qd-set 6000
# 3. train (PyTorch CPU in a venv: pip install torch numpy --index-url https://download.pytorch.org/whl/cpu)
python tools/sketch-model/train.py <data>/qd-set <data>/model-out 7 400000
# 4. install into the game
cp <data>/model-out/sketch-model.bin public/models/
cp <data>/model-out/parity.json src/recognition/__fixtures__/
node tools/sketch-model/pick-examples.ts <data>/qd-set public/models/sketch-model.bin
node tools/sketch-model/eval-policy.ts <data>/qd-set public/models/sketch-model.bin
```

Keep downloaded data outside the repository.

- `classes.txt` — the 138 categories (targets for all five levels, things
  children often draw, and plain shapes/scribbles that mean "not yet").
- `train.py` — trains, folds batch norm, quantises to int8 per output channel,
  calibrates a temperature on validation, and writes `sketch-model.bin`,
  `parity.json` (reference logits for the TypeScript forward pass) and
  `report.json` (accuracy, per-class recall and the most confused class).
- `pick-examples.ts` — chooses hint/stencil drawings and e2e fixtures.
- `eval-policy.ts` — runs the full TypeScript pipeline and the game's decision
  policy on held-out drawings.

## Glyph model (Level 2: digits and letters)

A second model of the same architecture and file format reads written
characters: `0-9`, `a-z`, `A-Z` and a `scribble` class (63 labels). It runs
through the same `Recognizer`; `src/recognition/glyphs.ts` holds the
constrained policy (the game always knows which character it asked for).

Sources:

- [UJI Pen Characters v2](https://archive.ics.uci.edu/dataset/177/uji+pen+characters+version+2)
  (UCI, **CC BY 4.0**): real pen strokes from 60 writers. The 40 "trn" writers
  train (6 of them validate), the 20 "tst" writers are the test set.
- [EMNIST ByClass](https://www.nist.gov/itl/products-and-services/emnist-dataset)
  (NIST): scanned characters, thinned to a one-pixel skeleton and traced into
  strokes, so they are drawn with the game's own pen.
- Quick, Draw! `squiggle` + `zigzag` (already downloaded above) for `scribble`.

```sh
# UJI: unzip ujipenchars2.txt from https://archive.ics.uci.edu/static/public/177/uji+pen+characters+version+2.zip
# EMNIST: unzip gzip/emnist-byclass-* from https://biometrics.nist.gov/cs_links/EMNIST/gzip.zip (~560 MB)
node --max-old-space-size=8192 tools/sketch-model/build-glyphs.ts <data>/ujipenchars2.txt <data>/gzip <data>/qd-data <data>/glyph-set
MS_SOURCE="UJI Pen Characters v2 (UCI, CC BY 4.0) + EMNIST ByClass (NIST) thinned to strokes + Quick, Draw! squiggle/zigzag (Google, CC BY 4.0)" \
  python tools/sketch-model/train.py <data>/glyph-set <data>/glyph-out 10
cp <data>/glyph-out/sketch-model.bin public/models/glyph-model.bin
cp <data>/glyph-out/parity.json src/recognition/__fixtures__/glyph-parity.json
node tools/sketch-model/eval-glyphs.ts <data>/glyph-set public/models/glyph-model.bin tests/fixtures/glyphs.json
```

First run (2026-11-23): 332k training images, about 45 minutes on the CPU;
int8 test top-1 80.9% / top-3 96.4% over 63 labels on unseen writers (top-1
is held down by pairs that look the same, c/C, o/O/0, which the game accepts
either way). With the game's policy, real handwriting of the characters Level
2 asks for is accepted on the first try 93-100% of the time; other characters
are wrongly accepted 0.3-6.3% (mostly intended look-alikes: l or I for 1).

To add a word for a new level: add its category (if the dataset has one) to
`classes.txt`, retrain, and map the word in `src/recognition/vocab.ts`.
Words the dataset lacks get aliases, a shape rule (`shapeRules.ts`) or a colour
rule.
