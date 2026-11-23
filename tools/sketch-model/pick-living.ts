// Two different real drawings (different people) per test category, for the
// living-drawing check: "two students drawing the same object produce visibly
// different living objects".
//
//   node tools/sketch-model/pick-living.ts <datasetDir> <model.bin>
//
// Writes tests/fixtures/living.json. Drawings: Quick, Draw! dataset (Google, CC BY 4.0).
import fs from "node:fs";
import path from "node:path";
import { parseModel } from "../../src/recognition/model.ts";
import { Recognizer } from "../../src/recognition/recognizer.ts";
import type { Stroke } from "../../src/recognition/strokes.ts";

const [setDir, modelPath] = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const buf = fs.readFileSync(modelPath);
const r = new Recognizer(parseModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
const val = JSON.parse(fs.readFileSync(path.join(setDir, "val_strokes.json"), "utf8")) as Record<string, Stroke[][]>;

const out: Record<string, Stroke[][]> = {};
for (const label of ["fish", "basketball", "pencil"]) {
  // Confidently recognised, then the two whose shapes differ most (aspect ratio).
  const good = val[label]
    .filter((d) => d.length <= 12 && d.reduce((n, s) => n + s.length, 0) <= 120)
    .map((d) => {
      const pts = d.flat();
      const w = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
      const h = Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]));
      return { d, p: r.prob(r.recognize(d), label), aspect: w / Math.max(1, h) };
    })
    .filter((x) => x.p > 0.8)
    .sort((a, b) => a.aspect - b.aspect);
  if (good.length < 2) throw new Error("not enough " + label);
  const pair = [good[0], good[good.length - 1]];
  console.log(label, pair.map((x) => `p=${x.p.toFixed(2)} aspect=${x.aspect.toFixed(2)}`).join(" | "));
  out[label] = pair.map((x) => x.d);
}
fs.writeFileSync(path.join(root, "tests/fixtures/living.json"), JSON.stringify(out));
console.log("wrote tests/fixtures/living.json");
