// Picks example drawings (hint card + trace stencil) and e2e fixtures from the
// validation drawings, using the game's own TypeScript recogniser.
//
//   node tools/sketch-model/pick-examples.ts <datasetDir> <model.bin>
//
// Writes src/recognition/examples.json and tests/fixtures/drawings.json.
// Drawings are from the Quick, Draw! dataset (Google, CC BY 4.0).
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

function best(label: string, minStrokes = 1, maxStrokes = 9): Stroke[] {
  let pick: Stroke[] | null = null;
  let bestScore = -1;
  for (const d of val[label]) {
    if (d.length < minStrokes || d.length > maxStrokes) continue;
    const points = d.reduce((n, s) => n + s.length, 0);
    if (points > 90) continue;
    const res = r.recognize(d);
    const p = r.prob(res, label);
    const score = p - Math.abs(d.length - 4) * 0.01;
    if (score > bestScore) {
      bestScore = score;
      pick = d;
    }
  }
  if (!pick) throw new Error("no example for " + label);
  console.log(`${label}: p=${bestScore.toFixed(3)} strokes=${pick.length}`);
  return pick;
}

const WORD_LABEL: Record<string, string> = { pencil: "pencil", pen: "marker", eraser: "eraser", scissors: "scissors", book: "book", crayon: "crayon", schoolbag: "backpack", desk: "table", chair: "chair", elephant: "elephant", monkey: "monkey", panda: "panda", penguin: "penguin", banana: "banana" };
const examples: Record<string, Stroke[]> = {};
for (const [word, label] of Object.entries(WORD_LABEL)) examples[word] = best(label, 2);
fs.writeFileSync(path.join(root, "src/recognition/examples.json"), JSON.stringify(examples));

const fixtures: Record<string, Stroke[]> = {};
for (const label of ["pencil", "eraser", "scissors", "book", "crayon", "backpack", "rabbit", "cat", "squiggle", "table", "chair", "elephant", "monkey", "panda", "penguin", "banana"]) fixtures[label] = best(label, 1, 12);
fs.mkdirSync(path.join(root, "tests/fixtures"), { recursive: true });
fs.writeFileSync(path.join(root, "tests/fixtures/drawings.json"), JSON.stringify(fixtures));
console.log("wrote examples and fixtures");
