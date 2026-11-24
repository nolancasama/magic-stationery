/**
 * Level 4 — Mr. Green's Supermarket (SPEC.md §8). Content and order only.
 *
 * 1. "Hello!" — the food is erased; customers are coming.
 * 2. Ken: "What do you want?" — apples (draw them) — "How many?" — three:
 *    the child clicks the crate three times (each apple hops into Ken's
 *    basket, counted aloud), then says "Here you are." Ken pays.
 * 3. Yui: oranges — round, and the crayon must be orange — two.
 * 4. Vegetables: a carrot for the shelf; Taro: tomatoes (red) — four.
 * 5. The fridge: milk; Ms. Penny: eggs — five.
 * 6. The player shops: "What do you want?" — "I want ___, please." —
 *    "How many?" — "___, please." — Mr. Green counts them into the player's
 *    basket — "Here you are." — "Thank you." The supermarket is restored.
 * The food is the child's own drawings; the crates never run out (magic).
 */
import * as THREE from "three";
import { audio } from "../../audio/audio.ts";
import { music } from "../../audio/music.ts";
import { artToDrawing } from "../../draw/art.ts";
import { CRAYONS, type Crayon } from "../../draw/drawing.ts";
import { buildBasket } from "../../objects/market.ts";
import { wordWithArticle, type WordId } from "../../recognition/vocab.ts";
import type { PhraseId } from "../../speech/phrases.ts";
import { tts } from "../../speech/tts.ts";
import { voiceOf } from "../../ui/dialogue.ts";
import { completionCard, type AlbumItem } from "../../ui/screens.ts";
import { CHECKOUT, GREEN_AISLE, GREEN_SPOT, VIEWS, type MarketSlotId } from "../../world/areas/market.ts";
import type { Slot, View } from "../../world/areas/room.ts";
import type { Character } from "../../world/characters.ts";
import { animate, arc, ease, wait } from "../../world/tween.ts";
import { MARKET_SLOT_KEYS, placeProgress } from "../save.ts";
import type { Game, NpcId } from "../game.ts";
import { startCounting, updateCounting } from "./counting.ts";

const ORANGE = CRAYONS.find((c) => c.id === "orange") as Crayon;
const RED = CRAYONS.find((c) => c.id === "red") as Crayon;

