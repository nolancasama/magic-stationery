/**
 * Level 5 — Coach Kato's Gym (SPEC.md §9). Content and order only.
 *
 * 1. "Hello!" — sports-festival day, and everything is erased.
 * 2. Soccer: draw a soccer ball. Ken: "Let's play soccer!" — "Yes, let's!" —
 *    he kicks it into the goal. "Do you like soccer?" (both answers right).
 * 3. Basketball: draw a basketball and trace the hoop. Yui shoots: swish!
 *    "What sport do you like?" — "I like ___."
 * 4. Tennis: draw a racket. Taro: "Let's play tennis!" — "Yes, let's!" — he
 *    and Coach Kato rally with the child's rackets.
 * 5. Baseball: draw a bat. The player asks Coach Kato "What sport do you
 *    like?" — "I like baseball!" — she pitches, Ken hits a home run.
 * 6. The sports festival: everyone from the town comes; the player says
 *    "Let's play!" The whole town is restored. This is the game's ending: it
 *    waits until the classroom, zoo and supermarket are restored too
 *    (`festivalOpen`); before that Coach Kato asks the player to come back.
 * The child's drawings are the equipment people play with.
 */
import * as THREE from "three";
import { audio } from "../../audio/audio.ts";
import { music } from "../../audio/music.ts";
import { artToDrawing } from "../../draw/art.ts";
import { buildPlayBall } from "../../objects/gym.ts";
import type { Living } from "../../objects/living.ts";
import type { WordId } from "../../recognition/vocab.ts";
import type { PhraseId } from "../../speech/phrases.ts";
import { completionCard, type AlbumItem } from "../../ui/screens.ts";
import { GOAL, KATO_SPOT, RINGS, VIEWS, type GymSlotId } from "../../world/areas/gym.ts";
import type { Character } from "../../world/characters.ts";
import { animate, wait } from "../../world/tween.ts";
import { festivalOpen, GYM_SLOT_KEYS, placeProgress } from "../save.ts";
import type { Game, NpcId } from "../game.ts";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export async function runGym(g: Game) {
  g.scripting = true;
  // Friends who have already played come back to the gym.
  if (g.stepDone("soccer")) player(g, "ken", -1.4, 1.2);
  if (g.stepDone("basketball")) player(g, "yui", -0.4, 1.6);
  if (g.stepDone("tennis")) player(g, "taro", 1.2, 1.3);
  await g.player.go(2.9, 1.9);
  g.player.faceTo(KATO_SPOT.x, KATO_SPOT.z);
  if (!g.stepDone("coach")) await stepCoach(g);
  if (!g.stepDone("soccer")) await stepSoccer(g);
  if (!g.stepDone("basketball")) await stepBasketball(g);
  if (!g.stepDone("tennis")) await stepTennis(g);
  if (!g.stepDone("baseball")) await stepBaseball(g);
  const waiting = !g.stepDone("festival") && !festivalOpen(g.save);
  if (waiting) await festivalLater(g);
  else if (!g.stepDone("festival")) {
    await stepFestival(g);
    await finale(g);
  }
  g.scripting = false;
  g.focus(VIEWS.overview);
  g.engine.setLensShift(0);
  g.dialogue.hide();
  if (waiting) g.objective("Help the other places! Then come back. 🏠", "ほかの ばしょも たすけてね！ 🏠");
  else g.objective("The gym is ready! Click the 🏠 to go to town.", "たいいくかんが もどった！ 🏠 で まちに もどれるよ。");
}

/** The gym is ready but the town is not: the festival is the game's ending, so it waits. */
async function festivalLater(g: Game) {
  const kato = g.cast.kato;
  g.player.faceTo(kato.position.x, kato.position.z);
  g.focus(g.talkView(g.player, kato), true);
  kato.emote("wave", 1.2);
  await g.say("kato", "Thank you! The gym is **ready**!", "ありがとう！ たいいくかんの じゅんびが できた！");
  await g.say("kato", "When the **whole town** is back, let's have the **sports festival** here!", "まちが ぜんぶ もどったら、ここで うんどうかいを しよう！");
}

function player(g: Game, id: NpcId, x: number, z: number) {
  const c = g.cast[id];
  c.stop();
  g.inRoom(c);
  c.place(x, z, Math.PI);
  g.startAmbient(id);
}

