// Screenshot pass for the town: progress stages, follow camera at each district, the map view.
// Usage: node scripts/town-shots.mjs <baseUrl> <outDir> [stage...]   (stages: start, middle, festival, done)
import { chromium } from "@playwright/test";
import fs from "node:fs";

const [base, out, ...only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

const art = { w: 10, h: 10, lw: 9, strokes: [{ c: "#2f3a75", p: [0, 0, 5, 5] }] };
const slots = (keys, n = 3) => Object.fromEntries(keys.map((k) => [k, { tints: Array(n).fill(null) }]));
const store = { steps: ["pen", "pencils", "shelf", "ken", "crayons", "books", "taro"], slots: slots(["pencilCup", "erasers", "scissors", "rulers", "crayons", "books", "notebooks", "schoolbags"]) };
const school = { steps: ["arrive", "desks", "clock", "time", "letters", "bell"], slots: slots(["desks", "chairs"], 4), glyphs: Object.fromEntries(["n12", "n3", "n6", "n9", "ld", "lg", "lm", "lt"].map((k) => [k, art])) };
const zoo = { steps: ["welcome", "elephants", "monkeys", "pandas", "penguins", "favorite"], slots: slots(["elephants", "monkeys", "bananas", "pandas", "bamboo", "penguins"]) };
const market = { steps: ["greet", "apples", "oranges", "vegetables", "fridge", "shopping"], slots: slots(["apples", "oranges", "tomatoes", "carrots", "milk", "eggs"]) };
const gymAll = ["coach", "soccer", "basketball", "tennis", "baseball"];
const gymSlots = slots(["soccerBalls", "basketballs", "hoops", "rackets", "bats"]);

const STAGES = {
  start: { v: 1, started: true, store: { steps: ["pen"], slots: {} } },
  middle: { v: 1, started: true, store, school },
  festival: { v: 1, started: true, store, school, zoo, market, gym: { steps: gymAll, slots: gymSlots } },
  done: { v: 1, started: true, store, school, zoo, market, gym: { steps: [...gymAll, "festival"], slots: gymSlots } }
};

const SPOTS = { street: [-2, 5.4], shops: [-8.1, 5.6], market: [8.4, 5.6], zoo: [-9, -7.4], yard: [6.5, -4.5], gym: [13, -6.6] };

for (const [stage, save] of Object.entries(STAGES)) {
  if (only.length && !only.includes(stage)) continue;
  await page.goto(base + "?e2e=1");
  await page.evaluate((s) => localStorage.setItem("ms.save.v1", JSON.stringify(s)), save);
  await page.reload();
  await page.click("[data-test=continue]");
  await page.waitForFunction(() => window.__ms?.state().waiting === "place", null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  for (const [name, [x, z]] of Object.entries(SPOTS)) {
    if (stage !== "middle" && stage !== "festival" && !["street", "yard"].includes(name)) continue;
    await page.evaluate(([x, z]) => window.__ms.game.player.place(x, z, Math.PI), [x, z]);
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `${out}/${stage}-${name}.png` });
  }
  await page.click("[data-test=map]");
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${stage}-map.png` });
  const draws = await page.evaluate(() => window.__ms.game.engine.renderer.info.render.calls);
  console.log(stage, "map draw calls", draws);
  await page.click("[data-test=map]");
}
console.log(errors.length ? "page errors: " + errors.join(" | ") : "no page errors");
await browser.close();
