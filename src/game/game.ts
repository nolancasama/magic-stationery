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
import { ENTRANCES, behaviourOf, bringToLife, buildLiving, fitFor, play as playLiving, type Fit, type Living } from "../objects/living.ts";
import { artFromDrawing, uprightArt, type Art } from "../draw/art.ts";
import { artMode } from "./config.ts";
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
import { PENNY_SPOT, StoreArea } from "../world/areas/store.ts";
import type { RoomArea, Slot, Spot, View } from "../world/areas/room.ts";
import { ClassroomArea } from "../world/areas/classroom.ts";
import { ZooArea } from "../world/areas/zoo.ts";
import { MarketArea } from "../world/areas/market.ts";
import { TOWN_VIEW, TownArea, type PlaceId } from "../world/areas/town.ts";
import { GLYPH_POLICY, glyphExample, glyphName, glyphNameJa, glyphScore, judgeGlyph, splitGlyphs, type GlyphVerdict } from "../recognition/glyphs.ts";
import { Character } from "../world/characters.ts";
import { Effects } from "../world/effects.ts";
import { Engine } from "../world/engine.ts";
import { worldUniforms } from "../world/materials.ts";
import { animate, arc, ease, wait } from "../world/tween.ts";
import { CAST, type CastId } from "./cast.ts";
import { isBuilt, isOpen } from "./levels/index.ts";
import {
  GLYPH_CHARS,
  MARKET_SLOT_KEYS,
  MARKET_STEPS,
  marketUnits,
  SCHOOL_SLOT_KEYS,
  SCHOOL_STEPS,
  ZOO_SLOT_KEYS,
  ZOO_STEPS,
  zooUnits,
  STORE_STEPS,
  SLOT_KEYS,
  load,
  placeProgress,
  schoolUnits,
  store as persist,
  type GlyphKey,
  type SaveData,
  type SlotSave,
  type Step,
} from "./save.ts";

export type NpcId = "penny" | "mori" | "oka" | "green" | "ken" | "yui" | "taro";
/** The level rooms (places with a scene of their own), in unlock order. */
export type RoomPlace = "store" | "school" | "zoo" | "market";
export const ROOM_PLACES: RoomPlace[] = ["store", "school", "zoo", "market"];
const HOSTS: Record<RoomPlace, NpcId> = { store: "penny", school: "mori", zoo: "oka", market: "green" };

export interface WriteOutcome {
  /** One drawing per character written (two for "12"). */
  drawings: Drawing[];
  rect: DOMRect;
  how: "model" | "help" | "nomodel";
}

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
  schoolbag: ["#263238", "#6d4c41"],
  desk: ["#d9a86c", "#c8955a", "#e0b47c"],
  chair: ["#d9a86c", "#c8955a", "#e0b47c"],
  apple: ["#e53935", "#7cb342", "#c62828", "#fdd835"],
  milk: ["#42a5f5", "#ef5350", "#66bb6a"]
};

/** How the child's drawing is shown in each display (drawing mode). */
const DISPLAY: Record<WordId, { fit: Fit; upright?: boolean; hinge?: boolean; entrance: keyof typeof ENTRANCES; tilt: number }> = {
  pencil: { fit: { w: 0.16, h: 0.5 }, upright: true, entrance: "spin", tilt: 0 },
  pen: { fit: { w: 0.16, h: 0.5 }, upright: true, entrance: "spin", tilt: 0 },
  crayon: { fit: { w: 0.12, h: 0.34 }, upright: true, entrance: "drop", tilt: -0.18 },
  ruler: { fit: { w: 0.16, h: 0.66 }, upright: true, entrance: "spin", tilt: 0 },
  eraser: { fit: { w: 0.3, h: 0.2 }, entrance: "bounce", tilt: 0 },
  scissors: { fit: { w: 0.32, h: 0.44 }, hinge: true, entrance: "snip", tilt: 0 },
  book: { fit: { w: 0.3, h: 0.4 }, hinge: true, entrance: "book", tilt: -0.16 },
  // Leans back at the notebook board's slope (store NOTEBOOK_SLOPE: pi/2 - 0.95).
  notebook: { fit: { w: 0.34, h: 0.38 }, entrance: "flutter", tilt: -(Math.PI / 2 - 0.95) },
  schoolbag: { fit: { w: 0.5, h: 0.55 }, entrance: "hop", tilt: 0 },
  desk: { fit: { w: 0.85, h: 0.68 }, entrance: "bounce", tilt: 0 },
  elephant: { fit: { w: 1.1, h: 0.9 }, entrance: "hop", tilt: 0 },
  monkey: { fit: { w: 0.6, h: 0.66 }, entrance: "hop", tilt: 0 },
  panda: { fit: { w: 0.7, h: 0.7 }, entrance: "hop", tilt: 0 },
  penguin: { fit: { w: 0.4, h: 0.55 }, entrance: "hop", tilt: 0 },
  banana: { fit: { w: 0.26, h: 0.22 }, entrance: "drop", tilt: 0 },
  bamboo: { fit: { w: 0.3, h: 1.2 }, upright: true, entrance: "spin", tilt: 0 },
  chair: { fit: { w: 0.5, h: 0.78 }, entrance: "hop", tilt: 0 },
  // The supermarket's food: a little bigger than life so it reads from the overview camera.
  apple: { fit: { w: 0.26, h: 0.26 }, entrance: "bounce", tilt: 0 },
  orange: { fit: { w: 0.26, h: 0.26 }, entrance: "bounce", tilt: 0 },
  tomato: { fit: { w: 0.26, h: 0.24 }, entrance: "bounce", tilt: 0 },
  carrot: { fit: { w: 0.16, h: 0.4 }, upright: true, entrance: "drop", tilt: 0 },
  egg: { fit: { w: 0.15, h: 0.2 }, entrance: "drop", tilt: 0 },
  milk: { fit: { w: 0.24, h: 0.36 }, entrance: "hop", tilt: 0 }
};

/**
 * Where the hand grips each held object, as a fraction of its length from its
 * origin end (models and drawings both stand on their origin, +y up). `flip`
 * points the origin end forward (the magic pen's tip).
 */
const GRIPS: Partial<Record<WordId | "magicPen", { grip: number; flip?: boolean }>> = {
  pencil: { grip: 0.32 },
  pen: { grip: 0.32 },
  crayon: { grip: 0.38 },
  ruler: { grip: 0.14 },
  eraser: { grip: 0.5 },
  scissors: { grip: 0.25 },
  book: { grip: 0.12 },
  notebook: { grip: 0.12 },
  schoolbag: { grip: 0.85 },
  magicPen: { grip: 0.28, flip: true },
  banana: { grip: 0.5 },
  bamboo: { grip: 0.3 }
};

