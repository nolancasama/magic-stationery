/**
 * The game controller: owns the engine, the places, the cast, the UI and the
 * recogniser, and offers the shared helpers every level script uses
 * (say / ask / yesNo / waitSlot / drawFor / restore / npcEnter ...).
 * Level scripts (levels/*.ts) contain only content and order.
 */
import * as THREE from "three";
import { audio } from "../audio/audio.ts";
import { music } from "../audio/music.ts";
import { INK, dominantCrayon, strokesOf, type Crayon, type Drawing } from "../draw/drawing.ts";
import { buildMagicPen } from "../objects/stationery.ts";
import type { Made } from "../objects/made.ts";
import { WORD_KINDS, buildSurprise } from "../objects/registry.ts";
import { copyFrom, flySketch, materialize, poof } from "../objects/transform.ts";
import { judge, liveGuess, type Verdict } from "../recognition/policy.ts";
import type { Recognizer } from "../recognition/recognizer.ts";
import { exampleFor } from "../recognition/examples.ts";
import { WORDS, withArticle, wordWithArticle, type WordId } from "../recognition/vocab.ts";
import { simplifyLikeQuickDraw } from "../recognition/strokes.ts";
import type { PhraseId } from "../speech/phrases.ts";
import { tts } from "../speech/tts.ts";
import { AskPrompt, type AskSpec } from "../ui/ask.ts";
import { Dialogue, type Speaker } from "../ui/dialogue.ts";
import { h } from "../ui/dom.ts";
import { DrawPanel } from "../ui/drawPanel.ts";
import { Hud } from "../ui/hud.ts";
import { placeLabel, settingsDialog } from "../ui/screens.ts";
import { DOOR, PENNY_SPOT, ROOM, StoreArea, VIEWS, type Slot, type SlotId, type View } from "../world/areas/store.ts";
import { TOWN_VIEW, TownArea, type PlaceId } from "../world/areas/town.ts";
import { Character } from "../world/characters.ts";
import { Effects } from "../world/effects.ts";
import { Engine } from "../world/engine.ts";
import { worldUniforms } from "../world/materials.ts";
import { animate, arc, ease, wait } from "../world/tween.ts";
import { CAST, type CastId } from "./cast.ts";
import { isBuilt } from "./levels/index.ts";
import { STORE_STEPS, SLOT_KEYS, load, store as persist, storeProgress, type SaveData, type StoreStep } from "./save.ts";

export type NpcId = "penny" | "ken" | "yui" | "taro";

export interface DrawOutcome {
  drawing: Drawing;
  rect: DOMRect;
  crayon: Crayon | null;
  how: "model" | "rule" | "help" | "nomodel";
}

export interface DrawOptions {
  firstTime?: boolean;
  /** Help level at the first attempt (the ladder can raise it). */
  help?: number;
  starColor?: string | null;
  color?: string;
  /** The colour asked for (crayon task). */
  colorWord?: Crayon | null;
}

/** Copy colours used when the magic fills a display. */
const COPY_TINTS: Partial<Record<WordId, (string | null)[]>> = {
  pencil: ["#64b5f6", "#81c784"],
  eraser: ["#ef5350", "#66bb6a"],
  scissors: ["#42a5f5"],
  ruler: ["#80deea", "#ffab91"],
  book: ["#42a5f5", "#66bb6a", "#ffa726", "#ab47bc", "#ef5350"],
  notebook: ["#81c784", "#ffb74d"],
  schoolbag: ["#263238", "#6d4c41"]
};

export class Game {
  readonly engine: Engine;
  readonly effects = new Effects();
  readonly store = new StoreArea();
  readonly town = new TownArea();
  readonly ui: HTMLDivElement;
  readonly hud: Hud;
  readonly dialogue: Dialogue;
  readonly asker: AskPrompt;
  readonly draw: DrawPanel;
  readonly player: Character;
  readonly cast: Record<NpcId, Character>;
  readonly storage: Storage | null;
  save: SaveData;
  recognizer: Recognizer | null = null;
  area: "store" | "town" | null = null;
  private marker: THREE.Vector3 | null = null;
  private slotWait: { ids: SlotId[]; resolve: (id: SlotId) => void } | null = null;
  private placeWait: { resolve: (id: PlaceId) => void } | null = null;
  private labels = new Map<PlaceId, HTMLDivElement>();
  private ambient = new Set<NpcId>();
  private ambientBusy = new Set<NpcId>();
  private fade: HTMLDivElement;
  scripting = false;
  /** Lines and asks seen this session (first meeting of a phrase is modelled aloud). */
  private modelled = new Set<string>();
  readonly events: string[] = [];

