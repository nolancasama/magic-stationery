/**
 * The five places of the town and their level scripts. A level = an area scene
 * (world/areas/*) + a script built from the shared Game helpers. Places without
 * a script are shown in the town as "Coming soon" (SPEC.md §5 has their design).
 */
import type { PlaceId } from "../../world/areas/town.ts";
import type { Game } from "../game.ts";
import { runStore } from "./store.ts";

export interface LevelDef {
  place: PlaceId;
  /** MEXT Let's Try! 2 focus. */
  focus: string;
  run?: (g: Game) => Promise<void>;
}

export const LEVELS: Record<PlaceId, LevelDef> = {
  store: { place: "store", focus: "Do you have a ...? Yes, I do. / No, I don't. Stationery, colours.", run: runStore },
  school: { place: "school", focus: "What time is it? Lowercase letters. School subjects." },
  zoo: { place: "zoo", focus: "Do you like ...? What animal do you like?" },
  market: { place: "market", focus: "What do you want? Fruit and vegetables, quantities." },
  gym: { place: "gym", focus: "What sport do you like? Sports equipment, physics." }
};

export function isBuilt(id: PlaceId): boolean {
  return !!LEVELS[id].run;
}
