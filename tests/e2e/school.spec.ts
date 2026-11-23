/**
 * Plays Level 2 (the Classroom) end to end through the real UI at Chromebook
 * size, starting from a save where the shop is finished. Speech goes through
 * the test hook; desks and chairs are real Quick, Draw! drawings; the
 * characters are real held-out handwriting (UJI Pen Characters v2) judged by
 * the real glyph model. On the way: a wrong letter ("b" for "d") and a wrong
 * time ("seven o'clock") get a gentle second chance.
 */
import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type Strokes = number[][][];
const FIX = JSON.parse(fs.readFileSync(new URL("../fixtures/drawings.json", import.meta.url), "utf8")) as Record<string, Strokes>;
const GLYPHS = JSON.parse(fs.readFileSync(new URL("../fixtures/glyphs.json", import.meta.url), "utf8")) as Record<string, Strokes>;

interface Api {
  state(): {
    area: string | null;
    waiting: string;
    steps: string[];
    school: { steps: string[]; slots: string[]; glyphs: string[] };
    model: number;
    glyphModel: number;
    events: string[];
    dialogue: string | null;
    stats: { calls: number };
  };
  say(text: string): boolean;
  clickSlot(id: string): boolean;
  clickPlace(id?: string): boolean;
  writeExample(target: string): boolean;
  drawStrokes(d: { strokes: { color: string; points: [number, number][] }[] }, color?: string): void;
}
const state = (page: Page) => page.evaluate(() => (window as unknown as { __ms: Api }).__ms.state());

const SHOP_DONE = {
  v: 1,
  started: true,
  store: {
    steps: ["pen", "pencils", "shelf", "ken", "crayons", "books", "taro"],
    slots: Object.fromEntries(["pencilCup", "erasers", "scissors", "rulers", "crayons", "books", "notebooks", "schoolbags"].map((k) => [k, { tints: [null, null, null] }]))
  },
  settings: { mic: true, help: "normal", japanese: true, slowVoice: false, music: true, sfx: true, touchpadPen: false }
};

async function put(page: Page, strokes: Strokes, color = "#2f3a75") {
  const d = { strokes: strokes.map((s) => ({ color, points: s.map(([x, y]) => [x, y] as [number, number]) })) };
  await page.evaluate((dd) => (window as unknown as { __ms: Api }).__ms.drawStrokes(dd as never), d);
}

async function step(page: Page, seen: Set<string>) {
  const s = await state(page);
  const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
  if (await page.locator("[data-test=complete-next]").isVisible()) {
    await page.click("[data-test=complete-next]");
    return;
  }
  if (s.waiting === "ask") {
    const cards = (await page.locator(".ask .say-card").allTextContents()).map((c) => c.replace("🔊", "").trim());
    let text: string;
    if (cards.length === 1) text = cards[0];
    else if (!s.school.steps.includes("time")) {
      // Answer the first time question wrongly once: the clock says eight.
      text = seen.has("wrongTime") ? "it's eight o'clock" : "it's seven o'clock";
      seen.add("wrongTime");
    } else text = "it's eight thirty";
    expect(await page.evaluate((t) => (window as unknown as { __ms: Api }).__ms.say(t), text)).toBe(true);
    return;
  }
  if (s.waiting.startsWith("slot:")) {
    const id = s.waiting.slice(5).split(",")[0];
    expect(await page.evaluate((i) => (window as unknown as { __ms: Api }).__ms.clickSlot(i), id)).toBe(true);
    return;
  }
  if (s.waiting === "draw") {
    const word = ((await page.locator(".draw-head .title .word").textContent()) ?? "").trim();
    const writing = await page.locator(".draw-panel.writing").count();
    if (!writing) {
      await put(page, FIX[word === "desk" ? "table" : word]);
      return;
    }
    if (word === "d" && !seen.has("wrongLetter")) {
      seen.add("wrongLetter");
      await put(page, GLYPHS.b);
      return;
    }
    if (GLYPHS[word]) await put(page, GLYPHS[word]);
    else expect(await page.evaluate((w) => (window as unknown as { __ms: Api }).__ms.writeExample(w), word)).toBe(true);
    return;
  }
  if (await next.isVisible()) {
    await next.click({ timeout: 2000 }).catch(() => {});
    return;
  }
  await page.waitForTimeout(120);
}

test("Level 2 can be completed: desks, chairs, the clock, the ABC and the bell", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?e2e=1&speed=5");
  await page.evaluate((s) => localStorage.setItem("ms.save.v1", JSON.stringify(s)), SHOP_DONE);
  await page.reload();
  await page.click("[data-test=continue]");
  await expect.poll(async () => (await state(page)).glyphModel, { timeout: 15000 }).toBe(63);
  await expect.poll(async () => (await state(page)).waiting, { timeout: 15000 }).toBe("place");
  expect(await page.evaluate(() => (window as unknown as { __ms: Api }).__ms.clickPlace("school"))).toBe(true);
  await expect.poll(async () => (await state(page)).area).toBe("school");

  const seen = new Set<string>();
  const t0 = Date.now();
  for (;;) {
    const s = await state(page);
    if (s.school.steps.includes("bell") && !(await page.locator("[data-test=complete-next]").isVisible()) && s.waiting === "" && !s.dialogue) break;
    if (Date.now() - t0 > Number(process.env.MS_PLAY_LIMIT ?? 420_000)) throw new Error("stuck: " + JSON.stringify(s));
    await step(page, seen);
  }
  const s = await state(page);
  expect(s.school.steps).toEqual(["arrive", "desks", "clock", "time", "letters", "bell"]);
  expect(s.school.slots.sort()).toEqual(["chairs", "desks"]);
  expect(s.school.glyphs.sort()).toEqual(["ld", "lg", "lm", "lt", "n12", "n3", "n6", "n9"]);
  expect(s.stats.calls).toBeLessThan(110);
  const events = await page.evaluate(() => (window as unknown as { __ms: { game: { events: string[] } } }).__ms.game.events);
  // "b" for "d" was named, not accepted; real handwriting was accepted by the model (not the pen's help).
  expect(events.some((e) => e.startsWith("write:d:other"))).toBe(true);
  for (const t of ["3", "6", "9", "g", "m", "t"]) expect(events, t).toContain(`write:${t}:accept`);
  expect(errors).toEqual([]);

  // The handwriting survives a reload and the town shows the School restored.
  await page.reload();
  await page.click("[data-test=continue]");
  const after = await state(page);
  expect(after.school.glyphs.length).toBe(8);
  expect(after.school.steps).toContain("bell");
});
