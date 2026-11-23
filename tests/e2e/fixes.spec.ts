/**
 * Behaviour checks for the fix pass, in the real game at Chromebook size:
 * - slow time answers through the real prompt + recogniser wrapper, with a
 *   scripted fake SpeechRecognition (pauses, browser cutting the session short);
 * - WASD / arrow movement (camera-relative, blocked by furniture and people),
 *   click-to-move still working, keys ignored while drawing;
 * - pen widths in the drawing panel, kept per stroke;
 * - the shopkeeper's head turning towards the player from different sides.
 */
import { expect, test, type Page } from "@playwright/test";

type Step = { at: number; text?: string; final?: boolean; end?: boolean };

/** A fake recogniser that plays `window.__speech` (results at times, optionally ending early like a non-continuous browser). */
async function installFakeSpeech(page: Page) {
  await page.addInitScript(() => {
    class FakeRec {
      lang = "";
      interimResults = true;
      maxAlternatives = 1;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onaudiostart: (() => void) | null = null;
      onaudioend = null;
      onsoundstart = null;
      onsoundend = null;
      onspeechstart = null;
      onspeechend = null;
      private timers: number[] = [];
      private done = false;
      start() {
        const w = window as unknown as { __speech: Step[][]; __sessions: { continuous: boolean }[] };
        w.__sessions = w.__sessions ?? [];
        w.__sessions.push({ continuous: this.continuous });
        const script = w.__speech.shift() ?? [];
        const results: { transcript: string; isFinal: boolean }[] = [];
        this.onaudiostart?.();
        for (const s of script) {
          this.timers.push(
            window.setTimeout(() => {
              if (this.done) return;
              if (s.end) return this.finish();
              const last = results[results.length - 1];
              if (last && !last.isFinal) results.pop();
              results.push({ transcript: s.text ?? "", isFinal: !!s.final });
              const list = results.map((r) => Object.assign([{ transcript: r.transcript }], { isFinal: r.isFinal }));
              this.onresult?.({ resultIndex: list.length - 1, results: list });
            }, s.at)
          );
        }
      }
      private finish() {
        if (this.done) return;
        this.done = true;
        this.timers.forEach((t) => window.clearTimeout(t));
        this.onend?.();
      }
      stop() {
        window.setTimeout(() => this.finish(), 30);
      }
      abort() {
        this.finish();
      }
    }
    // Replace both names: Chromium 153+ has a native unprefixed SpeechRecognition, which the game
    // prefers. Faking only the webkit one let the real recogniser run, hear silence, and never answer.
    const w = window as unknown as { SpeechRecognition: unknown; webkitSpeechRecognition: unknown };
    w.SpeechRecognition = FakeRec;
    w.webkitSpeechRecognition = FakeRec;
  });
}

interface Api {
  game: {
    asker: { ask(spec: unknown): Promise<string> };
    player: { position: { x: number; z: number }; drive: { x: number; y: number } };
    cast: Record<string, { position: { x: number; z: number }; heading: number; head: { rotation: { y: number } }; lookTarget: unknown }>;
    draw: { open(spec: unknown): void; next(): Promise<unknown>; isOpen: boolean; drawing: { strokes: { width?: number }[] }; canvasRect: DOMRect };
    room: unknown;
    canWalk: boolean;
  };
}

async function openStore(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?e2e=1&scene=store" + query);
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __ms?: Api }).__ms?.game.room), { timeout: 15000 }).toBe(true);
  await page.waitForTimeout(800);
  return errors;
}

/** Ask the 8:30 question through the real prompt, press the mic, and return the answer. */
async function answerTime(page: Page, sessions: Step[][], hintNow = false) {
  await page.evaluate((s) => ((window as unknown as { __speech: Step[][] }).__speech = s), sessions);
  const started = () => page.evaluate(() => (window as unknown as { __sessions?: unknown[] }).__sessions?.length ?? 0);
  const before = await started();
  const answer = page.evaluate(
    (hintNow) =>
      (window as unknown as { __ms: Api }).__ms.game.asker.ask({
        kind: "choice",
        options: ["itsEight", "itsEightThirty"],
        hint: { en: "Try saying “eight thirty” together.", ja: "「エイト・サーティ」を つなげて いってみよう！", say: "Eight thirty." },
        hintNow
      }),
    hintNow
  );
  await page.click("[data-test=mic]");
  // Fail fast if the scripted recogniser is not the one listening (a real one waits for a voice forever).
  await expect.poll(started, { timeout: 3000, message: "the fake recogniser was not started" }).toBeGreaterThan(before);
  return answer;
}

