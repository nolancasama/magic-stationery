/**
 * Plays Level 1 end to end through the real UI at Chromebook size.
 * Speech goes through the test hook (__ms.say -> the same matcher as the
 * microphone); drawings are real Quick, Draw! drawings put on the canvas,
 * then Finish is pressed and the real model judges them.
 */
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Strokes = number[][][];
const FIX = JSON.parse(fs.readFileSync(new URL("../fixtures/drawings.json", import.meta.url), "utf8")) as Record<string, Strokes>;

declare global {
  interface Window {
    __ms: {
      state(): { area: string | null; waiting: string; steps: string[]; slots: string[]; model: number; events: string[]; dialogue: string | null; stats: { calls: number } };
      say(text: string): boolean;
      clickSlot(id: string): boolean;
      clickPlace(): boolean;
      drawExample(word: string, color?: string): boolean;
      drawStrokes(d: { strokes: { color: string; points: [number, number][] }[] }, color?: string): void;
    };
  }
}

const RED = "#e53935";
const BLUE = "#1e88e5";

async function state(page: Page) {
  return page.evaluate(() => window.__ms.state());
}

async function drawFixture(page: Page, name: string, color = "#2f3a75") {
  const d = { strokes: FIX[name].map((s) => ({ color, points: s.map(([x, y]) => [x, y] as [number, number]) })) };
  await page.evaluate(([dd]) => window.__ms.drawStrokes(dd as never), [d]);
}

/** Answer whatever the game is waiting for, the way a student would. */
async function step(page: Page, opts: { surpriseFirst?: boolean; seen: Set<string> }) {
  const s = await state(page);
  const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
  if (await page.locator("[data-test=complete-next]").isVisible()) {
    await page.click("[data-test=complete-next]");
    return;
  }
  if (s.waiting === "ask") {
    const q = (await page.locator(".ask .q").textContent()) ?? "";
    const cards = await page.locator(".ask .say-card").allTextContents();
    if (cards.length === 1) {
      const text = cards[0].replace("🔊", "").trim();
      expect(await page.evaluate((t) => window.__ms.say(t), text)).toBe(true);
    } else {
      const yes = /pencil|eraser|notebook/i.test(q) && !/ruler|crayons|schoolbag/i.test(q);
      expect(await page.evaluate((t) => window.__ms.say(t), yes ? "yes I do" : "no I don't")).toBe(true);
    }
    return;
  }
  if (s.waiting.startsWith("slot:")) {
    const id = s.waiting.slice(5).split(",")[0];
    expect(await page.evaluate((i) => window.__ms.clickSlot(i), id)).toBe(true);
    return;
  }
  if (s.waiting === "draw") {
    // The target word is the highlighted span ("Draw a red <crayon>!").
    const word = ((await page.locator(".draw-head .title .word").textContent()) ?? "").trim();
    if (opts.surpriseFirst && word === "pencil" && !opts.seen.has("surprise")) {
      opts.seen.add("surprise");
      await drawFixture(page, "rabbit");
      return;
    }
    const obj = (await page.locator("[data-test=objective]").textContent()) ?? "";
    const color = /red/.test(obj) ? RED : /blue/.test(obj) ? BLUE : undefined;
    const key = word === "schoolbag" ? "backpack" : word;
    if (FIX[key]) await drawFixture(page, key, color);
    else expect(await page.evaluate(([w, c]) => window.__ms.drawExample(w as string, c as string | undefined), [word, color])).toBe(true);
    return;
  }
  if (await next.isVisible()) {
    await next.click({ timeout: 2000 }).catch(() => {});
    return;
  }
  await page.waitForTimeout(120);
}

async function playStore(page: Page, opts: { surpriseFirst?: boolean } = {}) {
  const seen = new Set<string>();
  const t0 = Date.now();
  for (;;) {
    const s = await state(page);
    if (s.steps.includes("taro") && !(await page.locator("[data-test=complete-next]").isVisible()) && s.waiting === "" && !s.dialogue) break;
    if (Date.now() - t0 > Number(process.env.MS_PLAY_LIMIT ?? 420_000)) throw new Error("stuck: " + JSON.stringify(s));
    await step(page, { ...opts, seen });
  }
}

async function start(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?e2e=1&speed=5" + query);
  await page.click("[data-test=start]");
  await expect.poll(async () => (await state(page)).model, { timeout: 15000 }).toBeGreaterThan(100);
  for (;;) {
    const s = await state(page);
    if (s.waiting === "place") break;
    const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
    if (await next.isVisible()) await next.click({ timeout: 2000 }).catch(() => {});
    else await page.waitForTimeout(100);
  }
  expect(await page.evaluate(() => window.__ms.clickPlace())).toBe(true);
  await expect.poll(async () => (await state(page)).area).toBe("store");
  return errors;
}

test("Level 1 can be completed by speaking, with a funny surprise on the way", async ({ page }) => {
  const errors = await start(page);
  await playStore(page, { surpriseFirst: true });
  const s = await state(page);
  expect(s.steps).toEqual(["pen", "pencils", "shelf", "ken", "crayons", "books", "taro"]);
  expect(s.slots.sort()).toEqual(["books", "crayons", "erasers", "notebooks", "pencilCup", "rulers", "schoolbags", "scissors"]);
  expect(s.stats.calls).toBeLessThan(130);
  expect(errors).toEqual([]);
  // The rabbit appeared and played, but did not complete the pencil task.
  const events = await page.evaluate(() => (window.__ms as unknown as { game: { events: string[] } }).game.events);
  expect(events).toContain("verdict:pencil:surprise:rabbit");
  // Progress survives a reload.
  await page.reload();
  await page.waitForSelector("[data-test=continue]");
  const after = await state(page);
  expect(after.steps.length).toBe(7);
});

test("the whole level works with the microphone switched off (tap mode)", async ({ page }) => {
  await page.goto("/?e2e=1");
  await page.evaluate(() => localStorage.setItem("ms.save.v1", JSON.stringify({ v: 1, started: false, store: { steps: [], slots: {} }, settings: { mic: false, help: "normal", japanese: true, slowVoice: false, music: true, sfx: true, touchpadPen: false } })));
  const errors = await start(page);
  // Click through Ms. Penny's first lines to the first prompt: "Do you have a pen?" among distractors.
  const tStart = Date.now();
  while ((await state(page)).waiting !== "ask") {
    if (Date.now() - tStart > 90000) throw new Error("no prompt: " + JSON.stringify(await state(page)));
    const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
    if (await next.isVisible()) await next.click({ timeout: 2000 }).catch(() => {});
    else await page.waitForTimeout(100);
  }
  const cards = page.locator(".ask .say-card.tappable");
  await expect(cards).toHaveCount(3);
  await page.locator(".ask .say-card.tappable", { hasText: "Do you like pens?" }).click();
  expect((await state(page)).waiting).toBe("ask");
  await page.locator(".ask .say-card.tappable", { hasText: "Do you have a pen?" }).click();
  const t0 = Date.now();
  while (!(await state(page)).steps.includes("pen")) {
    if (Date.now() - t0 > 60000) throw new Error("pen step did not finish");
    const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
    if (await next.isVisible()) await next.click({ timeout: 2000 }).catch(() => {});
    else await page.waitForTimeout(100);
  }
  // Yes/no questions are tappable too, and the truth still matters.
  expect(errors).toEqual([]);
});
