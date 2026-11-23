// Living-drawing check: two different children's fish, balls and pencils come
// to life side by side. node scripts/living-shots.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import fs from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:5181/";
const out = process.argv[3] ?? ".tmp/shots/living";
fs.mkdirSync(out, { recursive: true });
const FIX = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/living.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base + "?e2e=1&speed=1&scene=store");
await page.waitForFunction(() => window.__ms && window.__ms.state().model > 0 && window.__ms.state().area === "store", null, { timeout: 30000 });
await page.evaluate(() => window.__ms.game.focus({ pos: { x: 0.3, y: 3.4, z: 6.6 }, look: { x: 0.3, y: 0.8, z: 1.2 } }, true));
const colours = ["#1e88e5", "#e53935"];
const spawn = (name, i, x, z) =>
  page.evaluate(
    ([d, x, z]) => window.__ms.spawn(d, x, z, 40),
    [{ strokes: FIX[name][i].map((s) => ({ color: colours[i], points: s })) }, x, z]
  );
const results = [];
for (const [name, xs] of [["fish", [-2.2, -0.9]], ["basketball", [0.4, 1.4]], ["pencil", [2.5, 3.4]]]) {
  for (let i = 0; i < 2; i++) {
    results.push(JSON.stringify(await spawn(name, i, xs[i], 1.9)));
  }
}
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/living-${i}.png` });
}
console.log(results.join("\n"));
console.log("errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
