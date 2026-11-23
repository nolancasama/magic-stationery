// Camera shots of chosen spots: node scripts/view-shots.mjs <baseUrl> <outDir> "<name>|<query>|px,py,pz|lx,ly,lz" ...
// e.g. "door-in|scene=store&fill=1|3.2,1.6,3.0|4.6,1.4,1.7". Uses the e2e hook (window.__ms).
import { chromium } from "@playwright/test";
import fs from "node:fs";
const [base, out, ...specs] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let lastQuery = "";
for (const spec of specs) {
  const [name, query, pos, look] = spec.split("|");
  if (query !== lastQuery) {
    await page.goto(base + "?e2e=1&" + query);
    await page.waitForTimeout(2500);
    lastQuery = query;
  }
  await page.evaluate(({ pos, look }) => {
    const g = window.__ms.game;
    const p = g.engine.goalPos.clone().set(...pos);
    g.engine.setLensShift(0);
    g.engine.focus(p, p.clone().set(...look), true);
  }, { pos: pos.split(",").map(Number), look: look.split(",").map(Number) });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${name}.png` });
}
console.log(errors.join("\n") || "no errors");
await browser.close();
