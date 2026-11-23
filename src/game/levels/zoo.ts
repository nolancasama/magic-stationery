/**
 * Level 3 — Mr. Oka's Zoo (SPEC.md §7). Content and order only.
 *
 * 1. "Hello!" — the animals are erased.
 * 2. Elephants: they walk and spray water. Yui: "Do you like elephants?"
 *    (the child's own preference: both answers are right).
 * 3. Monkeys swing in their tree; they are hungry: draw a banana; they eat.
 * 4. Pandas sit; "Pandas like bamboo": draw bamboo; they munch.
 * 5. Penguins waddle and dive. Ken: "Do you like penguins?"
 * 6. The player asks Mr. Oka "What animal do you like?"; Taro asks the player,
 *    who answers "I like ___." from the animals they made. The zoo is restored.
 * The child's drawings are the animals; each species lives in its own way.
 */
import * as THREE from "three";
import { audio } from "../../audio/audio.ts";
import { music } from "../../audio/music.ts";
import { artToDrawing } from "../../draw/art.ts";
import type { Living } from "../../objects/living.ts";
import { play as playLiving } from "../../objects/living.ts";
import type { Made } from "../../objects/made.ts";
import type { PhraseId } from "../../speech/phrases.ts";
import { completionCard, type AlbumItem } from "../../ui/screens.ts";
import { POOL, ROAMS, VIEWS, type PenId, type ZooSlotId } from "../../world/areas/zoo.ts";
import { animate, arc, ease, wait } from "../../world/tween.ts";
import { placeProgress } from "../save.ts";
import type { Game, NpcId } from "../game.ts";

export async function runZoo(g: Game) {
  g.scripting = true;
  startLife(g);
  // Visitors who have already been here come back to look at the animals.
  if (g.stepDone("elephants")) visitor(g, "yui", -3.0, 0.4);
  if (g.stepDone("penguins")) visitor(g, "ken", 3.0, 0.5);
  if (g.stepDone("favorite")) visitor(g, "taro", 0.6, 0.9);
  await g.player.go(2.6, 1.6);
  g.player.faceTo(-3.3, 0.35);
  if (!g.stepDone("welcome")) await stepWelcome(g);
  if (!g.stepDone("elephants")) await stepElephants(g);
  if (!g.stepDone("monkeys")) await stepMonkeys(g);
  if (!g.stepDone("pandas")) await stepPandas(g);
  if (!g.stepDone("penguins")) await stepPenguins(g);
  if (!g.stepDone("favorite")) {
    await stepFavorite(g);
    await finale(g);
  }
  g.scripting = false;
  g.focus(VIEWS.overview);
  g.engine.setLensShift(0);
  g.dialogue.hide();
  g.objective("The zoo is open! Click the 🏠 to go to town.", "どうぶつえんが ひらいた！ 🏠 で まちに もどれるよ。");
}

function visitor(g: Game, id: NpcId, x: number, z: number) {
  const c = g.cast[id];
  g.inRoom(c);
  c.place(x, z, Math.PI);
  g.startAmbient(id);
}

// ---------------------------------------------------------------- the animals' life
/** Which pen each display's animals live in (bananas and bamboo stay where they are). */
const LIVES: Partial<Record<ZooSlotId, PenId>> = { elephants: "elephants", monkeys: "monkeys", pandas: "pandas", penguins: "penguins" };
const living = new WeakSet<Made>();

/** Every restored animal gets its own life loop while the player is at the zoo. */
function startLife(g: Game) {
  for (const id of Object.keys(LIVES) as ZooSlotId[]) for (const m of g.zoo.slots[id].items) if (m) void lifeOf(g, id, m);
}

