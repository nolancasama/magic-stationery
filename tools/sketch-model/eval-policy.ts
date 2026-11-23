// Evaluates the whole TypeScript pipeline (preprocess -> CNN -> policy) on
// held-out Quick, Draw! drawings.
//
//   node tools/sketch-model/eval-policy.ts <datasetDir> <model.bin>
//
// Reports: TS top-1/top-3 over every test drawing (compare with train.py's
// int8 numbers: a large gap would mean the TS forward pass is wrong), and for
// each Level 1 word the first-attempt verdicts on drawings of that word, plus
// how often drawings of other things would be accepted as it.
import fs from "node:fs";
import path from "node:path";
import { parseModel } from "../../src/recognition/model.ts";
import { judge } from "../../src/recognition/policy.ts";
import { Recognizer, type Recognition } from "../../src/recognition/recognizer.ts";
import type { Stroke } from "../../src/recognition/strokes.ts";
import type { WordId } from "../../src/recognition/vocab.ts";

const [setDir, modelPath] = process.argv.slice(2);
const buf = fs.readFileSync(modelPath);
const r = new Recognizer(parseModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
const test = JSON.parse(fs.readFileSync(path.join(setDir, "test_strokes.json"), "utf8")) as Record<string, Stroke[][]>;

// The drawings are in 0-255 space; the game measures ink in canvas pixels on a
// ~600 px canvas, so scale them up the same way for the "too little ink" check.
const toCanvas = (d: Stroke[]) => d.map((s) => s.map(([x, y]) => [x * 1.6, y * 1.6] as [number, number]));

const cache = new Map<string, Recognition[]>();
function recs(label: string): Recognition[] {
  if (!cache.has(label)) cache.set(label, test[label].map((d) => r.recognize(toCanvas(d))));
  return cache.get(label) as Recognition[];
}

let n = 0;
let top1 = 0;
let top3 = 0;
let ms = 0;
for (const label of r.labels) {
  for (const rec of recs(label)) {
    n++;
    ms += rec.ms;
    if (rec.ranked[0].label === label) top1++;
    if (rec.ranked.slice(0, 3).some((x) => x.label === label)) top3++;
  }
}
console.log(`TS pipeline on ${n} test drawings: top1 ${(top1 / n).toFixed(4)} top3 ${(top3 / n).toFixed(4)}  (${(ms / n).toFixed(2)} ms/drawing)`);

const WORDS: [WordId, string][] = [["pencil", "pencil"], ["eraser", "eraser"], ["scissors", "scissors"], ["book", "book"], ["notebook", "book"], ["crayon", "crayon"], ["schoolbag", "backpack"], ["ruler", "line"]];
const others = r.labels.filter((l) => !["pencil", "marker", "crayon", "paintbrush", "eraser", "scissors", "book", "backpack", "calendar", "laptop", "square", "line", "eyeglasses", "basket"].includes(l));
for (const [word, label] of WORDS) {
  const v = { accept: 0, surprise: 0, unclear: 0 };
  for (const rec of recs(label)) v[judge(rec, word, { misses: 0 }).kind]++;
  const total = recs(label).length;
  let falseAccept = 0;
  let otherN = 0;
  for (const o of others) {
    for (const rec of recs(o).slice(0, 25)) {
      otherN++;
      if (judge(rec, word, { misses: 0 }).kind === "accept") falseAccept++;
    }
  }
  console.log(
    `${word.padEnd(10)} own drawings (${label}): accept ${((100 * v.accept) / total).toFixed(1)}%  surprise ${((100 * v.surprise) / total).toFixed(1)}%  unclear ${((100 * v.unclear) / total).toFixed(1)}%  | other things accepted as ${word}: ${((100 * falseAccept) / otherN).toFixed(1)}%`
  );
}
