/**
 * Level 1 — Ms. Penny's Stationery Store (SPEC.md §3).
 * Content and order only; every mechanic is a shared Game helper.
 * Each step is saved when it ends, and restarts cleanly after a reload.
 */
import * as THREE from "three";
import { audio } from "../../audio/audio.ts";
import { music } from "../../audio/music.ts";
import { CRAYONS, type Crayon } from "../../draw/drawing.ts";
import { artFromDrawing, artToDrawing } from "../../draw/art.ts";
import { completionCard, type AlbumItem } from "../../ui/screens.ts";
import { COUNTER_FRONT, VIEWS, type SlotId } from "../../world/areas/store.ts";
import { animate, arc, ease, wait } from "../../world/tween.ts";
import type { Drawing } from "../../draw/drawing.ts";
import { WORDS } from "../../recognition/vocab.ts";
import { SLOT_KEYS } from "../save.ts";
import { capital, type Game } from "../game.ts";

const RED = CRAYONS.find((c) => c.id === "red") as Crayon;
const BLUE = CRAYONS.find((c) => c.id === "blue") as Crayon;

export async function runStore(g: Game) {
  g.scripting = true;
  // Customers who have already been helped come back to shop.
  if (g.stepDone("ken")) placeShopper(g, "ken", 1.6, 2.2);
  if (g.stepDone("crayons")) placeShopper(g, "yui", 0.3, 1.7);
  if (g.stepDone("taro")) placeShopper(g, "taro", 2.6, 2.0);
  await g.player.go(COUNTER_FRONT.x, COUNTER_FRONT.z);
  g.player.faceTo(-3.05, -1.7);
  if (!g.stepDone("pen")) await stepPen(g);
  if (!g.stepDone("pencils")) await stepPencils(g);
  if (!g.stepDone("shelf")) await stepShelf(g);
  if (!g.stepDone("ken")) await stepKen(g);
  if (!g.stepDone("crayons")) await stepCrayons(g);
  if (!g.stepDone("books")) await stepBooks(g);
  if (!g.stepDone("taro")) {
    await stepTaro(g);
    await finale(g);
  }
  g.scripting = false;
  g.focus(VIEWS.overview);
  g.engine.setLensShift(0);
  g.dialogue.hide();
  g.objective("The shop is open! Click the 🏠 to go to town.", "おみせが ひらいたよ！ 🏠 で まちに もどれるよ。");
}

function placeShopper(g: Game, id: "ken" | "yui" | "taro", x: number, z: number) {
  const c = g.cast[id];
  if (!c.root.parent) g.store.scene.add(c.root);
  c.collide = (px, pz, r) => g.store.nav.collides(px, pz, r);
  c.router = (ax, az, bx, bz) => g.store.nav.route(ax, az, bx, bz);
  c.place(x, z, Math.PI);
  g.startAmbient(id);
}

// ---------------------------------------------------------------- 1. the magic pen
async function stepPen(g: Game) {
  const penny = g.cast.penny;
  g.focus(VIEWS.counter);
  penny.setBase("sad");
  await wait(0.6);
  penny.setBase("idle");
  penny.emote("surprised", 1.2);
  await g.say("penny", "Oh! Hello!", "あら、こんにちは！");
  penny.emote("sad", 3);
  await g.say("penny", "Look… my shop is **empty**!", "みて… わたしの おみせが からっぽなの！");
  await g.say("penny", "Everything was **erased**!", "ぜんぶ きえちゃったの！");
  await g.say("narrator", "You need a **pen**. Ask Ms. Penny!", "ペンが いるね。ペニーさんに きいてみよう！");
  await g.say("penny", "Can I help you?", "なにか ごよう？");
  await g.ask({ kind: "command", options: ["doYouHavePen"], question: { who: "penny", en: "Can I help you?" }, help: "「ペンを もっていますか？」と きこう" });
  penny.emote("nod", 1);
  await g.say("penny", "**Yes, I do!**", "ええ、もっているわ！");
  await g.givePen();
  await g.say("penny", "This is a **magic pen**!", "これは まほうのペン！");
  await g.say("penny", "Draw something, and it **comes to life**!", "かいた ものが ほんものに なるのよ！");
  g.completeStep("pen");
}