// ---------------------------------------------------------------- shared helpers
async function drawSlot(g: Game, id: GymSlotId, objective: [string, string], opts: { help?: number } = {}) {
  const slot = g.gym.slots[id];
  g.objective(objective[0], objective[1], slot.marker);
  await g.waitSlot([id]);
  const out = await g.drawFor(slot.word, slot, opts);
  await g.restore(id, out);
}

async function visit(g: Game, id: NpcId, x: number, z: number) {
  const c = g.cast[id];
  g.focus(VIEWS.door, true);
  await g.npcEnter(id, x, z, { frame: false, walkView: VIEWS.overview });
  await g.player.go(x + 0.9, z + 0.3);
  c.faceTo(g.player.position.x, g.player.position.z);
  g.player.faceTo(c.position.x, c.position.z);
  const view = g.talkView(g.player, c);
  // Keep the visitor's feet in the shot when the dialogue panel comes up.
  view.pos.lerp(view.look, -0.2);
  g.focus(view, true);
  await wait(0.35);
  c.emote("wave", 1.2);
}

/** "Let's play ___!" — "Yes, let's!" */
async function letsPlay(g: Game, who: NpcId, sport: string, ja: string) {
  await g.say(who, `Let's play **${sport}**!`, `${ja}を しよう！`);
  await g.ask({ kind: "command", options: ["letsYes"], question: { who, en: `Let's play ${sport}!` }, help: "さそわれたら「Yes, let's!」" });
  g.player.emote("cheer", 1.0);
}

/** "Do you like ___?" — the child's preference: both answers are right, and the asker answers back. */
async function doYouLike(g: Game, who: NpcId, sport: string, ja: string) {
  const c = g.cast[who];
  await g.say(who, `Do you like **${sport}**?`, `${ja}は すき？`);
  const id = await g.ask({ kind: "choice", options: ["likeYes", "likeNo"], question: { who, en: `Do you like ${sport}?` }, help: "すきなら Yes, I do. ／ すきじゃないなら No, I don't." });
  if (id === "likeYes") {
    g.player.emote("nod", 0.8);
    c.emote("cheer", 1.4);
    await g.say(who, "**Me too!**", "ぼくも！");
  } else {
    g.player.emote("shake", 0.8);
    c.emote("surprised", 1.2);
    await g.say(who, `Oh! I **like** ${sport}!`, `そうなんだ！ ぼくは ${ja}が すき！`);
  }
}

const SPORT_OPTIONS: PhraseId[] = ["iLikeSoccer", "iLikeBasketball", "iLikeTennis", "iLikeBaseball"];
const SPORTS: Partial<Record<PhraseId, [string, string]>> = {
  iLikeSoccer: ["soccer", "サッカー"],
  iLikeBasketball: ["basketball", "バスケットボール"],
  iLikeTennis: ["tennis", "テニス"],
  iLikeBaseball: ["baseball", "やきゅう"]
};

// ---------------------------------------------------------------- balls in flight
/** A copy of the child's drawing (or the model) as a ball that spins about its own centre. */
function makeBall(g: Game, word: WordId, scale = 1): { obj: THREE.Group; rad: number } {
  const m = g.makeItem(word, 0, g.artFor(word), null);
  const h = (m as Living).art ? (m as Living).h : m.height;
  const holder = new THREE.Group();
  m.root.position.set(0, -h / 2, 0);
  holder.add(m.root);
  holder.scale.setScalar(scale);
  g.room.scene.add(holder);
  return { obj: holder, rad: (h / 2) * scale };
}

/** Fly from `from` to `to` in `dur` seconds, rising `apex` above the straight line, spinning. */
async function flight(ball: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, apex: number, dur: number, spin = 10) {
  await animate(dur, (k, dt) => {
    ball.position.lerpVectors(from, to, k);
    ball.position.y += 4 * apex * k * (1 - k);
    ball.rotation.z -= spin * dt;
  });
  ball.position.copy(to);
}

/** Bounce and roll on the floor from where it is, losing height each bounce, rolling as it moves. */
async function bounceOut(ball: THREE.Object3D, rad: number, vel: THREE.Vector3, seconds = 1.6) {
  const vy = { v: vel.y };
  await animate(seconds, (_k, dt) => {
    vy.v -= 9.8 * dt;
    ball.position.x += vel.x * dt;
    ball.position.z += vel.z * dt;
    ball.position.y += vy.v * dt;
    if (ball.position.y < rad) {
      ball.position.y = rad;
      if (vy.v < -0.6) audio.bounce(1.2 + Math.random() * 0.2);
      vy.v = -vy.v * 0.6;
      vel.x *= 0.85;
      vel.z *= 0.85;
    }
    ball.rotation.z -= (vel.x * dt) / Math.max(0.05, rad);
  });
}

