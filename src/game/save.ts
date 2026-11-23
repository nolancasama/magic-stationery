/**
 * Progress and settings, saved in localStorage (versioned, validated on load:
 * a damaged or foreign save never crashes the game, it falls back to defaults).
 */

import { sanitizeArt, type Art } from "../draw/art.ts";

export type StoreStep = "pen" | "pencils" | "shelf" | "ken" | "crayons" | "books" | "taro";
export const STORE_STEPS: StoreStep[] = ["pen", "pencils", "shelf", "ken", "crayons", "books", "taro"];

export type SlotKey = "pencilCup" | "erasers" | "scissors" | "rulers" | "crayons" | "books" | "notebooks" | "schoolbags";
export const SLOT_KEYS: SlotKey[] = ["pencilCup", "erasers", "scissors", "rulers", "crayons", "books", "notebooks", "schoolbags"];

/** Level 2, the Classroom (SPEC.md §5). */
export type SchoolStep = "arrive" | "desks" | "clock" | "time" | "letters" | "bell";
export const SCHOOL_STEPS: SchoolStep[] = ["arrive", "desks", "clock", "time", "letters", "bell"];
export type SchoolSlotKey = "desks" | "chairs";
export const SCHOOL_SLOT_KEYS: SchoolSlotKey[] = ["desks", "chairs"];
/** Characters the child writes: the clock's numbers and the alphabet strip's missing letters. */
export type GlyphKey = "n12" | "n3" | "n6" | "n9" | "ld" | "lg" | "lm" | "lt";
export const CLOCK_KEYS: GlyphKey[] = ["n12", "n3", "n6", "n9"];
export const LETTER_KEYS: GlyphKey[] = ["ld", "lg", "lm", "lt"];
export const GLYPH_KEYS: GlyphKey[] = [...CLOCK_KEYS, ...LETTER_KEYS];
/** What the child writes for each key. */
export const GLYPH_CHARS: Record<GlyphKey, string> = { n12: "12", n3: "3", n6: "6", n9: "9", ld: "d", lg: "g", lm: "m", lt: "t" };

/** Level 3, the Zoo. */
export type ZooStep = "welcome" | "elephants" | "monkeys" | "pandas" | "penguins" | "favorite";
export const ZOO_STEPS: ZooStep[] = ["welcome", "elephants", "monkeys", "pandas", "penguins", "favorite"];
export type ZooSlotKey = "elephants" | "monkeys" | "bananas" | "pandas" | "bamboo" | "penguins";
export const ZOO_SLOT_KEYS: ZooSlotKey[] = ["elephants", "monkeys", "bananas", "pandas", "bamboo", "penguins"];

export type Step = StoreStep | SchoolStep | ZooStep;

export interface SlotSave {
  /** Crayon colour (hex) of each filled anchor; null = natural colours. */
  tints: (string | null)[];
  /** The child's drawing (0-255 space, integer points), legacy/album fallback. */
  drawing?: number[][][];
  /** The child's own artwork (colours, proportions), shown in the world. */
  arts?: Art[];
  /** For each filled place, which art it shows. */
  src?: number[];
}

export interface Settings {
  /** Teacher setting: microphone allowed. Off = the whole game by tapping. */
  mic: boolean;
  /** Drawing help: "extra" shows the trace stencil from the first attempt. */
  help: "normal" | "extra";
  japanese: boolean;
  slowVoice: boolean;
  music: boolean;
  sfx: boolean;
  /** Click to put the pen down, click again to lift it (touchpads). */
  touchpadPen: boolean;
}

export interface SaveData {
  v: 1;
  started: boolean;
  store: {
    steps: StoreStep[];
    slots: Partial<Record<SlotKey, SlotSave>>;
  };
  school: {
    steps: SchoolStep[];
    slots: Partial<Record<SchoolSlotKey, SlotSave>>;
    /** The child's own handwriting for each written character. */
    glyphs: Partial<Record<GlyphKey, Art>>;
  };
  zoo: {
    steps: ZooStep[];
    slots: Partial<Record<ZooSlotKey, SlotSave>>;
  };
  settings: Settings;
}

export const KEY = "ms.save.v1";

export function defaults(): SaveData {
  return {
    v: 1,
    started: false,
    store: { steps: [], slots: {} },
    school: { steps: [], slots: {}, glyphs: {} },
    zoo: { steps: [], slots: {} },
    settings: { mic: true, help: "normal", japanese: true, slowVoice: false, music: true, sfx: true, touchpadPen: false }
  };
}

const isBool = (x: unknown): x is boolean => typeof x === "boolean";
const isHex = (x: unknown): x is string => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x);