async function lifeOf(g: Game, id: ZooSlotId, m: Made) {
  if (living.has(m)) return;
  living.add(m);
  const here = () => g.area === "zoo" && m.root.parent === g.zoo.scene;
  const ctx = (seconds: number) => ({ effects: g.effects, roam: ROAMS[LIVES[id] as PenId], camera: g.engine.camPos, seconds });
  const art = (m as Living).art ? (m as Living) : null;
  await wait(Math.random() * 2);
  while (here()) {
    if (id === "elephants") {
      if (art) await playLiving(art, "walk", ctx(4));
      else await wait(4);
      if (!here()) break;
      if (Math.random() < 0.6) await spray(g, m);
    } else if (id === "monkeys") {
      await monkeyLife(m);
    } else if (id === "pandas") {
      await pandaLife(g, m);
    } else if (id === "penguins") {
      if (art) await playLiving(art, "waddle", ctx(3));
      else await wait(3);
      if (!here()) break;
      if (Math.random() < 0.55) await dive(g, m);
    }
    await wait(0.6 + Math.random() * 1.4);
  }
  living.delete(m);
}

/** An elephant lifts its trunk and sprays water up into the air. */
async function spray(g: Game, m: Made) {
  audio.animal("elephant");
  const top = m.root.position.clone().add(new THREE.Vector3(0.25, 0.85, 0.15));
  await animate(1.1, (k) => {
    m.inner.rotation.z = Math.sin(k * Math.PI) * 0.12;
    for (let i = 0; i < 3; i++)
      g.effects.emit(top, { vel: { x: 0.6 + Math.random() * 0.6, y: 2.4 + Math.random(), z: (Math.random() - 0.5) * 0.6 }, color: "#7fd3f7", size: 0.06, life: 0.9, gravity: 6 });
  });
  m.inner.rotation.z = 0;
}

/** Monkeys swing on their branch, sometimes hop up and spin, chattering. */
async function monkeyLife(m: Made) {
  await animate(2.4, (k) => (m.inner.rotation.z = Math.sin(k * Math.PI * 4) * 0.25));
  m.inner.rotation.z = 0;
  if (Math.random() < 0.5) {
    audio.animal("monkey");
    await animate(0.7, (k) => {
      m.inner.position.y = arc(k) * 0.45;
      m.inner.rotation.y = ease.inOut(k) * Math.PI * 2;
    });
    m.inner.position.y = 0;
    m.inner.rotation.y = 0;
  }
}

/** A panda sits and munches (bamboo if there is some), rocking gently. */
async function pandaLife(g: Game, m: Made) {
  const eating = g.slotDone("bamboo");
  await animate(eating ? 2.6 : 2.0, (k) => {
    m.inner.rotation.z = Math.sin(k * Math.PI * 2) * 0.06;
    if (eating) m.inner.scale.y = 1 + Math.abs(Math.sin(k * Math.PI * 8)) * 0.04;
  });
  m.inner.rotation.z = 0;
  m.inner.scale.y = 1;
  if (eating && Math.random() < 0.4) audio.animal("panda");
}

/** A penguin slides into the pool, swims under, and pops back up on the ice. */
async function dive(g: Game, m: Made) {
  const from = m.root.position.clone();
  const into = new THREE.Vector3(POOL.x + (Math.random() - 0.5) * POOL.rx, 0, POOL.z + (Math.random() - 0.5) * POOL.rz * 0.8);
  audio.animal("penguin");
  await animate(0.7, (k) => {
    m.root.position.lerpVectors(from, into, k);
    m.root.position.y = from.y + arc(k) * 0.35 - ease.in(k) * 0.4;
    m.inner.rotation.z = -k * 1.2;
  });
  audio.whoosh(0.3);
  g.effects.burst(into.clone().setY(0.08), 16, { colors: ["#b3e5fc", "#ffffff"], speed: 1.2, size: 0.05 });
  m.root.visible = false;
  await wait(1.0 + Math.random());
  m.root.visible = true;
  g.effects.burst(into.clone().setY(0.08), 10, { colors: ["#b3e5fc", "#ffffff"], speed: 0.9, size: 0.05 });
  await animate(0.6, (k) => {
    m.root.position.lerpVectors(into, from, k);
    m.root.position.y = -0.4 * (1 - k) + arc(k) * 0.4 + from.y * k;
    m.inner.rotation.z = -1.2 * (1 - k);
  });
  m.root.position.copy(from);
  m.inner.rotation.z = 0;
}

