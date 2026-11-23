/**
 * Level 2 — Ms. Mori's Classroom (SPEC.md §5). Content and order only.
 *
 * 1. "Good morning!" — the classroom is erased; the children come at 8:30.
 * 2. Desks and chairs: one drawing each, the magic fills the four places.
 * 3. The clock: the child writes 12, 3, 6 and 9 (their handwriting stays on
 *    the clock), the magic adds the other numbers and the hands.
 * 4. "What time is it?" — "It's eight o'clock." (truthful: read the clock).
 * 5. The alphabet strip: Ms. Mori says the ABC and stops at each blank card;
 *    the child writes d, g, m, t.
 * 6. Ken, Yui and Taro come in ("Good morning!"), the clock reaches 8:30
 *    ("It's eight thirty."), the school chime rings and class begins.
 * Each step is saved when it ends and restarts cleanly after a reload.
 */
import * as THREE from "three";
import { audio } from "../../audio/audio.ts";
import { music } from "../../audio/music.ts";
import { artFromDrawing, artToDrawing } from "../../draw/art.ts";
import type { Drawing } from "../../draw/drawing.ts";
import type { PhraseId } from "../../speech/phrases.ts";
import { completionCard, type AlbumItem } from "../../ui/screens.ts";
import { CLOCK, SEATS, VIEWS } from "../../world/areas/classroom.ts";
import { animate, ease, wait } from "../../world/tween.ts";
import { CLOCK_KEYS, GLYPH_CHARS, LETTER_KEYS, placeProgress, type GlyphKey } from "../save.ts";
import type { Game, NpcId } from "../game.ts";

/** Where each student stands at their place (behind the chair, facing the board). */
function seatOf(i: number) {
  const s = SEATS[i];
  return { x: s.x, z: s.z + 0.92 };
}

const STUDENTS: NpcId[] = ["ken", "yui", "taro"];

export async function runSchool(g: Game) {
  g.scripting = true;
  const room = g.school;
  wearSchoolbag(g);
  if (g.stepDone("bell")) {
    // Class has started: everyone at their place.
    STUDENTS.forEach((id, i) => {
      const c = g.cast[id];
      g.inRoom(c);
      const s = seatOf(i);
      c.place(s.x, s.z, Math.PI);
    });
    room.setTime(8, 30);
  }
  await g.player.go(2.9, 2.0);
  g.player.faceTo(-3.0, -2.3);
  if (!g.stepDone("arrive")) await stepArrive(g);
  if (!g.stepDone("desks")) await stepDesks(g);
  if (!g.stepDone("clock")) await stepClock(g);
  if (!g.stepDone("time")) await stepTime(g);
  if (!g.stepDone("letters")) await stepLetters(g);
  if (!g.stepDone("bell")) {
    await stepBell(g);
    await finale(g);
  }
  g.scripting = false;
  g.focus(VIEWS.overview);
  g.engine.setLensShift(0);
  g.dialogue.hide();
  g.objective("Class has started! Click the 🏠 to go to town.", "じゅぎょうが はじまった！ 🏠 で まちに もどれるよ。");
}

/** Taro wears the schoolbag the child drew in the shop. */
function wearSchoolbag(g: Game) {
  const taro = g.cast.taro;
  while (taro.back.children.length) taro.back.remove(taro.back.children[0]);
  const saved = g.save.store.slots.schoolbags;
  const art = saved?.arts?.[0] ?? null;
  if (!saved) return;
  const bag = g.makeItem("schoolbag", 0, art, saved.tints[0] ?? null);
  bag.root.position.set(0, -0.3, -0.06);
  bag.root.rotation.set(0, Math.PI, 0);
  bag.root.scale.setScalar(0.75);
  taro.back.add(bag.root);
}

/** A truthful time answer: read the clock. Wrong answers get a hint and a second chance. */
async function askTime(g: Game, who: NpcId, truth: PhraseId, other: PhraseId, hint: { en: string; ja: string }) {
  let tries = 0;
  for (;;) {
    const options: PhraseId[] = tries >= 2 ? [truth] : truth < other ? [truth, other] : [other, truth];
    const id = await g.ask({ kind: "choice", options, question: { who, en: "What time is it?" }, help: "とけいを みて こたえよう！ みじかい はりは なんじ？" });
    if (id === truth) {
      g.player.emote("nod", 0.8);
      return;
    }
    tries++;
    g.cast[who].emote("think", 1.6);
    await g.say(who, hint.en, hint.ja);
  }
}