// ---------------------------------------------------------------- 1. hello
async function stepCoach(g: Game) {
  const kato = g.cast.kato;
  await g.player.go(KATO_SPOT.x + 1.0, KATO_SPOT.z + 0.6);
  g.player.faceTo(kato.position.x, kato.position.z);
  g.focus(g.talkView(g.player, kato));
  kato.emote("wave", 1.2);
  await g.say("kato", "Hello! Welcome to the **gym**!", "こんにちは！ たいいくかんへ ようこそ！");
  await g.ask({ kind: "command", options: ["hello"], question: { who: "kato", en: "Hello!" }, help: "あいさつしよう：「Hello!」" });
  kato.emote("sad", 2.5);
  g.focus(VIEWS.overview);
  await g.say("kato", "Today is the **sports festival**… but look! Everything is **erased**!", "きょうは うんどうかい… でも みて！ ぜんぶ きえちゃった！");
  await g.say("kato", "Please draw our **balls** and **rackets** with your magic pen!", "まほうの ペンで ボールや ラケットを かいて！");
  g.completeStep("coach");
}

// ---------------------------------------------------------------- 2. soccer
async function stepSoccer(g: Game) {
  const kato = g.cast.kato;
  if (!g.slotDone("soccerBalls")) {
    g.focus(VIEWS.cart);
    await g.say("kato", "The ball cart is empty. Please draw a **soccer ball**!", "ボールの カートが からっぽ。サッカーボールを かいて！");
    await drawSlot(g, "soccerBalls", ["Click the ball cart!", "ボールの カートを クリック！"]);
    kato.emote("cheer", 1.4);
    await g.say("kato", "**Soccer balls**! Great!", "サッカーボール！ すごい！");
  }
  await visit(g, "ken", -1.2, 1.0);
  await g.say("ken", "Hi! A **soccer ball**!", "やあ！ サッカーボールだ！");
  await letsPlay(g, "ken", "soccer", "サッカー");
  await kick(g, g.cast.ken);
  g.player.faceTo(g.cast.ken.position.x, g.cast.ken.position.z);
  g.cast.ken.faceTo(g.player.position.x, g.player.position.z);
  g.focus(g.talkView(g.player, g.cast.ken));
  await doYouLike(g, "ken", "soccer", "サッカー");
  g.startAmbient("ken");
  g.completeStep("soccer");
}

/** Ken dribbles up and kicks the ball into the goal. */
async function kick(g: Game, ken: Character) {
  g.focus(VIEWS.goal);
  const { obj: ball, rad } = makeBall(g, "soccerBall", 0.8);
  const spot = v(-2.1, rad, 0.75);
  ball.position.copy(spot);
  await ken.go(spot.x + 0.45, spot.z + 0.05);
  ken.faceTo(GOAL.x, GOAL.z);
  await wait(0.3);
  ken.emote("jump", 0.5);
  audio.bounce(0.8);
  const net = v(GOAL.x - 0.3, 0.45, GOAL.z + 0.1);
  await flight(ball, spot, net, 0.25, 0.5, 14);
  audio.whoosh(0.3);
  g.effects.burst(net, 30, { colors: ["#ffffff", "#fdd835", "#66bb6a"], speed: 1.2, size: 0.05 });
  audio.fanfare();
  ken.emote("cheer", 1.8);
  await bounceOut(ball, rad, v(0.6, 1.2, 0), 1.2);
  await g.say("ken", "**Goal!** Yay!", "ゴール！ やったー！");
  g.room.scene.remove(ball);
}

