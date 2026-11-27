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
import type { PhraseId } from "../../speech/phrases.ts";
import { completionCard, type AlbumItem } from "../../ui/screens.ts";
import { AMBIENT, FAVORITE, FOUNTAIN, HABITATS, PLAZA, SLOT_PEN, VIEWS, type Cam, type P2, type PenId, type ZooSlotId } from "../../world/areas/zooLayout.ts";
import { animate, wait } from "../../world/tween.ts";
import { placeProgress } from "../save.ts";
import type { Game, NpcId } from "../game.ts";
import { feedMonkeys, feedPandas, startZooLife, zooIntro } from "./zooLife.ts";

const view = (cam: Cam) => ({ pos: new THREE.Vector3(...cam.pos), look: new THREE.Vector3(...cam.look) });

function sayOka(g: Game, en: string, ja: string) {
  g.cast.oka.faceTo(g.player.position.x, g.player.position.z);
  return g.say("oka", en, ja);
}

export async function runZoo(g: Game) {
  g.scripting = true;
  startZooLife(g);
  // Visitors who have already been here come back to look at the animals.
  if (g.stepDone("elephants")) visitor(g, "yui", "elephants");
  if (g.stepDone("penguins")) visitor(g, "ken", "penguins");
  if (g.stepDone("favorite")) visitor(g, "taro", "monkeys");
  if (!g.stepDone("welcome")) await stepWelcome(g);
  if (!g.stepDone("elephants")) await stepElephants(g);
  if (!g.stepDone("monkeys")) await stepMonkeys(g);
  if (!g.stepDone("pandas")) await stepPandas(g);
  if (!g.stepDone("penguins")) await stepPenguins(g);
  if (!g.stepDone("favorite")) {
    await stepFavorite(g);
    await finale(g);
  }
  g.startAmbient("oka");
  g.scripting = false;
  g.focus(view(VIEWS.overview));
  g.engine.setLensShift(0);
  g.dialogue.hide();
  g.objective("The zoo is open! Click the 🏠 to go to town.", "どうぶつえんが ひらいた！ 🏠 で まちに もどれるよ。");
}

function visitor(g: Game, id: NpcId, pen: PenId) {
  const [x, z] = AMBIENT.find(([, , slot]) => slot === pen)!;
  const c = g.cast[id];
  c.stop();
  g.inRoom(c);
  c.place(x, z, Math.PI);
  g.startAmbient(id);
}

