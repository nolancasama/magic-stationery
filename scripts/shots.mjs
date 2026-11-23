// Screenshot pass at Chromebook sizes: node scripts/shots.mjs [baseUrl] [outDir] [scenario]
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:5181/";
const out = process.argv[3] ?? ".tmp/shots";
const scenario = process.argv[4] ?? "basic";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text()); });
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log("shot", name); };
const st = () => page.evaluate(() => window.__ms.state());
const waitFor = async (pred, ms = 30000) => {
  const t0 = Date.now();
  for (;;) { const s = await st(); if (pred(s)) return s; if (Date.now() - t0 > ms) throw new Error("timeout; state=" + JSON.stringify(s)); await page.waitForTimeout(150); }
};
await page.goto(base + "?e2e=1&speed=" + (process.env.SPEED ?? "3"));
await page.waitForTimeout(1500);
await shot("01-title");
await page.click("[data-test=start]");
await page.waitForTimeout(600);
await shot("02-town-intro");
// skip narrator lines
for (let i = 0; i < 2; i++) { await page.click("[data-test=next]"); await page.waitForTimeout(200); }
await waitFor((s) => s.waiting === "place");
await page.waitForTimeout(500);
await shot("03-town");
await page.evaluate(() => window.__ms.clickPlace());
await waitFor((s) => s.area === "store", 15000);
await page.waitForTimeout(2500);
await shot("04-store-arrive");
if (scenario === "basic") { console.log(JSON.stringify(await st())); console.log(errors.join("\n")); await browser.close(); process.exit(0); }
