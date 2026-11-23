// Builds the training set for the sketch model from downloaded ndjson files.
//
//   node tools/sketch-model/build-dataset.ts <dataDir> <outDir> [trainPerClass]
//
// Uses the game's own preprocessing (src/recognition/strokes.ts + raster.ts),
// so training drawings are prepared exactly like a child's drawing in the game.
// Only drawings the original Quick, Draw! game recognised are used.
// Train drawings also get one wobbled/partial copy (touchpad-style roughness).
import fs from "node:fs";
import path from "node:path";
import { fromQD, simplifyLikeQuickDraw, type Stroke } from "../../src/recognition/strokes.ts";
import { augment, mulberry32 } from "./augment.ts";
import { RASTER, rasterize, toBytes } from "../../src/recognition/raster.ts";

const [dataDir, outDir, perArg] = process.argv.slice(2);
if (!dataDir || !outDir) {
  console.error("usage: node build-dataset.ts <dataDir> <outDir> [trainPerClass]");
  process.exit(1);
}
const TRAIN_PER_CLASS = Number(perArg ?? 6000);
const AUG_PER_CLASS = Math.floor(TRAIN_PER_CLASS / 2);
const VAL_PER_CLASS = 300;
const TEST_PER_CLASS = 300;
const STROKES_PER_CLASS = 80; // raw test strokes kept for policy evaluation in TS
fs.mkdirSync(outDir, { recursive: true });

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const classes = fs
  .readFileSync(path.join(here, "classes.txt"), "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

interface Split {
  x: Uint8Array[];
  y: number[];
}
const train: Split = { x: [], y: [] };
const val: Split = { x: [], y: [] };
const test: Split = { x: [], y: [] };
const testStrokes: Record<string, Stroke[][]> = {};
const valStrokes: Record<string, Stroke[][]> = {};
const counts: Record<string, number> = {};
const raster = new Float32Array(RASTER * RASTER);
const t0 = Date.now();

classes.forEach((name, label) => {
  const file = path.join(dataDir, name.replace(/ /g, "_") + ".ndjson");
  const rnd = mulberry32(1000 + label);
  const drawings: Stroke[][] = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let rec: { recognized?: boolean; drawing?: [number[], number[]][] };
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (!rec.recognized || !Array.isArray(rec.drawing)) continue;
    drawings.push(fromQD(rec.drawing));
  }
  for (let i = drawings.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [drawings[i], drawings[j]] = [drawings[j], drawings[i]];
  }
  const testSet = drawings.slice(0, TEST_PER_CLASS);
  const valSet = drawings.slice(TEST_PER_CLASS, TEST_PER_CLASS + VAL_PER_CLASS);
  const trainSet = drawings.slice(TEST_PER_CLASS + VAL_PER_CLASS, TEST_PER_CLASS + VAL_PER_CLASS + TRAIN_PER_CLASS);
  const push = (split: Split, strokes: Stroke[]) => {
    rasterize(strokes, raster);
    split.x.push(toBytes(raster));
    split.y.push(label);
  };
  testSet.forEach((d) => push(test, simplifyLikeQuickDraw(d)));
  valSet.forEach((d) => push(val, simplifyLikeQuickDraw(d)));
  trainSet.forEach((d, i) => {
    push(train, simplifyLikeQuickDraw(d));
    if (i < AUG_PER_CLASS) push(train, augment(simplifyLikeQuickDraw(d), rnd));
  });
  testStrokes[name] = testSet.slice(0, STROKES_PER_CLASS).map((d) => simplifyLikeQuickDraw(d));
  valStrokes[name] = valSet.slice(0, STROKES_PER_CLASS).map((d) => simplifyLikeQuickDraw(d));
  counts[name] = trainSet.length;
  if (label % 10 === 0) console.log(`${label + 1}/${classes.length} ${name}: ${drawings.length} recognised, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
});

function write(prefix: string, split: Split) {
  // Shuffle once so the trainer can read contiguous chunks.
  const rnd = mulberry32(prefix.length * 7919);
  const order = split.y.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const x = new Uint8Array(order.length * RASTER * RASTER);
  const y = new Uint16Array(order.length);
  order.forEach((src, i) => {
    x.set(split.x[src], i * RASTER * RASTER);
    y[i] = split.y[src];
  });
  fs.writeFileSync(path.join(outDir, `${prefix}_x.u8`), x);
  fs.writeFileSync(path.join(outDir, `${prefix}_y.u16`), new Uint8Array(y.buffer));
  console.log(`${prefix}: ${order.length} images`);
}
write("train", train);
write("val", val);
write("test", test);
fs.writeFileSync(path.join(outDir, "labels.json"), JSON.stringify({ labels: classes, raster: RASTER, counts }, null, 1));
fs.writeFileSync(path.join(outDir, "test_strokes.json"), JSON.stringify(testStrokes));
fs.writeFileSync(path.join(outDir, "val_strokes.json"), JSON.stringify(valStrokes));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
