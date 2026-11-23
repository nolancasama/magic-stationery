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
import { fromQD, resample, simplifyLikeQuickDraw, type Point, type Stroke } from "../../src/recognition/strokes.ts";
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

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rnd: () => number): number {
  const u = Math.max(1e-9, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

function strokeLen(s: Stroke): number {
  let t = 0;
  for (let i = 1; i < s.length; i++) t += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return t;
}

/** Touchpad-style roughness: wobble, a missing stroke, skew and squash. */
function augment(strokes: Stroke[], rnd: () => number): Stroke[] {
  let s = strokes.map((st) => st.map((p) => [p[0], p[1]] as Point));
  if (s.length >= 4 && rnd() < 0.3) {
    const lens = s.map(strokeLen);
    const longest = lens.indexOf(Math.max(...lens));
    let drop = Math.floor(rnd() * s.length);
    if (drop === longest) drop = (drop + 1) % s.length;
    s.splice(drop, 1);
  }
  const amp = rnd() * 4;
  const fx = 0.015 + rnd() * 0.05;
  const fy = 0.015 + rnd() * 0.05;
  const px = rnd() * Math.PI * 2;
  const py = rnd() * Math.PI * 2;
  const jitter = rnd() * 1.2;
  s = s.map((st) => {
    const rs = resample(st, 5);
    let arc = 0;
    return rs.map((p, i) => {
      if (i > 0) arc += Math.hypot(p[0] - rs[i - 1][0], p[1] - rs[i - 1][1]);
      return [
        p[0] + amp * Math.sin(fx * arc + px) + jitter * gauss(rnd),
        p[1] + amp * Math.sin(fy * arc + py) + jitter * gauss(rnd)
      ] as Point;
    });
  });
  const angle = ((rnd() * 2 - 1) * 10 * Math.PI) / 180;
  const shear = (rnd() * 2 - 1) * 0.15;
  const sx = 0.85 + rnd() * 0.3;
  const sy = 0.85 + rnd() * 0.3;
  const c = Math.cos(angle);
  const n = Math.sin(angle);
  s = s.map((st) =>
    st.map(([x, y]) => {
      const x1 = (x - 128) * sx + shear * (y - 128);
      const y1 = (y - 128) * sy;
      return [x1 * c - y1 * n, x1 * n + y1 * c] as Point;
    })
  );
  return simplifyLikeQuickDraw(s);
}

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