// ---------------------------------------------------------------- 3. basketball
async function stepBasketball(g: Game) {
  const kato = g.cast.kato;
  if (!g.slotDone("basketballs")) {
    g.focus(VIEWS.rack);
    await g.say("kato", "Now **basketball**! Please draw a **basketball**!", "つぎは バスケットボール！ バスケットボールを かいて！");
    await drawSlot(g, "basketballs", ["Click the ball rack!", "ボールの たなを クリック！"]);
    kato.emote("cheer", 1.4);
  }
  if (!g.slotDone("hoops")) {
    g.focus(VIEWS.hoops);
    await g.say("kato", "Oh no, the **hoops** are erased too! Let's make one: trace the lines!", "ゴールの わも きえてる！ せんを なぞって つくろう！");
    await drawSlot(g, "hoops", ["Click the backboard!", "ボードを クリック！"], { help: 2 });
    kato.emote("cheer", 1.4);
    await g.say("kato", "Two **hoops**! Wonderful!", "ゴールが ふたつ！ すばらしい！");
  }
  await visit(g, "yui", -1.8, -0.6);
  await g.say("yui", "Hello! Can I shoot?", "こんにちは！ シュートしても いい？");
  await shoot(g, g.cast.yui);
  g.player.faceTo(g.cast.yui.position.x, g.cast.yui.position.z);
  g.cast.yui.faceTo(g.player.position.x, g.player.position.z);
  g.focus(g.talkView(g.player, g.cast.yui));
  await g.say("yui", "**What sport do you like?**", "どんな スポーツが すき？");
  const id = await g.ask({ kind: "choice", options: SPORT_OPTIONS, question: { who: "yui", en: "What sport do you like?" }, help: "すきな スポーツを えらんで いおう：I like ___." });
  const [sport, ja] = SPORTS[id] ?? ["soccer", "サッカー"];
  g.player.emote("cheer", 1);
  if (id === "iLikeBasketball") {
    g.cast.yui.emote("jump", 1.4);
    await g.say("yui", "**Basketball**! Me too!", "バスケットボール！ わたしも！");
  } else {
    g.cast.yui.emote("nod", 1.2);
    await g.say("yui", `**${sport[0].toUpperCase() + sport.slice(1)}**! Cool! I like **basketball**.`, `${ja}！ いいね！ わたしは バスケットボールが すき。`);
  }
  g.startAmbient("yui");
  g.completeStep("basketball");
}

/** Yui throws a basketball in an arc: it drops through the ring and bounces away. */
async function shoot(g: Game, yui: Character) {
  g.focus(VIEWS.hoops);
  const ring = RINGS[0];
  await yui.go(ring.x + 0.6, ring.z + 1.6);
  yui.faceTo(ring.x, ring.z);
  const { obj: ball, rad } = makeBall(g, "basketball", 0.7);
  const hands = yui.position.clone().add(v(0, 1.0, 0));
  ball.position.copy(hands);
  await wait(0.4);
  yui.emote("jump", 0.6);
  const over = ring.clone().add(v(0, 0.3, 0));
  await flight(ball, hands, over, 0.9, 0.85, 8);
  // Swish: straight down through the net.
  audio.whoosh(0.4);
  await animate(0.3, (k) => (ball.position.y = over.y - k * 0.6));
  g.effects.burst(ring.clone(), 24, { colors: ["#ff7043", "#ffffff"], speed: 1.0, size: 0.05 });
  audio.sparkle(5);
  yui.emote("cheer", 1.8);
  await bounceOut(ball, rad, v(0.4, 0.0, 1.2), 1.4);
  await g.say("yui", "**Nice shot!** Yay!", "ナイスシュート！ やったー！");
  g.room.scene.remove(ball);
}

// ---------------------------------------------------------------- 4. tennis
async function stepTennis(g: Game) {
  const kato = g.cast.kato;
  if (!g.slotDone("rackets")) {
    g.focus(VIEWS.wall);
    await g.say("kato", "Look, no **rackets**! Please draw a **racket**!", "ラケットが ない！ ラケットを かいて！");
    await drawSlot(g, "rackets", ["Click the racket wall!", "ラケットの かべを クリック！"]);
    kato.emote("cheer", 1.4);
    await g.say("kato", "**Rackets**! Let's play!", "ラケット！ あそぼう！");
  }
  await visit(g, "taro", -1.6, 0.4);
  await g.say("taro", "Hello! I want to play **tennis**!", "こんにちは！ テニスが したい！");
  await letsPlay(g, "taro", "tennis", "テニス");
  await rally(g, g.cast.taro, kato);
  g.startAmbient("taro");
  g.completeStep("tennis");
}