  constructor(container: HTMLElement) {
    this.storage = (() => {
      try {
        return window.localStorage;
      } catch {
        return null;
      }
    })();
    this.save = load(this.storage);
    this.engine = new Engine(container);
    this.ui = h("div", { id: "ui" });
    container.appendChild(this.ui);
    this.applySettings();
    this.hud = new Hud(this.ui, () => this.save.settings.japanese);
    this.dialogue = new Dialogue(this.ui);
    this.asker = new AskPrompt(this.ui, { micAllowed: () => this.save.settings.mic, japanese: () => this.save.settings.japanese });
    this.draw = new DrawPanel(this.ui, {
      guess: (d) => this.guess(d),
      japanese: () => this.save.settings.japanese,
      onTouchpadToggle: (on) => {
        this.save.settings.touchpadPen = on;
        this.persist();
      }
    });
    this.fade = h("div", { class: "passthrough", style: { position: "absolute", inset: "0", background: "#fff", opacity: "0", transition: "opacity .45s" } });
    this.ui.appendChild(this.fade);
    this.player = new Character(CAST.player.look);
    this.cast = {
      penny: new Character(CAST.penny.look),
      ken: new Character(CAST.ken.look),
      yui: new Character(CAST.yui.look),
      taro: new Character(CAST.taro.look)
    };
    this.player.onStep = () => audio.step();
    this.dialogue.onSpeaking = (who, on) => {
      const c = this.charOf(who);
      if (c) c.setBase(on ? "talk" : "idle");
      audio.duck(on);
    };
    tts.onSpeakingChange((on) => audio.duck(on));
    this.effects.setViewHeight(window.innerHeight);
    window.addEventListener("resize", () => this.effects.setViewHeight(window.innerHeight));
    this.bindInput();
    this.hud.settingsBtn.addEventListener("click", () => {
      audio.click();
      settingsDialog(this.ui, this.save.settings, () => {
        this.applySettings();
        this.persist();
      }, () => this.resetProgress());
    });
    this.hud.soundBtn.addEventListener("click", () => {
      const on = !(this.save.settings.music || this.save.settings.sfx);
      this.save.settings.music = on;
      this.save.settings.sfx = on;
      this.applySettings();
      this.persist();
      this.hud.soundBtn.textContent = on ? "🔊" : "🔇";
    });
    this.engine.onUpdate((dt, t) => this.update(dt, t));
  }

  // ------------------------------------------------------------ settings & save
  applySettings() {
    const s = this.save.settings;
    document.body.classList.toggle("hide-ja", !s.japanese);
    tts.setRate(s.slowVoice ? 0.8 : 1);
    audio.setMusicOn(s.music);
    audio.setSfxOn(s.sfx);
  }

  persist() {
    persist(this.storage, this.save);
  }

  private resetProgress() {
    const settings = this.save.settings;
    this.save = load(null);
    this.save.settings = settings;
    this.persist();
    window.location.reload();
  }

  stepDone(step: StoreStep): boolean {
    return this.save.store.steps.includes(step);
  }

  completeStep(step: StoreStep) {
    if (!this.save.store.steps.includes(step)) this.save.store.steps.push(step);
    this.save.store.steps.sort((a, b) => STORE_STEPS.indexOf(a) - STORE_STEPS.indexOf(b));
    this.persist();
    this.log("step:" + step);
  }

  slotDone(id: SlotId): boolean {
    return !!this.save.store.slots[id];
  }

  log(e: string) {
    this.events.push(e);
  }

  // ------------------------------------------------------------ frame
  private update(dt: number, t: number) {
    this.effects.update(dt);
    if (this.area === "store") {
      this.store.update(t);
      for (const c of [this.player, ...Object.values(this.cast)]) c.update(dt);
    } else if (this.area === "town") {
      this.town.update(t);
      this.player.update(dt);
      for (const [id, el] of this.labels) {
        const p = this.engine.toScreen(this.town.places[id].label);
        if (p) {
          el.style.left = p.x + "px";
          el.style.top = p.y + "px";
        }
      }
    }
    if (this.marker) {
      const p = this.engine.toScreen(this.marker.clone().add(new THREE.Vector3(0, Math.sin(t * 3) * 0.03, 0)));
      this.hud.setMarker(p);
      if (Math.random() < 0.15) this.effects.twinkle(this.marker, 0.25, "#fff59d");
    } else this.hud.setMarker(null);
  }

