/**
 * The five places of the town and their level scripts. A level = an area scene
 * (world/areas/*) + a script built from the shared Game helpers. Places without
 * a script are shown in the town as "Coming soon" (SPEC.md §5 has their design).
 */
import type { PlaceId } from "../../world/areas/town.ts";
import type { Game } from "../game.ts";
import { placeProgress, schoolProgress, storeProgress, type SaveData } from "../save.ts";
import { runMarket } from "./market.ts";
import { runSchool } from "./school.ts";
import { runZoo } from "./zoo.ts";
import { runStore } from "./store.ts";

export interface LevelDef {
  place: PlaceId;
  /** MEXT Let's Try! 2 focus. */
  focus: string;
  run?: (g: Game) => Promise<void>;
  /** Open once this is true (levels unlock in order: the magic pen comes from Level 1). */
  open?: (s: SaveData) => boolean;
}

export const LEVELS: Record<PlaceId, LevelDef> = {
  store: { place: "store", focus: "Do you have a ...? Yes, I do. / No, I don't. Stationery, colours.", run: runStore },
  school: {
    place: "school",
    focus: "Good morning. What time is it? It's eight o'clock. Numbers, lowercase letters.",
    run: runSchool,
    open: (s) => storeProgress(s) >= 1 && s.store.steps.includes("taro")
  },
  zoo: {
    place: "zoo",
    focus: "Hello. Do you like ...? Yes, I do. / No, I don't. What animal do you like? I like ...",
    run: runZoo,
    open: (s) => schoolProgress(s) >= 1
  },
  market: {
    place: "market",
    focus: "What do you want? I want ___, please. How many? ___, please. Here you are. Fruit, vegetables, numbers, colours.",
    run: runMarket,
    open: (s) => placeProgress(s, "zoo") >= 1
  },
  gym: { place: "gym", focus: "What sport do you like? Sports equipment, physics." }
};

export function isBuilt(id: PlaceId): boolean {
  return !!LEVELS[id].run;
}

export function isOpen(id: PlaceId, s: SaveData): boolean {
  return isBuilt(id) && (LEVELS[id].open?.(s) ?? true);
}