// ---------------------------------------------------------------- 1. good morning
async function stepArrive(g: Game) {
  const mori = g.cast.mori;
  g.focus(g.talkView(g.player, mori));
  mori.setBase("sad");
  await wait(0.5);
  mori.setBase("idle");
  mori.emote("surprised", 1.2);
  await g.say("mori", "Oh! Good morning!", "あら、おはよう！");
  await g.ask({ kind: "command", options: ["goodMorning"], question: { who: "mori", en: "Good morning!" }, help: "あいさつしよう：「Good morning!」" });
  mori.emote("nod", 1);
  await g.say("mori", "You have the **magic pen**!", "まほうのペンを もっているのね！");
  mori.emote("sad", 3);
  g.focus(VIEWS.overview);
  await g.say("mori", "Look… my classroom is **erased**!", "みて… きょうしつが きえちゃったの！");
  await g.say("mori", "No **desks**, no **chairs**, no **numbers** on the clock!", "つくえも いすも、とけいの すうじも ないの！");
  await g.say("mori", "The children come at **eight thirty**. Please help me!", "みんなは 8じ30ぷんに くるの。てつだって！");
  g.completeStep("arrive");
}

// ---------------------------------------------------------------- 2. desks and chairs
async function stepDesks(g: Game) {
  const room = g.school;
  const mori = g.cast.mori;
  for (const [id, word] of [["desks", "desk"], ["chairs", "chair"]] as const) {
    if (g.slotDone(id)) continue;
    const slot = room.slots[id];
    g.focus(slot.view);
    if (id === "desks") await g.say("mori", "First, the **desks**. Please draw a **desk**!", "まずは つくえ。つくえを かいてね！");
    else await g.say("mori", "Now the **chairs**. Please draw a **chair**!", "つぎは いす。いすを かいてね！");
    g.objective(id === "desks" ? "Click the desk places!" : "Click the chair places!", id === "desks" ? "つくえの ばしょを クリック！" : "いすの ばしょを クリック！", slot.marker);
    await g.waitSlot([id]);
    const out = await g.drawFor(word, slot, { help: 1 });
    await g.restore(id, out);
    mori.emote("cheer", 1.6);
    await g.say("mori", id === "desks" ? "**Desks**! Wonderful!" : "**Chairs**! Thank you!", id === "desks" ? "つくえ！ すてき！" : "いす！ ありがとう！");
  }
  g.completeStep("desks");
}

// ---------------------------------------------------------------- 3. the clock
async function stepClock(g: Game) {
  const room = g.school;
  const mori = g.cast.mori;
  g.focus(VIEWS.clock);
  await g.say("mori", "What time is it? Hmm… my **clock** has no **numbers**!", "なんじかな？ あれ、とけいに すうじが ない！");
  await g.say("mori", "Please write the **numbers**: **12**, **3**, **6** and **9**!", "すうじを かいてね：12、3、6、9！");
  let first = true;
  for (const key of CLOCK_KEYS) {
    if (room.hasGlyph(key)) continue;
    const ch = GLYPH_CHARS[key];
    const spot = room.spots[key];
    g.objective(`Click the place for ${ch} on the clock!`, `とけいの ${ch} の ばしょを クリック！`, spot.marker);
    await g.waitSlot([key], VIEWS.clock);
    const out = await g.writeGlyph(ch, spot, { firstTime: first });
    first = false;
    await placeGlyph(g, key, out.drawings);
    mori.emote("nod", 0.9);
    await g.say("mori", `**${ch}**! Good!`, `${ch}！ いいね！`);
  }
  // The magic writes the other numbers and the hands spin to eight o'clock.
  g.focus(VIEWS.clock);
  audio.magic();
  g.effects.burst(new THREE.Vector3(CLOCK.x, CLOCK.y, CLOCK.z + 0.2), 50);
  room.setClockFull(true);
  const { group, hour, minute } = room.handObjects;
  group.visible = true;
  await animate(1.6, (k) => {
    const turns = ease.out(k);
    minute.rotation.z = -turns * Math.PI * 2 * 8;
    hour.rotation.z = -turns * ((8 / 12) * Math.PI * 2);
  });
  room.setTime(8, 0);
  audio.bounce(1.4);
  mori.emote("cheer", 1.6);
  await g.say("mori", "My **clock** works again!", "とけいが うごいた！");
  g.completeStep("clock");
}