const WORD_SLOT: Partial<Record<WordId, string>> = {
  pencil: "pencilCup", eraser: "erasers", scissors: "scissors", ruler: "rulers", crayon: "crayons", book: "books", notebook: "notebooks", schoolbag: "schoolbags", desk: "desks", chair: "chairs",
  elephant: "elephants", monkey: "monkeys", panda: "pandas", penguin: "penguins", banana: "bananas", bamboo: "bamboo",
  apple: "apples", orange: "oranges", tomato: "tomatoes", carrot: "carrots", egg: "eggs", milk: "milk"
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
  /** Digits and letters (Level 2). */
  glyphs: Recognizer | null = null;
  area: RoomPlace | "town" | null = null;
  /** The level room the player is in (or was last in). */
  room: RoomArea = this.store;
  place: RoomPlace = "store";
  private schoolArea: ClassroomArea | null = null;
  private zooArea: ZooArea | null = null;
  private marketArea: MarketArea | null = null;
  private marker: THREE.Vector3 | null = null;
  private slotWait: { ids: string[]; resolve: (id: string) => void } | null = null;
  private placeWait: { resolve: (id: PlaceId) => void } | null = null;
  private labels = new Map<PlaceId, HTMLDivElement>();
  private ambient = new Set<NpcId>();
  private ambientBusy = new Set<NpcId>();
  private fade: HTMLDivElement;
  scripting = false;
  /** Lines and asks seen this session (first meeting of a phrase is modelled aloud). */
  private modelled = new Set<string>();
  readonly events: string[] = [];
  /** The child's artwork per display: arts, and which art each place shows. */
  readonly slotArt: Partial<Record<string, { arts: Art[]; src: number[] }>> = {};
  readonly drawingMode = artMode() === "drawing";

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
      mori: new Character(CAST.mori.look),
      oka: new Character(CAST.oka.look),
      green: new Character(CAST.green.look),
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

  /** The classroom scene is built the first time it is needed. */
  get school(): ClassroomArea {
    return (this.schoolArea ??= new ClassroomArea());
  }

  /** The zoo scene is built the first time it is needed. */
  get zoo(): ZooArea {
    return (this.zooArea ??= new ZooArea());
  }

  /** The supermarket scene is built the first time it is needed. */
  get market(): MarketArea {
    return (this.marketArea ??= new MarketArea());
  }

  areaOf(place: RoomPlace): RoomArea {
    return place === "store" ? this.store : place === "school" ? this.school : place === "zoo" ? this.zoo : this.market;
  }

  /** The room's host: Ms. Penny in the shop, Ms. Mori in the classroom, Mr. Oka at the zoo, Mr. Green at the supermarket. */
  get host(): Character {
    return this.cast[this.hostId];
  }

  get hostId(): NpcId {
    return HOSTS[this.place];
  }

  /** Steps and saved displays of each level room. */
  private levelSave(place: RoomPlace): { steps: string[]; slots: Partial<Record<string, SlotSave>>; order: readonly string[]; keys: readonly string[] } {
    if (place === "store") return { steps: this.save.store.steps, slots: this.save.store.slots, order: STORE_STEPS, keys: SLOT_KEYS };
    if (place === "school") return { steps: this.save.school.steps, slots: this.save.school.slots, order: SCHOOL_STEPS, keys: SCHOOL_SLOT_KEYS };
    if (place === "zoo") return { steps: this.save.zoo.steps, slots: this.save.zoo.slots, order: ZOO_STEPS, keys: ZOO_SLOT_KEYS };
    return { steps: this.save.market.steps, slots: this.save.market.slots, order: MARKET_STEPS, keys: MARKET_SLOT_KEYS };
  }

  /** Step names are unique across levels, so a step tells its level. */
  private placeOfStep(step: Step): RoomPlace {
    if ((STORE_STEPS as Step[]).includes(step)) return "store";
    if ((SCHOOL_STEPS as Step[]).includes(step)) return "school";
    return (ZOO_STEPS as Step[]).includes(step) ? "zoo" : "market";
  }

  stepDone(step: Step): boolean {
    return this.levelSave(this.placeOfStep(step)).steps.includes(step);
  }

  completeStep(step: Step) {
    const ls = this.levelSave(this.placeOfStep(step));
    if (!ls.steps.includes(step)) ls.steps.push(step);
    ls.steps.sort((a, b) => ls.order.indexOf(a) - ls.order.indexOf(b));
    this.persist();
    this.log("step:" + step);
    if (this.area === this.place) this.updateRoomHud();
  }

  /** Saved displays of a room. */
  slotSaves(place: RoomPlace = this.place): Partial<Record<string, SlotSave>> {
    return this.levelSave(place).slots;
  }

  slotKeys(place: RoomPlace = this.place): string[] {
    return [...this.levelSave(place).keys];
  }

  slotDone(id: string): boolean {
    return ROOM_PLACES.some((p) => !!this.levelSave(p).slots[id]);
  }

  log(e: string) {
    this.events.push(e);
  }

  // ------------------------------------------------------------ frame
  /** In one of the level rooms (shop, classroom, zoo, …) rather than the town or the title. */
  private get inLevelRoom(): boolean {
    return this.area !== null && this.area !== "town";
  }

  private update(dt: number, t: number) {
    this.effects.update(dt);
    this.updateDrive();
    this.updateGaze(dt);
    // Every level room, not a list of names: the zoo was missing from such a list and stood frozen.
    if (this.inLevelRoom) {
      this.room.update(t);
      for (const c of [this.player, ...Object.values(this.cast)]) if (c.root.parent === this.room.scene) c.update(dt);
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
  /** Movement keys held (WASD and arrows). */
  private keys = new Set<"f" | "b" | "l" | "r">();

  /** Free walking is allowed whenever clicking the floor would be. */
  get canWalk(): boolean {
    if (!this.area || this.draw.isOpen || this.asker.open) return false;
    if (this.area === "town") return !!this.placeWait;
    return !this.scripting || !!this.slotWait;
  }

  /** Keys -> a direction on the floor, relative to the camera (W = away from the camera). */
  private updateDrive() {
    const d = this.player.drive;
    if (!this.canWalk || !this.keys.size) {
      d.set(0, 0);
      return;
    }
    const fx = this.engine.camLook.x - this.engine.camPos.x;
    const fz = this.engine.camLook.z - this.engine.camPos.z;
    const fl = Math.hypot(fx, fz) || 1;
    const f = { x: fx / fl, z: fz / fl };
    const r = { x: -f.z, z: f.x };
    let x = 0;
    let z = 0;
    if (this.keys.has("f")) (x += f.x), (z += f.z);
    if (this.keys.has("b")) (x -= f.x), (z -= f.z);
    if (this.keys.has("r")) (x += r.x), (z += r.z);
    if (this.keys.has("l")) (x -= r.x), (z -= r.z);
    const len = Math.hypot(x, z);
    d.set(len ? x / len : 0, len ? z / len : 0);
  }

  private bindKeys() {
    const map: Record<string, "f" | "b" | "l" | "r"> = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r" };
    const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    window.addEventListener("keydown", (e) => {
      const k = map[e.code];
      if (!k || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!this.canWalk) return;
      e.preventDefault();
      if (!this.keys.has(k)) audio.unlock();
      this.keys.add(k);
    });
    window.addEventListener("keyup", (e) => {
      const k = map[e.code];
      if (k) this.keys.delete(k);
    });
    window.addEventListener("blur", () => this.keys.clear());
    // People are obstacles for a player steered by keys (routes keep their own planning).
    this.player.driveCollide = (x, z, r) => {
      if (this.area === "town") return false;
      for (const c of Object.values(this.cast)) {
        if (c.root.parent !== this.room.scene) continue;
        if (Math.hypot(c.position.x - x, c.position.z - z) < r + c.radius * 0.9) return true;
      }
      return false;
    };
  }

  /**
   * Who looks at whom: the person talking (or just spoken to) and the room's
   * host keep their eyes on the player; anyone close by glances at them; the
   * player looks at whoever is talking. Bodies turn only when needed (Character).
   */
  private updateGaze(dt: number) {
    const inRoom = this.inLevelRoom;
    const playerFace = this.player.position.clone().setY(1.0 * (this.player.look.scale ?? 1));
    let partner: Character | null = null;
    if (inRoom && this.lastSpeaker && this.lastSpeaker.root.parent === this.room.scene && this.lastSpeakerAt > performance.now() - 15000) partner = this.lastSpeaker;
    for (const [id, c] of Object.entries(this.cast) as [NpcId, Character][]) {
      if (!inRoom || c.root.parent !== this.room.scene) {
        c.lookTarget = null;
        continue;
      }
      const d = Math.hypot(c.position.x - this.player.position.x, c.position.z - this.player.position.z);
      const isHost = c === this.host;
      const wandering = this.ambient.has(id);
      const engaged = c === partner || (isHost && d < 4.5) || (!wandering && d < 2.2) || (wandering && d < 1.5 && !c.moving);
      c.lookTarget = engaged ? playerFace : null;
      // The host works facing the shop; shoppers keep their own heading.
      c.bodyTurn = isHost ? 1.15 : wandering ? Infinity : c === partner ? 0.75 : 1.2;
      if (isHost && !engaged && !c.moving && !this.scripting) {
        this.hostIdle += dt;
        if (this.hostIdle > 1.5) c.faceHeading(this.room.hostSpot.facing);
      } else if (isHost) this.hostIdle = 0;
    }
    const talker = partner && partner !== this.player ? partner : null;
    this.player.lookTarget = talker && this.scripting ? talker.position.clone().setY(1.0 * (talker.look.scale ?? 1)) : null;
    this.player.bodyTurn = 1.2;
  }

  private lastSpeaker: Character | null = null;
  private lastSpeakerAt = 0;
  private hostIdle = 0;

  private bindInput() {
    this.bindKeys();
    const canvas = this.engine.canvas;
    canvas.addEventListener("pointerdown", (e) => {
      audio.unlock();
      if (this.draw.isOpen) return;
      if (this.area === "town") this.clickTown(e.clientX, e.clientY);
      else if (this.area) this.clickRoom(e.clientX, e.clientY);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.area) return;
      const objs = this.area === "town" ? this.town.pickables : this.room.pickables;
      const hit = this.engine.pick(e.clientX, e.clientY, objs);
      canvas.style.cursor = hit ? "pointer" : "default";
    });
  }

  private clickRoom(x: number, y: number) {
    // A spot the game is waiting for wins over any other spot in front of it (desks and chairs overlap).
    const waited = this.slotWait ? this.room.pickables.filter((o) => this.slotWait?.ids.includes(o.userData.slot)) : [];
    const hit = (waited.length ? this.engine.pick(x, y, waited) : null) ?? this.engine.pick(x, y, this.room.pickables);
    const id = hit?.object.userData.slot as string | undefined;
    if (id && this.slotWait?.ids.includes(id)) {
      const w = this.slotWait;
      this.slotWait = null;
      audio.click();
      w.resolve(id);
      return;
    }
    const slot = id ? this.room.slots[id] : undefined;
    if (slot && id) {
      const w = WORDS[slot.word];
      this.hud.say(this.slotDone(id) ? `${capital(w.plural)}!` : `${capital(w.plural)}… not now.`, this.slotDone(id) ? w.ja : `${w.ja}… あとでね`, 1600);
      return;
    }
    if (id) return;
    if (this.scripting && !this.slotWait) return;
    const floor = this.engine.pick(x, y, [this.room.floor]);
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
      if (!isOpen(id, this.save)) {
        const why = lockedWhy(id);
        this.hud.say(why.en + "!", why.ja, 2200);
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
    this.enterRoom("store");
  }

  enterSchool() {
    this.enterRoom("school");
  }

  /** Walk into a level room: the player at the door, the host at work, saved things in place. */
  enterRoom(place: RoomPlace) {
    this.area = place;
    this.place = place;
    this.room = this.areaOf(place);
    const room = this.room;
    this.ambient.clear();
    // People belong to one scene at a time.
    this.player.root.removeFromParent();
    this.player.carry(null);
    for (const c of Object.values(this.cast)) {
      c.root.removeFromParent();
      this.dropFromHand(c);
    }
    this.engine.setScene(room.scene);
    room.scene.add(this.effects.points);
    for (const l of this.labels.values()) l.remove();
    this.labels.clear();
    const add = (c: Character) => {
      room.scene.add(c.root);
      c.collide = (x, z, r) => room.nav.collides(x, z, r);
      c.router = (ax, az, bx, bz) => room.nav.route(ax, az, bx, bz);
    };
    add(this.player);
    add(this.host);
    this.ensurePen();
    this.player.place(room.door.x - 0.6, room.door.z, -Math.PI / 2);
    this.host.place(room.hostSpot.x, room.hostSpot.z, room.hostSpot.facing);
    this.rebuildSlots();
    this.setRoomLevel(this.roomLevel(), true);
    this.focus(room.views.overview, true);
    this.hud.setVisible(true);
    this.hud.showPen(this.stepDone("pen"));
    this.updateRoomHud();
    music.start();
  }

  enterTown(from: PlaceId | null) {
    this.area = "town";
    this.engine.setScene(this.town.scene);
    this.town.scene.add(this.effects.points);
    this.ambient.clear();
    for (const c of [this.player, ...Object.values(this.cast)]) c.root.removeFromParent();
    this.player.carry(null);
    this.town.scene.add(this.player.root);
    this.ensurePen();
    this.player.collide = (x, z, r) => this.town.nav.collides(x, z, r);
    this.player.router = (ax, az, bx, bz) => this.town.nav.route(ax, az, bx, bz);
    if (from) {
      const door = this.town.places[from].door;
      this.player.place(door.x + 0.5, door.z + 0.6, 1.2);
    } else this.player.place(0, 5.2, Math.PI);
    let restored = 0;
    for (const place of ROOM_PLACES) {
      const p = placeProgress(this.save, place);
      this.town.setPlaceLevel(place, 0.08 + 0.92 * p);
      restored += p;
    }
    this.town.setPlazaLevel(0.1 + 0.18 * restored);
    this.engine.focus(TOWN_VIEW.pos, TOWN_VIEW.look, true);
    this.engine.setLensShift(0);
    this.hud.setPlace("Magic Town", "まほうの まち", 0, 0);
    const next = this.nextPlace();
    this.hud.setObjective(next ? next.en : null, next?.ja ?? "");
    this.hud.showPen(this.stepDone("pen"));
    for (const id of Object.keys(this.town.places) as PlaceId[]) {
      const p = this.town.places[id];
      const el = placeLabel(this.ui);
      const room = (ROOM_PLACES as string[]).includes(id) ? (id as RoomPlace) : null;
      if (room && isOpen(id, this.save)) {
        const u = this.unitsOf(room);
        el.innerHTML = `${p.name}<span class="ja">${p.ja}</span><span class="prog">★ ${u.done} / ${u.total}</span>`;
      } else {
        el.classList.add("locked");
        const why = !isBuilt(id) ? "Coming soon" : lockedWhy(id).en;
        el.innerHTML = `${p.name}<span class="ja">${p.ja}</span><span class="prog">🔒 ${why}</span>`;
      }
      this.labels.set(id, el);
    }
    this.marker = next ? this.town.places[next.place].label.clone().add(new THREE.Vector3(0, 0.9, 0)) : null;
    music.setLevel(Math.min(1, 0.1 + 0.2 * restored));
    music.start();
  }

  /** Restoration units of a level room (HUD stars and town labels). */
  unitsOf(place: RoomPlace): { done: number; total: number } {
    if (place === "store") return { done: SLOT_KEYS.filter((k) => this.save.store.slots[k]).length, total: SLOT_KEYS.length };
    if (place === "school") return schoolUnits(this.save);
    if (place === "zoo") return zooUnits(this.save);
    return marketUnits(this.save);
  }

  /** Once earned, the magic pen is always in the player's hand (also after a reload). */
  private ensurePen() {
    if (!this.stepDone("pen") || this.player.hand.children.length) return;
    this.holdItem(this.player, "magicPen", buildMagicPen(), 0.75);
  }

  /** The next place to restore, if any (the town's objective). */
  nextPlace(): { place: RoomPlace; en: string; ja: string } | null {
    if (placeProgress(this.save, "store") < 1) return { place: "store", en: "Go to the Stationery Store!", ja: "ぶんぼうぐやに いこう！" };
    if (placeProgress(this.save, "school") < 1) return { place: "school", en: "Go to the School!", ja: "がっこうに いこう！" };
    if (placeProgress(this.save, "zoo") < 1) return { place: "zoo", en: "Go to the Zoo!", ja: "どうぶつえんに いこう！" };
    if (placeProgress(this.save, "market") < 1) return { place: "market", en: "Go to the Supermarket!", ja: "スーパーに いこう！" };
    return null;
  }

  waitPlace(): Promise<PlaceId> {
    return new Promise((resolve) => (this.placeWait = { resolve }));
  }

  roomLevel(place: RoomPlace = this.place): number {
    return 0.1 + 0.9 * placeProgress(this.save, place);
  }

  private setRoomLevel(level: number, snap: boolean) {
    if (snap) worldUniforms.uRestore.value = level;
    const p = placeProgress(this.save, this.place);
    this.room.setLevel(p);
    music.setLevel(p);
  }

  updateRoomHud() {
    if (this.place === "store") {
      const done = SLOT_KEYS.filter((k) => this.save.store.slots[k]).length;
      this.hud.setPlace("Penny's Stationery", "ぶんぼうぐや", done, SLOT_KEYS.length);
    } else if (this.place === "school") {
      const u = schoolUnits(this.save);
      this.hud.setPlace("Ms. Mori's Classroom", "もり先生の きょうしつ", u.done, u.total);
    } else if (this.place === "zoo") {
      const u = zooUnits(this.save);
      this.hud.setPlace("Mr. Oka's Zoo", "おかさんの どうぶつえん", u.done, u.total);
    } else {
      const u = marketUnits(this.save);
      this.hud.setPlace("Green's Supermarket", "グリーンさんの スーパー", u.done, u.total);
    }
  }

  /** Restoration went up: colour spreads from `from`, the room's decor and music follow. */
  progressed(from: THREE.Vector3, before: number) {
    const after = placeProgress(this.save, this.place);
    void this.colourWave(from, 0.1 + 0.9 * before, 0.1 + 0.9 * after);
    this.room.setLevel(after);
    music.setLevel(after);
    this.updateRoomHud();
    audio.fanfare();
  }

  /** Rebuild saved items in their slots (no animation). */
  private rebuildSlots() {
    const saves = this.slotSaves();
    for (const id of this.slotKeys()) {
      const slot = this.room.slots[id];
      for (const m of slot.items) this.room.scene.remove(m.root);
      slot.items = [];
      slot.ghosts.forEach((g) => (g.visible = true));
      const saved = saves[id];
      if (!saved) continue;
      const arts = saved.arts?.length ? saved.arts : [this.legacyArt(slot.word, saved.drawing)];
      const src = saved.src ?? saved.tints.map(() => 0);
      this.slotArt[id] = { arts, src: src.slice() };
      saved.tints.forEach((tint, i) => {
        const a = slot.anchors[i];
        if (!a) return;
        const m = this.makeItem(slot.word, i, arts[src[i] ?? 0] ?? arts[0], tint);
        this.placeItem(slot, i, m);
        this.room.scene.add(m.root);
        slot.items.push(m);
        slot.ghosts[i].visible = false;
      });
    }
    if (this.room === this.schoolArea) this.school.rebuildWriting(this.save.school.glyphs, this.drawingMode);
  }

  /** Artwork for saves made before drawings were kept (their lines, in magic ink). */
  private legacyArt(word: WordId, drawing?: number[][][]): Art {
    const d = drawing?.length
      ? { strokes: drawing.map((st) => ({ color: INK.hex, points: st.map(([x, y]) => [x, y] as [number, number]) })) }
      : exampleFor(word) ?? { strokes: [{ color: INK.hex, points: [[0, 0], [10, 10]] as [number, number][] }] };
    return artFromDrawing(d, 9);
  }

  /** A display object: the child's living drawing, or (models mode) the premade model. */
  makeItem(word: WordId, index: number, art: Art | null, tint: string | null, glow = false): Made {
    if (this.drawingMode && art) {
      const cfg = DISPLAY[word];
      return buildLiving(cfg.upright ? uprightArt(art) : art, cfg.fit, { glow, label: word, hinge: cfg.hinge });
    }
    return WORD_KINDS[word].build(tint ? new THREE.Color(tint) : null, index);
  }

  /** Put an item at a display place (drawings stand facing the room). */
  private placeItem(slot: Slot, i: number, m: Made) {
    const a = slot.anchors[i];
    if ((m as Living).art) {
      m.root.position.copy(a.p).add(new THREE.Vector3(0, 0, i * 0.012));
      m.root.rotation.set(DISPLAY[slot.word].tilt, 0, a.r.z);
      m.root.scale.setScalar(1);
    } else {
      m.root.position.copy(a.p);
      m.root.rotation.copy(a.r);
      m.root.scale.setScalar(a.s ?? 1);
    }
  }

  /** The first artwork drawn for a word (for gifts), if any. */
  artFor(word: WordId): Art | null {
    const id = WORD_SLOT[word];
    return (id && this.slotArt[id]?.arts[0]) || null;
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
        const hit = ray.intersectObjects(this.room.solids, false)[0];
        ray.far = Infinity;
        return !hit || hit.distance > len - 0.3;
      });
    const room = this.room.bounds;
    for (const back of [1.3, 1.9, 0.6]) {
      for (const off of [2.4, 1.7, 3.0]) {
        for (const s of [firstSide, -firstSide]) {
          for (const hgt of [2.2, 2.9]) {
            const c = pa.clone().addScaledVector(dir, -back).addScaledVector(side, s * off);
            c.y = hgt;
            c.x = Math.max(room.minX + 0.25, Math.min(room.maxX - 0.25, c.x));
            c.z = Math.max(room.minZ + 0.25, Math.min(room.maxZ + 3.05, c.z));
            if (clear(c)) return { pos: c, look };
          }
        }
      }
    }
    return { pos: this.room.views.overview.pos.clone(), look };
  }

  setMarker(p: THREE.Vector3 | null) {
    this.marker = p ? p.clone() : null;
  }

  // ------------------------------------------------------------ talking
  charOf(who: Speaker): Character | null {
    if (who === "player") return this.player;
    if (who === "pen" || who === "narrator") return null;
    return this.cast[who];
  }

  async say(who: Speaker, en: string, ja?: string) {
    const c = this.charOf(who);
    if (c && c !== this.player) {
      this.lastSpeaker = c;
      this.lastSpeakerAt = performance.now();
    }
    this.engine.setLensShift(0.11);
    await this.dialogue.say(who, en, this.save.settings.japanese ? ja : undefined);
  }

  async ask(spec: AskSpec): Promise<PhraseId> {
    const asker = spec.question ? this.charOf(spec.question.who) : null;
    if (asker && asker !== this.player) {
      this.lastSpeaker = asker;
      this.lastSpeakerAt = performance.now();
    }
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

  spotOf(id: string): Spot {
    return this.room.slots[id] ?? this.room.spots[id];
  }

  /** Wait until the child clicks one of these slots or spots; the player walks there. */
  async waitSlot<T extends string>(ids: T[], view: View = this.room.views.overview): Promise<T> {
    this.dialogue.hide();
    this.engine.setLensShift(0);
    this.focus(view);
    const id = (await new Promise<string>((resolve) => (this.slotWait = { ids, resolve }))) as T;
    this.setMarker(null);
    const slot = this.room.slots[id];
    const spot = this.spotOf(id);
    await this.player.go(spot.stand.x, spot.stand.z);
    const face = slot ? slot.anchors[0].p : this.room.spots[id].face;
    this.player.faceTo(face.x, face.z);
    return id;
  }

  /**
   * Wait for a click on one of these slots without walking there or moving the camera: the
   * child clicks a display again and again (counting food into a basket) while a speaking
   * prompt stays open. Resolves "" when `cancelPick()` ends the wait.
   */
  pickSlot(ids: string[]): Promise<string> {
    return new Promise((resolve) => (this.slotWait = { ids, resolve }));
  }

  cancelPick() {
    const w = this.slotWait;
    this.slotWait = null;
    w?.resolve("");
  }

  /** Test hook: click a slot or spot. */
  clickSlot(id: string): boolean {
    if (!this.slotWait?.ids.includes(id)) return false;
    const w = this.slotWait;
    this.slotWait = null;
    w.resolve(id);
    return true;
  }

  clickPlace(id: PlaceId): boolean {
    if (!this.placeWait || !isBuilt(id) || !isOpen(id, this.save)) return false;
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
    if (this.writingTarget) return this.guessGlyph(d, this.writingTarget);
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
  async drawFor(word: WordId, near: Spot, opts: DrawOptions = {}): Promise<DrawOutcome> {
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
  private async surprise(label: string, drawing: Drawing, rect: DOMRect, near: Spot, word: WordId) {
    const B = this.room.bounds;
    const scene = this.room.scene;
    const nav = this.room.nav;
    // The front part of the room (towards the camera), clear of the walls.
    const front = B.minZ + 0.7 * (B.maxZ - B.minZ);
    const spot = new THREE.Vector3(Math.max(B.minX + 1.25, Math.min(B.maxX - 0.65, near.stand.x + 0.9)), 0, Math.max(front, Math.min(B.maxZ - 0.8, near.stand.z + 0.5)));
    if (nav.collides(spot.x, spot.z, 0.3)) {
      const [fx, fz] = nav.nearestFree(spot.x, spot.z);
      spot.set(fx, 0, fz);
    }
    // Frame the spot where it appears, with room to play around it.
    this.focus({ pos: new THREE.Vector3(spot.x + 0.6, 2.6, Math.min(spot.z + 3.8, B.maxZ + 3.25)), look: new THREE.Vector3(spot.x, 0.55, spot.z - 0.2) });
    const roam = { minX: Math.max(B.minX + 1.05, spot.x - 1.6), maxX: Math.min(B.maxX - 0.5, spot.x + 1.6), minZ: Math.max(front - 0.25, spot.z - 0.6), maxZ: Math.min(B.maxZ - 0.3, spot.z + 1.3) };
    let made: Made;
    let play: Promise<void>;
    if (this.drawingMode) {
      // Their own drawing comes to life and behaves like what it is.
      const b = behaviourOf(label);
      const m = buildLiving(artFromDrawing(drawing), fitFor(b), { shadow: true, glow: true, label });
      const yaw = Math.atan2(this.engine.goalPos.x - spot.x, this.engine.goalPos.z - spot.z);
      await bringToLife(this.engine, scene, this.effects, m, screenBox(drawing, rect), spot, new THREE.Euler(0, yaw, 0));
      made = m;
      audio.animal(label);
      play = playLiving(m, b, { effects: this.effects, roam, camera: this.engine.camPos });
    } else {
      const crayon = dominantCrayon(drawing);
      const thing = buildSurprise(label, crayon ? new THREE.Color(crayon.hex) : null, drawing);
      await flySketch(this.engine, scene, this.effects, drawing, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, size: rect.height * 0.8 }, spot.clone().setY(0.4), 0.5);
      await materialize(scene, this.effects, thing.made, spot, Math.atan2(this.engine.camPos.x - spot.x, this.engine.camPos.z - spot.z));
      made = thing.made;
      audio.animal(label);
      play = thing.play({ effects: this.effects, roam, camera: this.engine.camPos });
    }
    this.hud.say(`${capital(withArticle(label))}!`, "", 2400);
    this.host.emote("laugh", 2.2);
    this.player.emote("surprised", 1.4);
    await Promise.all([play, this.dialogue.announce(this.hostId, `${capital(withArticle(label))}! Ha ha! But it's not ${wordWithArticle(word)}.`, this.save.settings.japanese ? `わあ、おもしろい！ でも ${WORDS[word].ja}じゃないね。` : undefined)]);
    await poof(scene, this.effects, made);
    this.dialogue.hide();
  }

  // ------------------------------------------------------------ writing (Level 2)
  private writingTarget: string | null = null;

  private guessGlyph(d: Drawing, target: string) {
    const r = this.glyphs;
    if (!r) return null;
    const parts = splitGlyphs(strokesOf(d), target.length);
    if (!parts) return null;
    const chars = [...target];
    const ok = parts.every((p, i) => {
      const rec = r.recognize(p);
      return rec.ink >= GLYPH_POLICY.minInk * 0.8 && glyphScore(rec, chars[i]) >= 0.4;
    });
    return ok ? { text: `"${target}"`, isTarget: true } : null;
  }

  /**
   * Write a character (or two side by side, "12") at a spot: the same help
   * ladder as drawing (example, then a stencil to trace, then the pen helps).
   */
  async writeGlyph(target: string, near: Spot, opts: { firstTime?: boolean } = {}): Promise<WriteOutcome> {
    const chars = [...target];
    let misses = 0;
    const startHelp = this.save.settings.help === "extra" ? 2 : 0;
    const name = glyphName(target);
    const goal = `Write ${name}!`;
    const goalJa = `${glyphNameJa(target)}を かこう！`;
    this.writingTarget = target;
    this.focus(near.view);
    const openPanel = () => {
      this.dialogue.hide();
      this.engine.setLensShift(0);
      this.draw.open({
        word: target,
        wordWithArticle: name,
        ja: target,
        help: Math.max(startHelp, misses >= 2 ? 2 : misses),
        example: glyphExample(target),
        touchpadPen: this.save.settings.touchpadPen,
        firstTime: opts.firstTime && misses === 0,
        writing: { title: `Write ${name}!`, ja: goalJa, say: `Write ${name}!` }
      });
      this.engine.renderEvery = 2;
      this.objective(goal, goalJa);
    };
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
      const strokes = strokesOf(ev.drawing);
      const parts = splitGlyphs(strokes, chars.length);
      const toDrawing = (ps: typeof strokes): Drawing => ({ strokes: ev.drawing.strokes.filter((s) => ps.includes(s.points)) });
      let verdict: GlyphVerdict;
      if (!this.glyphs) verdict = { kind: "accept", how: "help", score: 0 };
      else if (!parts) verdict = misses + 1 >= GLYPH_POLICY.helpAfter ? { kind: "accept", how: "help", score: 0 } : { kind: "unclear", reason: "unsure", countsAsMiss: true };
      else {
        const vs = parts.map((p, i) => judgeGlyph((this.glyphs as Recognizer).recognize(p), chars[i], misses));
        verdict = vs.find((v) => v.kind !== "accept") ?? vs[0];
        if (vs.every((v) => v.kind === "accept")) verdict = vs.some((v) => v.kind === "accept" && v.how === "help") ? { kind: "accept", how: "help", score: 0 } : vs[0];
      }
      this.log(`write:${target}:${verdict.kind}${verdict.kind === "other" ? ":" + verdict.label : ""}`);
      if (verdict.kind === "accept") {
        await this.draw.celebrate(target);
        await this.draw.leave();
        this.engine.renderEvery = 1;
        this.writingTarget = null;
        this.objective(null);
        if (verdict.how === "help" && this.glyphs) this.hud.say("The magic pen helped you!", "まほうのペンが てつだってくれたよ！");
        const drawings = parts && parts.length === chars.length ? parts.map(toDrawing) : [ev.drawing];
        return { drawings, rect: ev.rect, how: this.glyphs ? verdict.how : "nomodel" };
      }
      if (verdict.kind === "other") {
        misses++;
        this.draw.setHelp(misses >= 2 ? 2 : misses);
        this.draw.feedback(`That looks like "${verdict.label}"! Write "${target}".`, `それは「${verdict.label}」みたい。「${target}」を かいてね！`);
        continue;
      }
      if (verdict.countsAsMiss) misses++;
      this.draw.setHelp(misses >= 2 ? 2 : misses);
      if (verdict.reason === "tooLittle") this.draw.feedback("Write it bigger!", "もっと おおきく かいてね！");
      else if (!parts) this.draw.feedback(`Write ${chars.join(" and ")}, side by side!`, `${chars.join(" と ")}を ならべて かいてね！`);
      else if (verdict.reason === "scribble") this.draw.feedback(`Hmm… a scribble? Look at the hint!`, "うーん、ぐるぐる？ ヒントを みてね！");
      else this.draw.feedback(`Hmm… I can't read it. Look at the hint!`, "うーん、よめないなあ。ヒントを みてね！");
    }
  }

  // ------------------------------------------------------------ restoring
  /**
   * Turn an accepted drawing into the slot's first object (flight, unfold,
   * entrance), then let the magic fill the other places. Saves the slot.
   */
  async restore(id: string, out: DrawOutcome, opts: { anchor?: number; fill?: boolean; tints?: (string | null)[]; save?: boolean } = {}): Promise<Made> {
    const slot = this.room.slots[id];
    const kind = WORD_KINDS[slot.word];
    const index = opts.anchor ?? 0;
    const a = slot.anchors[index];
    // Models mode: a crayon drawn in magic ink is an ink-coloured crayon; other things keep natural colours.
    const tint = kind.tintable && out.crayon ? out.crayon.hex : slot.word === "crayon" ? INK.hex : null;
    const art = artFromDrawing(out.drawing);
    const rec = (this.slotArt[id] ??= { arts: [], src: [] });
    rec.arts.push(art);
    rec.src[index] = rec.arts.length - 1;
    slot.ghosts[index].visible = false;
    this.focus(slot.view);
    const m = this.makeItem(slot.word, index, art, tint, true);
    if (this.drawingMode) {
      // The drawing itself lifts off the page and flies to its place.
      this.placeItem(slot, index, m);
      const at = m.root.position.clone();
      const rot = m.root.rotation.clone();
      await bringToLife(this.engine, this.room.scene, this.effects, m as Living, screenBox(out.drawing, out.rect), at, rot);
      await ENTRANCES[DISPLAY[slot.word].entrance](m as Living);
    } else {
      m.root.scale.setScalar(a.s ?? 1);
      const r = out.rect;
      await flySketch(this.engine, this.room.scene, this.effects, out.drawing, { x: r.left + r.width / 2, y: r.top + r.height / 2, size: r.height * 0.8 }, a.p.clone().add(new THREE.Vector3(0, m.height * 0.6, 0)), Math.max(0.35, m.height * 1.2));
      await materialize(this.room.scene, this.effects, m, a.p, a.r);
      await kind.intro(m, { effects: this.effects });
    }
    slot.items[index] = m;
    this.log("restored:" + id + ":" + index);
    if (opts.fill !== false) await this.fillSlot(id, index, opts.tints);
    if (opts.save !== false) this.saveSlot(id, out.drawing);
    return m;
  }

  /** The magic copies the drawing(s) into the rest of the display. */
  async fillSlot(id: string, from: number, tints?: (string | null)[]) {
    const slot = this.room.slots[id];
    const base = slot.anchors[from].p.clone();
    const rec = (this.slotArt[id] ??= { arts: [], src: [] });
    const jobs: Promise<void>[] = [];
    let k = 0;
    for (let i = 0; i < slot.anchors.length; i++) {
      if (slot.items[i]) continue;
      const tint = tints?.[i] ?? COPY_TINTS[slot.word]?.[k % (COPY_TINTS[slot.word]?.length ?? 1)] ?? null;
      // Copies are the child's own drawings again (taking turns if there are several).
      const srcIndex = rec.arts.length ? k % rec.arts.length : 0;
      rec.src[i] = srcIndex;
      const m = this.makeItem(slot.word, i, rec.arts[srcIndex] ?? null, tint);
      slot.ghosts[i].visible = false;
      slot.items[i] = m;
      this.placeItem(slot, i, m);
      const at = m.root.position.clone();
      const rot = m.root.rotation.clone();
      const scale = m.root.scale.x;
      jobs.push(wait(0.18 * k).then(() => copyFrom(this.room.scene, this.effects, base, m, at, rot)).then(() => void m.root.scale.setScalar(scale)));
      k++;
    }
    await Promise.all(jobs);
  }

  saveSlot(id: string, drawing: Drawing | null) {
    const slot = this.room.slots[id];
    const tints = slot.items.map((m) => (m?.tint ? "#" + m.tint.getHexString() : null));
    const simplified = drawing ? simplifyLikeQuickDraw(strokesOf(drawing)).map((s) => s.map(([x, y]) => [x, y])) : undefined;
    const rec = this.slotArt[id];
    const before = placeProgress(this.save, this.place);
    (this.slotSaves() as Record<string, SlotSave>)[id] = { tints, drawing: simplified, arts: rec?.arts.slice(), src: rec ? slot.items.map((_, i) => rec.src[i] ?? 0) : undefined };
    this.persist();
    this.progressed(slot.anchors[0].p, before);
  }

  /** Keep a written character (the child's handwriting) and show it in the classroom. */
  saveGlyph(key: GlyphKey, art: Art, from: THREE.Vector3) {
    const before = placeProgress(this.save, "school");
    this.save.school.glyphs[key] = art;
    this.persist();
    if (placeProgress(this.save, "school") > before) this.progressed(from, before);
    else this.updateRoomHud();
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
  /** Let a character walk in this room (collisions and routes on its floor). */
  inRoom(c: Character) {
    const room = this.room;
    if (c.root.parent !== room.scene) room.scene.add(c.root);
    c.collide = (px, pz, r) => room.nav.collides(px, pz, r);
    c.router = (ax, az, bx, bz) => room.nav.route(ax, az, bx, bz);
  }

  async npcEnter(id: NpcId, x: number, z: number, opts: { keepDoor?: boolean; frame?: boolean } = {}) {
    const c = this.cast[id];
    const room = this.room;
    const door = room.door;
    this.ambient.delete(id);
    this.inRoom(c);
    c.place(door.outsideX, door.z, -Math.PI / 2);
    // The doorway is outside the walkable room: no collision until they are inside.
    c.collide = null;
    c.router = null;
    if (opts.frame !== false) this.focus(room.views.door);
    audio.door();
    await animate(0.4, (k) => room.setDoor(ease.out(k)));
    await c.walkTo(door.x - 0.7, door.z);
    this.inRoom(c);
    if (!opts.keepDoor) void animate(0.5, (k) => room.setDoor(1 - ease.inOut(k)));
    await c.go(x, z);
  }

  async npcLeave(id: NpcId) {
    const c = this.cast[id];
    const room = this.room;
    this.ambient.delete(id);
    await c.go(room.door.x - 0.7, room.door.z);
    audio.door();
    await animate(0.3, (k) => room.setDoor(ease.out(k)));
    c.collide = null;
    c.router = null;
    await c.walkTo(room.door.outsideX, room.door.z);
    room.scene.remove(c.root);
    void animate(0.4, (k) => room.setDoor(1 - k));
  }

  /** Fly an object (a new copy of a word kind) into a character's hand. */
  async giveTo(c: Character, word: WordId, fromPos: THREE.Vector3, tint: string | null = null): Promise<Made> {
    const m = this.makeItem(word, 1, this.artFor(word), tint);
    m.root.position.copy(fromPos);
    this.room.scene.add(m.root);
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
    this.room.scene.remove(m.root);
    this.holdItem(c, word, m);
    audio.pop(1.5);
    return m;
  }

  /** Put an object in a character's hand with its own grip (one shared rule for every item). */
  holdItem(c: Character, word: WordId | "magicPen", m: Made, size = 0.8) {
    const living = (m as Living).art ? (m as Living) : null;
    const g = GRIPS[word] ?? { grip: 0.3 };
    c.hold(m.root, {
      length: living ? living.h : m.height,
      grip: g.grip,
      flip: g.flip,
      // A flat drawing turns its face a little outwards so both people (and the camera) can see it.
      turn: living ? 0.7 : 0,
      scale: size / (c.look.scale ?? 1)
    });
  }

  /** Empty both hands (held items, a carried basket): people do not carry things between places. */
  dropFromHand(c: Character) {
    c.emptyHand();
    c.carry(null);
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
    this.holdItem(this.player, "magicPen", pen, 0.75);
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
    const room = this.room;
    const place = this.place;
    const spots = room.ambientSpots;
    let n = Math.floor(Math.random() * spots.length);
    while (this.ambient.has(id) && this.area === place) {
      if (this.ambientBusy.has(id)) {
        await wait(0.5);
        continue;
      }
      n = (n + 1 + Math.floor(Math.random() * 3)) % spots.length;
      // Keep clear of the player and of anyone taking part in a scene.
      const busy = [this.player, ...Object.entries(this.cast).filter(([k, c]) => !this.ambient.has(k as NpcId) && c.root.parent === room.scene).map(([, c]) => c)];
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
        const f = room.slots[slot] ? room.slots[slot].anchors[0].p : room.spots[slot].face;
        c.faceTo(f.x, f.z);
        c.emote(!room.slots[slot] || this.slotDone(slot) ? "point" : "think", 1.4);
      } else if (place === "store" && z < 1) {
        c.faceTo(PENNY_SPOT.x, PENNY_SPOT.z);
        c.emote("give", 1.0);
        audio.coin();
        this.cast.penny.emote("nod", 0.8);
      } else if (place === "school") {
        c.faceTo(room.hostSpot.x, room.hostSpot.z);
        c.emote(Math.random() < 0.5 ? "wave" : "laugh", 1.0);
      }
      await wait(1.6 + Math.random() * 2.2);
    }
  }

  /**
   * Debug / future invention phase: any drawing comes to life on the shop floor
   * as itself, behaving like whatever it was recognised as. Stays in the world.
   */
  async debugSpawn(d: Drawing, at: { x: number; z: number }, seconds = 6): Promise<{ label: string; behaviour: string; w: number; h: number }> {
    const label = this.recognizer?.recognize(strokesOf(d)).ranked[0].label ?? "drawing";
    const b = behaviourOf(label);
    const m = buildLiving(artFromDrawing(d), fitFor(b), { shadow: true, glow: true, label });
    const spot = new THREE.Vector3(at.x, 0, at.z);
    const yaw = Math.atan2(this.engine.goalPos.x - spot.x, this.engine.goalPos.z - spot.z);
    const box = { x: window.innerWidth / 2 - 120, y: window.innerHeight / 2 - 120, w: 240, h: 240 };
    await bringToLife(this.engine, this.room.scene, this.effects, m, box, spot, new THREE.Euler(0, yaw, 0));
    const roam = { minX: spot.x - 1.6, maxX: spot.x + 1.6, minZ: Math.max(0.6, spot.z - 0.8), maxZ: Math.min(this.room.bounds.maxZ - 0.3, spot.z + 1.0) };
    void playLiving(m, b, { effects: this.effects, roam, camera: this.engine.camPos, seconds });
    return { label, behaviour: b, w: m.w, h: m.h };
  }

  /** Debug: every slot of the current room restored with natural colours, people about. */
  async debugFill() {
    const saves = this.slotSaves() as Record<string, SlotSave>;
    for (const id of this.slotKeys()) {
      const slot = this.room.slots[id];
      const ex = exampleFor(slot.word);
      const arts = ex ? [artFromDrawing(ex)] : [];
      saves[id] = { tints: slot.anchors.map(() => null), arts, src: slot.anchors.map(() => 0) };
    }
    if (this.place === "school") {
      for (const [key, ch] of Object.entries(GLYPH_CHARS)) {
        const ex = glyphExample(ch);
        if (ex) (this.save.school.glyphs as Record<string, Art>)[key] = artFromDrawing(ex);
      }
      if (!this.save.school.steps.includes("bell")) this.save.school.steps.push("bell");
    }
    this.rebuildSlots();
    this.setRoomLevel(this.roomLevel(), true);
    this.updateRoomHud();
    this.hud.showPen(true);
    for (const id of ["ken", "yui", "taro"] as NpcId[]) {
      const c = this.cast[id];
      this.inRoom(c);
      c.place(-1 + Math.random() * 3, 1.5 + Math.random(), Math.PI);
      this.startAmbient(id);
    }
  }

  // ------------------------------------------------------------ e2e helpers
  stats() {
    return this.engine.stats();
  }
}

/** The drawing's own box on screen (canvas rect + its ink bounds). */
export function screenBox(d: Drawing, rect: DOMRect) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const st of d.strokes)
    for (const [x, y] of st.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  if (minX === Infinity) return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
  return { x: rect.left + minX, y: rect.top + minY, w: Math.max(10, maxX - minX), h: Math.max(10, maxY - minY) };
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Why a built place is still closed (places open in order: each needs the one before). */
export function lockedWhy(id: PlaceId): { en: string; ja: string } {
  const before: Partial<Record<PlaceId, { en: string; ja: string }>> = {
    school: { en: "Help the shop first", ja: "まず ぶんぼうぐやを たすけよう！" },
    zoo: { en: "Help the school first", ja: "まず がっこうを たすけよう！" },
    market: { en: "Help the zoo first", ja: "まず どうぶつえんを たすけよう！" },
    gym: { en: "Help the supermarket first", ja: "まず スーパーを たすけよう！" }
  };
  return before[id] ?? { en: "Not yet", ja: "まだ だよ" };
}

export type { CastId };