// ---------------------------------------------------------------- shared helpers
/** Draw the slot's animal, bring it to life, start its life loop. */
async function drawSlot(g: Game, id: ZooSlotId, objective: [string, string], opts: { help?: number } = {}) {
  const slot = g.zoo.slots[id];
  g.objective(objective[0], objective[1], slot.marker);
  await g.waitSlot([id]);
  const out = await g.drawFor(slot.word, slot, opts);
  await g.restore(id, out);
  if (LIVES[id]) for (const m of slot.items) if (m) void lifeOf(g, id, m);
  return out;
}

/** "Do you like X?" — a preference: either answer is right, and the asker answers back. */
async function doYouLike(g: Game, who: NpcId, animal: string, ja: string) {
  const c = g.cast[who];
  await g.say(who, `Do you like **${animal}**?`, `${ja}は すき？`);
  const id = await g.ask({ kind: "choice", options: ["likeYes", "likeNo"], question: { who, en: `Do you like ${animal}?` }, help: "すきなら Yes, I do. ／ すきじゃないなら No, I don't." });
  if (id === "likeYes") {
    g.player.emote("nod", 0.8);
    c.emote("cheer", 1.4);
    await g.say(who, "**Me too!**", "わたしも！");
  } else {
    g.player.emote("shake", 0.8);
    c.emote("surprised", 1.2);
    await g.say(who, `Oh! I **like** ${animal}!`, `そうなんだ！ わたしは ${ja}が すき！`);
  }
}

async function npcVisit(g: Game, id: NpcId, x: number, z: number) {
  const c = g.cast[id];
  await g.npcEnter(id, x, z);
  await g.player.go(x + 0.9, z + 0.3);
  c.faceTo(g.player.position.x, g.player.position.z);
  g.player.faceTo(c.position.x, c.position.z);
  g.focus(g.talkView(g.player, c));
  c.emote("wave", 1.2);
}

// ---------------------------------------------------------------- 1. welcome
async function stepWelcome(g: Game) {
  const oka = g.cast.oka;
  await g.player.go(-2.2, 0.6);
  g.player.faceTo(oka.position.x, oka.position.z);
  g.focus(g.talkView(g.player, oka));
  oka.emote("wave", 1.2);
  await g.say("oka", "Hello! Welcome to the **zoo**!", "こんにちは！ どうぶつえんへ ようこそ！");
  await g.ask({ kind: "command", options: ["hello"], question: { who: "oka", en: "Hello!" }, help: "あいさつしよう：「Hello!」" });
  oka.emote("sad", 2.5);
  g.focus(VIEWS.overview);
  await g.say("oka", "But look… my **animals** are **erased**!", "でも みて… どうぶつが きえちゃった！");
  await g.say("oka", "You have the **magic pen**! Please draw my animals!", "まほうのペンで どうぶつを かいて！");
  g.completeStep("welcome");
}

// ---------------------------------------------------------------- 2. elephants
async function stepElephants(g: Game) {
  const oka = g.cast.oka;
  if (!g.slotDone("elephants")) {
    g.focus(VIEWS.elephants);
    await g.say("oka", "First, the **elephants**. Please draw an **elephant**!", "まずは ぞう。ぞうを かいてね！");
    await drawSlot(g, "elephants", ["Click the elephant house!", "ぞうの おうちを クリック！"], { help: 1 });
    oka.emote("cheer", 1.6);
    g.focus(VIEWS.elephants);
    await g.say("oka", "**Elephants**! Look, they're spraying water!", "ぞうだ！ みて、みずを ふいてるよ！");
  }
  await npcVisit(g, "yui", -2.6, 0.55);
  await g.say("yui", "Hi! Wow, **elephants**!", "やっほー！ わあ、ぞうだ！");
  await doYouLike(g, "yui", "elephants", "ぞう");
  g.startAmbient("yui");
  g.completeStep("elephants");
}

