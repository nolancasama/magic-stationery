/** Play Level 5 from an unlocked save, using the gym drawing fixtures and a fake browser recogniser. */
import { expect, test, type Page } from "@playwright/test";
import type { Game, NpcId } from "../../src/game/game.ts";
import {
  defaults, GLYPH_KEYS, MARKET_SLOT_KEYS, MARKET_STEPS, SCHOOL_STEPS, SLOT_KEYS,
  STORE_STEPS, ZOO_SLOT_KEYS, ZOO_STEPS
} from "../../src/game/save.ts";
import { WORDS, type WordId } from "../../src/recognition/vocab.ts";

type Framing = ReturnType<Game["npcFraming"]>;
interface TestWindow {
  __ms: {
    game: Game;
    state(): { area: string | null; waiting: string; dialogue: string | null };
    clickPlace(id: "gym" | "market"): boolean;
    clickSlot(id: string): boolean;
    drawExample(word: WordId): boolean;
  };
  gymSpeech: string;
  gymEntrances: { who: NpcId; line: string; framing: Framing }[];
  gymFinale: Framing[];
}

const drawnWords = ["soccerBall", "basketball", "hoop", "racket", "bat"] as const;
const fixtures = new Map(drawnWords.map((word) => [WORDS[word].en, word]));
const answers = [
  ["hello", "Hello!"],
  ["letsYes", "Yes, let's!"],
  ["likeYes", "Yes, I do."],
  ["iLikeBasketball", "I like basketball."],
  ["letsYes", "Yes, let's!"],
  ["whatSport", "What sport do you like?"],
  ["letsPlay", "Let's play!"]
] as const;

const art = { w: 10, h: 10, lw: 9, strokes: [{ c: "#2f3a75", p: [0, 0, 5, 5] }] };
const slots = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, { tints: [null, null, null] }]));
const save = {
  ...defaults(),
  started: true,
  store: { steps: STORE_STEPS, slots: slots(SLOT_KEYS) },
  school: {
    steps: SCHOOL_STEPS,
    slots: slots(["desks", "chairs"]),
    glyphs: Object.fromEntries(GLYPH_KEYS.map((key) => [key, art]))
  },
  zoo: { steps: ZOO_STEPS, slots: slots(ZOO_SLOT_KEYS) },
  market: { steps: MARKET_STEPS, slots: slots(MARKET_SLOT_KEYS) }
};

