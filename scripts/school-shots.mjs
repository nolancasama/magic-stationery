// Level 2 screenshot pass at Chromebook size: node scripts/school-shots.mjs [baseUrl] [outDir]
// Erased classroom views, a writing panel, then a play-through with real handwriting
// (tests/fixtures/glyphs.json) capturing the key moments, and the restored room.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:4181/";
const out = process.argv[3] ?? ".tmp/school-shots";
fs.mkdirSync(out, { recursive: true });
const FIX = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/drawings.json", import.meta.url), "utf8"));
const GLYPHS = JSON.parse(fs.readFileSync(new URL("../tests/fixtures/glyphs.json", import.meta.url), "utf8"));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.type() + ": " + m.text()); });
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log("shot", name); };
const st = () => page.evaluate(() => window.__ms.state());

// 1. Static views of the erased and the restored classroom.
for (const [name, q] of [["01-erased", "scene=school"], ["02-erased-clock", "scene=school&view=clock"], ["03-erased-strip", "scene=school&view=strip"], ["04-erased-desks", "scene=school&view=desks"], ["20-restored", "scene=school&fill=1"], ["21-restored-clock", "scene=school&fill=1&view=clock"], ["22-restored-strip", "scene=school&fill=1&view=strip"]]) {
  await page.goto(base + "?e2e=1&" + q);
  await page.waitForTimeout(2200);
  await shot(name);
}

// 2. Play from a finished shop, photographing moments.
const SHOP_DONE = { v: 1, started: true, store: { steps: ["pen", "pencils", "shelf", "ken", "crayons", "books", "taro"], slots: Object.fromEntries(["pencilCup", "erasers", "scissors", "rulers", "crayons", "books", "notebooks", "schoolbags"].map((k) => [k, { tints: [null, null, null] }])) }, settings: { mic: true, help: "normal", japanese: true, slowVoice: false, music: true, sfx: true, touchpadPen: false } };
await page.goto(base + "?e2e=1&speed=4");
await page.evaluate((s) => localStorage.setItem("ms.save.v1", JSON.stringify(s)), SHOP_DONE);
await page.reload();
await page.click("[data-test=continue]");
for (let i = 0; i < 60 && (await st()).waiting !== "place"; i++) await page.waitForTimeout(150);
await page.waitForTimeout(500);
await shot("05-town-school-open");
await page.evaluate(() => window.__ms.clickPlace("school"));
const put = (strokes, color = "#2f3a75") => page.evaluate((d) => window.__ms.drawStrokes(d), { strokes: strokes.map((s) => ({ color, points: s })) });
const taken = new Set();
const once = async (key, name) => { if (!taken.has(key)) { taken.add(key); await page.waitForTimeout(350); await shot(name); } };
const t0 = Date.now();
let n = 0;
for (;;) {
  const s = await st();
  if (s.school.steps.includes("bell") && s.waiting === "" && !s.dialogue && !(await page.locator("[data-test=complete-next]").isVisible())) break;
  if (Date.now() - t0 > 400000) throw new Error("stuck " + JSON.stringify(s));
  if (await page.locator("[data-test=complete-next]").isVisible()) { await once("album", "19-album"); await page.click("[data-test=complete-next]"); continue; }
  if (s.waiting === "ask") {
    await once("ask:" + s.school.steps.length, `ask-${s.school.steps.length}`);
    const cards = (await page.locator(".ask .say-card").allTextContents()).map((c) => c.replace("🔊", "").trim());
    const text = cards.length === 1 ? cards[0] : s.school.steps.includes("time") ? "it's eight thirty" : "it's eight o'clock";
    await page.evaluate((t) => window.__ms.say(t), text);
    continue;
  }
  if (s.waiting.startsWith("slot:")) { const id = s.waiting.slice(5).split(",")[0]; await once("slot:" + id, `slot-${id}`); await page.evaluate((i) => window.__ms.clickSlot(i), id); continue; }
  if (s.waiting === "draw") {
    const word = ((await page.locator(".draw-head .title .word").textContent()) ?? "").trim();
    const writing = await page.locator(".draw-panel.writing").count();
    if (!writing) { await put(FIX[word === "desk" ? "table" : word]); await page.waitForTimeout(900); await once("draw:" + word, `draw-${word}`); continue; }
    if (word === "d" && !taken.has("hint")) {
      // Show the writing panel with the hint and stencil (two misses with a scribble).
      await put(GLYPHS.scribble); await page.waitForTimeout(700);
      await put(GLYPHS.scribble); await page.waitForTimeout(900);
      await once("hint", "write-d-stencil");
      continue;
    }
    if (GLYPHS[word]) await put(GLYPHS[word]); else await page.evaluate((w) => window.__ms.writeExample(w), word);
    await page.waitForTimeout(700);
    await once("write:" + word, `write-${word}`);
    continue;
  }
  const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
  if (await next.isVisible()) {
    const line = s.dialogue ?? "";
    if (/Wonderful|works again|Look! My|Good morning, everyone|is back/.test(line)) await once(line.slice(0, 20), `line-${String(++n).padStart(2, "0")}`);
    await next.click({ timeout: 2000 }).catch(() => {});
    continue;
  }
  await page.waitForTimeout(120);
}
await page.waitForTimeout(800);
await shot("23-played-end");
console.log(JSON.stringify((await st()).stats));
console.log(errors.join("\n") || "no errors");
await browser.close();
