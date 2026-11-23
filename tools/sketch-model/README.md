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

To add a word for a new level: add its category (if the dataset has one) to
`classes.txt`, retrain, and map the word in `src/recognition/vocab.ts`.
Words the dataset lacks get aliases, a shape rule (`shapeRules.ts`) or a colour
rule.
