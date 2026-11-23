// Evaluates the glyph model + the game's glyph policy on held-out writers.
//
//   node tools/sketch-model/eval-glyphs.ts <glyphSetDir> <glyph-model.bin> [fixturesOut.json]
//
// For each character the game asks for: how often a real handwritten sample is
// accepted on the first try, how often other characters / scribbles are wrongly
// accepted, and whether the hand-made hint example is recognised. Optionally
// writes e2e fixtures (one well-recognised real sample per target, plus a
// wrong letter and a scribble).
import fs from "node:fs";
import { parseModel } from "../../src/recognition/model.ts";
import { Recognizer } from "../../src/recognition/recognizer.ts";
import { GLYPH_TARGETS, SCRIBBLE, glyphExample, glyphScore, judgeGlyph } from "../../src/recognition/glyphs.ts";
import type { Stroke } from "../../src/recognition/strokes.ts";

const [setDir, modelPath, fixturesOut] = process.argv.slice(2);
const buf = fs.readFileSync(modelPath);
const r = new Recognizer(parseModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
const test = JSON.parse(fs.readFileSync(`${setDir}/test_strokes.json`, "utf8")) as Record<string, Stroke[][]>;
const lower = (c: string) => c.toLowerCase();

const fixtures: Record<string, Stroke[]> = {};
console.log("target  accept1st  wrongly-accepted(others)  scribble-accepted  example");
for (const t of GLYPH_TARGETS) {
  const own = test[t] ?? [];
  let ok = 0;
  let bestP = -1;
  for (const d of own) {
    const rec = r.recognize(d);
    if (judgeGlyph(rec, t, 0).kind === "accept") ok++;
    const p = glyphScore(rec, t);
    if (p > bestP) {
      bestP = p;
      fixtures[t] = d;
    }
  }
  let falseOk = 0;
  let others = 0;
  for (const [label, ds] of Object.entries(test)) {
    if (label === SCRIBBLE || lower(label) === lower(t)) continue;
    for (const d of ds) {
      others++;
      if (judgeGlyph(r.recognize(d), t, 0).kind === "accept") falseOk++;
    }
  }
  let scrOk = 0;
  for (const d of test[SCRIBBLE]) if (judgeGlyph(r.recognize(d), t, 0).kind === "accept") scrOk++;
  const ex = glyphExample(t);
  const exRec = ex ? r.recognize(ex.strokes.map((s) => s.points)) : null;
  const exTxt = exRec ? `${exRec.ranked[0].label} ${exRec.ranked[0].p.toFixed(2)} (${judgeGlyph(exRec, t, 0).kind})` : "-";
  console.log(
    `${t.padEnd(7)} ${((100 * ok) / Math.max(1, own.length)).toFixed(0).padStart(5)}% of ${own.length}   ${((100 * falseOk) / others).toFixed(1).padStart(5)}%   ${((100 * scrOk) / test[SCRIBBLE].length).toFixed(1).padStart(5)}%   ${exTxt}`
  );
}
if (fixturesOut) {
  fixtures.b = test.b[0];
  fixtures[SCRIBBLE] = test[SCRIBBLE][0];
  fs.writeFileSync(fixturesOut, JSON.stringify(fixtures));
  console.log("wrote", fixturesOut);
}