async function drawSlot(g: Game, id: ZooSlotId, objective: [string, string], opts: { help?: number } = {}) {
  const slot = g.zoo.slots[id];
  const habitat = HABITATS[SLOT_PEN[id]];
  g.objective(objective[0], objective[1], slot.marker);
  const walk = g.waitSlot([id], view(habitat.view));
  let okaWalk: Promise<boolean> | undefined;
  const keeper = animate(Infinity, () => {
    if (g.area === "zoo" && g.waitingFor === `slot:${id}`) return;
    keeper.cancel();
    if (g.area === "zoo") okaWalk = g.cast.oka.go(habitat.oka.x, habitat.oka.z);
  });
  await walk;
  keeper.cancel();
  await (okaWalk ?? g.cast.oka.go(habitat.oka.x, habitat.oka.z));
  const out = await g.drawFor(slot.word, slot, opts);
  await g.restore(id, out);
  g.focus(view(habitat.view));
  if (SLOT_PEN[id] === id) await zooIntro(g, id);
  else startZooLife(g);
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

async function npcVisit(g: Game, id: NpcId, spot: P2, player: P2, arrive?: P2) {
  const c = g.cast[id];
  const enter = async () => {
    if (!arrive) return g.npcEnter(id, spot.x, spot.z);
    c.stop();
    g.inRoom(c);
    c.place(arrive.x, arrive.z, Math.PI);
    await c.go(spot.x, spot.z);
  };
  await Promise.all([enter(), g.player.go(player.x, player.z)]);
  c.faceTo(g.player.position.x, g.player.position.z);
  g.player.faceTo(c.position.x, c.position.z);
  g.focus(g.talkView(g.player, c));
  c.emote("wave", 1.2);
}

// ---------------------------------------------------------------- 1. welcome
async function stepWelcome(g: Game) {
  const oka = g.cast.oka;
  oka.stop();
  oka.place(PLAZA.oka.x, PLAZA.oka.z, PLAZA.okaFacing);
  await g.player.go(PLAZA.player.x, PLAZA.player.z);
  g.player.faceTo(PLAZA.oka.x, PLAZA.oka.z);
  g.focus(g.talkView(g.player, oka));
  oka.emote("wave", 1.2);
  await sayOka(g, "Hello! Welcome to the **zoo**!", "こんにちは！ どうぶつえんへ ようこそ！");
  await g.ask({ kind: "command", options: ["hello"], question: { who: "oka", en: "Hello!" }, help: "あいさつしよう：「Hello!」" });
  oka.emote("sad", 2.5);
  g.focus(view(VIEWS.overview));
  await sayOka(g, "But look… my **animals** are **erased**!", "でも みて… どうぶつが きえちゃった！");
  await sayOka(g, "You have the **magic pen**! Please draw my animals!", "まほうのペンで どうぶつを かいて！");
  g.completeStep("welcome");
}

// ---------------------------------------------------------------- 2. elephants
async function stepElephants(g: Game) {
  const oka = g.cast.oka;
  const habitat = HABITATS.elephants;
  if (!g.slotDone("elephants")) {
    g.focus(view(habitat.view));
    await sayOka(g, "First, the **elephants**. Please draw an **elephant**!", "まずは ぞう。ぞうを かいてね！");
    await drawSlot(g, "elephants", ["Click the elephant house!", "ぞうの おうちを クリック！"], { help: 1 });
    oka.emote("cheer", 1.6);
    await sayOka(g, "**Elephants**! Look, they're spraying water!", "ぞうだ！ みて、みずを ふいてるよ！");
  }
  await npcVisit(g, "yui", habitat.visitor!, habitat.stand, habitat.arrive!);
  await g.say("yui", "Hi! Wow, **elephants**!", "やっほー！ わあ、ぞうだ！");
  await doYouLike(g, "yui", "elephants", "ぞう");
  g.startAmbient("yui");
  g.completeStep("elephants");
}

// ---------------------------------------------------------------- 3. monkeys and bananas
async function stepMonkeys(g: Game) {
  const oka = g.cast.oka;
  if (!g.slotDone("monkeys")) {
    g.focus(view(VIEWS.monkeys));
    await sayOka(g, "My **monkeys**' tree is empty. Please draw a **monkey**!", "さるの きが からっぽ。さるを かいてね！");
    await drawSlot(g, "monkeys", ["Click the monkey tree!", "さるの きを クリック！"]);
    oka.emote("laugh", 1.6);
    await sayOka(g, "**Monkeys**! Ha ha!", "さるだ！ はは！");
  }
  if (!g.slotDone("bananas")) {
    await sayOka(g, "Oh, they're **hungry**. Monkeys like **bananas**!", "おなかが すいてるみたい。さるは バナナが すき！");
    await sayOka(g, "Please draw a **banana**!", "バナナを かいてね！");
    await drawSlot(g, "bananas", ["Click the feeding stump!", "えさの きりかぶを クリック！"]);
    await feedMonkeys(g);
    await sayOka(g, "Yum! Thank you!", "おいしそう！ ありがとう！");
  }
  g.completeStep("monkeys");
}

// ---------------------------------------------------------------- 4. pandas and bamboo
async function stepPandas(g: Game) {
  const oka = g.cast.oka;
  if (!g.slotDone("pandas")) {
    g.focus(view(VIEWS.pandas));
    await sayOka(g, "Now the **pandas**! Please draw a **panda**!", "つぎは パンダ！ パンダを かいてね！");
    await drawSlot(g, "pandas", ["Click the panda garden!", "パンダの にわを クリック！"]);
    oka.emote("cheer", 1.4);
    await sayOka(g, "**Pandas**! So cute!", "パンダ！ かわいい！");
  }
  if (!g.slotDone("bamboo")) {
    await sayOka(g, "Pandas like **bamboo**. Please draw **bamboo**! Make it long!", "パンダは たけが すき。たけを かいてね！ ながーく！");
    await drawSlot(g, "bamboo", ["Click the panda garden!", "パンダの にわを クリック！"]);
    await feedPandas(g);
    await sayOka(g, "Munch, munch! The pandas are happy!", "もぐもぐ！ パンダが よろこんでる！");
  }
  g.completeStep("pandas");
}

// ---------------------------------------------------------------- 5. penguins
async function stepPenguins(g: Game) {
  const oka = g.cast.oka;
  const habitat = HABITATS.penguins;
  if (!g.slotDone("penguins")) {
    g.focus(view(habitat.view));
    await sayOka(g, "Last, the **penguins**! Please draw a **penguin**!", "さいごは ペンギン！ ペンギンを かいてね！");
    await drawSlot(g, "penguins", ["Click the penguin pool!", "ペンギンの プールを クリック！"]);
    oka.emote("cheer", 1.4);
    await sayOka(g, "**Penguins**! Look, they can swim!", "ペンギン！ みて、およげるよ！");
  }
  await npcVisit(g, "ken", habitat.visitor!, habitat.stand);
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
  await Promise.all([g.player.go(FAVORITE.player.x, FAVORITE.player.z), oka.go(FAVORITE.oka.x, FAVORITE.oka.z)]);
  g.player.faceTo(oka.position.x, oka.position.z);
  g.focus(g.talkView(g.player, oka));
  await sayOka(g, "My zoo is full of animals again!", "どうぶつえんが また にぎやかに なった！");
  await g.say("narrator", "Ask Mr. Oka about his favourite animal!", "おかさんに すきな どうぶつを きいてみよう！");
  await g.ask({ kind: "command", options: ["whatAnimal"], question: { who: "oka", en: "…" }, help: "「What animal do you like?」と きこう" });
  oka.emote("cheer", 1.4);
  await sayOka(g, "I like **pandas**! They eat bamboo all day!", "パンダが すき！ いちにちじゅう たけを たべてるんだ！");
  await npcVisit(g, "taro", FAVORITE.taro, FAVORITE.player);
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
  g.progressed(new THREE.Vector3(FAVORITE.oka.x, 1, FAVORITE.oka.z), before);
}

// ---------------------------------------------------------------- the zoo is back
async function finale(g: Game) {
  g.focus(view(VIEWS.overview));
  g.engine.setLensShift(0.1);
  await wait(1.6);
  music.setLevel(1);
  audio.fanfare();
  for (const spot of [FAVORITE.oka, FOUNTAIN, FAVORITE.taro]) {
    g.effects.confetti({ x: spot.x, y: 2.6, z: spot.z }, 90);
    await wait(0.25);
  }
  for (const c of [g.player, g.cast.oka, g.cast.ken, g.cast.yui, g.cast.taro]) c.emote("cheer", 2.5);
  await sayOka(g, "My zoo is **back**! Thank you!", "どうぶつえんが もどった！ ほんとうに ありがとう！");
  await g.say("narrator", "The Zoo is restored!", "どうぶつえんが もとに もどった！");
  g.dialogue.hide();
  const items: AlbumItem[] = (["elephants", "monkeys", "pandas", "penguins"] as ZooSlotId[]).map((id) => {
    const art = g.save.zoo.slots[id]?.arts?.[0];
    return { word: id[0].toUpperCase() + id.slice(1), drawing: art ? artToDrawing(art) : null };
  });
  await completionCard(g.ui, "The zoo is open!", "どうぶつえんが ひらいたよ！", items, "Great!", "やったね！");
}