/** The written character flies onto the clock or the card in the child's own handwriting. */
async function placeGlyph(g: Game, key: GlyphKey, drawings: Drawing[]) {
  const room = g.school;
  const spot = room.spots[key];
  const combined: Drawing = { strokes: drawings.flatMap((d) => d.strokes) };
  const art = artFromDrawing(combined);
  g.focus(spot.view);
  // A sparkle trail from the page to its place.
  const at = spot.hotspot.position.clone();
  audio.whoosh(0.5);
  await animate(0.5, (k) => {
    if (Math.random() < 0.8) g.effects.twinkle(at.clone().add(new THREE.Vector3((1 - k) * 0.6, (1 - k) * -0.8, (1 - k) * 1.2)), 0.12);
  });
  room.setGlyph(key, art);
  g.effects.burst(at.clone().add(new THREE.Vector3(0, 0, 0.1)), 26, { speed: 1, size: 0.08 });
  audio.sparkle(6);
  g.saveGlyph(key, art, at);
}

// ---------------------------------------------------------------- 4. what time is it?
async function stepTime(g: Game) {
  const room = g.school;
  room.setTime(8, 0);
  const mori = g.cast.mori;
  g.player.faceTo(mori.position.x, mori.position.z);
  g.focus(VIEWS.clock);
  await g.say("mori", "Now… **what time is it**?", "では… いま なんじ？");
  await askTime(g, "mori", "itsEight", "itsSeven", { en: "Look at the clock! The short hand is on **8**.", ja: "とけいを みて！ みじかい はりは 8 だよ。" });
  mori.emote("cheer", 1.4);
  await g.say("mori", "Yes! **It's eight o'clock.** Thank you!", "そう！ 8じです。ありがとう！");
  g.completeStep("time");
}

// ---------------------------------------------------------------- 5. the alphabet strip
const RUN_UP: Record<string, string> = { d: "a, b, c", g: "e, f", m: "h, i, j, k, l", t: "n, o, p, q, r, s" };

/** "a, b, c" shown in lowercase, spoken as letter names. */
function letters(list: string): string {
  return list
    .split(", ")
    .map((c) => `{${c}|${c.toUpperCase()}}`)
    .join(", ");
}

async function stepLetters(g: Game) {
  const room = g.school;
  const mori = g.cast.mori;
  g.focus(VIEWS.strip);
  await g.say("mori", "Look at our **ABC**! Some letters are **missing**.", "ABCを みて！ もじが たりないの。");
  await g.say("mori", "Let's say the **ABC** together!", "いっしょに ABCを いおう！");
  let first = true;
  for (const key of LETTER_KEYS) {
    const ch = GLYPH_CHARS[key];
    if (room.hasGlyph(key)) continue;
    const spot = room.spots[key];
    g.focus(spot.view);
    await g.say("mori", `${letters(RUN_UP[ch])}… Oh!`, "");
    mori.emote("surprised", 1);
    await g.say("mori", `**{${ch}|${ch.toUpperCase()}}** is missing! Please write **{${ch}|${ch.toUpperCase()}}**!`, `「${ch}」が ない！ 「${ch}」を かいてね！`);
    g.objective(`Click the empty card!`, "からっぽの カードを クリック！", spot.marker);
    await g.waitSlot([key], spot.view);
    const out = await g.writeGlyph(ch, spot, { firstTime: first });
    first = false;
    await placeGlyph(g, key, out.drawings);
    mori.emote("nod", 0.9);
    await g.say("mori", `**{${ch}|${ch.toUpperCase()}}**! Great!`, `「${ch}」！ すごい！`);
  }
  g.focus(VIEWS.strip);
  await g.say("mori", `All together! ${letters("a, b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z")}!`, "ぜんぶ いえたね！");
  mori.emote("cheer", 1.6);
  g.completeStep("letters");
}