// ---------------------------------------------------------------- 3. monkeys and bananas
async function stepMonkeys(g: Game) {
  const oka = g.cast.oka;
  if (!g.slotDone("monkeys")) {
    g.focus(VIEWS.monkeys);
    await g.say("oka", "My **monkeys**' tree is empty. Please draw a **monkey**!", "さるの きが からっぽ。さるを かいてね！");
    await drawSlot(g, "monkeys", ["Click the monkey tree!", "さるの きを クリック！"]);
    oka.emote("laugh", 1.6);
    g.focus(VIEWS.monkeys);
    await g.say("oka", "**Monkeys**! Ha ha!", "さるだ！ はは！");
  }
  if (!g.slotDone("bananas")) {
    audio.animal("monkey");
    await g.say("oka", "Oh, they're **hungry**. Monkeys like **bananas**!", "おなかが すいてるみたい。さるは バナナが すき！");
    await g.say("oka", "Please draw a **banana**!", "バナナを かいてね！");
    await drawSlot(g, "bananas", ["Click the feeding stump!", "えさの きりかぶを クリック！"]);
    await feedMonkeys(g);
    await g.say("oka", "Yum! Thank you!", "おいしそう！ ありがとう！");
  }
  g.completeStep("monkeys");
}

/** Each monkey grabs a banana and gobbles it; the bananas come back by magic. */
async function feedMonkeys(g: Game) {
  const bananas = g.zoo.slots.bananas.items.filter(Boolean);
  const monkeys = g.zoo.slots.monkeys.items.filter(Boolean);
  g.focus(VIEWS.monkeys);
  await Promise.all(
    monkeys.map(async (mk, i) => {
      const b = bananas[i % Math.max(1, bananas.length)];
      if (!b) return;
      await wait(i * 0.35);
      const from = b.root.position.clone();
      const to = mk.root.position.clone().add(new THREE.Vector3(0, 0.35, 0.12));
      audio.whoosh(0.4);
      await animate(0.6, (k) => {
        b.root.position.lerpVectors(from, to, ease.inOut(k));
        b.root.position.y += arc(k) * 0.6;
      });
      audio.animal("monkey");
      await animate(0.8, (k) => {
        b.root.scale.setScalar(Math.max(0.01, 1 - k));
        mk.inner.position.y = Math.abs(Math.sin(k * Math.PI * 3)) * 0.12;
      });
      mk.inner.position.y = 0;
      g.effects.burst(to, 10, { colors: ["#ffd54f", "#fff59d"], speed: 0.8, size: 0.05 });
      b.root.position.copy(from);
      await wait(0.4);
      await animate(0.4, (k) => b.root.scale.setScalar(Math.max(0.01, ease.out(k))));
    })
  );
}

// ---------------------------------------------------------------- 4. pandas and bamboo
async function stepPandas(g: Game) {
  const oka = g.cast.oka;
  if (!g.slotDone("pandas")) {
    g.focus(VIEWS.pandas);
    await g.say("oka", "Now the **pandas**! Please draw a **panda**!", "つぎは パンダ！ パンダを かいてね！");
    await drawSlot(g, "pandas", ["Click the panda garden!", "パンダの にわを クリック！"]);
    oka.emote("cheer", 1.4);
    g.focus(VIEWS.pandas);
    await g.say("oka", "**Pandas**! So cute!", "パンダ！ かわいい！");
  }
  if (!g.slotDone("bamboo")) {
    await g.say("oka", "Pandas like **bamboo**. Please draw **bamboo**! Make it long!", "パンダは たけが すき。たけを かいてね！ ながーく！");
    await drawSlot(g, "bamboo", ["Click the panda garden!", "パンダの にわを クリック！"]);
    g.focus(VIEWS.pandas);
    audio.animal("panda");
    // The pandas hop with joy.
    await Promise.all(g.zoo.slots.pandas.items.filter(Boolean).map((m) => animate(0.6, (k) => (m.inner.position.y = arc(k) * 0.25))));
    await g.say("oka", "Munch, munch! The pandas are happy!", "もぐもぐ！ パンダが よろこんでる！");
  }
  g.completeStep("pandas");
}