test.describe("slow time answers (8:30)", () => {
  // Each answer takes a few seconds; a stalled prompt should fail the test, not the whole run.
  test.describe.configure({ timeout: 60_000 });
  test.beforeEach(async ({ page }) => {
    await installFakeSpeech(page);
  });

  const said = (...parts: [number, string, boolean?][]): Step[] => parts.map(([at, text, final]) => ({ at, text, final: final ?? true }));

  test("normal speed, with and without It's", async ({ page }) => {
    await openStore(page);
    expect(await answerTime(page, [said([300, "it's eight thirty"])])).toBe("itsEightThirty");
    expect(await answerTime(page, [said([300, "eight thirty"])])).toBe("itsEightThirty");
    expect(await answerTime(page, [said([300, "8:30"])])).toBe("itsEightThirty");
  });

  test("slowly, with a short pause and with a longer pause", async ({ page }) => {
    await openStore(page);
    // "eight" (final) ... 1.2 s ... "thirty"
    expect(await answerTime(page, [said([300, "eight"], [1500, "thirty"])])).toBe("itsEightThirty");
    // "it's" ... "eight" ... 2.5 s ... "thirty"
    expect(await answerTime(page, [said([300, "it's", false], [700, "it's eight"], [3200, "thirty"])])).toBe("itsEightThirty");
  });

  test("the browser stops listening after 'eight': the next words are joined on", async ({ page }) => {
    await openStore(page);
    const sessions = [[{ at: 300, text: "eight", final: true }, { at: 600, end: true }], said([900, "thirty"])];
    expect(await answerTime(page, sessions)).toBe("itsEightThirty");
    const s = await page.evaluate(() => (window as unknown as { __sessions: { continuous: boolean }[] }).__sessions.length);
    expect(s).toBe(2);
  });

  test("'eight' alone, then quiet, is taken as eight o'clock (the truth check decides)", async ({ page }) => {
    await openStore(page);
    const t0 = Date.now();
    expect(await answerTime(page, [said([300, "eight"])])).toBe("itsEight");
    // It waited for a possible "thirty" first.
    expect(Date.now() - t0).toBeGreaterThan(2800);
  });

  test("after a miss the tip with a listen button appears, and the next try still works", async ({ page }) => {
    await openStore(page);
    await page.evaluate(() => ((window as unknown as { __speech: Step[][] }).__speech = [[{ at: 300, text: "banana", final: true }], [{ at: 300, text: "it's eight thirty", final: true }]]));
    const answer = page.evaluate(() => (window as unknown as { __ms: Api }).__ms.game.asker.ask({ kind: "choice", options: ["itsEight", "itsEightThirty"], hint: { en: "Try saying “eight thirty” together.", ja: "x", say: "Eight thirty." } }));
    await expect(page.locator("[data-test=ask-hint]")).toBeHidden();
    await page.click("[data-test=mic]");
    await expect(page.locator("[data-test=ask-hint]")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("[data-test=ask-hint]")).toContainText("eight thirty");
    await expect(page.locator("[data-test=ask-hint-listen]")).toBeVisible();
    await page.click("[data-test=mic]");
    expect(await answer).toBe("itsEightThirty");
  });

  test("three misses make the sentences tappable, and a tap answers", async ({ page }) => {
    await openStore(page);
    await page.evaluate(() => {
      const w = window as unknown as { __speech: Step[][]; __states: string[]; __ms: { game: { asker: { onSession: ((s: string) => void) | null } } } };
      w.__speech = [0, 1, 2].map(() => [{ at: 300, text: "banana", final: true }]);
      w.__states = [];
      w.__ms.game.asker.onSession = (s) => w.__states.push(s);
    });
    const answer = page.evaluate(() => (window as unknown as { __ms: Api }).__ms.game.asker.ask({ kind: "choice", options: ["itsEight", "itsEightThirty"] }));
    const misses = () => page.evaluate(() => (window as unknown as { __states: string[] }).__states.filter((s) => s === "miss").length);
    for (let i = 1; i <= 3; i++) {
      // After the second miss the sentences are read aloud first; the click waits for the mic to come back.
      await page.click("[data-test=mic]");
      await expect.poll(misses, { timeout: 15000 }).toBe(i);
    }
    await expect(page.locator("[data-test=mic]")).toBeHidden();
    await page.click('.say-card.tappable[data-phrase="itsEightThirty"]');
    expect(await answer).toBe("itsEightThirty");
  });
});

