/**
 * Progress and settings, saved in localStorage (versioned, validated on load:
 * a damaged or foreign save never crashes the game, it falls back to defaults).
 */

export type StoreStep = "pen" | "pencils" | "shelf" | "ken" | "crayons" | "books" | "taro";
export const STORE_STEPS: StoreStep[] = ["pen", "pencils", "shelf", "ken", "crayons", "books", "taro"];

export type SlotKey = "pencilCup" | "erasers" | "scissors" | "rulers" | "crayons" | "books" | "notebooks" | "schoolbags";
export const SLOT_KEYS: SlotKey[] = ["pencilCup", "erasers", "scissors", "rulers", "crayons", "books", "notebooks", "schoolbags"];

export interface SlotSave {
  /** Crayon colour (hex) of each filled anchor; null = natural colours. */
  tints: (string | null)[];
  /** The child's drawing (0-255 space, integer points) for the album. */
  drawing?: number[][][];
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
  settings: Settings;
}

export const KEY = "ms.save.v1";

export function defaults(): SaveData {
  return {
    v: 1,
    started: false,
    store: { steps: [], slots: {} },
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
    const slots = store.slots as Record<string, unknown> | undefined;
    if (slots && typeof slots === "object") {
      for (const key of SLOT_KEYS) {
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
        out.store.slots[key] = entry;
      }
    }
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