// ---------------------------------------------------------------- 5. penguins
async function stepPenguins(g: Game) {
  const oka = g.cast.oka;
  if (!g.slotDone("penguins")) {
    g.focus(VIEWS.penguins);
    await g.say("oka", "Last, the **penguins**! Please draw a **penguin**!", "さいごは ペンギン！ ペンギンを かいてね！");
    await drawSlot(g, "penguins", ["Click the penguin pool!", "ペンギンの プールを クリック！"]);
    oka.emote("cheer", 1.4);
    g.focus(VIEWS.penguins);
    await g.say("oka", "**Penguins**! Look, they can swim!", "ペンギン！ みて、およげるよ！");
  }
  await npcVisit(g, "ken", 2.4, 0.55);
  await g.say("ken", "Hello! Cool, **penguins**!", "やあ！ すごい、ペンギンだ！");
  await doYouLike(g, "ken", "penguins", "ペンギン");
  g.startAmbient("ken");
  g.completeStep("penguins");
}

// ---------------------------------------------------------------- 6. what animal do you like?
const LIKE_OPTIONS: PhraseId[] = ["iLikeElephants", "iLikeMonkeys", "iLikePandas", "iLikePenguins"];
const LIKED: Record<string, [string, string]> = {
  iLikeElephants: ["elephants", "ぞう"],
  iLikeMonkeys: ["monkeys", "さる"],
  iLikePandas: ["pandas", "パンダ"],
  iLikePenguins: ["penguins", "ペンギン"]
};

async function stepFavorite(g: Game) {
  const oka = g.cast.oka;
  await g.player.go(-2.2, 0.6);
  g.player.faceTo(oka.position.x, oka.position.z);
  g.focus(g.talkView(g.player, oka));
  await g.say("oka", "My zoo is full of animals again!", "どうぶつえんが また にぎやかに なった！");
  await g.say("narrator", "Ask Mr. Oka about his favourite animal!", "おかさんに すきな どうぶつを きいてみよう！");
  await g.ask({ kind: "command", options: ["whatAnimal"], question: { who: "oka", en: "…" }, help: "「What animal do you like?」と きこう" });
  oka.emote("cheer", 1.4);
  await g.say("oka", "I like **pandas**! They eat bamboo all day!", "パンダが すき！ いちにちじゅう たけを たべてるんだ！");
  await npcVisit(g, "taro", -1.2, 1.3);
  await g.say("taro", "Hello! I like **monkeys**!", "こんにちは！ ぼくは さるが すき！");
  await g.say("taro", "**What animal do you like?**", "どんな どうぶつが すき？");
  const id = await g.ask({ kind: "choice", options: LIKE_OPTIONS, question: { who: "taro", en: "What animal do you like?" }, help: "すきな どうぶつを えらんで いおう：I like ___." });
  const [en, ja] = LIKED[id];
  g.player.emote("cheer", 1);
  g.cast.taro.emote(id === "iLikeMonkeys" ? "jump" : "nod", 1.4);
  await g.say("taro", id === "iLikeMonkeys" ? "**Monkeys**! Me too!" : `**${en[0].toUpperCase() + en.slice(1)}**! Nice!`, id === "iLikeMonkeys" ? "さる！ ぼくも！" : `${ja}！ いいね！`);
  g.startAmbient("taro");
  const before = placeProgress(g.save, "zoo");
  g.completeStep("favorite");
  g.progressed(new THREE.Vector3(0, 1, -1), before);
}

// ---------------------------------------------------------------- the zoo is back
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
  for (const c of [g.player, g.cast.oka, g.cast.ken, g.cast.yui, g.cast.taro]) c.emote("cheer", 2.5);
  await g.say("oka", "My zoo is **back**! Thank you!", "どうぶつえんが もどった！ ほんとうに ありがとう！");
  await g.say("narrator", "The Zoo is restored!", "どうぶつえんが もとに もどった！");
  g.dialogue.hide();
  const items: AlbumItem[] = (["elephants", "monkeys", "pandas", "penguins"] as ZooSlotId[]).map((id) => {
    const art = g.save.zoo.slots[id]?.arts?.[0];
    return { word: id[0].toUpperCase() + id.slice(1), drawing: art ? artToDrawing(art) : null };
  });
  await completionCard(g.ui, "The zoo is open!", "どうぶつえんが ひらいたよ！", items, "Great!", "やったね！");
}