// ---------------------------------------------------------------- 2. pencils
async function stepPencils(g: Game) {
  const slot = g.store.slots.pencilCup;
  g.focus(slot.view);
  await g.say("penny", "Look! My **pencil** cup is empty.", "えんぴつたてが からっぽ！");
  await g.say("penny", "Please draw a **pencil**!", "えんぴつを かいてね！");
  g.objective("Click the pencil cup!", "えんぴつたてを クリック！", slot.marker);
  await g.waitSlot(["pencilCup"]);
  const out = await g.drawFor("pencil", slot, { firstTime: true, help: 1 });
  await g.restore("pencilCup", out);
  g.cast.penny.emote("cheer", 1.8);
  await g.say("penny", "Wow! **Pencils**! Thank you!", "わあ、えんぴつ！ ありがとう！");
  g.completeStep("pencils");
}

// ---------------------------------------------------------------- 3. erasers and scissors
async function stepShelf(g: Game) {
  const left: SlotId[] = (["erasers", "scissors"] as SlotId[]).filter((id) => !g.slotDone(id));
  g.focus(g.store.slots.erasers.view);
  await g.say("penny", "My **erasers** and **scissors** are gone, too.", "けしゴムと はさみも なくなったの。");
  await g.say("penny", "Can you draw them?", "かいてくれる？");
  while (left.length) {
    const first = g.store.slots[left[0]];
    g.objective(left.length === 2 ? "Draw an eraser and scissors!" : `Draw ${left[0] === "erasers" ? "an eraser" : "scissors"}!`, "けしゴムと はさみを かこう！", first.marker);
    const id = await g.waitSlot(left);
    const slot = g.store.slots[id];
    const out = await g.drawFor(slot.word, slot);
    await g.restore(id, out);
    left.splice(left.indexOf(id), 1);
    g.cast.penny.emote("cheer", 1.4);
    if (left.length) await g.say("penny", left[0] === "scissors" ? "Great! Now the **scissors**!" : "Great! Now an **eraser**!", left[0] === "scissors" ? "いいね！ つぎは はさみ！" : "いいね！ つぎは けしゴム！");
  }
  await g.say("penny", "My shop looks better!", "おみせが すこし げんきに なったわ！");
  g.completeStep("shelf");
}

// ---------------------------------------------------------------- 4. Ken: truthful yes/no, the ruler
async function stepKen(g: Game) {
  const ken = g.cast.ken;
  const penny = g.cast.penny;
  await g.npcEnter("ken", -1.7, 0.75);
  await g.player.go(COUNTER_FRONT.x, COUNTER_FRONT.z);
  ken.faceTo(g.player.position.x, g.player.position.z);
  g.player.faceTo(ken.position.x, ken.position.z);
  g.focus(g.talkView(g.player, ken));
  ken.emote("wave", 1.2);
  await g.say("ken", "Hello!", "こんにちは！");
  await g.yesNo("ken", "Do you have a **pencil**?", true, { en: "Really? I can see **pencils** there!", ja: "ほんとう？ あそこに えんぴつが あるよ！" }, "えんぴつ、ある？");
  ken.emote("cheer", 1);
  await g.say("ken", "Great! One **pencil**, please.", "やった！ えんぴつを ひとつ ください。");
  const cup = g.store.slots.pencilCup.anchors[0].p.clone().add(new THREE.Vector3(0, 0.3, 0));
  await g.giveTo(ken, "pencil", cup);
  ken.emote("give", 1);
  audio.coin();
  penny.emote("nod", 0.8);
  await g.say("penny", "Thank you!", "ありがとう！");
  await g.yesNo("ken", "Do you have a **ruler**?", false, { en: "Hmm… I can't see a **ruler**.", ja: "うーん、じょうぎは ないみたい…" }, "じょうぎ、ある？");
  ken.emote("sad", 2);
  await g.say("ken", "Oh no! I need a **ruler** for math.", "ええっ、さんすうで じょうぎが いるのに。");
  penny.emote("point", 1.2);
  await g.say("penny", "Let's draw a **ruler**! Make it long!", "じょうぎを かこう！ ながーく かいてね！");
  const slot = g.store.slots.rulers;
  g.objective("Click the ruler box!", "じょうぎの はこを クリック！", slot.marker);
  await g.waitSlot(["rulers"]);
  const out = await g.drawFor("ruler", slot);
  await g.restore("rulers", out);
  g.dropFromHand(ken);
  g.focus(g.talkView(g.player, ken));
  g.player.faceTo(ken.position.x, ken.position.z);
  await g.say("ken", "Wow! A **ruler**!", "わあ、じょうぎだ！");
  await g.ask({ kind: "command", options: ["thisIsForYou"], question: { who: "ken", en: "Wow! A ruler!" }, help: "「これを どうぞ」＝ This is for you." });
  g.player.emote("give", 1);
  await g.giveTo(ken, "ruler", g.store.slots.rulers.anchors[1].p.clone().add(new THREE.Vector3(0, 0.4, 0)), out.crayon?.hex ?? null);
  ken.emote("jump", 1.4);
  await g.say("ken", "Thank you!", "ありがとう！");
  g.completeStep("ken");
  g.dropFromHand(ken);
  g.startAmbient("ken");
}