async function installFakeSpeech(page: Page) {
  await page.addInitScript(() => {
    class FakeRecognition {
      onresult?: (event: unknown) => void;
      onend?: () => void;
      private timer = 0;

      start() {
        const transcript = (window as unknown as TestWindow).gymSpeech;
        this.timer = window.setTimeout(() => {
          const result = Object.assign([{ transcript }], { isFinal: true });
          this.onresult?.({ resultIndex: 0, results: [result] });
        }, 50);
      }

      stop() {
        this.abort();
        this.onend?.();
      }

      abort() {
        window.clearTimeout(this.timer);
      }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
  });
}

const state = (page: Page) => page.evaluate(() => (window as unknown as TestWindow).__ms.state());

test("Level 5 restores the gym and starts the sports festival", async ({ page }) => {
  test.setTimeout(480_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installFakeSpeech(page);
  await page.goto("/?e2e=1&speed=5");
  await page.evaluate((data) => localStorage.setItem("ms.save.v1", JSON.stringify(data)), save);
  await page.reload();
  await page.click("[data-test=continue]");
  await expect.poll(async () => (await state(page)).waiting, { timeout: 20_000 }).toBe("place");
  // The reported bug: Taro shops in the supermarket first, and the route he was walking there came back
  // in the gym doorway. Visit the market while the shoppers wander, then leave mid-route.
  expect(await page.evaluate(() => (window as unknown as TestWindow).__ms.clickPlace("market"))).toBe(true);
  await expect.poll(async () => (await state(page)).area, { timeout: 20_000 }).toBe("market");
  await expect.poll(() => page.evaluate(() => {
    const g = (window as unknown as TestWindow).__ms.game;
    return !g.scripting && g.cast.taro.moving;
  }), { timeout: 30_000 }).toBe(true);
  await page.click("[data-test=town]");
  // Back in town the narrator may say the place is back in colour: read on until a place can be picked.
  await expect.poll(async () => {
    const more = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
    if (await more.isVisible()) await more.click();
    return (await state(page)).waiting;
  }, { timeout: 30_000 }).toBe("place");
  expect(await page.evaluate(() => {
    const w = window as unknown as TestWindow;
    const g = w.__ms.game;
    const onSpeaking = g.dialogue.onSpeaking;
    w.gymEntrances = [];
    w.gymFinale = [];
    g.dialogue.onSpeaking = (who, speaking) => {
      onSpeaking?.(who, speaking);
      if (!speaking) return;
      const line = g.dialogue.el.querySelector(".en")?.textContent ?? "";
      if (who === "ken" || who === "yui" || who === "taro") {
        w.gymEntrances.push({ who, line, framing: g.npcFraming(who) });
      }
      if (who === "kato" && line.startsWith("Everyone is here!")) {
        w.gymFinale = (["ken", "yui", "taro"] as const).map((id) => g.npcFraming(id));
      }
    };
    return w.__ms.clickPlace("gym");
  })).toBe(true);
  await expect.poll(async () => (await state(page)).area, { timeout: 20_000 }).toBe("gym");

  const next = page.locator(".dialogue:not(.hidden) [data-test=next]:not(.ghost)");
  const complete = page.locator("[data-test=complete-next]");
  const submitted = new Set<WordId>();
  const deadline = Date.now() + 400_000;
  let answered = 0;
  for (;;) {
    const s = await state(page);
    if (Date.now() > deadline) throw new Error("Gym playthrough stalled at " + JSON.stringify(s));
    if (await complete.isVisible()) {
      await complete.click();
      break;
    }
    if (s.waiting === "ask") {
      const answer = answers[answered++];
      expect(answer).toBeDefined();
      const [id, transcript] = answer;
      await expect(page.locator(`.ask:not(.hidden) [data-phrase="${id}"]`)).toBeVisible();
      await page.evaluate((text) => { (window as unknown as TestWindow).gymSpeech = text; }, transcript);
      await page.locator(".ask:not(.hidden) [data-test=mic]").click();
      await expect(page.locator(".ask")).toBeHidden({ timeout: 15_000 });
    } else if (s.waiting.startsWith("slot:")) {
      const id = s.waiting.slice(5);
      expect(await page.evaluate((slot) => (window as unknown as TestWindow).__ms.clickSlot(slot), id), id).toBe(true);
    } else if (s.waiting === "draw") {
      const title = (await page.locator(".draw-head .title .word").textContent())?.trim() ?? "";
      const word = fixtures.get(title);
      if (!word) throw new Error("Missing gym drawing fixture for " + title);
      if (!submitted.has(word)) {
        expect(await page.evaluate((id) => (window as unknown as TestWindow).__ms.drawExample(id), word),
          `HARNESS_PRECONDITION_FAILED - missing gym drawing fixture for ${word}`).toBe(true);
        submitted.add(word);
        await expect.poll(() => page.evaluate((id) => {
          const events = (window as unknown as TestWindow).__ms.game.events;
          return events.find((event) => event.startsWith(`verdict:${id}:`));
        }, word), { timeout: 15_000 }).toBe(`verdict:${word}:accept`);
      } else await page.waitForTimeout(120);
    } else if (await next.isVisible()) {
      await next.click();
    } else await page.waitForTimeout(120);
  }

  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).__ms.game.scripting)).toBe(false);
  const result = await page.evaluate(() => {
    const w = window as unknown as TestWindow;
    const g = w.__ms.game;
    return {
      steps: g.save.gym.steps,
      slots: Object.keys(g.save.gym.slots).sort(),
      modelReady: g.events.includes("model:ok"),
      speech: g.events.filter((event) => event.startsWith("said:")),
      entrances: w.gymEntrances,
      finale: w.gymFinale
    };
  });
  expect(result.steps).toEqual(["coach", "soccer", "basketball", "tennis", "baseball", "festival"]);
  expect(result.slots).toEqual(["basketballs", "bats", "hoops", "rackets", "soccerBalls"]);
  expect(result.modelReady).toBe(true);
  expect([...submitted]).toEqual(drawnWords);
  expect(answered).toBe(answers.length);
  expect(result.speech).toEqual(answers.map(([id]) => `said:${id}`));
  for (const [who, line, x, z] of [
    ["ken", "Hi! A soccer ball!", -1.2, 1.0],
    ["yui", "Hello! Can I shoot?", -1.8, -0.6],
    ["taro", "Hello! I want to play tennis!", -1.6, 0.4]
  ] as const) {
    const framing = result.entrances.find((entry) => entry.who === who && entry.line === line)?.framing;
    expect(framing, line).toMatchObject({
      inGymScene: true, inRoomBounds: true, visible: true, inFrame: true, moving: false, facingPlayer: true
    });
    expect(framing?.x).toBeCloseTo(x, 1);
    expect(framing?.z).toBeCloseTo(z, 1);
  }
  const taroLines = result.entrances.filter(({ who }) => who === "taro");
  expect(taroLines.map(({ line }) => line)).toEqual([
    "Hello! I want to play tennis!", "Let's play tennis!", "That was fun! Thank you!"
  ]);
  for (const { line, framing } of taroLines) {
    expect(framing, line).toMatchObject({ inGymScene: true, inRoomBounds: true, visible: true, inFrame: true });
  }
  expect(result.finale).toHaveLength(3);
  for (const framing of result.finale) {
    expect(framing).toMatchObject({ inGymScene: true, inRoomBounds: true, visible: true, moving: false });
  }
  expect(errors).toEqual([]);
});