  // ------------------------------------------------------------ input
  private bindInput() {
    const canvas = this.engine.canvas;
    canvas.addEventListener("pointerdown", (e) => {
      audio.unlock();
      if (this.draw.isOpen) return;
      if (this.area === "store") this.clickStore(e.clientX, e.clientY);
      else if (this.area === "town") this.clickTown(e.clientX, e.clientY);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.area) return;
      const objs = this.area === "store" ? this.store.pickables : this.town.pickables;
      const hit = this.engine.pick(e.clientX, e.clientY, objs);
      canvas.style.cursor = hit ? "pointer" : "default";
    });
  }

  private clickStore(x: number, y: number) {
    const hit = this.engine.pick(x, y, this.store.pickables);
    const id = hit?.object.userData.slot as SlotId | undefined;
    if (id && this.slotWait?.ids.includes(id)) {
      const w = this.slotWait;
      this.slotWait = null;
      audio.click();
      w.resolve(id);
      return;
    }
    if (id) {
      const slot = this.store.slots[id];
      const w = WORDS[slot.word];
      this.hud.say(this.slotDone(id) ? `${capital(w.plural)}!` : `${capital(w.plural)}… not now.`, this.slotDone(id) ? w.ja : `${w.ja}… あとでね`, 1600);
      return;
    }
    if (this.scripting && !this.slotWait) return;
    const floor = this.engine.pick(x, y, [this.store.floor]);
    if (floor) void this.player.go(floor.point.x, floor.point.z);
  }

  private clickTown(x: number, y: number) {
    const hit = this.engine.pick(x, y, this.town.pickables);
    const id = hit?.object.userData.place as PlaceId | undefined;
    if (id && this.placeWait) {
      audio.click();
      if (!isBuilt(id)) {
        const p = this.town.places[id];
        this.hud.say(`${p.name}: coming soon!`, `${p.ja}は もうすぐ オープン！`, 2200);
        return;
      }
      const w = this.placeWait;
      this.placeWait = null;
      w.resolve(id);
      return;
    }
    const floor = this.engine.pick(x, y, [this.town.ground]);
    if (floor) void this.player.go(floor.point.x, floor.point.z);
  }

  // ------------------------------------------------------------ places
  async fadeTo(fn: () => void | Promise<void>) {
    this.fade.style.opacity = "1";
    await new Promise((r) => window.setTimeout(r, 470));
    await fn();
    this.fade.style.opacity = "0";
  }

  enterStore() {
    this.area = "store";
    this.engine.setScene(this.store.scene);
    this.store.scene.add(this.effects.points);
    for (const l of this.labels.values()) l.remove();
    this.labels.clear();
    const add = (c: Character) => {
      if (!c.root.parent) this.store.scene.add(c.root);
      c.collide = (x, z, r) => this.store.nav.collides(x, z, r);
      c.router = (ax, az, bx, bz) => this.store.nav.route(ax, az, bx, bz);
    };
    add(this.player);
    add(this.cast.penny);
    this.player.place(DOOR.x - 0.6, DOOR.z, -Math.PI / 2);
    this.cast.penny.place(PENNY_SPOT.x, PENNY_SPOT.z, 0);
    this.rebuildSlots();
    this.setStoreLevel(this.storeLevel(), true);
    this.focus(VIEWS.overview, true);
    this.hud.setVisible(true);
    this.hud.showPen(this.stepDone("pen"));
    this.updateStoreHud();
    music.start();
  }

  enterTown(fromStore: boolean) {
    this.area = "town";
    this.engine.setScene(this.town.scene);
    this.town.scene.add(this.effects.points);
    this.ambient.clear();
    if (!this.player.root.parent || this.player.root.parent !== this.town.scene) this.town.scene.add(this.player.root);
    this.player.collide = (x, z, r) => this.town.nav.collides(x, z, r);
    this.player.router = (ax, az, bx, bz) => this.town.nav.route(ax, az, bx, bz);
    const door = this.town.places.store.door;
    if (fromStore) this.player.place(door.x + 0.5, door.z + 0.6, 1.2);
    else this.player.place(0, 5.2, Math.PI);
    const level = storeProgress(this.save);
    this.town.setPlaceLevel("store", 0.08 + 0.92 * level);
    this.town.setPlazaLevel(0.1 + 0.18 * level);
    this.engine.focus(TOWN_VIEW.pos, TOWN_VIEW.look, true);
    this.engine.setLensShift(0);
    this.hud.setPlace("Magic Town", "まほうの まち", 0, 0);
    if (level < 1) this.hud.setObjective("Go to the Stationery Store!", "ぶんぼうぐやに いこう！");
    else this.hud.setObjective(null);
    this.hud.showPen(this.stepDone("pen"));
    for (const id of Object.keys(this.town.places) as PlaceId[]) {
      const p = this.town.places[id];
      const el = placeLabel(this.ui);
      if (id === "store") {
        const done = SLOT_KEYS.filter((k) => this.save.store.slots[k]).length;
        el.innerHTML = `${p.name}<span class="ja">${p.ja}</span><span class="prog">★ ${done} / ${SLOT_KEYS.length}</span>`;
      } else {
        el.classList.add("locked");
        el.innerHTML = `${p.name}<span class="ja">${p.ja}</span><span class="prog">🔒 Coming soon</span>`;
      }
      this.labels.set(id, el);
    }
    this.marker = level < 1 ? this.town.places.store.label.clone().add(new THREE.Vector3(0, 0.9, 0)) : null;
    music.setLevel(0.1 + 0.2 * level);
    music.start();
  }

  waitPlace(): Promise<PlaceId> {
    return new Promise((resolve) => (this.placeWait = { resolve }));
  }

  storeLevel(): number {
    return 0.1 + 0.9 * storeProgress(this.save);
  }

  private setStoreLevel(level: number, snap: boolean) {
    if (snap) worldUniforms.uRestore.value = level;
    this.store.setLevel(storeProgress(this.save));
    music.setLevel(storeProgress(this.save));
  }

  updateStoreHud() {
    const done = SLOT_KEYS.filter((k) => this.save.store.slots[k]).length;
    this.hud.setPlace("Penny's Stationery", "ぶんぼうぐや", done, SLOT_KEYS.length);
  }

  /** Rebuild saved items in their slots (no animation). */
  private rebuildSlots() {
    for (const id of SLOT_KEYS) {
      const slot = this.store.slots[id];
      for (const m of slot.items) this.store.scene.remove(m.root);
      slot.items = [];
      slot.ghosts.forEach((g) => (g.visible = true));
      const saved = this.save.store.slots[id];
      if (!saved) continue;
      saved.tints.forEach((tint, i) => {
        const a = slot.anchors[i];
        if (!a) return;
        const m = WORD_KINDS[slot.word].build(tint ? new THREE.Color(tint) : null, i);
        m.root.position.copy(a.p);
        m.root.rotation.copy(a.r);
        m.root.scale.setScalar(a.s ?? 1);
        this.store.scene.add(m.root);
        slot.items.push(m);
        slot.ghosts[i].visible = false;
      });
    }
  }

  // ------------------------------------------------------------ camera
  focus(view: View, snap = false) {
    this.engine.focus(view.pos, view.look, snap);
  }

  /**
   * Conversation framing: over the player's shoulder towards the other
   * person's face (monster-island's three-quarter shot). Candidate positions
   * are tried in order of preference; the first with a clear line of sight to
   * both faces (no walls or furniture in between) wins.
   */
  talkView(a: Character, b: Character): View {
    const pa = a.position;
    const pb = b.position;
    const dir = new THREE.Vector3().subVectors(pb, pa).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
    dir.normalize();
    const side = new THREE.Vector3(dir.z, 0, -dir.x);
    // Prefer the side towards the open (cut-away) front of the diorama.
    const firstSide = side.z >= 0 ? 1 : -1;
    const look = pb.clone().lerp(pa, 0.35).setY(1.05);
    const heads = [pa.clone().setY(1.1), pb.clone().setY(1.15)];
    const ray = this.engine.raycaster;
    const clear = (from: THREE.Vector3) =>
      heads.every((hd) => {
        const to = hd.clone().sub(from);
        const len = to.length();
        ray.set(from, to.normalize());
        ray.far = len;
        const hit = ray.intersectObjects(this.store.solids, false)[0];
        ray.far = Infinity;
        return !hit || hit.distance > len - 0.3;
      });
    for (const back of [1.3, 1.9, 0.6]) {
      for (const off of [2.4, 1.7, 3.0]) {
        for (const s of [firstSide, -firstSide]) {
          for (const hgt of [2.2, 2.9]) {
            const c = pa.clone().addScaledVector(dir, -back).addScaledVector(side, s * off);
            c.y = hgt;
            c.x = Math.max(-4.2, Math.min(4.2, c.x));
            c.z = Math.max(-2.7, Math.min(6, c.z));
            if (clear(c)) return { pos: c, look };
          }
        }
      }
    }
    return { pos: VIEWS.overview.pos.clone(), look };
  }

  setMarker(p: THREE.Vector3 | null) {
    this.marker = p ? p.clone() : null;
  }

  // ------------------------------------------------------------ talking
  charOf(who: Speaker): Character | null {
    if (who === "player") return this.player;
    if (who === "penny" || who === "ken" || who === "yui" || who === "taro") return this.cast[who];
    return null;
  }

  async say(who: Speaker, en: string, ja?: string) {
    this.engine.setLensShift(0.11);
    await this.dialogue.say(who, en, this.save.settings.japanese ? ja : undefined);
  }

  async ask(spec: AskSpec): Promise<PhraseId> {
    this.dialogue.hide();
    this.engine.setLensShift(0.12);
    const key = spec.options.join("+");
    const model = spec.model ?? !this.modelled.has(key);
    this.modelled.add(key);
    const id = await this.asker.ask({ ...spec, model });
    this.log("said:" + id);
    return id;
  }

  /** "Do you have a ...?" answered truthfully: wrong answers get a gentle second chance. */
  async yesNo(who: NpcId, question: string, truth: boolean, wrong: { en: string; ja: string }, ja?: string): Promise<void> {
    await this.say(who, question, ja);
    let tries = 0;
    for (;;) {
      const id = await this.ask({
        kind: "choice",
        options: tries >= 2 ? [truth ? "yesIDo" : "noIDont"] : ["yesIDo", "noIDont"],
        question: { who, en: question },
        help: "もっているかな？ よく みて こたえよう！"
      });
      const saidYes = id === "yesIDo";
      if (saidYes === truth) {
        this.player.emote(saidYes ? "nod" : "shake", 0.8);
        return;
      }
      tries++;
      this.cast[who].emote("think", 1.6);
      await this.say(who, wrong.en, wrong.ja);
    }
  }

  // ------------------------------------------------------------ waiting for the child
  objective(en: string | null, ja = "", at: THREE.Vector3 | null = null) {
    this.hud.setObjective(en, ja);
    this.setMarker(at);
  }

  /** Wait until the child clicks one of these slots; the player walks there. */
  async waitSlot(ids: SlotId[]): Promise<SlotId> {
    this.dialogue.hide();
    this.engine.setLensShift(0);
    this.focus(VIEWS.overview);
    const id = await new Promise<SlotId>((resolve) => (this.slotWait = { ids, resolve }));
    this.setMarker(null);
    const slot = this.store.slots[id];
    await this.player.go(slot.stand.x, slot.stand.z);
    this.player.faceTo(slot.anchors[0].p.x, slot.anchors[0].p.z);
    return id;
  }

  /** Test hook: click a slot. */
  clickSlot(id: SlotId): boolean {
    if (!this.slotWait?.ids.includes(id)) return false;
    const w = this.slotWait;
    this.slotWait = null;
    w.resolve(id);
    return true;
  }

  clickPlace(id: PlaceId): boolean {
    if (!this.placeWait || id !== "store") return false;
    const w = this.placeWait;
    this.placeWait = null;
    w.resolve(id);
    return true;
  }

  get waitingFor(): string {
    if (this.slotWait) return "slot:" + this.slotWait.ids.join(",");
    if (this.placeWait) return "place";
    if (this.asker.open) return "ask";
    if (this.draw.isOpen) return "draw";
    return "";
  }

  // ------------------------------------------------------------ drawing
  private guess(d: Drawing) {
    const r = this.recognizer;
    const word = this.drawingWord;
    if (!r) return null;
    const rec = r.recognize(strokesOf(d));
    const g = liveGuess(rec, word);
    if (!g) return null;
    if (g.isTarget && word) return { text: wordWithArticle(word), isTarget: true };
    return { text: withArticle(g.label), isTarget: false };
  }

  private drawingWord: WordId | null = null;

  /** The full drawing loop for one target: help ladder, surprises, unclear tries. */
  async drawFor(word: WordId, near: Slot, opts: DrawOptions = {}): Promise<DrawOutcome> {
    const w = WORDS[word];
    let misses = 0;
    const startHelp = Math.max(opts.help ?? 0, this.save.settings.help === "extra" ? 2 : 0);
    this.drawingWord = word;
    this.focus(near.view);
    const openPanel = () => {
      this.dialogue.hide();
      this.engine.setLensShift(0);
      this.draw.open({
        word: w.en,
        wordWithArticle: wordWithArticle(word),
        ja: w.ja,
        help: Math.max(startHelp, misses >= 2 ? 2 : misses),
        example: exampleFor(word),
        starColor: opts.starColor,
        color: opts.color,
        colorWord: opts.colorWord ?? null,
        touchpadPen: this.save.settings.touchpadPen,
        firstTime: opts.firstTime && misses === 0
      });
      this.engine.renderEvery = 2;
      this.objective(goal, goalJa);
    };
    const goal = opts.colorWord ? `Draw a ${opts.colorWord.en} ${w.en}!` : `Draw ${wordWithArticle(word)}!`;
    const goalJa = opts.colorWord ? `${opts.colorWord.ja}の ${w.ja}を かこう！` : `${w.ja}を かこう！`;
    openPanel();
    for (;;) {
      const ev = await this.draw.next();
      if (ev.kind === "cancel") {
        this.draw.hide();
        this.engine.renderEvery = 1;
        this.objective(goal, goalJa, near.marker);
        await this.waitSlot([near.id]);
        this.setMarker(null);
        openPanel();
        continue;
      }
      const verdict: Verdict = this.recognizer
        ? judge(this.recognizer.recognize(strokesOf(ev.drawing)), word, { misses })
        : { kind: "accept", how: "help", score: 0 };
      this.log(`verdict:${word}:${verdict.kind}${verdict.kind === "surprise" ? ":" + verdict.label : ""}`);
      if (verdict.kind === "accept") {
        await this.draw.celebrate(w.en);
        await this.draw.leave();
        this.engine.renderEvery = 1;
        this.drawingWord = null;
        this.objective(null);
        if (verdict.how === "help" && this.recognizer) this.hud.say("The magic pen helped you!", "まほうのペンが てつだってくれたよ！");
        return { drawing: ev.drawing, rect: ev.rect, crayon: dominantCrayon(ev.drawing), how: this.recognizer ? verdict.how : "nomodel" };
      }
      if (verdict.kind === "surprise") {
        misses++;
        await this.draw.leave();
        this.engine.renderEvery = 1;
        await this.surprise(verdict.label, ev.drawing, ev.rect, near, word);
        openPanel();
        continue;
      }
      if (verdict.countsAsMiss) misses++;
      this.draw.setHelp(misses >= 2 ? 2 : misses);
      if (verdict.reason === "tooLittle") this.draw.feedback("Draw it bigger!", "もっと おおきく かいてね！");
      else if (verdict.reason === "shape") this.draw.feedback(`Hmm… ${withArticle(verdict.best ?? "shape")}? Add more lines!`, "もうすこし かきたしてみよう！");
      else this.draw.feedback(`Hmm… I can't tell. Look at the hint!`, "うーん、わからないなあ。ヒントを みてね！");
    }
  }

  /** The wrong thing appears and plays, people react, then it goes puff. */
  private async surprise(label: string, drawing: Drawing, rect: DOMRect, near: Slot, word: WordId) {
    const crayon = dominantCrayon(drawing);
    const thing = buildSurprise(label, crayon ? new THREE.Color(crayon.hex) : null, drawing);
    const spot = new THREE.Vector3(Math.max(-3.2, Math.min(3.8, near.stand.x + 0.9)), 0, Math.max(1.2, Math.min(ROOM.maxZ - 0.8, near.stand.z + 0.5)));
    if (this.store.nav.collides(spot.x, spot.z, 0.3)) {
      const [fx, fz] = this.store.nav.nearestFree(spot.x, spot.z);
      spot.set(fx, 0, fz);
    }
    // Frame the spot where it appears, with room to play around it.
    this.focus({ pos: new THREE.Vector3(spot.x + 0.6, 2.6, Math.min(spot.z + 3.8, 6.2)), look: new THREE.Vector3(spot.x, 0.55, spot.z - 0.2) });
    await flySketch(this.engine, this.store.scene, this.effects, drawing, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: rect.height * 0.8 }, spot.clone().setY(0.4), 0.5);
    await materialize(this.store.scene, this.effects, thing.made, spot, Math.atan2(this.engine.camPos.x - spot.x, this.engine.camPos.z - spot.z));
    audio.animal(label);
    this.hud.say(`${capital(withArticle(label))}!`, "", 2400);
    // Play on the open floor near the spot, so it stays in the picture and off the furniture.
    const roam = { minX: Math.max(-3.4, spot.x - 1.6), maxX: Math.min(ROOM.maxX - 0.5, spot.x + 1.6), minZ: Math.max(0.95, spot.z - 0.6), maxZ: Math.min(ROOM.maxZ - 0.3, spot.z + 1.3) };
    const play = thing.play({ effects: this.effects, roam, camera: this.engine.camPos });
    this.cast.penny.emote("laugh", 2.2);
    this.player.emote("surprised", 1.4);
    await Promise.all([play, this.dialogue.announce("penny", `${capital(withArticle(label))}! Ha ha! But it's not ${wordWithArticle(word)}.`, this.save.settings.japanese ? `わあ、おもしろい！ でも ${WORDS[word].ja}じゃないね。` : undefined)]);
    await poof(this.store.scene, this.effects, thing.made);
    this.dialogue.hide();
  }

  // ------------------------------------------------------------ restoring
  /**
   * Turn an accepted drawing into the slot's first object (flight, unfold,
   * entrance), then let the magic fill the other places. Saves the slot.
   */
  async restore(id: SlotId, out: DrawOutcome, opts: { anchor?: number; fill?: boolean; tints?: (string | null)[]; save?: boolean } = {}): Promise<Made> {
    const slot = this.store.slots[id];
    const kind = WORD_KINDS[slot.word];
    const index = opts.anchor ?? 0;
    const a = slot.anchors[index];
    // A crayon drawn in magic ink is an ink-coloured crayon; other things keep their natural colours.
    const tint = kind.tintable && out.crayon ? out.crayon.hex : slot.word === "crayon" ? INK.hex : null;
    const m = kind.build(tint ? new THREE.Color(tint) : null, index);
    m.root.scale.setScalar(a.s ?? 1);
    slot.ghosts[index].visible = false;
    this.focus(slot.view);
    const r = out.rect;
    await flySketch(this.engine, this.store.scene, this.effects, out.drawing, { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.height * 0.8 }, a.p.clone().add(new THREE.Vector3(0, m.height * 0.6, 0)), Math.max(0.35, m.height * 1.2));
    await materialize(this.store.scene, this.effects, m, a.p, a.r);
    await kind.intro(m, { effects: this.effects });
    slot.items[index] = m;
    this.log("restored:" + id + ":" + index);
    if (opts.fill !== false) await this.fillSlot(id, index, opts.tints);
    if (opts.save !== false) this.saveSlot(id, out.drawing);
    return m;
  }

  /** The magic copies the first object into the rest of the display. */
  async fillSlot(id: SlotId, from: number, tints?: (string | null)[]) {
    const slot = this.store.slots[id];
    const kind = WORD_KINDS[slot.word];
    const base = slot.anchors[from].p.clone();
    const jobs: Promise<void>[] = [];
    let k = 0;
    for (let i = 0; i < slot.anchors.length; i++) {
      if (slot.items[i]) continue;
      const tint = tints?.[i] ?? COPY_TINTS[slot.word]?.[k % (COPY_TINTS[slot.word]?.length ?? 1)] ?? null;
      const m = kind.build(tint ? new THREE.Color(tint) : null, i);
      slot.ghosts[i].visible = false;
      slot.items[i] = m;
      const a = slot.anchors[i];
      m.root.scale.setScalar(a.s ?? 1);
      jobs.push(wait(0.18 * k).then(() => copyFrom(this.store.scene, this.effects, base, m, a.p, a.r)));
      k++;
    }
    await Promise.all(jobs);
  }

  saveSlot(id: SlotId, drawing: Drawing | null) {
    const slot = this.store.slots[id];
    const tints = slot.items.map((m) => (m?.tint ? "#" + m.tint.getHexString() : null));
    const simplified = drawing ? simplifyLikeQuickDraw(strokesOf(drawing)).map((s) => s.map(([x, y]) => [x, y])) : undefined;
    const before = storeProgress(this.save);
    this.save.store.slots[id] = { tints, drawing: simplified };
    this.persist();
    const after = storeProgress(this.save);
    void this.colourWave(slot.anchors[0].p, 0.1 + 0.9 * before, 0.1 + 0.9 * after);
    this.store.setLevel(after);
    music.setLevel(after);
    this.updateStoreHud();
    audio.fanfare();
  }

  /** Colour spreads from a restored object across the room. */
  async colourWave(from: THREE.Vector3, level0: number, level1: number) {
    const u = worldUniforms;
    u.uRestore.value = level0;
    u.uWave.value.set(from.x, from.y, from.z, 0.01);
    u.uWaveBoost.value = level1 - level0;
    await animate(1.8, (k) => (u.uWave.value.w = 0.01 + ease.out(k) * 14));
    u.uRestore.value = level1;
    u.uWaveBoost.value = 0;
    u.uWave.value.w = -1;
  }

  // ------------------------------------------------------------ people
  async npcEnter(id: NpcId, x: number, z: number) {
    const c = this.cast[id];
    this.ambient.delete(id);
    if (!c.root.parent) this.store.scene.add(c.root);
    c.collide = (px, pz, r) => this.store.nav.collides(px, pz, r);
    c.router = (ax, az, bx, bz) => this.store.nav.route(ax, az, bx, bz);
    c.place(DOOR.outsideX, DOOR.z, -Math.PI / 2);
    // The doorway is outside the walkable room: no collision until they are inside.
    c.collide = null;
    c.router = null;
    this.focus(VIEWS.door);
    audio.door();
    await animate(0.4, (k) => this.store.setDoor(ease.out(k)));
    await c.walkTo(DOOR.x - 0.7, DOOR.z);
    c.collide = (px, pz, r) => this.store.nav.collides(px, pz, r);
    c.router = (ax, az, bx, bz) => this.store.nav.route(ax, az, bx, bz);
    void animate(0.5, (k) => this.store.setDoor(1 - ease.inOut(k)));
    await c.go(x, z);
  }

  async npcLeave(id: NpcId) {
    const c = this.cast[id];
    this.ambient.delete(id);
    await c.go(DOOR.x - 0.7, DOOR.z);
    audio.door();
    await animate(0.3, (k) => this.store.setDoor(ease.out(k)));
    c.collide = null;
    c.router = null;
    await c.walkTo(DOOR.outsideX, DOOR.z);
    this.store.scene.remove(c.root);
    void animate(0.4, (k) => this.store.setDoor(1 - k));
  }

  /** Fly an object (a new copy of a word kind) into a character's hand. */
  async giveTo(c: Character, word: WordId, fromPos: THREE.Vector3, tint: string | null = null): Promise<Made> {
    const m = WORD_KINDS[word].build(tint ? new THREE.Color(tint) : null, 1);
    m.root.position.copy(fromPos);
    this.store.scene.add(m.root);
    const to = new THREE.Vector3();
    audio.whoosh(0.4);
    const start = fromPos.clone();
    await animate(0.6, (k) => {
      c.hand.getWorldPosition(to);
      m.root.position.lerpVectors(start, to, ease.inOut(k));
      m.root.position.y += arc(k) * 0.5;
      m.root.rotation.y = k * Math.PI * 2;
      if (Math.random() < 0.5) this.effects.twinkle(m.root.position, 0.1);
    });
    this.store.scene.remove(m.root);
    m.root.position.set(0, 0, 0);
    m.root.rotation.set(0, 0, 0);
    m.root.scale.setScalar(0.8 / (c.look.scale ?? 1));
    c.hand.add(m.root);
    audio.pop(1.5);
    return m;
  }

  dropFromHand(c: Character) {
    while (c.hand.children.length) c.hand.remove(c.hand.children[0]);
  }

  async givePen() {
    const pen = buildMagicPen();
    const from = new THREE.Vector3(PENNY_SPOT.x, 1.6, PENNY_SPOT.z + 0.4);
    pen.root.position.copy(from);
    this.store.scene.add(pen.root);
    audio.magic();
    this.effects.burst(from, 40);
    await animate(1.2, (k) => {
      pen.inner.rotation.y = k * Math.PI * 4;
      pen.root.position.y = from.y + Math.sin(k * Math.PI) * 0.4;
      if (Math.random() < 0.7) this.effects.twinkle(pen.root.position, 0.2);
    });
    const to = new THREE.Vector3();
    const start = pen.root.position.clone();
    await animate(0.7, (k) => {
      this.player.hand.getWorldPosition(to);
      pen.root.position.lerpVectors(start, to, ease.inOut(k));
      pen.root.position.y += arc(k) * 0.4;
    });
    this.store.scene.remove(pen.root);
    pen.root.position.set(0, -0.05, 0.02);
    pen.root.rotation.set(Math.PI, 0, 0);
    pen.root.scale.setScalar(0.75);
    this.player.hand.add(pen.root);
    this.player.emote("cheer", 1.6);
    audio.sparkle(7);
    this.hud.showPen(true);
  }

  // ------------------------------------------------------------ ambient shoppers
  startAmbient(id: NpcId) {
    if (this.ambient.has(id)) return;
    this.ambient.add(id);
    void this.ambientLoop(id);
  }

  stopAmbient(id: NpcId) {
    this.ambient.delete(id);
  }

  private async ambientLoop(id: NpcId) {
    const c = this.cast[id];
    const spots: [number, number, SlotId | null][] = [
      [0.1, -1.8, "books"],
      [3.1, -1.8, "schoolbags"],
      [0.9, 1.45, "crayons"],
      [2.5, 1.45, "notebooks"],
      [-2.0, 0.45, null],
      [1.8, 2.3, null]
    ];
    let n = Math.floor(Math.random() * spots.length);
    while (this.ambient.has(id) && this.area === "store") {
      if (this.ambientBusy.has(id)) {
        await wait(0.5);
        continue;
      }
      n = (n + 1 + Math.floor(Math.random() * 3)) % spots.length;
      // Keep clear of the player and of anyone taking part in a scene.
      const busy = [this.player, ...Object.entries(this.cast).filter(([k, c]) => !this.ambient.has(k as NpcId) && c.root.parent === this.store.scene).map(([, c]) => c)];
      const near = (x: number, z: number) => busy.some((c) => Math.hypot(c.position.x - x, c.position.z - z) < 2.0);
      for (let tries = 0; tries < spots.length && near(spots[n][0], spots[n][1]); tries++) n = (n + 1) % spots.length;
      if (near(spots[n][0], spots[n][1])) {
        await wait(1.2);
        continue;
      }
      const [x, z, slot] = spots[n];
      const ok = await c.go(x + (Math.random() - 0.5) * 0.4, z + (Math.random() - 0.5) * 0.3);
      if (!ok || !this.ambient.has(id)) return;
      if (slot) {
        const s = this.store.slots[slot];
        c.faceTo(s.anchors[0].p.x, s.anchors[0].p.z);
        c.emote(this.slotDone(slot) ? "point" : "think", 1.4);
      } else if (z < 1) {
        c.faceTo(PENNY_SPOT.x, PENNY_SPOT.z);
        c.emote("give", 1.0);
        audio.coin();
        this.cast.penny.emote("nod", 0.8);
      }
      await wait(1.6 + Math.random() * 2.2);
    }
  }

  /** Debug: every slot restored with natural colours, all customers shopping. */
  async debugFill() {
    for (const id of SLOT_KEYS) this.save.store.slots[id] = { tints: this.store.slots[id].anchors.map(() => null) };
    this.rebuildSlots();
    this.setStoreLevel(this.storeLevel(), true);
    this.updateStoreHud();
    this.hud.showPen(true);
    for (const id of ["ken", "yui", "taro"] as NpcId[]) {
      const c = this.cast[id];
      this.store.scene.add(c.root);
      c.collide = (px, pz, r) => this.store.nav.collides(px, pz, r);
      c.router = (ax, az, bx, bz) => this.store.nav.route(ax, az, bx, bz);
      c.place(-1 + Math.random() * 3, 1.5 + Math.random(), Math.PI);
      this.startAmbient(id);
    }
  }

  // ------------------------------------------------------------ e2e helpers
  stats() {
    return this.engine.stats();
  }
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type { CastId };