// ---------------------------------------------------------------- 5. Yui: crayons in colours
async function stepCrayons(g: Game) {
  const yui = g.cast.yui;
  const slot = g.store.slots.crayons;
  for (const m of slot.items) if (m) g.store.scene.remove(m.root);
  slot.items = [];
  slot.ghosts.forEach((gh) => (gh.visible = true));
  await g.npcEnter("yui", 0.05, 1.75);
  await g.player.go(slot.stand.x, slot.stand.z);
  yui.faceTo(g.player.position.x, g.player.position.z);
  g.player.faceTo(yui.position.x, yui.position.z);
  g.focus(g.talkView(g.player, yui));
  yui.emote("wave", 1.2);
  await g.say("yui", "Hi!", "やっほー！");
  await g.yesNo("yui", "Do you have **crayons**?", false, { en: "Hmm… the crayon box is empty.", ja: "うーん、クレヨンの はこは からっぽだよ。" }, "クレヨン、ある？");
  yui.emote("sad", 1.5);
  await g.say("yui", "Oh… I like **red** and **blue**.", "あかと あおが すきなのに…");
  let anchor = 0;
  let firstDrawing: Drawing | null = null;
  for (const want of [RED, BLUE]) {
    await g.say("yui", `Please draw a **${want.en}** crayon!`, `${want.ja}の クレヨンを かいて！`);
    let wrong = 0;
    for (;;) {
      g.objective(`Draw a ${want.en} crayon!`, `${want.ja}の クレヨンを かこう！`, slot.marker);
      await g.waitSlot(["crayons"]);
      const out = await g.drawFor("crayon", slot, { colorWord: want, starColor: wrong >= 1 ? want.hex : null, color: wrong >= 2 ? want.hex : undefined });
      firstDrawing ??= out.drawing;
      const got = out.crayon;
      const right = got?.id === want.id || wrong >= 3;
      // After three wrong colours the pen's magic turns the crayon the colour Yui wants.
      const drawn =
        right && got?.id !== want.id
          ? { ...out, crayon: want, drawing: { strokes: out.drawing.strokes.map((st) => ({ ...st, color: want.hex })) } }
          : out;
      if (anchor < slot.anchors.length) {
        await g.restore("crayons", drawn, { anchor, fill: false, save: false });
        anchor++;
      }
      if (right) {
        yui.emote("cheer", 1.4);
        await g.say("yui", `Yes! A **${want.en}** crayon!`, `やった！ ${want.ja}の クレヨン！`);
        break;
      }
      wrong++;
      yui.emote("think", 1.6);
      const name = got ? got.en : "dark blue";
      await g.say("yui", `That's a **${name}** crayon. I like **${want.en}**!`, `それは ${got?.ja ?? "こいあお"}だね。${want.ja}が すきなの！`);
      await g.say("narrator", `Pick the **${want.en}** crayon, then draw!`, `${want.ja}の クレヨンを えらんでから かこう！`);
    }
  }
  await g.say("penny", "Now the magic fills the box!", "まほうで はこを いっぱいに！");
  await g.fillSlot("crayons", 0, [null, null, "#fdd835", "#43a047", "#fb8c00", "#8e24aa"]);
  g.saveSlot("crayons", firstDrawing);
  g.focus(g.talkView(g.player, yui));
  await g.ask({ kind: "command", options: ["thisIsForYou"], question: { who: "yui", en: "Red and blue!" }, help: "わたすときは「This is for you.」" });
  g.player.emote("give", 1);
  await g.giveTo(yui, "crayon", slot.anchors[0].p.clone().add(new THREE.Vector3(0, 0.35, 0)), RED.hex);
  yui.emote("jump", 1.4);
  await g.say("yui", "Thank you! I like this shop!", "ありがとう！ このおみせ だいすき！");
  g.dropFromHand(yui);
  g.completeStep("crayons");
  g.startAmbient("yui");
}