// ---------------------------------------------------------------- 6. the children come, the bell rings
async function stepBell(g: Game) {
  const room = g.school;
  const mori = g.cast.mori;
  await g.say("mori", "The classroom is ready. Here come the children!", "きょうしつの じゅんびが できた。みんなが くるよ！");
  await g.player.go(2.9, 2.35);
  for (let i = 0; i < STUDENTS.length; i++) {
    const id = STUDENTS[i];
    const c = g.cast[id];
    await g.npcEnter(id, 3.3, 1.65, { keepDoor: i < STUDENTS.length - 1 });
    c.faceTo(g.player.position.x, g.player.position.z);
    g.player.faceTo(c.position.x, c.position.z);
    g.focus(g.talkView(g.player, c));
    c.emote("wave", 1.2);
    await g.say(id, "Good morning!", "おはよう！");
    if (i === 0) await g.ask({ kind: "command", options: ["goodMorning"], question: { who: id, en: "Good morning!" }, help: "「Good morning!」と こたえよう" });
    else g.player.emote("wave", 1);
    if (id === "taro" && g.save.store.slots.schoolbags) {
      c.emote("jump", 1.2);
      await g.say("taro", "Look! My **schoolbag**!", "みて！ ぼくの ランドセル！");
    }
    const s = seatOf(i);
    void c.go(s.x, s.z).then(() => c.faceTo(s.x, s.z - 2));
  }
  void animate(0.5, (k) => room.setDoor(1 - ease.inOut(k)));
  await wait(1.2);
  // The clock moves on to half past eight.
  g.focus(VIEWS.clock);
  const { minute, hour } = room.handObjects;
  audio.whoosh(0.8);
  await animate(1.2, (k) => {
    minute.rotation.z = -ease.inOut(k) * Math.PI;
    hour.rotation.z = -((8 + 0.5 * ease.inOut(k)) / 12) * Math.PI * 2;
  });
  room.setTime(8, 30);
  const ken = g.cast.ken;
  await g.say("ken", "Excuse me… **what time is it**?", "ねえ、いま なんじ？");
  await askTime(g, "ken", "itsEightThirty", "itsEight", { en: "Hmm… the long hand is on **6**. That's **thirty**!", ja: "ながい はりは 6。30ぷん だよ！" });
  ken.emote("cheer", 1);
  await g.say("ken", "**Eight thirty**! Thank you!", "8じ30ぷん！ ありがとう！");
  // The school chime.
  g.focus(VIEWS.class);
  const len = audio.chime();
  room.ring(len);
  music.setLevel(0.3);
  STUDENTS.forEach((id, i) => {
    const c = g.cast[id];
    const s = seatOf(i);
    void c.go(s.x, s.z).then(() => c.faceTo(s.x, s.z - 2));
  });
  await wait(Math.min(len, 5.5));
  g.player.faceTo(-3.0, -2.3);
  mori.emote("wave", 1.4);
  await g.say("mori", "Good morning, everyone!", "みなさん、おはようございます！");
  for (const id of STUDENTS) g.cast[id].emote("wave", 1.4);
  await g.say("ken", "Good morning, **Ms. Mori**!", "おはようございます、もり先生！");
  const before = placeProgress(g.save, "school");
  g.completeStep("bell");
  g.progressed(new THREE.Vector3(0, 1, -1), before);
}

// ---------------------------------------------------------------- class begins
async function finale(g: Game) {
  g.focus(VIEWS.overview);
  g.engine.setLensShift(0.1);
  await wait(1.6);
  music.setLevel(1);
  audio.fanfare();
  for (let i = 0; i < 3; i++) {
    g.effects.confetti({ x: -2 + i * 2, y: 2.6, z: -0.5 }, 90);
    await wait(0.25);
  }
  for (const c of [g.player, g.cast.mori, g.cast.ken, g.cast.yui, g.cast.taro]) c.emote("cheer", 2.5);
  await g.say("mori", "My classroom is **back**! Thank you!", "きょうしつが もどった！ ほんとうに ありがとう！");
  await g.say("narrator", "The Classroom is restored!", "きょうしつが もとに もどった！");
  g.dialogue.hide();
  // Four cards (fits a Chromebook screen): desks, chairs, their numbers round a clock, their letters in a row.
  const items: AlbumItem[] = [];
  for (const id of ["desks", "chairs"] as const) {
    const art = g.save.school.slots[id]?.arts?.[0];
    items.push({ word: id === "desks" ? "Desks" : "Chairs", drawing: art ? artToDrawing(art) : null });
  }
  const glyph = (k: GlyphKey) => {
    const a = g.save.school.glyphs[k];
    return a ? artToDrawing(a) : null;
  };
  // 12 at the top, 3 right, 6 bottom, 9 left.
  const ring: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  items.push({ word: "Clock", drawing: compose(CLOCK_KEYS.map(glyph), (i) => [ring[i][0] * 150, ring[i][1] * 150]) });
  items.push({ word: "ABC", drawing: compose(LETTER_KEYS.map(glyph), (i) => [i * 125, 0]) });
  await completionCard(g.ui, "Class has started!", "じゅぎょうが はじまったよ！", items, "Great!", "やったね！");
}

/** Several drawings in one picture: each scaled to the same height and centred at `at(i)`. */
function compose(parts: (Drawing | null)[], at: (i: number) => [number, number]): Drawing | null {
  const strokes: Drawing["strokes"] = [];
  parts.forEach((d, i) => {
    if (!d) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of d.strokes)
      for (const [x, y] of s.points) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    if (minX === Infinity) return;
    const k = 100 / Math.max(1, maxY - minY);
    const [cx, cy] = at(i);
    const ox = cx - ((minX + maxX) / 2) * k;
    const oy = cy - ((minY + maxY) / 2) * k;
    for (const s of d.strokes) strokes.push({ ...s, points: s.points.map(([x, y]) => [ox + x * k, oy + y * k] as [number, number]) });
  });
  return strokes.length ? { strokes } : null;
}
