// Screenshot pass for the handoff's unchecked items: town with the zoo open,
// students seated, the classroom door, the Class 4-1 sign (inside and outside).
// Usage: node scripts/pass-shots.mjs <baseUrl> <outDir>   (e.g. http://127.0.0.1:4181/ .tmp/shots/pass)
import { chromium } from "@playwright/test";
import fs from "node:fs";

const [base, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

// 1. Town after the shop and the classroom are finished: the zoo should be open.
const art = { w: 10, h: 10, lw: 9, strokes: [{ c: "#2f3a75", p: [0, 0, 5, 5] }] };
const SAVE = {
  v: 1,
  started: true,
  store: {
    steps: ["pen", "pencils", "shelf", "ken", "crayons", "books", "taro"],
    slots: Object.fromEntries(["pencilCup", "erasers", "scissors", "rulers", "crayons", "books", "notebooks", "schoolbags"].map((k) => [k, { tints: [null, null, null] }]))
  },
  school: {
    steps: ["arrive", "desks", "clock", "time", "letters", "bell"],
    slots: { desks: { tints: [null, null, null, null] }, chairs: { tints: [null, null, null, null] } },
    glyphs: Object.fromEntries(["n12", "n3", "n6", "n9", "ld", "lg", "lm", "lt"].map((k) => [k, art]))
  }
};
await page.goto(base + "?e2e=1");
await page.evaluate((s) => localStorage.setItem("ms.save.v1", JSON.stringify(s)), SAVE);
await page.reload();
await page.click("[data-test=continue]");
await page.waitForFunction(() => window.__ms?.state().waiting === "place", null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/town.png` });

// 2. The classroom once class has started: students seated, clock at 8:30.
await page.evaluate(() => localStorage.clear());
await page.goto(base + "?e2e=1&scene=school&fill=1");
await page.waitForFunction(() => !!window.__ms?.game.room, null, { timeout: 30000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const g = window.__ms.game;
  const SEATS = [{ x: -0.35, z: -0.75 }, { x: 1.75, z: -0.75 }, { x: -0.35, z: 0.95 }];
  ["ken", "yui", "taro"].forEach((id) => g.stopAmbient(id));
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.__ms.game;
  const SEATS = [{ x: -0.35, z: -0.75 }, { x: 1.75, z: -0.75 }, { x: -0.35, z: 0.95 }];
  ["ken", "yui", "taro"].forEach((id, i) => {
    const c = g.cast[id];
    c.place(SEATS[i].x, SEATS[i].z + 0.62, Math.PI);
    c.setBase("sit");
  });
  g.school.setTime(8, 30);
});
await page.waitForTimeout(1200);
const shot = async (name, pos, look) => {
  await page.evaluate(({ pos, look }) => {
    const g = window.__ms.game;
    const p = g.engine.goalPos.clone().set(...pos);
    g.engine.setLensShift(0);
    g.engine.focus(p, p.clone().set(...look), true);
  }, { pos, look });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png` });
};
await shot("class-overview", [0.25, 6.7, 9.7], [0.15, 1.3, -0.95]);
await shot("class-seated", [0.4, 3.2, 4.9], [0.0, 1.2, -1.4]);
await shot("class-seated-close", [0.9, 1.7, 3.6], [0.6, 0.6, 0.0]);
await shot("class-seated-side", [-3.2, 1.6, 1.0], [0.8, 0.6, 0.2]);
await shot("class-door", [1.6, 2.6, 4.6], [3.6, 1.0, 1.4]);
await shot("sign-inside", [2.0, 2.4, 1.7], [4.5, 2.75, 1.7]);
await shot("sign-outside", [7.4, 2.3, 1.7], [4.5, 2.5, 1.7]);
console.log(errors.join("\n") || "no errors");
await browser.close();
