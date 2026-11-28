/**
 * Debug mode (`?debug=1`): build saves at any stage of the game. Pure save
 * editing; the panel (ui/debugPanel.ts) applies them and reloads.
 */
import { artFromDrawing } from "../draw/art.ts";
import { glyphExample } from "../recognition/glyphs.ts";
import {
  defaults,
  GLYPH_CHARS,
  GYM_SLOT_KEYS,
  GYM_STEPS,
  MARKET_SLOT_KEYS,
  MARKET_STEPS,
  SCHOOL_SLOT_KEYS,
  SCHOOL_STEPS,
  SLOT_KEYS,
  STORE_STEPS,
  ZOO_SLOT_KEYS,
  ZOO_STEPS,
  type GlyphKey,
  type SaveData,
  type SlotSave
} from "./save.ts";
import type { RoomPlace } from "./game.ts";

/** Enough tints for every display place (extra ones are ignored; drawings fall back to the example art). */
const filled = (): SlotSave => ({ tints: Array(8).fill(null) });
const fill = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, filled()]));

export function completePlace(s: SaveData, place: RoomPlace) {
  if (place === "store") s.store = { steps: [...STORE_STEPS], slots: fill(SLOT_KEYS) };
  else if (place === "school") {
    const glyphs: Partial<Record<GlyphKey, ReturnType<typeof artFromDrawing>>> = {};
    for (const [key, ch] of Object.entries(GLYPH_CHARS) as [GlyphKey, string][]) {
      const ex = glyphExample(ch);
      glyphs[key] = ex ? artFromDrawing(ex) : { w: 10, h: 10, lw: 9, strokes: [{ c: "#2f3a75", p: [0, 0, 10, 10] }] };
    }
    s.school = { steps: [...SCHOOL_STEPS], slots: fill(SCHOOL_SLOT_KEYS), glyphs };
  } else if (place === "zoo") s.zoo = { steps: [...ZOO_STEPS], slots: fill(ZOO_SLOT_KEYS) };
  else if (place === "market") s.market = { steps: [...MARKET_STEPS], slots: fill(MARKET_SLOT_KEYS) };
  else s.gym = { steps: [...GYM_STEPS], slots: fill(GYM_SLOT_KEYS) };
}

export function resetPlace(s: SaveData, place: RoomPlace) {
  const fresh = defaults();
  if (place === "school") s.school = fresh.school;
  else (s as unknown as Record<string, unknown>)[place] = fresh[place];
}

export type PresetId = "new" | "pen" | "shop" | "middle" | "festival" | "done";
export const PRESETS: Record<PresetId, string> = {
  new: "New game",
  pen: "Has the pen (shop mid-way)",
  shop: "Shop done (free middle)",
  middle: "Middle done (gym not started)",
  festival: "Festival ready (gym's last step)",
  done: "Game finished"
};

/** A save at a stage of the game; the settings are kept. */
export function presetSave(id: PresetId, settings: SaveData["settings"]): SaveData {
  const s = defaults();
  s.settings = settings;
  s.started = true;
  if (id === "new") return s;
  if (id === "pen") {
    s.store.steps = ["pen"];
    return s;
  }
  completePlace(s, "store");
  if (id === "shop") return s;
  for (const p of ["school", "zoo", "market"] as const) completePlace(s, p);
  if (id === "middle") return s;
  completePlace(s, "gym");
  if (id === "festival") s.gym.steps = s.gym.steps.filter((x) => x !== "festival");
  return s;
}
