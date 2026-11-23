// Close-ups of every character, one at a time (front, three-quarter, side, back-top),
// to inspect hats, hair, glasses and held items:
//   node scripts/cast-shots.mjs [baseUrl] [outDir] [holding]
// holding=1: each character holds a pencil, then a ruler, in a "give" pose.
import { chromium } from "@playwright/test";
import fs from "node:fs";
const base = process.argv[2] ?? "http://127.0.0.1:4181/";
const out = process.argv[3] ?? ".tmp/cast-shots";
const holding = process.argv[4] === "1";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(base + "?e2e=1&scene=store");
await page.waitForTimeout(2500);
const ids = ["penny", "mori", "ken", "yui", "taro", "player"];
const X = 0.8, Z = 1.9;
const cam = (pos, look) => page.evaluate(({ pos, look }) => {
  const g = window.__ms.game;
  const p = g.engine.goalPos.clone().set(...pos);
  g.engine.setLensShift(0);
  g.engine.focus(p, p.clone().set(...look), true);
}, { pos, look });
for (const id of ids) {
  for (const item of holding ? ["pencil", "ruler"] : [null]) {
    const s = await page.evaluate(async ({ id, ids, X, Z, item }) => {
      const g = window.__ms.game;
      for (const o of ids) {
        const c = o === "player" ? g.player : g.cast[o];
        g.inRoom(c);
        g.dropFromHand(c);
        c.place(o === id ? X : -30, o === id ? Z : -30, 0);
        c.setBase("idle");
      }
      const c = id === "player" ? g.player : g.cast[id];
      if (item) {
        await g.giveTo(c, item, c.position.clone().setY(1.6));
        c.emote("give", 999);
      } else c.emote("idle", 0.01);
      return c.look.scale ?? 1;
    }, { id, ids, X, Z, item });
    await page.waitForTimeout(900);
    const hy = 1.0 * s;
    const views = item
      ? [[`hold-${item}-front`, [X + 0.5, 0.95 * s, Z + 1.9], [X, 0.6 * s, Z]], [`hold-${item}-side`, [X + 1.9, 0.9 * s, Z + 0.5], [X, 0.6 * s, Z]]]
      : [["front", [X, hy + 0.05, Z + 1.6 * s], [X, hy, Z]], ["three-quarter", [X + 1.1 * s, hy + 0.2, Z + 1.1 * s], [X, hy, Z]], ["side", [X + 1.6 * s, hy + 0.05, Z], [X, hy, Z]], ["back-top", [X - 0.6 * s, hy + 1.0 * s, Z - 1.1 * s], [X, hy, Z]]];
    for (const [name, pos, look] of views) {
      await cam(pos, look);
      await page.waitForTimeout(200);
      await page.screenshot({ path: `${out}/${id}-${name}.png`, clip: { x: 433, y: 134, width: 500, height: 500 } });
    }
  }
}
console.log(errors.join("\n") || "no errors");
await browser.close();