/** Taro and Coach Kato hit a ball back and forth with the child's rackets. */
async function rally(g: Game, a: Character, b: Character) {
  g.focus(VIEWS.court);
  const ends = [v(-1.7, 0, 0.5), v(1.7, 0, 0.5)];
  await Promise.all([a.go(ends[0].x, ends[0].z), b.go(ends[1].x, ends[1].z)]);
  a.faceTo(ends[1].x, ends[1].z);
  b.faceTo(ends[0].x, ends[0].z);
  for (const c of [a, b]) g.holdItem(c, "racket", g.makeItem("racket", 0, g.artFor("racket"), null), 0.6);
  const ball = buildPlayBall("#d4e157");
  g.room.scene.add(ball);
  const hit = (c: Character) => c.position.clone().add(v(c === a ? 0.35 : -0.35, 0.9, 0));
  let from = hit(a);
  ball.position.copy(from);
  for (let i = 0; i < 6; i++) {
    const hitter = i % 2 === 0 ? a : b;
    const other = i % 2 === 0 ? b : a;
    hitter.emote("give", 0.4);
    audio.pop(1.6 + (i % 2) * 0.2);
    const to = hit(other);
    await flight(ball, from, to, 0.7, 0.75, 6);
    from = to;
  }
  audio.sparkle(4);
  for (const c of [a, b]) c.emote("cheer", 1.4);
  g.room.scene.remove(ball);
  await g.say("taro", "That was fun! **Thank you!**", "たのしかった！ ありがとう！");
  for (const c of [a, b]) g.dropFromHand(c);
  void b.go(KATO_SPOT.x, KATO_SPOT.z);
}

// ---------------------------------------------------------------- 5. baseball
async function stepBaseball(g: Game) {
  const kato = g.cast.kato;
  if (!g.slotDone("bats")) {
    g.focus(VIEWS.wall);
    await g.say("kato", "The bat bucket is empty. Please draw a **bat**! Make it long!", "バットが ない！ バットを かいて！ ながーく！");
    await drawSlot(g, "bats", ["Click the bat bucket!", "バットの バケツを クリック！"]);
    kato.emote("cheer", 1.4);
  }
  await kato.go(KATO_SPOT.x, KATO_SPOT.z);
  await g.player.go(KATO_SPOT.x + 1.0, KATO_SPOT.z + 0.6);
  kato.faceTo(g.player.position.x, g.player.position.z);
  g.player.faceTo(kato.position.x, kato.position.z);
  g.focus(g.talkView(g.player, kato));
  await g.say("narrator", "Ask Coach Kato about her favourite sport!", "かとう コーチに すきな スポーツを きいてみよう！");
  await g.ask({ kind: "command", options: ["whatSport"], question: { who: "kato", en: "…" }, help: "「What sport do you like?」と きこう" });
  kato.emote("cheer", 1.4);
  await g.say("kato", "I like **baseball**! Let's play! Ken, come here!", "やきゅうが すき！ やろう！ ケン、おいで！");
  await homeRun(g, kato, g.cast.ken);
  g.startAmbient("ken");
  g.completeStep("baseball");
}

/** Coach Kato pitches; Ken swings the child's bat; the ball flies out over the gym's back wall. */
async function homeRun(g: Game, pitcher: Character, batter: Character) {
  g.stopAmbient("ken");
  g.inRoom(batter);
  g.focus(VIEWS.court);
  await Promise.all([pitcher.go(1.8, 0.4), batter.go(-1.4, 0.4)]);
  pitcher.faceTo(-1.4, 0.4);
  batter.faceTo(1.8, 0.4);
  g.holdItem(batter, "bat", g.makeItem("bat", 0, g.artFor("bat"), null), 0.75);
  const ball = buildPlayBall("#fafafa", 0.045);
  g.room.scene.add(ball);
  const release = pitcher.position.clone().add(v(-0.3, 1.2, 0));
  const plate = batter.position.clone().add(v(0.35, 0.8, 0));
  ball.position.copy(release);
  await g.say("kato", "Ready? Here it comes!", "いくよ！");
  g.dialogue.hide();
  pitcher.emote("give", 0.5);
  await flight(ball, release, plate, 0.15, 0.55, 12);
  batter.emote("jump", 0.6);
  audio.tone(196, 0.06, { type: "square", gain: 0.2 });
  audio.bounce(2.2);
  g.effects.burst(plate, 20, { colors: ["#ffffff", "#fdd835"], speed: 1.4, size: 0.05 });
  // Up and away over the back wall.
  const out = v(2.8, 5.6, -4.6);
  await flight(ball, plate, out, 2.2, 1.3, 16);
  g.room.scene.remove(ball);
  audio.fanfare();
  for (const c of [batter, pitcher, g.player]) c.emote("cheer", 1.8);
  await g.say("ken", "**Home run!** Yay!", "ホームラン！ やったー！");
  g.dropFromHand(batter);
  void pitcher.go(KATO_SPOT.x, KATO_SPOT.z);
}

