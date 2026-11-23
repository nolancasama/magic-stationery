// Plays the start of Level 1 and screenshots key moments: node scripts/play-shots.mjs <outDir>
import { chromium } from "@playwright/test";
import fs from "node:fs";
const out = process.argv[2] ?? ".tmp/shots/play";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: +(process.env.W ?? 1366), height: +(process.env.H ?? 768) }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const st = () => page.evaluate(() => window.__ms.state());
let n = 0;
const shot = async (name) => { await page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png` }); };
await page.goto("http://127.0.0.1:5181/?e2e=1&speed=" + (process.env.SPEED ?? "2"));
await page.click("[data-test=start]");
const shots = new Set((process.env.SHOTS ?? "counter,ask,draw").split(","));
const t0 = Date.now();
let shotDialogue = 0;
while (Date.now() - t0 < 120000) {
  const s = await st();
  if (s.waiting === "place") { await page.evaluate(() => window.__ms.clickPlace()); await page.waitForTimeout(300); continue; }
  if (s.waiting === "ask") {
    await page.waitForTimeout(700);
    if (shots.has("ask")) await shot("ask");
    const cards = await page.locator(".ask .say-card").allTextContents();
    await page.evaluate((t) => window.__ms.say(t), cards[0].replace("🔊", "").trim());
    continue;
  }
  if (s.waiting.startsWith("slot:")) { await page.waitForTimeout(400); await shot("slot-wait"); await page.evaluate((i) => window.__ms.clickSlot(i), s.waiting.slice(5).split(",")[0]); continue; }
  if (s.waiting === "draw") {
    await page.waitForTimeout(800);
    await shot("draw-open");
    // A rough hand-drawn pencil with the mouse.
    const box = await page.locator("[data-test=draw-canvas]").boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const path = [[-20, 120], [-20, -80], [0, -130], [20, -80], [20, 120], [-20, 120]];
    await page.mouse.move(cx + path[0][0], cy + path[0][1]);
    await page.mouse.down();
    for (const [x, y] of path.slice(1)) await page.mouse.move(cx + x, cy + y, { steps: 8 });
    await page.mouse.up();
    await page.mouse.move(cx - 20, cy + 95); await page.mouse.down(); await page.mouse.move(cx + 20, cy + 95, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(900);
    await shot("draw-drawn");
    await page.click("[data-test=draw-finish]");
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(450); await shot("transform-" + i); }
    break;
  }
  const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
  if (await next.isVisible()) {
    if (shotDialogue < 3 && shots.has("counter")) { await shot("dialogue"); shotDialogue++; }
    await next.click({ timeout: 2000 }).catch(() => {});
  } else await page.waitForTimeout(120);
}
await page.waitForTimeout(2500);
await shot("after");
console.log(JSON.stringify(await st()), errors.join("\n"));
await browser.close();
