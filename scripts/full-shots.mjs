// Plays all of Level 1 (real model, real UI) and screenshots the key moments.
//   node scripts/full-shots.mjs [baseUrl] [outDir]
// Speech goes through the e2e hook; drawings are the e2e fixtures put on the canvas.
import { chromium } from "@playwright/test";
import fs from "node:fs";

const base = process.argv[2] ?? "http://127.0.0.1:4181/";
const out = process.argv[3] ?? ".tmp/shots/full";
fs.mkdirSync(out, { recursive: true });
const FIX = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/drawings.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let n = 0;
const shot = async (name) => page.screenshot({ path: `${out}/${String(++n).padStart(2, "0")}-${name}.png` });
const st = () => page.evaluate(() => window.__ms.state());
const draw = (name, color = "#2f3a75") =>
  page.evaluate(([d]) => window.__ms.drawStrokes(d), [{ strokes: FIX[name].map((s) => ({ color, points: s })) }]);

await page.goto(base + "?e2e=1&speed=" + (process.env.SPEED ?? "2"));
await page.click("[data-test=start]");
const shots = { surprise: false, hint: false, crayonWrong: false, taroBag: false };
let drawnRabbit = false;
const seenQ = new Set();
let crayonTries = 0;
const t0 = Date.now();
while (Date.now() - t0 < 900_000) {
  const s = await st();
  if (await page.locator("[data-test=complete-next]").isVisible()) {
    await page.waitForTimeout(800);
    await shot("album");
    await page.click("[data-test=complete-next]");
    continue;
  }
  if (s.steps.includes("taro") && s.waiting === "" && !s.dialogue) break;
  if (s.waiting === "place") {
    await page.evaluate(() => window.__ms.clickPlace());
    continue;
  }
  if (s.waiting === "ask") {
    const q = (await page.locator(".ask .q").textContent()) ?? "";
    const cards = await page.locator(".ask .say-card").allTextContents();
    if (/schoolbag/.test(q) && !shots.taroBag) {
      await page.waitForTimeout(500);
      await shot("taro-asks");
    }
    if (!seenQ.has(q) && seenQ.size < 8) {
      seenQ.add(q);
      await page.waitForTimeout(900);
      await shot("ask-" + q.replace(/[^a-z]+/gi, "-").slice(0, 24));
    }
    let text = cards[0].replace("🔊", "").trim();
    if (cards.length > 1) text = /pencil|eraser|notebook/i.test(q) && !/ruler|crayons|schoolbag/i.test(q) ? "yes I do" : "no I don't";
    if (/This is for you/.test(cards[0]) && /schoolbag/i.test(q + (s.dialogue ?? ""))) {
      shots.taroBag = true;
      await shot("taro-packed-bag");
    }
    await page.evaluate((t) => window.__ms.say(t), text);
    continue;
  }
  if (s.waiting.startsWith("slot:")) {
    await page.evaluate((i) => window.__ms.clickSlot(i), s.waiting.slice(5).split(",")[0]);
    continue;
  }
  if (s.waiting === "draw") {
    await page.waitForTimeout(600);
    const word = ((await page.locator(".draw-head .title .word").textContent()) ?? "").trim();
    const title = (await page.locator(".draw-head .title").textContent()) ?? "";
    if (word === "pencil" && !drawnRabbit) {
      drawnRabbit = true;
      await draw("rabbit");
      for (let i = 0; i < 8; i++) {
        await page.waitForTimeout(500);
        await shot("surprise-" + i);
      }
      continue;
    }
    if (word === "eraser" && !shots.hint) {
      shots.hint = true;
      await draw("squiggle");
      await page.waitForTimeout(900);
      await shot("unclear-feedback");
      await page.click("[data-test=draw-hint]");
      await page.waitForTimeout(500);
      await page.click("[data-test=draw-hint]");
      await page.waitForTimeout(700);
      await shot("hint-stencil");
    }
    if (word === "crayon") {
      crayonTries++;
      const want = /red/.test(title) ? "#e53935" : "#1e88e5";
      // First red crayon is drawn in green: Yui should say which colour it is.
      const color = crayonTries === 1 ? "#43a047" : want;
      await draw("crayon", color);
      if (crayonTries === 1) {
        await page.waitForTimeout(2500);
        await shot("crayon-wrong-colour");
      }
      continue;
    }
    const key = word === "schoolbag" ? "backpack" : word;
    if (FIX[key]) await draw(key);
    else await page.evaluate((w) => window.__ms.drawExample(w), word);
    await page.waitForTimeout(1300);
    await shot("transform-" + word);
    continue;
  }
  const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
  if (await next.isVisible()) await next.click({ timeout: 2000 }).catch(() => {});
  else await page.waitForTimeout(150);
}
await page.waitForTimeout(2500);
await shot("store-restored");
console.log("stats", JSON.stringify((await st()).stats));
// Back to town: the shop stands in colour.
await page.click("[data-test=town]");
await page.waitForTimeout(3500);
for (let i = 0; i < 3; i++) {
  const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
  if (await next.isVisible()) {
    await shot("town-after-" + i);
    await next.click({ timeout: 2000 }).catch(() => {});
  }
  await page.waitForTimeout(1500);
}
await shot("town-final");
console.log(JSON.stringify(await st()), "errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