// ---------------------------------------------------------------- 6. books and notebooks
async function stepBooks(g: Game) {
  const penny = g.cast.penny;
  if (!g.slotDone("books")) {
    const slot = g.store.slots.books;
    g.focus(slot.view);
    penny.emote("sad", 1.5);
    await g.say("penny", "Oh! My **bookshelf** is empty, too.", "ほんだなも からっぽ！");
    await g.say("penny", "Can you draw a **book**?", "ほんを かいてくれる？");
    g.objective("Click the bookshelf!", "ほんだなを クリック！", slot.marker);
    await g.waitSlot(["books"]);
    const out = await g.drawFor("book", slot);
    await g.restore("books", out);
    penny.emote("cheer", 1.4);
    await g.say("penny", "The **books** are back!", "ほんが もどってきた！");
  }
  if (!g.slotDone("notebooks")) {
    const slot = g.store.slots.notebooks;
    g.focus(slot.view);
    await g.say("penny", "And my **notebooks**? Please draw a **notebook**!", "ノートも かいてね！");
    g.objective("Click the notebook stand!", "ノートの たなを クリック！", slot.marker);
    await g.waitSlot(["notebooks"]);
    const out = await g.drawFor("notebook", slot);
    await g.restore("notebooks", out);
    penny.emote("cheer", 1.4);
    await g.say("penny", "Books and notebooks! Wonderful!", "ほんも ノートも！ すてき！");
  }
  g.completeStep("books");
}

