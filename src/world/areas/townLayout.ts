/**
 * The town's layout: a small neighbourhood, not a hub. One source for every
 * position the scene, the walking map, the cameras and the townsfolk use.
 *
 *   north   zoo (behind its fence)          school + gym behind the schoolyard
 *           zoo forecourt ── lane ── school gate
 *           little park        │           schoolyard (track, sports-day flags)
 *           houses · STORE · ··│·· café · SUPERMARKET · houses   (shop row)
 *   south   ═══════════ main street (crosswalk at the lane) ═══════════
 *           bus stop, low houses beyond the far pavement (outside the walkable area)
 *
 * Every building faces south, towards the camera, so each sign reads.
 * +z is south (towards the camera); heading 0 faces +z.
 */
import { NavMap, type Oval, type Rect } from "../nav.ts";

export type PlaceId = "store" | "school" | "zoo" | "market" | "gym";
export interface P2 {
  x: number;
  z: number;
}

/** Where the player may walk. The far pavement is the southern edge. */
export const BOUNDS: Rect = { minX: -17, maxX: 17, minZ: -13.5, maxZ: 9.9 };

// ---------------------------------------------------------------- streets
export const STREET = { minZ: 6.2, maxZ: 9.0, z: 7.6 };
export const PAVEMENT = { north: { minZ: 4.7, maxZ: 6.2 }, south: { minZ: 9.0, maxZ: 10.0 } };
/** The lane from the main street north to the zoo and the school. */
export const LANE = { minX: -3.2, maxX: -0.8, x: -2, minZ: -11.2, maxZ: 6.2 };
export const ZOO_FORECOURT: Rect = { minX: -14, maxX: -3.2, minZ: -8.8, maxZ: -5.4 };
export const PARK: Rect = { minX: -17, maxX: -3.2, minZ: -5.4, maxZ: 0.6 };
export const PARK_PATH: Rect = { minX: -15.4, maxX: -3.2, minZ: -2.7, maxZ: -1.7 };
export const SCHOOLYARD: Rect = { minX: -0.6, maxX: 17, minZ: -8.6, maxZ: -0.5 };
/** The school gate: the gap in the campus fence on the lane. */
export const SCHOOL_GATE = { x: -0.7, minZ: -6.4, maxZ: -3.2 };
export const TRACK = { x: 7.4, z: -4.6, rx: 5.4, rz: 2.5 };

// ---------------------------------------------------------------- places
export interface PlaceLayout {
  at: P2;
  /** Footprint (walls), centred on `at`. */
  w: number;
  d: number;
  /** Where the player walks to before going in (on the path in front). */
  door: P2;
}

export const PLACES: Record<PlaceId, PlaceLayout> = {
  store: { at: { x: -9, z: 2.6 }, w: 4.2, d: 3.2, door: { x: -8.1, z: 5.0 } },
  market: { at: { x: 6.6, z: 2.4 }, w: 5.0, d: 3.4, door: { x: 8.4, z: 5.0 } },
  school: { at: { x: 5.2, z: -10.6 }, w: 9.4, d: 3.2, door: { x: 5.2, z: -8.2 } },
  gym: { at: { x: 13.2, z: -10.3 }, w: 4.7, d: 4.1, door: { x: 13.2, z: -7.4 } },
  zoo: { at: { x: -9, z: -9.2 }, w: 4.0, d: 0.8, door: { x: -9, z: -8.2 } }
};

/** Neighbours' houses along the shop row (x, z, width, depth, wall, roof). */
export const HOUSES: [number, number, number, number, string, string][] = [
  [-14.6, 2.7, 3.6, 3.0, "#f3ead8", "#5c6b8a"],
  [1.3, 2.7, 3.0, 2.8, "#fff1e0", "#b5654a"],
  [11.6, 2.7, 3.2, 3.0, "#eef2e6", "#4f6d5e"],
  [15.4, 2.8, 2.8, 2.8, "#f6e7e7", "#6d5a7d"]
];
/** Low houses beyond the far pavement: scenery outside the walkable area. */
export const FAR_HOUSES: [number, number, number, number, string, string][] = [
  [-14.5, 12.2, 4.0, 3.0, "#efe6d6", "#56657f"],
  [-8.8, 12.4, 3.6, 3.0, "#f7efe4", "#9a5c48"],
  [-2.6, 12.2, 3.4, 2.8, "#eaf0ea", "#4f6d5e"],
  [9.6, 12.3, 3.8, 3.0, "#f3eadf", "#5c6b8a"],
  [15.0, 12.2, 3.4, 2.8, "#f6e9ef", "#7a5a6a"]
];
export const BUS_STOP: P2 = { x: 3.6, z: 9.55 };