/** Rebuild a save from untrusted JSON, keeping only valid fields. */
export function sanitize(raw: unknown): SaveData {
  const out = defaults();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return out;
  if (isBool(r.started)) out.started = r.started;
  const store = r.store as Record<string, unknown> | undefined;
  if (store && typeof store === "object") {
    if (Array.isArray(store.steps)) out.store.steps = STORE_STEPS.filter((s) => (store.steps as unknown[]).includes(s));
    sanitizeSlots(store.slots, SLOT_KEYS, out.store.slots);
  }
  const school = r.school as Record<string, unknown> | undefined;
  if (school && typeof school === "object") {
    if (Array.isArray(school.steps)) out.school.steps = SCHOOL_STEPS.filter((s) => (school.steps as unknown[]).includes(s));
    sanitizeSlots(school.slots, SCHOOL_SLOT_KEYS, out.school.slots);
    const glyphs = school.glyphs as Record<string, unknown> | undefined;
    if (glyphs && typeof glyphs === "object") {
      for (const key of GLYPH_KEYS) {
        const a = sanitizeArt(glyphs[key]);
        if (a) out.school.glyphs[key] = a;
      }
    }
  }
  const zoo = r.zoo as Record<string, unknown> | undefined;
  if (zoo && typeof zoo === "object") {
    if (Array.isArray(zoo.steps)) out.zoo.steps = ZOO_STEPS.filter((s) => (zoo.steps as unknown[]).includes(s));
    sanitizeSlots(zoo.slots, ZOO_SLOT_KEYS, out.zoo.slots);
  }
  const st = r.settings as Record<string, unknown> | undefined;
  if (st && typeof st === "object") {
    const s = out.settings;
    if (isBool(st.mic)) s.mic = st.mic;
    if (st.help === "normal" || st.help === "extra") s.help = st.help;
    if (isBool(st.japanese)) s.japanese = st.japanese;
    if (isBool(st.slowVoice)) s.slowVoice = st.slowVoice;
    if (isBool(st.music)) s.music = st.music;
    if (isBool(st.sfx)) s.sfx = st.sfx;
    if (isBool(st.touchpadPen)) s.touchpadPen = st.touchpadPen;
  }
  return out;
}

function sanitizeSlots<K extends string>(raw: unknown, keys: readonly K[], out: Partial<Record<K, SlotSave>>): void {
  const slots = raw as Record<string, unknown> | undefined;
  if (!slots || typeof slots !== "object") return;
  for (const key of keys) {
    const s = slots[key] as Record<string, unknown> | undefined;
    if (!s || !Array.isArray(s.tints)) continue;
    const tints = (s.tints as unknown[]).slice(0, 8).map((t) => (isHex(t) ? t : null));
    if (!tints.length) continue;
    const entry: SlotSave = { tints };
    if (Array.isArray(s.drawing)) {
      const d = (s.drawing as unknown[])
        .slice(0, 60)
        .filter(Array.isArray)
        .map((st) => (st as unknown[]).slice(0, 400).filter((pt): pt is number[] => Array.isArray(pt) && pt.length === 2 && pt.every((n) => Number.isFinite(n))));
      if (d.length) entry.drawing = d;
    }
    if (Array.isArray(s.arts)) {
      const arts = (s.arts as unknown[]).slice(0, 8).map(sanitizeArt).filter((a): a is Art => a !== null);
      if (arts.length) {
        entry.arts = arts;
        const src = Array.isArray(s.src) ? (s.src as unknown[]) : [];
        entry.src = tints.map((_, i) => {
          const v = src[i];
          return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < arts.length ? v : 0;
        });
      }
    }
    out[key] = entry;
  }
}

export interface Storage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export function load(storage: Storage | null): SaveData {
  if (!storage) return defaults();
  try {
    const text = storage.getItem(KEY);
    return text ? sanitize(JSON.parse(text)) : defaults();
  } catch {
    return defaults();
  }
}

export function store(storage: Storage | null, data: SaveData): void {
  try {
    storage?.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode / quota: play on without saving */
  }
}

export function storeProgress(data: SaveData): number {
  return SLOT_KEYS.filter((k) => data.store.slots[k]).length / SLOT_KEYS.length;
}

/** Classroom restoration units: desks, chairs, the clock, the alphabet strip, the bell. */
export function schoolUnits(data: SaveData): { done: number; total: number } {
  const s = data.school;
  const units = [
    !!s.slots.desks,
    !!s.slots.chairs,
    CLOCK_KEYS.every((k) => s.glyphs[k]),
    LETTER_KEYS.every((k) => s.glyphs[k]),
    s.steps.includes("bell")
  ];
  return { done: units.filter(Boolean).length, total: units.length };
}

export function schoolProgress(data: SaveData): number {
  const u = schoolUnits(data);
  return u.done / u.total;
}

/** Zoo restoration units: the six displays and the favourite-animal talk. */
export function zooUnits(data: SaveData): { done: number; total: number } {
  const done = ZOO_SLOT_KEYS.filter((k) => data.zoo.slots[k]).length + (data.zoo.steps.includes("favorite") ? 1 : 0);
  return { done, total: ZOO_SLOT_KEYS.length + 1 };
}

export function placeProgress(data: SaveData, place: "store" | "school" | "zoo"): number {
  if (place === "store") return storeProgress(data);
  if (place === "school") return schoolProgress(data);
  const u = zooUnits(data);
  return u.done / u.total;
}