const NUMBERS = ["zero", "one", "two", "three", "four", "five", "six"];
const NUMBERS_JA = ["ゼロ", "ひとつ", "ふたつ", "みっつ", "よっつ", "いつつ", "むっつ"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const FOODS: Record<MarketSlotId, { word: WordId; plural: string; ja: string }> = {
  apples: { word: "apple", plural: "apples", ja: "りんご" },
  oranges: { word: "orange", plural: "oranges", ja: "オレンジ" },
  tomatoes: { word: "tomato", plural: "tomatoes", ja: "トマト" },
  carrots: { word: "carrot", plural: "carrots", ja: "にんじん" },
  milk: { word: "milk", plural: "milk", ja: "ぎゅうにゅう" },
  eggs: { word: "egg", plural: "eggs", ja: "たまご" }
};

/** What a customer comes in for, and where they wait (beside the display). */
interface Order {
  who: NpcId;
  food: MarketSlotId;
  count: number;
  hi: [string, string];
  at: { x: number; z: number };
  /** The colour the food must be (an orange is orange, a tomato is red). */
  color?: Crayon;
}

const ORDERS: Record<"ken" | "yui" | "taro" | "penny", Order> = {
  ken: { who: "ken", food: "apples", count: 3, hi: ["Hi!", "やあ！"], at: { x: -0.3, z: 1.45 } },
  yui: { who: "yui", food: "oranges", count: 2, hi: ["Hello!", "こんにちは！"], at: { x: 0.7, z: 1.45 }, color: ORANGE },
  taro: { who: "taro", food: "tomatoes", count: 4, hi: ["Hello!", "こんにちは！"], at: { x: 2.1, z: 1.45 }, color: RED },
  penny: { who: "penny", food: "eggs", count: 5, hi: ["Hello again!", "また あったね！"], at: { x: 0.75, z: -1.7 } }
};

export async function runMarket(g: Game) {
  g.scripting = true;
  // Customers who have already been served come back to shop.
  if (g.stepDone("apples")) shopper(g, "ken", -1.6, 1.9);
  if (g.stepDone("oranges")) shopper(g, "yui", 0.9, 2.2);
  if (g.stepDone("vegetables")) shopper(g, "taro", 2.6, 1.9);
  await g.player.go(2.9, 1.9);
  g.player.faceTo(GREEN_SPOT.x, GREEN_SPOT.z);
  if (!g.stepDone("greet")) await stepGreet(g);
  if (!g.stepDone("apples")) {
    await serve(g, ORDERS.ken);
    g.completeStep("apples");
  }
  if (!g.stepDone("oranges")) {
    await serve(g, ORDERS.yui);
    g.completeStep("oranges");
  }
  if (!g.stepDone("vegetables")) await stepVegetables(g);
  if (!g.stepDone("fridge")) await stepFridge(g);
  if (!g.stepDone("shopping")) {
    await stepShopping(g);
    await finale(g);
  }
  g.scripting = false;
  g.focus(VIEWS.overview);
  g.engine.setLensShift(0);
  g.dialogue.hide();
  g.objective("The supermarket is open! Click the 🏠 to go to town.", "スーパーが ひらいた！ 🏠 で まちに もどれるよ。");
}

function shopper(g: Game, id: NpcId, x: number, z: number) {
  const c = g.cast[id];
  g.inRoom(c);
  c.carry(buildBasket());
  c.place(x, z, Math.PI);
  g.startAmbient(id);
}

// ---------------------------------------------------------------- 1. hello
async function stepGreet(g: Game) {
  const green = g.cast.green;
  await g.player.go(-2.5, 0.3);
  g.player.faceTo(green.position.x, green.position.z);
  g.focus(g.talkView(g.player, green));
  green.emote("wave", 1.2);
  await g.say("green", "Hello! Welcome to my **supermarket**!", "こんにちは！ ぼくの スーパーへ ようこそ！");
  await g.ask({ kind: "command", options: ["hello"], question: { who: "green", en: "Hello!" }, help: "あいさつしよう：「Hello!」" });
  green.emote("sad", 2.5);
  g.focus(VIEWS.overview);
  await g.say("green", "But look… all my **food** is **erased**!", "でも みて… たべものが ぜんぶ きえちゃった！");
  await g.say("green", "And **customers** are coming! Please help me with your **magic pen**!", "おきゃくさんが くるよ！ まほうの ペンで てつだって！");
  g.completeStep("greet");
}

// ---------------------------------------------------------------- drawing the food
/**
 * Draw a display's food and restore it. With `want`, the crayon decides what a round drawing is:
 * the wrong colour is talked about and tried again (★ after one, preselected after two, the magic
 * recolours it after three, like Yui's crayons in the shop).
 */
async function drawFood(g: Game, id: MarketSlotId, who: NpcId, want?: Crayon) {
  const slot = g.market.slots[id];
  const food = FOODS[id];
  let wrong = 0;
  for (;;) {
    g.objective(`Click the ${food.plural}!`, `${food.ja}の ところを クリック！`, slot.marker);
    await g.waitSlot([id]);
    const out = await g.drawFor(food.word, slot, {
      help: food.word === "milk" ? 1 : 0,
      starColor: want && wrong >= 1 ? want.hex : null,
      color: want && wrong >= 2 ? want.hex : undefined
    });
    const got = out.crayon;
    if (!want || got?.id === want.id || wrong >= 3) {
      const drawn =
        want && got?.id !== want.id
          ? { ...out, crayon: want, drawing: { strokes: out.drawing.strokes.map((s) => ({ ...s, color: want.hex })), fills: out.drawing.fills?.map((f) => ({ ...f, color: want.hex })) } }
          : out;
      await g.restore(id, drawn);
      return;
    }
    wrong++;
    g.cast[who].emote("think", 1.6);
    if (food.word === "orange" && got?.id === "red") {
      await g.say(who, "Red and round… that's a **tomato**! **Oranges** are **orange**.", "あかくて まるい… それは トマトだよ！ オレンジは オレンジいろ！");
    } else if (food.word === "tomato" && got?.id === "orange") {
      await g.say(who, "Orange and round… that's an **orange**! **Tomatoes** are **red**.", "オレンジいろで まるい… それは オレンジだよ！ トマトは あか！");
    } else {
      const name = got ? got.en : "dark blue";
      await g.say(who, `A **${name}** ${food.word}? Hmm… **${cap(food.plural)}** are **${want.en}**!`, `${got?.ja ?? "こいあお"}の ${food.ja}？ ${food.ja}は ${want.ja}だよ！`);
    }
    await g.say("narrator", `Pick the **${want.en}** crayon, then draw!`, `${want.ja}の クレヨンを えらんでから かこう！`);
  }
}

// ---------------------------------------------------------------- a customer
/** What do you want? → (draw it) → How many? → count it into their basket → Here you are. → pay. */
async function serve(g: Game, o: Order) {
  const c = g.cast[o.who];
  const food = FOODS[o.food];
  c.carry(buildBasket());
  await g.npcEnter(o.who, o.at.x, o.at.z);
  await faceCustomer(g, c, o);
  c.emote("wave", 1.2);
  await g.say(o.who, o.hi[0], o.hi[1]);
  await g.ask({ kind: "command", options: ["whatDoYouWant"], question: { who: o.who, en: o.hi[0] }, help: "ほしいものを きこう：「What do you want?」" });
  await g.say(o.who, `I want **${food.plural}**, please.`, `${food.ja}を ください。`);
  if (!g.slotDone(o.food)) {
    const green = g.cast.green;
    green.emote("surprised", 1.4);
    await g.say("green", `Oh no! There are no **${food.plural}**! Please draw ${wordWithArticle(food.word)}!`, `たいへん！ ${food.ja}が ない！ ${food.ja}を かいて！`);
    await drawFood(g, o.food, o.who, o.color);
    green.emote("cheer", 1.4);
    await faceCustomer(g, c, o);
    c.emote("jump", 1.0);
    await g.say(o.who, `Wow, **${food.plural}**!`, `わあ、${food.ja}！`);
  }
  await g.ask({ kind: "command", options: ["howMany"], question: { who: o.who, en: `I want ${food.plural}, please.` }, help: "かずを きこう：「How many?」" });
  await g.say(o.who, `**${cap(NUMBERS[o.count])}**, please.`, `${NUMBERS_JA[o.count]} ください。`);
  const n = await countInto(g, c, o.who, o.food, o.count);
  c.emote("cheer", 1.4);
  await g.say(o.who, "**Thank you!**", "ありがとう！");
  await checkout(g, o.who, n);
  if (o.who === "penny") {
    await g.say("penny", "Bye! See you at my shop!", "バイバイ！ また わたしの おみせでね！");
    await g.npcLeave("penny");
  } else g.startAmbient(o.who);
}

async function faceCustomer(g: Game, c: Character, o: Order) {
  await g.player.go(o.at.x - 0.85, o.at.z + 0.15);
  c.faceTo(g.player.position.x, g.player.position.z);
  g.player.faceTo(c.position.x, c.position.z);
  g.focus(g.talkView(g.player, c));
}

// ---------------------------------------------------------------- counting into a basket
/** Where items sit in a basket (basket space: metres, origin at its bottom). */
const BASKET_SPOTS = [
  new THREE.Vector3(-0.1, 0.05, 0.04),
  new THREE.Vector3(0.02, 0.05, 0.05),
  new THREE.Vector3(0.12, 0.06, -0.01),
  new THREE.Vector3(-0.05, 0.09, -0.05),
  new THREE.Vector3(0.07, 0.1, 0.0),
  new THREE.Vector3(0.0, 0.13, 0.02)
];
/** Items shrink into the basket to about 15 cm. */
const IN_BASKET: Record<MarketSlotId, number> = { apples: 0.58, oranges: 0.58, tomatoes: 0.6, carrots: 0.42, milk: 0.45, eggs: 0.75 };

/** Count the food into the basket, then open the handoff prompt. */
async function countInto(g: Game, c: Character, who: NpcId, id: MarketSlotId, want: number): Promise<number> {
  const slot = g.market.slots[id];
  const food = FOODS[id];
  const basket = c.carried;
  if (!basket) return want;
  let state = startCounting(want);
  let hops = Promise.resolve();
  const wantWord = cap(NUMBERS[want]);
  const goal = `Put ${want} ${food.plural} in the basket.`;
  const goalJa = `${food.ja}を ${NUMBERS_JA[want]} かごに いれよう。`;
  const showCount = (n: number) => g.objective(`${goal} ${n} / ${want}`, goalJa, slot.marker);
  const addItem = () => {
    state = updateCounting(state, "pick");
    const n = state.count;
    hops = hops.then(async () => {
      await hop(g, slot, basket, n, who);
      showCount(n);
      if (n === want) await wait(0.25);
    });
  };
  g.dialogue.hide();
  g.engine.setLensShift(0);
  g.focus(countView(slot, basket));
  showCount(0);
  while (state.count < state.want && state.idleHints < 2) {
    const idle = animate(8, () => {});
    const picked = await Promise.race([g.pickSlot([id]), idle.then(() => "")]);
    idle.cancel();
    if (picked === id) {
      addItem();
      continue;
    }
    g.cancelPick();
    state = updateCounting(state, "idle");
    if (state.idleHints >= 2) break;
    const hint = `Click the ${food.plural}, please!`;
    c.emote("think", 1.4);
    g.hud.say(hint, `${food.ja}の ところを クリックしてね！`, 3400);
    g.effects.twinkle(slot.marker, 0.25, "#fff59d");
    void tts.speak(hint, voiceOf(who));
  }
  // A quick extra click before the finished count clears hops back.
  const extra = state.count === state.want && (await Promise.race([g.pickSlot([id]), hops.then(() => "")])) === id;
  g.cancelPick();
  if (state.count < state.want) {
    g.hud.say("The magic pen helped you!", "まほうのペンが てつだってくれたよ！");
    audio.magic();
    while (state.count < state.want) addItem();
  }
  await hops;
  if (extra) {
    const item = await hop(g, slot, basket, want + 1, null);
    c.emote("surprised", 1.0);
    g.hud.say(`Oops! ${wantWord}, please!`, `${NUMBERS_JA[want]} だよ！`, 2200);
    void tts.speak(`Oops! ${wantWord}, please!`, voiceOf(who));
    await hopBack(g, slot, item);
  }
  state = updateCounting(state, "ready");
  g.objective(null);
  if (state.phase === "speaking") {
    const answer = await g.ask({ kind: "command", options: ["hereYouAre"], question: { who, en: `${wantWord}, please.` }, help: "「Here you are.」と いって わたそう。" });
    if (answer === "hereYouAre") state = updateCounting(state, "answer");
  }
  if (state.phase === "done") g.player.emote("give", 0.8);
  return state.count;
}

/**
 * Counting is watched from above the people's heads: the display and the basket the food lands in are
 * both in view (the display's own view looks past the customer's back and loses the basket).
 */
function countView(slot: Slot, basket: THREE.Object3D): View {
  const b = basket.getWorldPosition(new THREE.Vector3());
  const mid = slot.anchors[0].p.clone().lerp(b, 0.5);
  return { pos: mid.clone().add(new THREE.Vector3(0.35, 2.0, 2.1)), look: mid.setY(0.6) };
}

/** One item flies from the display into the basket (and stays in it). `who` counts it aloud. */
async function hop(g: Game, slot: Slot, basket: THREE.Object3D, n: number, who: NpcId | null): Promise<THREE.Object3D> {
  const id = slot.id as MarketSlotId;
  const m = g.makeItem(slot.word, n, g.artFor(slot.word), null);
  const a = slot.anchors[(n - 1) % slot.anchors.length];
  const from = a.p.clone().add(new THREE.Vector3(0, 0.08, 0));
  m.root.position.copy(from);
  m.root.scale.setScalar(IN_BASKET[id]);
  g.room.scene.add(m.root);
  audio.whoosh(0.25);
  const spot = BASKET_SPOTS[(n - 1) % BASKET_SPOTS.length];
  const to = new THREE.Vector3();
  await animate(0.4, (k) => {
    basket.localToWorld(to.copy(spot));
    m.root.position.lerpVectors(from, to, ease.inOut(k));
    m.root.position.y += arc(k) * 0.45;
    m.root.rotation.y = k * Math.PI * 2;
  });
  basket.attach(m.root);
  m.root.position.copy(spot);
  m.root.rotation.set(0, 0, 0);
  audio.pop(1.1 + n * 0.08);
  g.effects.twinkle(to, 0.12);
  if (who) {
    const said = `${cap(NUMBERS[n])}!`;
    g.hud.say(said, NUMBERS_JA[n] ?? "", 1000);
    void tts.speak(said, voiceOf(who));
  }
  return m.root;
}

async function hopBack(g: Game, slot: Slot, item: THREE.Object3D) {
  const from = new THREE.Vector3();
  item.getWorldPosition(from);
  g.room.scene.attach(item);
  const to = slot.anchors[0].p.clone().add(new THREE.Vector3(0, 0.1, 0));
  audio.whoosh(0.25);
  await animate(0.4, (k) => {
    item.position.lerpVectors(from, to, ease.inOut(k));
    item.position.y += arc(k) * 0.4;
  });
  g.effects.twinkle(to, 0.15);
  g.room.scene.remove(item);
}

/** The customer pays: the register beeps once per item. */
async function checkout(g: Game, who: NpcId, items: number) {
  const c = g.cast[who];
  const green = g.cast.green;
  g.focus(VIEWS.checkout);
  await c.go(CHECKOUT.x, CHECKOUT.z);
  c.faceTo(green.position.x, green.position.z);
  green.faceTo(c.position.x, c.position.z);
  for (let i = 0; i < items; i++) {
    audio.tone(1568, 0.08, { type: "square", gain: 0.08 });
    green.emote("give", 0.3);
    await wait(0.3);
  }
  audio.coin();
  await g.say("green", "Thank you! Come again!", "ありがとう！ また きてね！");
  c.emote("wave", 1.2);
}

// ---------------------------------------------------------------- 4. vegetables
async function stepVegetables(g: Game) {
  const green = g.cast.green;
  if (!g.slotDone("carrots")) {
    g.focus(VIEWS.veg);
    await g.say("green", "Now the **vegetables**! Please draw a **carrot**!", "つぎは やさい！ にんじんを かいて！");
    await drawFood(g, "carrots", "green");
    green.emote("cheer", 1.4);
    await g.say("green", "**Carrots**! Great!", "にんじん！ いいね！");
  }
  await serve(g, ORDERS.taro);
  g.completeStep("vegetables");
}

// ---------------------------------------------------------------- 5. the fridge
async function stepFridge(g: Game) {
  const green = g.cast.green;
  if (!g.slotDone("milk")) {
    g.focus(VIEWS.fridge);
    await g.say("green", "Look at my **fridge**. It's empty! Please draw **milk**!", "れいぞうこを みて。からっぽ！ ぎゅうにゅうを かいて！");
    await drawFood(g, "milk", "green");
    green.emote("cheer", 1.4);
    await g.say("green", "**Milk**! Cold and fresh!", "ぎゅうにゅう！ つめたくて おいしそう！");
  }
  await serve(g, ORDERS.penny);
  g.completeStep("fridge");
}

// ---------------------------------------------------------------- 6. your shopping
const WANT_OPTIONS: PhraseId[] = ["wantApples", "wantOranges", "wantTomatoes", "wantCarrots", "wantEggs"];
const WANTED: Partial<Record<PhraseId, MarketSlotId>> = { wantApples: "apples", wantOranges: "oranges", wantTomatoes: "tomatoes", wantCarrots: "carrots", wantEggs: "eggs" };
const NUMBER_OPTIONS: PhraseId[] = ["onePlease", "twoPlease", "threePlease", "fourPlease", "fivePlease"];
const COUNT_OF: Partial<Record<PhraseId, number>> = { onePlease: 1, twoPlease: 2, threePlease: 3, fourPlease: 4, fivePlease: 5 };

async function stepShopping(g: Game) {
  const green = g.cast.green;
  await g.player.go(-2.5, 0.6);
  g.player.faceTo(green.position.x, green.position.z);
  g.focus(g.talkView(g.player, green));
  await g.say("green", "My supermarket is full of food again! Thank you!", "スーパーが また たべもので いっぱいに なった！ ありがとう！");
  await g.say("green", "Now **you** can shop! Here's a **basket**.", "こんどは きみが かいものする ばん！ はい、かご。");
  g.player.carry(buildBasket());
  audio.pop(1.3);
  await g.say("green", "**What do you want?**", "なにが ほしい？");
  const id = await g.ask({ kind: "choice", options: WANT_OPTIONS, question: { who: "green", en: "What do you want?" }, help: "ほしいものを えらんで いおう：I want ___, please." });
  const slotId = WANTED[id] ?? "apples";
  const food = FOODS[slotId];
  g.player.emote("nod", 0.8);
  await g.say("green", `**${cap(food.plural)}**! OK. **How many?**`, `${food.ja}だね！ いくつ？`);
  const n = await g.ask({ kind: "choice", options: NUMBER_OPTIONS, question: { who: "green", en: "How many?" }, help: "かずを えらんで いおう：___, please." });
  const count = COUNT_OF[n] ?? 1;
  await g.say("green", `**${cap(NUMBERS[count])}** ${count === 1 ? food.word : food.plural}. Coming up!`, `${food.ja}を ${NUMBERS_JA[count]}だね。まかせて！`);
  // Use the aisle behind the checkout to give Mr. Green room to clear its corner.
  const slot = g.market.slots[slotId];
  await green.go(GREEN_AISLE.x, GREEN_AISLE.z);
  await green.go(slot.serve.x, slot.serve.z);
  green.faceHeading(slot.serve.facing);
  await g.player.go(slot.stand.x, slot.stand.z);
  g.player.faceTo(green.position.x, green.position.z);
  g.focus(slot.view);
  const basket = g.player.carried;
  if (basket) {
    for (let i = 1; i <= count; i++) {
      green.emote("give", 0.6);
      await hop(g, slot, basket, i, "green");
      await wait(0.25);
    }
  }
  green.faceTo(g.player.position.x, g.player.position.z);
  g.player.faceTo(green.position.x, green.position.z);
  g.focus(g.talkView(g.player, green));
  await g.say("green", "**Here you are.**", "はい、どうぞ。");
  await g.ask({ kind: "command", options: ["thankYou"], question: { who: "green", en: "Here you are." }, help: "おれいを いおう：「Thank you.」" });
  g.player.emote("cheer", 1.2);
  green.emote("laugh", 1.4);
  await g.say("green", "You're welcome!", "どういたしまして！");
  const before = placeProgress(g.save, "market");
  g.completeStep("shopping");
  g.progressed(new THREE.Vector3(0, 1, 0.4), before);
  void green.go(GREEN_AISLE.x, GREEN_AISLE.z)
    .then(() => green.go(GREEN_SPOT.x, GREEN_SPOT.z))
    .then(() => green.faceHeading(0));
}

// ---------------------------------------------------------------- the supermarket is back
async function finale(g: Game) {
  g.focus(VIEWS.overview);
  g.engine.setLensShift(0.1);
  await wait(1.6);
  music.setLevel(1);
  audio.fanfare();
  for (let i = 0; i < 3; i++) {
    g.effects.confetti({ x: -2 + i * 2, y: 2.6, z: 0.5 }, 90);
    await wait(0.25);
  }
  for (const c of [g.player, g.cast.green, g.cast.ken, g.cast.yui, g.cast.taro]) if (c.root.parent === g.market.scene) c.emote("cheer", 2.5);
  await g.say("green", "My supermarket is **back**! Thank you!", "スーパーが もどった！ ほんとうに ありがとう！");
  await g.say("narrator", "The Supermarket is restored!", "スーパーが もとに もどった！");
  g.dialogue.hide();
  const items: AlbumItem[] = MARKET_SLOT_KEYS.map((id) => {
    const art = g.save.market.slots[id]?.arts?.[0];
    return { word: cap(FOODS[id].plural), drawing: art ? artToDrawing(art) : null };
  });
  await completionCard(g.ui, "The supermarket is open!", "スーパーが ひらいたよ！", items, "Great!", "やったね！");
}