// ---------------------------------------------------------------- street things
/** Utility poles along the shop-row pavement, each with a street lamp. */
export const POLES: number[] = [-16.4, -13.4, -4.9, 3.5, 13.6];
export const POLE_Z = 6.0;
export const VENDING: P2[] = [{ x: -6.3, z: 4.3 }, { x: -5.5, z: 4.3 }];
export const BIKES: [number, number, number][] = [[-4.4, 4.3, 0.3], [-3.8, 4.25, 0.2], [10.0, 4.6, -0.2]];
export const BENCHES: [number, number, number][] = [[-12.6, -0.6, 0], [-6.8, -3.6, Math.PI], [2.4, -1.2, 0], [12.0, -1.2, 0]];
/** Flower beds: x, z, width, depth, district. */
export const BEDS: [number, number, number, number, "shops" | "campus" | "zoo" | "park"][] = [
  [-11.4, 4.45, 1.2, 0.4, "shops"],
  [4.2, 4.4, 1.0, 0.4, "shops"],
  [-9.0, -3.8, 2.2, 1.0, "park"],
  [-13.4, -6.0, 1.4, 0.6, "zoo"],
  [-4.6, -6.0, 1.4, 0.6, "zoo"],
  [1.8, -8.2, 1.6, 0.5, "campus"]
];
export const SANDBOX: P2 = { x: -14.6, z: -4.0 };
export const SLIDE: P2 = { x: -12.0, z: -4.4 };
export const BARS: P2 = { x: 16.0, z: -2.0 };
export const GOAL: P2 = { x: 15.8, z: -5.4 };

/** Trees: x, z, size, kind. */
export const TREES: [number, number, number, "round" | "sakura" | "pine"][] = [
  // Park.
  [-16.0, -0.6, 1.0, "round"], [-16.2, -3.0, 1.1, "round"], [-6.0, -0.4, 0.9, "sakura"],
  [-4.4, -4.5, 0.9, "round"], [-16.2, -4.8, 0.9, "pine"],
  // Zoo forecourt and fence.
  [-15.4, -7.4, 1.0, "round"], [-3.9, -8.4, 0.8, "pine"],
  // Campus edges (out of the schoolyard's middle).
  [0.4, -11.8, 1.0, "sakura"], [0.4, -1.4, 0.8, "sakura"], [16.4, -8.4, 0.9, "sakura"], [16.6, -0.9, 0.8, "round"],
  // The lane's top.
  [-2.0, -12.6, 1.0, "round"]
];
/** Trees behind the zoo fence and the school (scenery, not walkable). */
export const BACK_TREES: [number, number, number, "round" | "sakura" | "pine"][] = [
  [-16, -11, 1.4, "round"], [-12.6, -12.4, 1.6, "round"], [-6.4, -11.6, 1.5, "round"], [-4.6, -13.4, 1.2, "pine"],
  [-14, -14.4, 1.3, "pine"], [-9.6, -13.8, 1.2, "round"], [2.2, -14.0, 1.2, "round"], [10.0, -13.6, 1.4, "round"],
  [17.0, -12.4, 1.3, "pine"], [-19.2, -2.0, 1.3, "round"], [19.4, -4.0, 1.3, "round"], [19.0, 3.4, 1.1, "pine"],
  [-19.4, 4.8, 1.1, "round"]
];

// ---------------------------------------------------------------- walking map
const rect = (cx: number, cz: number, w: number, d: number, pad = 0): Rect =>
  ({ minX: cx - w / 2 - pad, maxX: cx + w / 2 + pad, minZ: cz - d / 2 - pad, maxZ: cz + d / 2 + pad });