test("WASD and arrows move the player, furniture and people block, clicks still work, keys ignored while drawing", async ({ page }) => {
  const errors = await openStore(page);
  const pos = () => page.evaluate(() => ({ ...(window as unknown as { __ms: Api }).__ms.game.player.position }));
  expect(await page.evaluate(() => (window as unknown as { __ms: Api }).__ms.game.canWalk)).toBe(true);
  const start = await pos();
  // W walks away from the camera (towards the back wall: -z).
  await page.keyboard.down("w");
  await page.waitForTimeout(700);
  await page.keyboard.up("w");
  const afterW = await pos();
  expect(afterW.z).toBeLessThan(start.z - 0.4);
  // Smooth stop: it glides a little after release, then stops.
  await page.waitForTimeout(500);
  const settled = await pos();
  await page.waitForTimeout(300);
  expect(Math.hypot(settled.x - (await pos()).x, settled.z - (await pos()).z)).toBeLessThan(0.01);
  // Arrow left moves left (-x). W stopped the player on the display table's rounded corner,
  // so this also checks gliding round a corner instead of sticking to it.
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(600);
  await page.keyboard.up("ArrowLeft");
  expect((await pos()).x).toBeLessThan(settled.x - 0.3);
  // Holding W for long never passes the counter / back wall.
  await page.keyboard.down("w");
  await page.waitForTimeout(3500);
  await page.keyboard.up("w");
  expect((await pos()).z).toBeGreaterThan(-2.95 + 0.2);
  // People block: walk straight at Ms. Penny from in front of her.
  await page.evaluate(() => {
    const g = (window as unknown as { __ms: { game: Record<string, any> } }).__ms.game;
    g.player.place(-3.5, -0.2 + 0, 0);
    g.cast.penny.place(1.0, 1.6, 0);
    g.player.place(1.0, 2.6, Math.PI);
  });
  await page.keyboard.down("w");
  await page.waitForTimeout(1500);
  await page.keyboard.up("w");
  const p = await pos();
  expect(Math.hypot(p.x - 1.0, p.z - 1.6)).toBeGreaterThan(0.45);
  // Clicking the floor still walks there.
  const box = await page.locator("canvas").first().boundingBox();
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) * 0.3, (box?.y ?? 0) + (box?.height ?? 0) * 0.8);
  await page.waitForTimeout(1600);
  const clicked = await pos();
  expect(Math.hypot(clicked.x - p.x, clicked.z - p.z)).toBeGreaterThan(0.5);
  // While the drawing panel is open, W types nothing and moves no one.
  await page.evaluate(() => (window as unknown as { __ms: Api }).__ms.game.draw.open({ word: "pencil", wordWithArticle: "a pencil", ja: "えんぴつ", help: 0, example: null, touchpadPen: false }));
  const before = await pos();
  await page.keyboard.down("w");
  await page.waitForTimeout(500);
  await page.keyboard.up("w");
  const after = await pos();
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(0.01);
  expect(errors).toEqual([]);
});

test("pen widths: four sizes, selected one marked, each line keeps its own width", async ({ page }) => {
  await openStore(page);
  await page.evaluate(() => {
    const d = (window as unknown as { __ms: Api }).__ms.game.draw;
    d.open({ word: "pencil", wordWithArticle: "a pencil", ja: "えんぴつ", help: 0, example: null, touchpadPen: false });
    // A level script always waits for the drawing; the panel only takes input while someone does.
    void d.next();
  });
  await expect(page.locator(".width-btn")).toHaveCount(4);
  await expect(page.locator("[data-test=width-medium]")).toHaveClass(/sel/);
  const r = await page.locator("[data-test=draw-canvas]").boundingBox();
  if (!r) throw new Error("no canvas");
  const line = async (y: number) => {
    await page.mouse.move(r.x + 60, r.y + y);
    await page.mouse.down();
    await page.mouse.move(r.x + 200, r.y + y, { steps: 8 });
    await page.mouse.move(r.x + 340, r.y + y, { steps: 8 });
    await page.mouse.up();
  };
  for (const [key, y] of [["thin", 60], ["medium", 110], ["thick", 170], ["extra", 240]] as const) {
    await page.click(`[data-test=width-${key}]`);
    await expect(page.locator(`[data-test=width-${key}]`)).toHaveClass(/sel/);
    await line(y);
  }
  const widths = await page.evaluate(() => (window as unknown as { __ms: Api }).__ms.game.draw.drawing.strokes.map((s) => s.width ?? 9));
  expect(widths).toEqual([5, 9, 16, 26]);
  // Undo removes the last line only.
  await page.click("[data-test=draw-undo]");
  expect(await page.evaluate(() => (window as unknown as { __ms: Api }).__ms.game.draw.drawing.strokes.length)).toBe(3);
  await page.screenshot({ path: "test-results/pen-widths.png" });
});

test("the shopkeeper looks at the player from different sides, turning her head before her body", async ({ page }) => {
  await openStore(page);
  const check = async (x: number, z: number) => {
    await page.evaluate(([px, pz]) => (window as unknown as { __ms: { game: { player: { place(a: number, b: number, c: number): void } } } }).__ms.game.player.place(px, pz, 0), [x, z]);
    await page.waitForTimeout(1500);
    return page.evaluate(([px, pz]) => {
      const p = (window as unknown as { __ms: Api }).__ms.game.cast.penny;
      const gaze = p.heading + p.head.rotation.y;
      const want = Math.atan2(px - p.position.x, pz - p.position.z);
      let d = gaze - want;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return { err: Math.abs(d), body: p.heading };
    }, [x, z]);
  };
  // In front of the counter, slightly left, slightly right, and far round to the side.
  for (const [x, z] of [[-2.75, 0.05], [-3.6, 0.3], [-1.9, 0.1]]) {
    const r = await check(x, z);
    expect(r.err, `${x},${z}`).toBeLessThan(0.25);
    // Small moves: her body stays facing the shop.
    expect(Math.abs(r.body), `${x},${z}`).toBeLessThan(0.2);
  }
  const side = await check(-1.4, -1.6);
  expect(side.err).toBeLessThan(0.3);
  expect(Math.abs(side.body)).toBeGreaterThan(0.4);
});
