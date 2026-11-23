/**
 * Plays Level 3 (the Zoo) end to end at Chromebook size from a save where the
 * shop and the classroom are finished. Animals and the banana are real
 * Quick, Draw! drawings judged by the real model; bamboo is the hand example
 * (a long thin shape); answers go through the speech matcher.
 */
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Strokes = number[][][];
const FIX = JSON.parse(fs.readFileSync(new URL("../fixtures/drawings.json", import.meta.url), "utf8")) as Record<string, Strokes>;

interface Api {
  state(): { area: string | null; waiting: string; dialogue: string | null; stats: { calls: number } };
  say(text: string): boolean;
  clickSlot(id: string): boolean;
  clickPlace(id?: string): boolean;
  drawExample(word: string): boolean;
  drawStrokes(d: { strokes: { color: string; points: [number, number][] }[] }): void;
  game: { save: { zoo: { steps: string[]; slots: Record<string, unknown> } }; events: string[] };
}
const state = (page: Page) => page.evaluate(() => (window as unknown as { __ms: Api }).__ms.state());
const zoo = (page: Page) => page.evaluate(() => {
  const z = (window as unknown as { __ms: Api }).__ms.game.save.zoo;
  return { steps: z.steps.slice(), slots: Object.keys(z.slots) };
});

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
  },
  settings: { mic: true, help: "normal", japanese: true, slowVoice: false, music: true, sfx: true, touchpadPen: false }
};

async function step(page: Page) {
  const s = await state(page);
  const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
  if (await page.locator("[data-test=complete-next]").isVisible()) {
    await page.click("[data-test=complete-next]");
    return;
  }
  if (s.waiting === "ask") {
    const cards = (await page.locator(".ask .say-card").allTextContents()).map((c) => c.replace("🔊", "").trim());
    const text = cards.length === 1 ? cards[0] : cards.includes("Yes, I do.") ? "yes I do" : "I like pandas";
    expect(await page.evaluate((t) => (window as unknown as { __ms: Api }).__ms.say(t), text), text).toBe(true);
    return;
  }
  if (s.waiting.startsWith("slot:")) {
    const id = s.waiting.slice(5).split(",")[0];
    expect(await page.evaluate((i) => (window as unknown as { __ms: Api }).__ms.clickSlot(i), id)).toBe(true);
    return;
  }
  if (s.waiting === "draw") {
    const word = ((await page.locator(".draw-head .title .word").textContent()) ?? "").trim();
    if (FIX[word]) {
      const d = { strokes: FIX[word].map((st) => ({ color: "#2f3a75", points: st.map(([x, y]) => [x, y] as [number, number]) })) };
      await page.evaluate((dd) => (window as unknown as { __ms: Api }).__ms.drawStrokes(dd as never), d);
    } else expect(await page.evaluate((w) => (window as unknown as { __ms: Api }).__ms.drawExample(w), word), word).toBe(true);
    return;
  }
  if (await next.isVisible()) {
    await next.click({ timeout: 2000 }).catch(() => {});
    return;
  }
  await page.waitForTimeout(120);
}

test("Level 3 can be completed: elephants, monkeys and bananas, pandas and bamboo, penguins, favourite animal", async ({ page }) => {
  // The playthrough takes ~5 min on SwiftShader; the loop below has its own 400 s stuck check.
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?e2e=1&speed=5");
  await page.evaluate((s) => localStorage.setItem("ms.save.v1", JSON.stringify(s)), SAVE);
  await page.reload();
  await page.click("[data-test=continue]");
  await expect.poll(async () => (await state(page)).waiting, { timeout: 20000 }).toBe("place");
  expect(await page.evaluate(() => (window as unknown as { __ms: Api }).__ms.clickPlace("zoo"))).toBe(true);
  await expect.poll(async () => (await state(page)).area).toBe("zoo");
  const t0 = Date.now();
  for (;;) {
    const z = await zoo(page);
    const s = await state(page);
    if (z.steps.includes("favorite") && !(await page.locator("[data-test=complete-next]").isVisible()) && s.waiting === "" && !s.dialogue) break;
    if (Date.now() - t0 > 400_000) throw new Error("stuck: " + JSON.stringify(s) + JSON.stringify(z));
    await step(page);
  }
  const z = await zoo(page);
  expect(z.steps).toEqual(["welcome", "elephants", "monkeys", "pandas", "penguins", "favorite"]);
  expect(z.slots.sort()).toEqual(["bamboo", "bananas", "elephants", "monkeys", "pandas", "penguins"]);
  const events = await page.evaluate(() => (window as unknown as { __ms: Api }).__ms.game.events);
  for (const w of ["elephant", "monkey", "panda", "penguin", "banana"]) expect(events, w).toContain(`verdict:${w}:accept`);
  expect((await state(page)).stats.calls).toBeLessThan(140);
  expect(errors).toEqual([]);
});