// ---------------------------------------------------------------- 7. Taro: the schoolbag (finale)
async function stepTaro(g: Game) {
  const taro = g.cast.taro;
  const slot = g.store.slots.schoolbags;
  await g.npcEnter("taro", 2.15, -1.45);
  await g.player.go(slot.stand.x, slot.stand.z);
  taro.faceTo(g.player.position.x, g.player.position.z);
  g.player.faceTo(taro.position.x, taro.position.z);
  g.focus(g.talkView(g.player, taro));
  taro.setBase("sad");
  await g.say("taro", "Hello… I'm going to school.", "こんにちは… ぼく、がっこうに いくんだ。");
  await g.yesNo("taro", "Do you have a **schoolbag**?", false, { en: "Hmm… I can't see a **schoolbag**.", ja: "うーん、ランドセルは ないみたい…" }, "ランドセル、ある？");
  await g.say("penny", "Let's draw a **schoolbag**!", "ランドセルを かこう！");
  g.objective("Click the schoolbag hooks!", "ランドセルの フックを クリック！", slot.marker);
  await g.waitSlot(["schoolbags"]);
  const out = await g.drawFor("schoolbag", slot);
  await g.restore("schoolbags", out, { save: false });
  taro.setBase("idle");
  taro.emote("surprised", 1.2);
  g.focus(g.talkView(g.player, taro));
  await g.say("taro", "Wow! A **schoolbag**!", "わあ、ランドセルだ！");
  // His own bag: a copy drops in front of him and is packed with things you drew.
  const tint = out.crayon?.hex ?? null;
  const bag = g.makeItem("schoolbag", 0, artFromDrawing(out.drawing), tint);
  const bagAt = new THREE.Vector3((g.player.position.x + taro.position.x) / 2, 0, (g.player.position.z + taro.position.z) / 2 + 0.55);
  bag.root.position.copy(slot.anchors[0].p);
  g.store.scene.add(bag.root);
  const start = bag.root.position.clone();
  await animate(0.7, (k) => {
    bag.root.position.lerpVectors(start, bagAt, ease.inOut(k));
    bag.root.position.y += arc(k) * 0.6;
  });
  audio.bounce(1.1);
  if (bag.parts.flap) bag.parts.flap.rotation.x = -1.7;
  else bag.root.rotation.y = Math.atan2(g.engine.camPos.x - bagAt.x, g.engine.camPos.z - bagAt.z);
  const pack: [string, string, string, SlotId, "pencil" | "eraser" | "notebook"][] = [
    ["Do you have a **pencil**?", "えんぴつ、ある？", "Really? I see **pencils** there!", "pencilCup", "pencil"],
    ["Do you have an **eraser**?", "けしゴム、ある？", "Really? I see **erasers** there!", "erasers", "eraser"],
    ["Do you have a **notebook**?", "ノート、ある？", "Really? I see **notebooks** there!", "notebooks", "notebook"]
  ];
  for (const [q, ja, wrong, from, word] of pack) {
    await g.yesNo("taro", q, true, { en: wrong, ja: "ほんとう？ あそこに あるよ！" }, ja);
    const src = g.store.slots[from].anchors[1].p.clone().add(new THREE.Vector3(0, 0.3, 0));
    const item = g.makeItem(word, 2, g.artFor(word), null);
    item.root.position.copy(src);
    g.store.scene.add(item.root);
    audio.whoosh(0.5);
    const top = bagAt.clone().add(new THREE.Vector3(0, 0.55, 0));
    await animate(0.75, (k) => {
      item.root.position.lerpVectors(src, top, ease.inOut(k));
      item.root.position.y += arc(k) * 0.8;
      item.root.rotation.y = k * Math.PI * 3;
      item.root.scale.setScalar(1 - 0.6 * ease.in(k));
    });
    g.store.scene.remove(item.root);
    audio.pop(1.4);
    g.effects.burst(top, 14, { speed: 1, size: 0.08 });
    taro.emote("nod", 0.8);
    await g.say("taro", `A **${WORDS[word].en}**! Thank you!`, `${WORDS[word].ja}！ ありがとう！`);
  }
  if (bag.parts.flap) bag.parts.flap.rotation.x = 0;
  audio.bounce(2);
  await g.ask({ kind: "command", options: ["thisIsForYou"], question: { who: "taro", en: "My schoolbag!" }, help: "ランドセルを わたそう：「This is for you.」" });
  g.player.emote("give", 1);
  const from = bag.root.position.clone();
  const backPos = new THREE.Vector3();
  await animate(0.7, (k) => {
    taro.back.getWorldPosition(backPos);
    bag.root.position.lerpVectors(from, backPos.clone().add(new THREE.Vector3(0, -0.25, 0)), ease.inOut(k));
    bag.root.position.y += arc(k) * 0.5;
  });
  g.store.scene.remove(bag.root);
  bag.root.position.set(0, -0.3, -0.06);
  bag.root.rotation.set(0, Math.PI, 0);
  bag.root.scale.setScalar(0.75);
  taro.back.add(bag.root);
  audio.sparkle(6);
  taro.setBase("idle");
  taro.emote("jump", 2);
  await g.say("taro", "Thank you! Now I can go to school!", "ありがとう！ これで がっこうに いける！");
  g.saveSlot("schoolbags", out.drawing);
  g.completeStep("taro");
}

// ---------------------------------------------------------------- the shop is back
async function finale(g: Game) {
  g.focus(VIEWS.overview);
  g.engine.setLensShift(0.1);
  await wait(1.9);
  music.setLevel(1);
  audio.fanfare();
  for (let i = 0; i < 3; i++) {
    g.effects.confetti({ x: -2 + i * 2, y: 2.6, z: -0.5 }, 90);
    await wait(0.25);
  }
  for (const c of [g.player, g.cast.penny, g.cast.ken, g.cast.yui, g.cast.taro]) c.emote("cheer", 2.5);
  await g.say("penny", "My shop is **back**! Thank you!", "おみせが もどった！ ほんとうに ありがとう！");
  await g.say("narrator", "The Stationery Store is restored!", "ぶんぼうぐやが もとに もどった！");
  g.dialogue.hide();
  const items: AlbumItem[] = SLOT_KEYS.map((k) => {
    const saved = g.save.store.slots[k];
    const d = saved?.drawing;
    const word = WORDS[g.store.slots[k].word];
    // Their own artwork, in their own colours.
    const art = saved?.arts?.[0];
    const drawing: Drawing | null = art ? artToDrawing(art) : d ? { strokes: d.map((s) => ({ color: "#2f3a75", points: s.map(([x, y]) => [x, y] as [number, number]) })) } : null;
    return { word: capital(word.plural), drawing };
  });
  await completionCard(g.ui, "The shop is back!", "おみせが もどったよ！", items, "Great!", "やったね！");
  g.startAmbient("ken");
  g.startAmbient("yui");
  g.startAmbient("taro");
}
