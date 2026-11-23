// Downloads the first few MB of each Quick, Draw! "simplified" ndjson file.
//
//   node tools/sketch-model/download.mjs <outDir> [bytesPerClass]
//
// The dataset (https://github.com/googlecreativelab/quickdraw-dataset, CC BY 4.0)
// is a set of files, not an inference API. Each simplified file holds one JSON
// drawing per line in random order, so a byte-range prefix is a fair sample.
// The partial last line is dropped. Existing files are kept (resumable).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] ?? "");
const bytes = Number(process.argv[3] ?? 3_500_000);
if (!process.argv[2]) {
  console.error("usage: node download.mjs <outDir> [bytesPerClass]");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const classes = fs
  .readFileSync(path.join(here, "classes.txt"), "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const BASE = "https://storage.googleapis.com/quickdraw_dataset/full/simplified/";

async function one(name) {
  const file = path.join(outDir, name.replace(/ /g, "_") + ".ndjson");
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return "kept";
  const url = BASE + encodeURIComponent(name) + ".ndjson";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
      if (res.status !== 206 && res.status !== 200) throw new Error("HTTP " + res.status);
      const text = await res.text();
      const cut = text.lastIndexOf("\n");
      fs.writeFileSync(file, cut > 0 ? text.slice(0, cut + 1) : text);
      return "ok";
    } catch (e) {
      if (attempt === 4) throw new Error(`${name}: ${e.message}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
}

let next = 0;
let done = 0;
const failures = [];
async function worker() {
  while (next < classes.length) {
    const name = classes[next++];
    try {
      const r = await one(name);
      done++;
      if (done % 10 === 0 || r !== "kept") console.log(`${done}/${classes.length} ${name} ${r}`);
    } catch (e) {
      failures.push(e.message);
    }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`finished: ${done}/${classes.length}`);
if (failures.length) {
  console.error("FAILED:\n" + failures.join("\n"));
  process.exit(1);
}
