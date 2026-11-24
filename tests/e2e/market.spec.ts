import { expect, test, type Page } from "@playwright/test";
import {
  GLYPH_KEYS, SCHOOL_SLOT_KEYS, SCHOOL_STEPS, SLOT_KEYS, STORE_STEPS, ZOO_SLOT_KEYS, ZOO_STEPS
} from "../../src/game/save.ts";

interface MarketApi {
  state(): { area: string | null; waiting: string; dialogue: string | null; model: number };
  say(text: string): boolean;
  clickSlot(id: string): boolean;
  clickPlace(id: string): boolean;
  drawExample(word: string, color?: string): boolean;
  game: { save: { market: { steps: string[]; slots: Record<string, { arts?: unknown[] }> } }; events: string[] };
}

const state = (page: Page) => page.evaluate(() => (window.__ms as unknown as MarketApi).state());
const art = { w: 10, h: 10, lw: 9, strokes: [{ c: "#2f3a75", p: [0, 0, 5, 5] }] };
const filled = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, { tints: [null] }]));
const SAVE = {
  v: 1,
  started: true,
  store: { steps: STORE_STEPS, slots: filled(SLOT_KEYS) },
  school: { steps: SCHOOL_STEPS, slots: filled(SCHOOL_SLOT_KEYS), glyphs: Object.fromEntries(GLYPH_KEYS.map((k) => [k, art])) },
  zoo: { steps: ZOO_STEPS, slots: filled(ZOO_SLOT_KEYS) },
  settings: { mic: true, help: "normal", japanese: true, slowVoice: false, music: true, sfx: true, touchpadPen: false }
};
const COLORS: Record<string, string> = { orange: "#fb8c00", tomato: "#e53935" };

test("Level 4 restores the market and accepts each handoff on the first answer", async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?e2e=1&speed=5");
  await page.evaluate((s) => localStorage.setItem("ms.save.v1", JSON.stringify(s)), SAVE);
  await page.reload();
  await page.click("[data-test=continue]");
  await expect.poll(async () => (await state(page)).model, { timeout: 20000 }).toBeGreaterThan(100);
  await expect.poll(async () => (await state(page)).waiting, { timeout: 20000 }).toBe("place");
  expect(await page.evaluate(() => (window.__ms as unknown as MarketApi).clickPlace("market"))).toBe(true);
  await expect.poll(async () => (await state(page)).area).toBe("market");

  const picks = new Map<string, number>();
  const counts: number[] = [];
  const orderQuestions = ["What do you want?", "How many?", "Here you are."];
  const answers = [
    "Hello!", ...orderQuestions, ...orderQuestions, ...orderQuestions, ...orderQuestions,
    "I want eggs, please.", "Three, please.", "Thank you."
  ];
  const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
  const objective = page.locator("[data-test=objective]:not(.hidden)");
  const say = (s: string) => page.evaluate((text) => (window.__ms as unknown as MarketApi).say(text), s);
  const album = page.locator("[data-test=complete-next]");
  const deadline = Date.now() + 400_000;
  while (!(await album.isVisible())) {
    const s = await state(page);
    if (Date.now() > deadline) throw new Error("Stuck at " + JSON.stringify(s));
    if (s.waiting === "ask") {
      const cards = (await page.locator(".ask .say-card").allTextContents()).map((c) => c.replace("🔊", "").trim());
      const text = answers.shift();
      if (!text) throw new Error("Unexpected prompt with cards " + cards.join(", "));
      // MS_SHOTS=<dir>: screenshots for a visual pass (the full basket's prompt, Mr. Green at the display).
      if (process.env.MS_SHOTS && (text === "Here you are." || text === "Thank you.")) {
        await page.screenshot({ path: `${process.env.MS_SHOTS}/ask-${text.replace(/\W+/g, "")}-${counts.length}.png` });
      }
      expect(cards).toContain(text);
      expect(await say(text)).toBe(true);
      if (text === "Here you are.") {
        expect(await say(text)).toBe(false);
        counts.push(picks.size);
      }
    } else if (s.waiting.startsWith("slot:")) {
      const id = s.waiting.slice(5);
      // The objective can hide between the check and the read (the prompt opening): never wait on it.
      const goal = (await objective.first().isVisible()) ? ((await objective.first().textContent({ timeout: 500 }).catch(() => "")) ?? "") : "";
      const count = goal.match(/(\d+) \/ (\d+)/);
      if (count) {
        const alreadyPicked = picks.get(id) ?? 0;
        if (alreadyPicked === 0) {
          expect(count[1]).toBe("0");
          expect(await say("Here you are.")).toBe(false);
          await expect(page.locator(".ask")).toBeHidden();
        }
        if (alreadyPicked >= Number(count[2])) {
          await page.waitForTimeout(120);
          continue;
        }
        // The idle hint (8 s, sped up in e2e) can end the wait between the read and the click: retry.
        if (!(await page.evaluate((key) => window.__ms.clickSlot(key), id))) continue;
        picks.set(id, alreadyPicked + 1);
        if (process.env.MS_SHOTS && alreadyPicked === 1) {
          await page.waitForTimeout(400);
          await page.screenshot({ path: `${process.env.MS_SHOTS}/count-${id}.png` });
        }
        continue;
      }
      // A wait that ended under us (the end of counting) is re-read; a click that never lands stalls to the deadline.
      if (!(await page.evaluate((key) => window.__ms.clickSlot(key), id))) await page.waitForTimeout(120);
    } else if (s.waiting === "draw") {
      const word = ((await page.locator(".draw-head .title .word").textContent()) ?? "").trim();
      expect(await page.evaluate(([w, color]) => window.__ms.drawExample(w, color), [word, COLORS[word]])).toBe(true);
    } else if (await next.isVisible()) {
      await next.click({ timeout: 2000 }).catch(() => {});
    } else {
      await page.waitForTimeout(120);
    }
  }
  await album.click();
  await expect(objective).toContainText("The supermarket is open!");
  expect(answers).toEqual([]);
  expect(counts).toEqual([1, 2, 3, 4]);
  expect(Object.fromEntries(picks)).toEqual({ apples: 3, oranges: 2, tomatoes: 4, eggs: 5 });
  const progress = await page.evaluate(() => {
    const { save, events } = (window.__ms as unknown as MarketApi).game;
    return {
      steps: save.market.steps,
      drawn: Object.keys(save.market.slots).filter((id) => save.market.slots[id].arts?.length).sort(),
      handoffs: events.filter((event) => event === "said:hereYouAre").length
    };
  });
  expect(progress.steps).toEqual(["greet", "apples", "oranges", "vegetables", "fridge", "shopping"]);
  expect(progress.drawn).toEqual(["apples", "carrots", "eggs", "milk", "oranges", "tomatoes"]);
  expect(progress.handoffs).toBe(4);
  expect(errors).toEqual([]);
});
