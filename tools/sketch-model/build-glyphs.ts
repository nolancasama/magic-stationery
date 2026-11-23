// Builds the training set for the glyph model (digits and letters, Level 2).
//
//   node tools/sketch-model/build-glyphs.ts <ujipenchars2.txt> <emnistGzipDir> <qdDataDir> <outDir>
//
// Sources (see README):
// - UJI Pen Characters v2 (UCI, CC BY 4.0): real pen strokes. Writers "trn" train
//   (the last 6 of them are validation), writers "tst" are the test set, so the
//   reported accuracy is on writers the model never saw.
// - EMNIST ByClass (NIST): scanned characters, thinned to a one-pixel skeleton and
//   traced into strokes, so they are drawn with the game's own pen like a child's.
// - Quick, Draw! squiggle + zigzag: the "scribble" class (not a character).
// Everything goes through the game's simplifyLikeQuickDraw + rasterize.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fromQD, simplifyLikeQuickDraw, type Point, type Stroke } from "../../src/recognition/strokes.ts";
import { RASTER, rasterize, toBytes } from "../../src/recognition/raster.ts";
import { augment, mulberry32, type AugmentOptions } from "./augment.ts";

const [ujiFile, emnistDir, qdDir, outDir] = process.argv.slice(2);
if (!ujiFile || !emnistDir || !qdDir || !outDir) {
  console.error("usage: node build-glyphs.ts <ujipenchars2.txt> <emnistGzipDir> <qdDataDir> <outDir>");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const SCRIBBLE = "scribble";
const CHARS = [..."0123456789", ..."abcdefghijklmnopqrstuvwxyz", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const LABELS = [...CHARS, SCRIBBLE];
const index = new Map(LABELS.map((l, i) => [l, i]));

/** Glyphs are small: less wobble than objects, never drop a stroke (an "i" without its dot is fine, a "t" without its bar is not). */
const GLYPH_AUGMENT: AugmentOptions = { dropStroke: 0, wobble: 5, rotate: 12, shear: 0.25, squash: 0.2 };
const UJI_COPIES = 24;
const EMNIST_TRAIN_PER_CLASS = 2600;
const EMNIST_AUG_PER_CLASS = 1000;
const EMNIST_VAL_PER_CLASS = 60;
const SCRIBBLE_TRAIN = 5000;
const SCRIBBLE_VAL = 150;
const SCRIBBLE_TEST = 300;
const STROKES_PER_CLASS = 40;

interface Split {
  x: Uint8Array[];
  y: number[];
}
const train: Split = { x: [], y: [] };
const val: Split = { x: [], y: [] };
const test: Split = { x: [], y: [] };
const testStrokes: Record<string, Stroke[][]> = {};
const raster = new Float32Array(RASTER * RASTER);
const counts: Record<string, number> = {};
function push(split: Split, strokes: Stroke[], label: number) {
  if (strokes.length === 0) return;
  rasterize(strokes, raster);
  split.x.push(toBytes(raster));
  split.y.push(label);
  if (split === train) counts[LABELS[label]] = (counts[LABELS[label]] ?? 0) + 1;
}
const t0 = Date.now();
const rnd = mulberry32(4242);

// ---------------------------------------------------------------- UJI Pen Characters v2
{
  const lines = fs.readFileSync(ujiFile, "latin1").split(/\r?\n/);
  const samples: { ch: string; writer: string; split: "trn" | "tst"; strokes: Stroke[] }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^WORD (\S+) (trn|tst)_(\S+)-\d+/.exec(lines[i]);
    if (!m) continue;
    const ch = m[1];
    const n = Number(/NUMSTROKES (\d+)/.exec(lines[i + 1])?.[1] ?? 0);
    const strokes: Stroke[] = [];
    for (let k = 0; k < n; k++) {
      const nums = (lines[i + 2 + k].split("#")[1] ?? "").trim().split(/\s+/).map(Number);
      const st: Stroke = [];
      for (let j = 0; j + 1 < nums.length; j += 2) {
        const p: Point = [nums[j], nums[j + 1]];
        const last = st[st.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) st.push(p);
      }
      if (st.length) strokes.push(st);
    }
    i += 1 + n;
    if (!index.has(ch)) continue;
    samples.push({ ch, writer: m[3], split: m[2] as "trn" | "tst", strokes });
  }
  const trnWriters = [...new Set(samples.filter((s) => s.split === "trn").map((s) => s.writer))].sort();
  const valWriters = new Set(trnWriters.slice(-6));
  for (const s of samples) {
    const label = index.get(s.ch) as number;
    const simple = simplifyLikeQuickDraw(s.strokes);
    if (s.split === "tst") {
      push(test, simple, label);
      const list = (testStrokes[s.ch] ??= []);
      if (list.length < STROKES_PER_CLASS) list.push(simple);
    } else if (valWriters.has(s.writer)) {
      push(val, simple, label);
    } else {
      push(train, simple, label);
      for (let c = 0; c < UJI_COPIES; c++) push(train, augment(simple, rnd, GLYPH_AUGMENT), label);
    }
  }
  console.log(`UJI: ${samples.length} samples, ${trnWriters.length} trn writers (6 for validation), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// ---------------------------------------------------------------- EMNIST ByClass
function idx(file: string): { dims: number[]; data: Uint8Array } {
  const buf = zlib.gunzipSync(fs.readFileSync(file));
  const nd = buf[3];
  const dims: number[] = [];
  for (let i = 0; i < nd; i++) dims.push(buf.readUInt32BE(4 + 4 * i));
  return { dims, data: new Uint8Array(buf.buffer, buf.byteOffset + 4 + 4 * nd, buf.length - 4 - 4 * nd) };
}

/** Zhang-Suen thinning of a binary W x W image, in place. */
function thin(img: Uint8Array, W: number): void {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= W ? 0 : img[y * W + x]);
  const del: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          if (!img[y * W + x]) continue;
          const p2 = at(x, y - 1), p3 = at(x + 1, y - 1), p4 = at(x + 1, y), p5 = at(x + 1, y + 1);
          const p6 = at(x, y + 1), p7 = at(x - 1, y + 1), p8 = at(x - 1, y), p9 = at(x - 1, y - 1);
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let a = 0;
          for (let k = 0; k < 8; k++) if (seq[k] === 0 && seq[k + 1] === 1) a++;
          if (a !== 1) continue;
          if (pass === 0 ? p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0 : p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          del.push(y * W + x);
        }
      }
      for (const k of del) img[k] = 0;
      if (del.length) changed = true;
    }
  }
}

const NB = [
  [1, 0], [0, 1], [-1, 0], [0, -1],
  [1, 1], [-1, 1], [-1, -1], [1, -1]
];

/** Trace a one-pixel skeleton into polylines (edges between 8-neighbours, each used once). */
function trace(img: Uint8Array, W: number): Stroke[] {
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < W && img[y * W + x] === 1;
  // Skip diagonal edges already covered by two straight ones (keeps corners clean).
  const neighbours = (x: number, y: number): [number, number][] => {
    const out: [number, number][] = [];
    NB.forEach(([dx, dy], i) => {
      if (!on(x + dx, y + dy)) return;
      if (i >= 4 && (on(x + dx, y) || on(x, y + dy))) return;
      out.push([x + dx, y + dy]);
    });
    return out;
  };
  const used = new Set<string>();
  const key = (a: number, b: number, c: number, d: number) => (a * W + b < c * W + d ? `${a},${b},${c},${d}` : `${c},${d},${a},${b}`);
  const pixels: [number, number][] = [];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) if (img[y * W + x]) pixels.push([x, y]);
  // Endpoints first, so strokes start where a pen would.
  pixels.sort((p, q) => neighbours(p[0], p[1]).length - neighbours(q[0], q[1]).length);
  const strokes: Stroke[] = [];
  for (const [sx, sy] of pixels) {
    for (;;) {
      let x = sx, y = sy;
      const st: Stroke = [[x, y]];
      for (;;) {
        const next = neighbours(x, y).find(([nx, ny]) => !used.has(key(x, y, nx, ny)));
        if (!next) break;
        used.add(key(x, y, next[0], next[1]));
        [x, y] = next;
        st.push([x, y]);
      }
      if (st.length < 2) break;
      strokes.push(st);
    }
  }
  // Isolated single pixels (dots of i and j).
  for (const [x, y] of pixels) if (neighbours(x, y).length === 0) strokes.push([[x, y]]);
  return strokes;
}

{
  const mapping = new Map<number, string>();
  for (const line of fs.readFileSync(path.join(emnistDir, "emnist-byclass-mapping.txt"), "utf8").split(/\r?\n/)) {
    const [a, b] = line.trim().split(/\s+/).map(Number);
    if (Number.isFinite(a) && Number.isFinite(b)) mapping.set(a, String.fromCharCode(b));
  }
  const imgs = idx(path.join(emnistDir, "emnist-byclass-train-images-idx3-ubyte.gz"));
  const labs = idx(path.join(emnistDir, "emnist-byclass-train-labels-idx1-ubyte.gz"));
  const W = imgs.dims[1];
  const order = Array.from(labs.data.keys());
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const taken: Record<string, number> = {};
  const img = new Uint8Array(W * W);
  let used = 0;
  for (const n of order) {
    const ch = mapping.get(labs.data[n]);
    if (!ch || !index.has(ch)) continue;
    const t = taken[ch] ?? 0;
    if (t >= EMNIST_TRAIN_PER_CLASS + EMNIST_VAL_PER_CLASS) continue;
    taken[ch] = t + 1;
    // EMNIST images are stored transposed.
    const base = n * W * W;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) img[y * W + x] = imgs.data[base + x * W + y] > 110 ? 1 : 0;
    thin(img, W);
    const strokes = trace(img, W);
    if (strokes.length === 0) continue;
    const simple = simplifyLikeQuickDraw(strokes);
    const label = index.get(ch) as number;
    if (t < EMNIST_VAL_PER_CLASS) push(val, simple, label);
    else {
      push(train, simple, label);
      if (t - EMNIST_VAL_PER_CLASS < EMNIST_AUG_PER_CLASS) push(train, augment(simple, rnd, GLYPH_AUGMENT), label);
    }
    used++;
  }
  console.log(`EMNIST: ${used} images used, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

// ---------------------------------------------------------------- scribbles
{
  const label = index.get(SCRIBBLE) as number;
  const drawings: Stroke[][] = [];
  for (const name of ["squiggle", "zigzag"]) {
    for (const line of fs.readFileSync(path.join(qdDir, `${name}.ndjson`), "utf8").split("\n")) {
      if (!line) continue;
      try {
        const rec = JSON.parse(line) as { drawing?: [number[], number[]][] };
        if (Array.isArray(rec.drawing)) drawings.push(fromQD(rec.drawing));
      } catch {
        /* skip */
      }
    }
  }
  for (let i = drawings.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [drawings[i], drawings[j]] = [drawings[j], drawings[i]];
  }
  const tst = drawings.slice(0, SCRIBBLE_TEST);
  tst.forEach((d) => push(test, simplifyLikeQuickDraw(d), label));
  testStrokes[SCRIBBLE] = tst.slice(0, STROKES_PER_CLASS).map((d) => simplifyLikeQuickDraw(d));
  drawings.slice(SCRIBBLE_TEST, SCRIBBLE_TEST + SCRIBBLE_VAL).forEach((d) => push(val, simplifyLikeQuickDraw(d), label));
  drawings.slice(SCRIBBLE_TEST + SCRIBBLE_VAL, SCRIBBLE_TEST + SCRIBBLE_VAL + SCRIBBLE_TRAIN).forEach((d) => push(train, simplifyLikeQuickDraw(d), label));
  console.log(`scribbles: ${drawings.length} available`);
}

function write(prefix: string, split: Split) {
  const r = mulberry32(prefix.length * 7919);
  const order = split.y.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
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
fs.writeFileSync(path.join(outDir, "labels.json"), JSON.stringify({ labels: LABELS, raster: RASTER, counts }, null, 1));
fs.writeFileSync(path.join(outDir, "test_strokes.json"), JSON.stringify(testStrokes));
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