// ---------------------------------------------------------------- 6. the sports festival
const GUESTS: [NpcId, number, number][] = [
  ["penny", -2.6, 1.2],
  ["mori", -1.7, 1.5],
  ["oka", 1.7, 1.5],
  ["green", 2.6, 1.2]
];

async function stepFestival(g: Game) {
  const kato = g.cast.kato;
  await kato.go(0.0, 0.3);
  kato.faceTo(0, 3);
  g.focus(VIEWS.overview);
  await g.say("kato", "The gym is ready! Let's call **everyone**!", "たいいくかんが もどった！ みんなを よぼう！");
  for (const [id, x, z] of GUESTS) {
    await g.npcEnter(id, x, z, { keepDoor: true, frame: false });
    g.cast[id].faceTo(0, 0.3);
    g.cast[id].emote("wave", 1.0);
  }
  void (async () => {
    await wait(0.6);
    g.room.setDoor(0);
  })();
  for (const id of ["ken", "yui", "taro"] as NpcId[]) {
    g.stopAmbient(id);
    const c = g.cast[id];
    c.stop();
    g.inRoom(c);
  }
  await Promise.all([g.cast.ken.go(-0.9, 1.9), g.cast.yui.go(0.0, 2.1), g.cast.taro.go(0.9, 1.9), g.player.go(0.0, 1.2)]);
  for (const c of [g.cast.ken, g.cast.yui, g.cast.taro, g.player]) c.faceTo(0, 0.3);
  g.player.faceTo(kato.position.x, kato.position.z);
  g.focus(VIEWS.court);
  await g.say("penny", "Wow! The town is **back in colour**!", "わあ！ まちに いろが もどった！");
  await g.say("kato", "Everyone is here! Please start the **sports festival**!", "みんな そろった！ うんどうかいを はじめて！");
  await g.ask({ kind: "command", options: ["letsPlay"], question: { who: "kato", en: "Start the sports festival!" }, help: "「Let's play!」で はじめよう！" });
  const before = placeProgress(g.save, "gym");
  g.completeStep("festival");
  g.progressed(v(0, 1, 0.5), before);
}

// ---------------------------------------------------------------- the whole town is back
async function finale(g: Game) {
  g.focus(VIEWS.overview);
  g.engine.setLensShift(0.1);
  music.setLevel(1);
  audio.fanfare();
  for (let i = 0; i < 4; i++) {
    g.effects.confetti({ x: -3 + i * 2, y: 2.8, z: 0.6 }, 100);
    await wait(0.25);
  }
  const everyone = [g.player, ...Object.values(g.cast)].filter((c) => c.root.parent === g.gym.scene);
  for (const c of everyone) c.emote("cheer", 3);
  // Balls bounce up all over the gym.
  const balls: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const { obj, rad } = makeBall(g, i % 2 ? "basketball" : "soccerBall", 0.7);
    obj.position.set(-2.4 + i * 1.6, rad, 0.2);
    balls.push(obj);
    void bounceOut(obj, rad, v((Math.random() - 0.5) * 1.2, 4 + Math.random(), (Math.random() - 0.5) * 0.8), 2.6);
  }
  await wait(1.2);
  await g.say("kato", "The sports festival **starts**! Thank you!", "うんどうかいの はじまり！ ほんとうに ありがとう！");
  await g.say("narrator", "The whole town is **restored**! You did it!", "まちが ぜんぶ もとに もどった！ やったね！");
  g.dialogue.hide();
  for (const b of balls) g.room.scene.remove(b);
  const names: Record<GymSlotId, string> = { soccerBalls: "Soccer ball", basketballs: "Basketball", hoops: "Hoop", rackets: "Racket", bats: "Bat" };
  const items: AlbumItem[] = GYM_SLOT_KEYS.map((id) => {
    const art = g.save.gym.slots[id]?.arts?.[0];
    return { word: names[id], drawing: art ? artToDrawing(art) : null };
  });
  await completionCard(g.ui, "The sports festival!", "うんどうかいだ！", items, "Hooray!", "やったー！");
}
