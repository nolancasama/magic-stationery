// Fill tool check: draw a closed pencil shape with the mouse, colour it in with
// the paint bucket, then watch it land. node scripts/fill-shots.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import fs from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:5181/";
const out = process.argv[3] ?? ".tmp/shots/fill";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const st = () => page.evaluate(() => window.__ms.state());
await page.goto(base + "?e2e=1&speed=2");
await page.click("[data-test=start]");
const t0 = Date.now();
while (Date.now() - t0 < 120000) {
  const s = await st();
  if (s.waiting === "place") { await page.evaluate(() => window.__ms.clickPlace()); continue; }
  if (s.waiting === "ask") { const c = await page.locator(".ask .say-card").allTextContents(); await page.evaluate((t) => window.__ms.say(t), c[0].replace("🔊", "").trim()); continue; }
  if (s.waiting.startsWith("slot:")) { await page.evaluate((i) => window.__ms.clickSlot(i), s.waiting.slice(5).split(",")[0]); continue; }
  if (s.waiting === "draw") break;
  const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
  if (await next.isVisible()) await next.click({ timeout: 2000 }).catch(() => {});
  else await page.waitForTimeout(120);
}
await page.waitForTimeout(800);
const box = await page.locator("[data-test=draw-canvas]").boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const line = async (pts) => {
  await page.mouse.move(cx + pts[0][0], cy + pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(cx + x, cy + y, { steps: 8 });
  await page.mouse.up();
};
// A closed pencil outline and its tip line.
await line([[-28, 130], [-28, -80], [0, -140], [28, -80], [28, 130], [-28, 130]]);
await line([[-28, -80], [28, -80]]);
// Colour it in: yellow body, pink tip area.
await page.click("[data-test=draw-fill]");
await page.click(".crayon-btn[data-color=yellow]");
await page.mouse.click(cx, cy + 20);
await page.click(".crayon-btn[data-color=pink]");
await page.mouse.click(cx, cy - 100);
// Tapping outside the drawing must be refused.
await page.mouse.click(box.x + 30, box.y + box.height - 40);
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/01-coloured-in.png` });
await page.click("[data-test=draw-finish]");
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/0${i + 2}-landing.png` });
}
console.log(JSON.stringify((await st()).events.slice(-4)), "errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