/** Obstacles: buildings, fences, hedges and furniture. Paths stay wide (≥ 2 m). */
export function obstacles(): { rects: Rect[]; ovals: Oval[] } {
  const rects: Rect[] = [];
  for (const id of ["store", "market", "school", "gym"] as PlaceId[]) {
    const p = PLACES[id];
    rects.push(rect(p.at.x, p.at.z, p.w, p.d, 0.1));
  }
  for (const [x, z, w, d] of HOUSES) rects.push(rect(x, z, w, d, 0.1));
  // The zoo behind its fence (the gate is the way in).
  rects.push({ minX: BOUNDS.minX, maxX: LANE.minX - 0.4, minZ: BOUNDS.minZ, maxZ: -9.0 });
  // Behind the school and the gym.
  rects.push({ minX: SCHOOLYARD.minX, maxX: BOUNDS.maxX, minZ: BOUNDS.minZ, maxZ: -11.9 });
  // Campus fence on the lane, either side of the gate.
  rects.push({ minX: -0.75, maxX: -0.45, minZ: -11.9, maxZ: SCHOOL_GATE.minZ });
  rects.push({ minX: -0.75, maxX: -0.45, minZ: SCHOOL_GATE.maxZ, maxZ: 0.7 });
  // Hedge between the schoolyard and the backs of the shop row.
  rects.push({ minX: -0.6, maxX: BOUNDS.maxX, minZ: -0.5, maxZ: 1.2 });
  // Park hedge behind the shop row (with gaps either side of the store).
  rects.push({ minX: BOUNDS.minX, maxX: -16.6, minZ: 0.6, maxZ: 1.2 });
  for (const v of VENDING) rects.push(rect(v.x, v.z, 0.75, 0.6));
  for (const [x, z] of BIKES) rects.push(rect(x, z, 0.35, 1.2));
  for (const [x, z, r] of BENCHES) rects.push(Math.abs(Math.sin(r)) > 0.5 ? rect(x, z, 0.5, 1.6) : rect(x, z, 1.6, 0.5));
  for (const [x, z, w, d] of BEDS) rects.push(rect(x, z, w, d));
  rects.push(rect(SANDBOX.x, SANDBOX.z, 1.8, 1.8));
  rects.push(rect(SLIDE.x, SLIDE.z, 0.7, 2.2));
  rects.push(rect(BARS.x, BARS.z, 1.8, 0.3));
  rects.push(rect(GOAL.x, GOAL.z, 0.8, 2.2));
  rects.push(rect(BUS_STOP.x, BUS_STOP.z, 1.8, 0.6));
  // The zoo gate's posts stand out of the fence.
  for (const sx of [-1, 1]) rects.push(rect(PLACES.zoo.at.x + sx * 1.6, PLACES.zoo.at.z, 0.7, 0.7));
  const ovals: Oval[] = [];
  for (const [x, z, s] of TREES) ovals.push({ x, z, rx: 0.25 * s, rz: 0.25 * s });
  for (const x of POLES) ovals.push({ x, z: POLE_Z, rx: 0.14, rz: 0.14 });
  for (const [a, b] of BUNTING) for (const e of [a, b]) ovals.push({ x: e.x, z: e.z, rx: 0.1, rz: 0.1 });
  return { rects, ovals };
}

export function townNav(): NavMap {
  const { rects, ovals } = obstacles();
  return new NavMap(BOUNDS, rects, 0.3, ovals);
}

// ---------------------------------------------------------------- cameras
/** Follow camera: above and behind the player, looking north; clamped so the edge of the world stays out of view. */
export const FOLLOW = {
  up: 13.6,
  back: 13.6,
  lookUp: 0.8,
  lookAhead: 2.2,
  look: { minX: -9.5, maxX: 9.5, minZ: -9.0, maxZ: 5.4 }
};
/** The map: the whole town from high above (every place visible and clickable). */
export const MAP_VIEW = { pos: { x: 0, y: 36, z: 16.5 }, look: { x: 0, y: 0, z: -3.6 } };

/** First arrival (and the title's backdrop): at the bottom of the lane, facing up it. */
export const SPAWN = { x: -2.0, z: 5.4, heading: Math.PI };

// ---------------------------------------------------------------- townsfolk
/** Where people stroll, by district. Each list is a loop of free spots. */
export const STROLL: Record<"shops" | "campus" | "zoo" | "market" | "gym", P2[]> = {
  shops: [{ x: -6.6, z: 5.5 }, { x: -12.6, z: 5.6 }, { x: -9.4, z: -2.2 }, { x: BUS_STOP.x - 1.6, z: 9.4 }, { x: 1.2, z: 5.4 }],
  campus: [{ x: 3.0, z: -3.0 }, { x: 7.4, z: -6.9 }, { x: 11.8, z: -4.4 }, { x: 14.0, z: -2.8 }, { x: 6.2, z: -2.0 }],
  zoo: [{ x: -11.8, z: -7.0 }, { x: -6.4, z: -6.8 }, { x: -9.0, z: -6.0 }],
  market: [{ x: 5.0, z: 5.4 }, { x: 10.4, z: 5.6 }, { x: 7.2, z: 5.5 }],
  gym: [{ x: 12.4, z: -6.4 }, { x: 9.6, z: -6.6 }, { x: 14.6, z: -6.2 }]
};

/** Strings of sports-day flags across the schoolyard (from, to; y on the poles). */
export const BUNTING: [P2, P2][] = [
  [{ x: 0.4, z: -2.0 }, { x: 15.6, z: -2.0 }],
  [{ x: 0.4, z: -7.6 }, { x: 10.4, z: -7.6 }]
];
export const BUNTING_Y = 3.4;
