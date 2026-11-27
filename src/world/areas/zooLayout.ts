/**
 * Mr. Oka's zoo, as data: one source of truth for the scene (areas/zoo.ts),
 * the animals' lives (levels/zooLife.ts) and the level script (levels/zoo.ts).
 * Plain numbers: x to the right, z towards the camera (the diorama's open
 * front is +z), y up. 24 x 18 m.
 *
 *          z -8.75 (back)
 *   +-----------+--------------+---+---------------+
 *   |           |   MONKEY     |hed|    PANDA      |
 *   | ELEPHANTS |   ISLAND     |ge |    GARDEN     |
 *   |           |   (moat)     |   |               |
 *   |  water    +--------------+---+---------------+  back path z -2.4..-0.4
 *   |  hole     | bed  |  N  | bed |   +-----------+
 *   |           |------+fountain---+ E | PENGUIN    |
 *   |  mud      | bed  |  S  | bed | p | POOL       |
 *   +--deck-----+------+plaza+-----+---+-----------+
 *   |  promenade (main path) ......................  GATE (east wall)
 *   +--- front flower bed -------------------------+  z 8.75 (front)
 *
 * Visitors walk anywhere in ROOM except visitorRects()/visitorOvals(); the
 * paths are the walkable corridors between the habitats and beds. Each
 * habitat's animals stay inside its `roam`, clear of its own obstacles
 * (habitatNav). Positions are the root of a drawing: its bottom centre.
 */
import { NavMap, type Oval, type Rect } from "../nav.ts";

export type V3 = [number, number, number];
export interface P2 {
  x: number;
  z: number;
}
export interface Cam {
  pos: V3;
  look: V3;
}

export type PenId = "elephants" | "monkeys" | "pandas" | "penguins";
export type ZooSlotId = "elephants" | "monkeys" | "bananas" | "pandas" | "bamboo" | "penguins";

// ---------------------------------------------------------------- the grounds
/** The slab the zoo stands on (a little bigger than the walkable room). */
export const GROUND: Rect = { minX: -12, maxX: 12, minZ: -9.2, maxZ: 9 };
/** Walkable bounds for people. */
export const ROOM: Rect = { minX: -11.75, maxX: 11.75, minZ: -8.75, maxZ: 8.75 };
/** The gate is in the east (+x) fence, near the front, like every room's door. */
export const DOOR = { x: 11.55, z: 6.4, outsideX: 13.0 };
/** The opening in the east fence (fence line at x = ROOM.maxX + 0.1). */
export const GATE_GAP = { minZ: 5.7, maxZ: 7.1 };

/** Main path along the front, from the gate past the plaza to the elephant deck. */
export const PROMENADE: Rect = { minX: -10.8, maxX: 11.75, minZ: 5.4, maxZ: 8.0 };
/** Viewing deck in front of the elephants (walkable). */
export const ELEPHANT_DECK: Rect = { minX: -10.8, maxX: -4.6, minZ: 3.9, maxZ: 5.4 };
/** Path along the elephants' east fence, with a dead-end spur to a side overlook. */
export const WEST_PATH: Rect = { minX: -4.6, maxX: -2.6, minZ: -6.2, maxZ: 5.4 };
/** Path in front of the monkey island and the panda garden. */
export const BACK_PATH: Rect = { minX: -4.6, maxX: 11.75, minZ: -2.4, maxZ: -0.2 };
/** Path along the penguins' west side, back path to promenade. */
export const EAST_PATH: Rect = { minX: 3.4, maxX: 5.4, minZ: -0.4, maxZ: 5.4 };
/** Central garden: four beds around a cross of paths with a fountain in the middle. */
export const CROSS_NS: Rect = { minX: -0.3, maxX: 1.5, minZ: -0.4, maxZ: 5.4 };
export const CROSS_EW: Rect = { minX: -2.6, maxX: 3.4, minZ: 1.2, maxZ: 3.8 };
export const FOUNTAIN: Oval = { x: 0.6, z: 2.5, rx: 0.75, rz: 0.75 };

/** Planted beds and hedges people cannot walk on (low planting only in the central beds). */
export const BEDS: Record<string, Rect> = {
  nw: { minX: -2.6, maxX: -0.3, minZ: -0.4, maxZ: 1.2 },
  ne: { minX: 1.5, maxX: 3.4, minZ: -0.4, maxZ: 1.2 },
  sw: { minX: -2.6, maxX: -0.3, minZ: 3.8, maxZ: 5.4 },
  se: { minX: 1.5, maxX: 3.4, minZ: 3.8, maxZ: 5.4 },
  /** Hedge with tall trees between the monkey island and the panda garden. */
  hedgeMid: { minX: 3.4, maxX: 4.4, minZ: -8.75, maxZ: -2.4 },
  /** Trees closing the north end of the west spur. */
  hedgeWest: { minX: -4.6, maxX: -2.6, minZ: -8.75, maxZ: -6.2 },
  /** Corner planting west of the elephant deck. */
  cornerWest: { minX: -11.75, maxX: -10.8, minZ: 3.9, maxZ: 8.0 },
  /** Flower border along the diorama's open front: keep it below ~1.2 m except at the corners. */
  front: { minX: -11.75, maxX: 11.75, minZ: 8.0, maxZ: 8.75 }
};

/** Benches (1.0 x 0.4 m). yaw 0 = the sitter faces -z (towards the exhibits). */
export const BENCHES: { x: number; z: number; yaw: number }[] = [
  { x: -9.6, z: 7.7, yaw: 0 },
  { x: -5.8, z: 7.7, yaw: 0 },
  { x: 5.6, z: 7.7, yaw: 0 },
  { x: -1.5, z: 1.4, yaw: Math.PI },
  { x: 2.5, z: 1.4, yaw: Math.PI },
  { x: -1.5, z: 3.6, yaw: 0 },
  { x: 2.5, z: 3.6, yaw: 0 }
];

// ---------------------------------------------------------------- habitats
export interface Habitat {
  id: PenId;
  /** Sign text and border colour. */
  name: string;
  color: string;
  /** Fence footprint: visitors are kept out of it. */
  rect: Rect;
  /** Where the animals' roots may go (inside the fence). */
  roam: Rect;
  /** The animals' clearance radius on their own nav map. */
  radius: number;
  /** Exhibit camera (drawing, restoring, talking about the animals). */
  view: Cam;
  /** Player stands here to draw; Mr. Oka stands beside them. */
  stand: P2;
  oka: P2;
  /** A friend visiting this exhibit stands here, and (if not entering by the gate) walks in from `arrive`. */
  visitor: P2 | null;
  arrive: P2 | null;
  /** Exhibit sign, on the fence facing the path. */
  sign: P2;
  /** Objective star. */
  marker: V3;
}

export const HABITATS: Record<PenId, Habitat> = {
  elephants: {
    id: "elephants",
    name: "ELEPHANTS",
    color: "#8d9db0",
    rect: { minX: -11.75, maxX: -4.6, minZ: -8.75, maxZ: 3.9 },
    roam: { minX: -11.45, maxX: -4.9, minZ: -8.45, maxZ: 3.6 },
    radius: 0.8,
    view: { pos: [-8.0, 5.4, 10.4], look: [-8.0, 0.5, -1.0] },
    stand: { x: -8.2, z: 4.7 },
    oka: { x: -6.9, z: 4.85 },
    visitor: { x: -9.5, z: 4.9 },
    arrive: { x: -3.6, z: -0.6 },
    sign: { x: -5.6, z: 4.05 },
    marker: [-8.0, 2.6, 0.5]
  },
  monkeys: {
    id: "monkeys",
    name: "MONKEYS",
    color: "#a1887f",
    rect: { minX: -2.6, maxX: 3.4, minZ: -8.75, maxZ: -2.4 },
    roam: { minX: -2.15, maxX: 2.95, minZ: -8.45, maxZ: -2.95 },
    radius: 0.15,
    view: { pos: [0.4, 5.6, 4.4], look: [0.4, 1.5, -5.4] },
    stand: { x: 0.4, z: -1.3 },
    oka: { x: 1.7, z: -1.05 },
    visitor: null,
    arrive: null,
    sign: { x: -1.9, z: -2.25 },
    marker: [0.4, 3.0, -5.0]
  },
  pandas: {
    id: "pandas",
    name: "PANDAS",
    color: "#66bb6a",
    rect: { minX: 4.4, maxX: 11.75, minZ: -8.75, maxZ: -2.4 },
    roam: { minX: 4.7, maxX: 11.45, minZ: -8.45, maxZ: -2.7 },
    radius: 0.45,
    view: { pos: [8.0, 4.8, 4.2], look: [8.0, 0.6, -5.2] },
    stand: { x: 7.6, z: -1.3 },
    oka: { x: 8.9, z: -1.05 },
    visitor: null,
    arrive: null,
    sign: { x: 5.0, z: -2.25 },
    marker: [8.0, 1.8, -5.0]
  },
  penguins: {
    id: "penguins",
    name: "PENGUINS",
    color: "#4fc3f7",
    rect: { minX: 5.4, maxX: 11.75, minZ: -0.2, maxZ: 4.8 },
    roam: { minX: 5.65, maxX: 11.5, minZ: 0.05, maxZ: 4.55 },
    radius: 0.22,
    view: { pos: [8.6, 3.8, 9.2], look: [8.9, 0.2, 2.0] },
    stand: { x: 8.2, z: 5.8 },
    oka: { x: 6.9, z: 5.95 },
    // Ken comes in by the gate, which is right here.
    visitor: { x: 9.6, z: 6.0 },
    arrive: null,
    sign: { x: 6.0, z: 4.95 },
    marker: [9.2, 1.5, 2.3]
  }
};

// ---------------------------------------------------------------- features
export interface Tree {
  x: number;
  z: number;
  trunk: number;
  /** Trunk height. */
  h: number;
  /** Canopy centre height and radius (a cluster of spheres around it). */
  canopyY: number;
  canopy: number;
}
export interface Rock extends Oval {
  h: number;
}
/** Logs lie along x or z (their nav footprint is then an oval). */
export interface Log {
  x: number;
  z: number;
  len: number;
  r: number;
  axis: "x" | "z";
}

export const logOval = (l: Log): Oval => (l.axis === "x" ? { x: l.x, z: l.z, rx: l.len / 2, rz: l.r } : { x: l.x, z: l.z, rx: l.r, rz: l.len / 2 });
const trunkOval = (t: Tree): Oval => ({ x: t.x, z: t.z, rx: t.trunk, rz: t.trunk });

// Elephants: the biggest habitat. A watering hole against the west fence that they drink and
// spray at (never walk into; a 1.5 m wide way past it on the east keeps the back reachable),
// a mud wallow they bathe in (walkable), shade trees at the back, logs, rocks, a hay rack at the front.
export const ELEPHANT = {
  water: { x: -9.6, z: -1.8, rx: 1.6, rz: 1.3 } as Oval,
  mud: { x: -6.4, z: 0.9, rx: 1.1, rz: 0.7 } as Oval,
  /** Bare earth (decor). */
  dirt: [{ x: -9.4, z: -1.8, rx: 2.5, rz: 2.1 }, { x: -7.6, z: -5.4, rx: 1.8, rz: 1.3 }] as Oval[],
  trees: [
    { x: -10.3, z: -5.8, trunk: 0.22, h: 2.7, canopyY: 3.0, canopy: 1.5 },
    { x: -5.9, z: -6.9, trunk: 0.2, h: 2.4, canopyY: 2.7, canopy: 1.25 }
  ] as Tree[],
  rocks: [
    { x: -11.0, z: -0.2, rx: 0.5, rz: 0.45, h: 0.5 },
    { x: -8.2, z: -7.9, rx: 1.1, rz: 0.6, h: 0.9 },
    { x: -11.0, z: -7.8, rx: 0.8, rz: 0.6, h: 0.8 }
  ] as Rock[],
  logs: [
    { x: -6.6, z: -4.6, len: 1.6, r: 0.18, axis: "x" },
    { x: -11.0, z: 1.8, len: 1.3, r: 0.16, axis: "z" }
  ] as Log[],
  hayRack: { minX: -5.9, maxX: -4.75, minZ: 2.55, maxZ: 3.75 } as Rect,
  /** Places they walk between. */
  poi: {
    shoreS: { x: -9.6, z: 0.35 },
    shoreE: { x: -6.9, z: -1.8 },
    shoreN: { x: -9.6, z: -3.95 },
    mud: { x: -6.4, z: 0.9 },
    shadeW: { x: -10.3, z: -4.7 },
    shadeE: { x: -5.9, z: -5.75 },
    log: { x: -6.6, z: -3.55 },
    hay: { x: -6.75, z: 2.75 },
    front: { x: -9.0, z: 2.75 },
    grassW: { x: -9.6, z: -6.8 },
    middle: { x: -8.3, z: -5.4 }
  } as Record<string, P2>,
  /** The shore points, where they drink and spray. */
  shores: ["shoreS", "shoreE", "shoreN"]
};

// Monkeys: an island in a moat, three trees of different heights with branches,
// a platform on posts, ropes, and a feeding table near the front.
export const MONKEY = {
  island: { x: 0.4, z: -5.7, rx: 2.55, rz: 2.75 } as Oval,
  /** Island surface height (ground nodes stand on it). */
  groundY: 0.15,
  trees: [
    { x: -0.9, z: -6.6, trunk: 0.2, h: 3.4, canopyY: 3.95, canopy: 1.0 },
    { x: 2.0, z: -7.2, trunk: 0.18, h: 2.9, canopyY: 3.4, canopy: 0.85 },
    { x: -1.4, z: -4.4, trunk: 0.15, h: 2.5, canopyY: 2.95, canopy: 0.7 }
  ] as Tree[],
  /** Branch centre lines (from the trunk outwards). */
  branches: [
    { from: [-0.9, 2.4, -6.6], to: [0.45, 2.5, -6.6], r: 0.06 },
    { from: [2.0, 2.0, -7.2], to: [1.5, 2.1, -6.3], r: 0.055 },
    { from: [-1.4, 1.7, -4.4], to: [-0.4, 1.8, -4.5], r: 0.05 }
  ] as { from: V3; to: V3; r: number }[],
  /** Deck on four posts; a climbing pole at its front; two taller posts hold ropes. */
  platform: { x: 1.6, z: -5.15, w: 1.0, d: 0.8, top: 1.6, pole: { x: 1.6, z: -4.68 }, ropePosts: [{ x: 1.15, z: -5.5 }, { x: 1.15, z: -4.8 }], postTop: 2.25 },
  /** Feeding table: the bananas lie on it. */
  table: { x: 0.9, z: -4.0, w: 0.9, d: 0.6, top: 0.62 },
  /** Ropes the scene draws (sagging) and the monkeys swing or hang along. */
  ropes: [
    { a: [0.45, 2.5, -6.6], b: [1.15, 2.25, -5.5], sag: 0.35 },
    { a: [-0.4, 1.8, -4.5], b: [1.15, 2.25, -4.8], sag: 0.3 },
    { a: [-0.75, 2.41, -6.6], b: [1.85, 2.03, -6.93], sag: 0.25 }
  ] as { a: V3; b: V3; sag: number }[],
  /** A monkey hanging from a branch or rope holds on 0.7 m above its root. */
  hangDrop: 0.7
};

/** A point along a rope (t 0 at `a`, 1 at `b`): the scene draws ropes and the monkeys ride them with this one curve. */
export function ropePoint(rope: { a: V3; b: V3; sag: number }, t: number): V3 {
  const { a, b, sag } = rope;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
}

export type ClimbPose = "stand" | "hang";
export type ClimbMove = "walk" | "climb" | "branch" | "swing" | "brachiate" | "jump";
export interface ClimbNode {
  /** Root of the drawing (stand: on the surface; hang: hangDrop below the grip). */
  p: V3;
  pose: ClimbPose;
  /** Eating place beside the feeding table. */
  eat?: boolean;
}
export interface ClimbEdge {
  a: string;
  b: string;
  move: ClimbMove;
  /** Index into MONKEY.ropes for swing / brachiate. */
  rope?: number;
}

export const CLIMB_NODES: Record<string, ClimbNode> = {
  e1: { p: [0.25, 0.15, -3.55], pose: "stand", eat: true },
  e2: { p: [1.55, 0.15, -3.55], pose: "stand", eat: true },
  e3: { p: [-0.35, 0.15, -4.2], pose: "stand", eat: true },
  e4: { p: [2.15, 0.15, -4.15], pose: "stand", eat: true },
  g3: { p: [-0.2, 0.15, -5.7], pose: "stand" },
  p1base: { p: [1.6, 0.15, -4.5], pose: "stand" },
  p1: { p: [1.6, 1.6, -5.05], pose: "stand" },
  t1base: { p: [-0.9, 0.15, -6.25], pose: "stand" },
  t1top: { p: [-0.6, 2.48, -6.6], pose: "stand" },
  b1end: { p: [0.45, 1.8, -6.6], pose: "hang" },
  t2base: { p: [2.0, 0.15, -6.85], pose: "stand" },
  t2top: { p: [1.85, 2.09, -6.93], pose: "stand" },
  b2end: { p: [1.5, 1.4, -6.3], pose: "hang" },
  t3base: { p: [-1.35, 0.15, -4.05], pose: "stand" },
  t3top: { p: [-1.1, 1.78, -4.43], pose: "stand" },
  b3end: { p: [-0.4, 1.1, -4.5], pose: "hang" }
};

export const CLIMB_EDGES: ClimbEdge[] = [
  { a: "e1", b: "e2", move: "walk" },
  { a: "e1", b: "e3", move: "walk" },
  { a: "e2", b: "e4", move: "walk" },
  { a: "e3", b: "g3", move: "walk" },
  { a: "e4", b: "p1base", move: "walk" },
  { a: "e2", b: "p1base", move: "walk" },
  { a: "g3", b: "p1base", move: "walk" },
  { a: "g3", b: "t1base", move: "walk" },
  { a: "g3", b: "t2base", move: "walk" },
  { a: "e3", b: "t3base", move: "walk" },
  { a: "t1base", b: "t1top", move: "climb" },
  { a: "t2base", b: "t2top", move: "climb" },
  { a: "t3base", b: "t3top", move: "climb" },
  { a: "p1base", b: "p1", move: "climb" },
  { a: "t1top", b: "b1end", move: "branch" },
  { a: "t2top", b: "b2end", move: "branch" },
  { a: "t3top", b: "b3end", move: "branch" },
  { a: "b1end", b: "p1", move: "swing", rope: 0 },
  { a: "b3end", b: "p1", move: "swing", rope: 1 },
  { a: "t1top", b: "t2top", move: "brachiate", rope: 2 },
  { a: "b2end", b: "p1", move: "jump" }
];

// Pandas: a quiet garden. The child's bamboo grows in three clumps along the fences
// (there is no other bamboo: the level asks the child to draw it). A big shade tree,
// a boulder pile, a log, open lawn.
export const PANDA = {
  trees: [{ x: 9.9, z: -7.4, trunk: 0.25, h: 3.0, canopyY: 3.4, canopy: 1.6 }] as Tree[],
  rocks: [
    { x: 6.6, z: -7.85, rx: 0.95, rz: 0.6, h: 0.85 },
    { x: 8.3, z: -4.3, rx: 0.5, rz: 0.4, h: 0.4 },
    { x: 11.0, z: -3.3, rx: 0.55, rz: 0.45, h: 0.5 }
  ] as Rock[],
  logs: [{ x: 6.9, z: -5.4, len: 1.5, r: 0.2, axis: "x" }] as Log[],
  /** Bamboo stalk footprint (each bamboo anchor is an obstacle for the pandas). */
  bambooR: 0.15,
  poi: {
    eatA: { x: 5.2, z: -7.3 },
    eatB: { x: 8.0, z: -7.4 },
    eatC: { x: 10.35, z: -5.45 },
    rock: { x: 6.6, z: -6.75 },
    shade: { x: 9.6, z: -6.3 },
    log: { x: 6.9, z: -4.7 },
    lawn1: { x: 8.9, z: -5.7 },
    lawn2: { x: 5.5, z: -3.9 },
    lawn3: { x: 9.9, z: -3.5 },
    front: { x: 7.6, z: -3.35 }
  } as Record<string, P2>,
  /** Eating place in front of each bamboo clump, and the clump's bamboo anchor indices. */
  eats: { eatA: [0, 1], eatB: [2, 3], eatC: [4, 5] } as Record<string, number[]>
};

// Penguins: a big oval pool with ice land around it on the west and back, rocks,
// a diving rock, and gentle ice ramps. The pool is convex, so a straight swim
// between two points inside it never crosses its edge.
export const PENGUIN = {
  pool: { x: 9.4, z: 2.35, rx: 2.0, rz: 1.4 } as Oval,
  /** Water surface height; swimmers stay inside the pool shrunk by `swimInset`. */
  surfaceY: 0.04,
  swimInset: 0.4,
  /** Root height while swimming at the surface (the water hides the rest), and fully under. */
  swimY: -0.3,
  underY: -0.7,
  /** Ice floor height on land. */
  landY: 0.05,
  rocks: [
    { x: 5.95, z: 4.25, rx: 0.35, rz: 0.3, h: 0.35 },
    { x: 11.2, z: 4.3, rx: 0.4, rz: 0.3, h: 0.4 },
    { x: 7.6, z: 0.2, rx: 0.3, rz: 0.25, h: 0.3 }
  ] as Rock[],
  /** They dive from its top into `diveInto`. */
  diveRock: { x: 10.9, z: 0.55, rx: 0.45, rz: 0.35, h: 0.55 } as Rock,
  diveInto: { x: 10.55, z: 1.75 },
  /** Resting places on the ice. */
  rests: [
    { x: 6.1, z: 0.7 },
    { x: 6.5, z: 1.9 },
    { x: 6.0, z: 3.1 },
    { x: 8.45, z: 0.45 },
    { x: 10.0, z: 0.4 },
    { x: 7.0, z: 4.1 }
  ] as P2[],
  /** Ice ramps between land and water (used both ways). */
  ramps: [
    { land: { x: 6.85, z: 2.45 }, water: { x: 7.95, z: 2.45 } },
    { land: { x: 9.1, z: 0.45 }, water: { x: 9.1, z: 1.5 } },
    { land: { x: 8.75, z: 4.1 }, water: { x: 8.9, z: 3.2 } }
  ] as { land: P2; water: P2 }[]
};

// ---------------------------------------------------------------- slots
export interface ZooAnchor {
  p: V3;
  /** Yaw of the item (bananas lie at different angles). */
  yaw?: number;
  /** Models mode scale (the premade elephant is smaller than the drawn one). */
  s?: number;
  /** Monkeys: the climbing node the monkey starts on. */
  node?: string;
}

/**
 * Display places. More than the first zoo had (4 monkeys, 4 bananas, 6 bamboo,
 * 5 penguins): saves with fewer are filled with copies of the child's own
 * drawings when they load.
 */
export const ANCHORS: Record<ZooSlotId, ZooAnchor[]> = {
  elephants: [
    { p: [-7.6, 0, 1.9], s: 1.6 },
    { p: [-9.8, 0, 1.0], s: 1.6 }
  ],
  monkeys: [
    { p: CLIMB_NODES.b1end.p, node: "b1end" },
    { p: CLIMB_NODES.b3end.p, node: "b3end" },
    { p: CLIMB_NODES.p1.p, node: "p1" },
    { p: CLIMB_NODES.g3.p, node: "g3" }
  ],
  bananas: [
    { p: [0.65, 0.62, -3.88], yaw: 0 },
    { p: [0.88, 0.62, -4.12], yaw: 0.6 },
    { p: [1.1, 0.62, -3.88], yaw: 1.2 },
    { p: [1.2, 0.62, -4.14], yaw: 1.8 }
  ],
  pandas: [
    { p: [6.3, 0, -3.5], s: 1.2 },
    { p: [9.4, 0, -3.8], s: 1.2 }
  ],
  bamboo: [
    { p: [5.15, 0, -8.05] },
    { p: [5.45, 0, -8.3] },
    { p: [7.85, 0, -8.25] },
    { p: [8.2, 0, -8.05] },
    { p: [11.2, 0, -5.3] },
    { p: [11.0, 0, -5.7] }
  ],
  penguins: PENGUIN.rests.slice(0, 5).map((r) => ({ p: [r.x, PENGUIN.landY, r.z] as V3 }))
};

/** Click boxes: footprint and height (the waited-for slot wins where they overlap). */
export const HOTSPOTS: Record<ZooSlotId, Rect & { minY: number; maxY: number }> = {
  elephants: { ...HABITATS.elephants.rect, minY: 0, maxY: 2.2 },
  monkeys: { ...HABITATS.monkeys.rect, minY: 0, maxY: 4.2 },
  bananas: { minX: 0.2, maxX: 1.6, minZ: -4.45, maxZ: -3.4, minY: 0, maxY: 1.2 },
  pandas: { ...HABITATS.pandas.rect, minY: 0, maxY: 1.4 },
  bamboo: { ...HABITATS.pandas.rect, minY: 0, maxY: 1.8 },
  penguins: { ...HABITATS.penguins.rect, minY: 0, maxY: 1.0 }
};

/** Which habitat each slot belongs to. */
export const SLOT_PEN: Record<ZooSlotId, PenId> = { elephants: "elephants", monkeys: "monkeys", bananas: "monkeys", pandas: "pandas", bamboo: "pandas", penguins: "penguins" };

// ---------------------------------------------------------------- people
/** Mr. Oka greets the player at the plaza by the fountain path (facing the gate and the camera). */
export const PLAZA = { oka: { x: 0.0, z: 6.3 }, okaFacing: 1.0, player: { x: 1.6, z: 6.5 } };
/** Where Taro asks "What animal do you like?" (he comes in by the gate). */
export const FAVORITE = { player: { x: 1.6, z: 6.5 }, oka: { x: 0.0, z: 6.3 }, taro: { x: 2.6, z: 6.1 } };

/** Places people wander to when the zoo is alive: x, z, slot they look at. */
export const AMBIENT: [number, number, ZooSlotId | null][] = [
  [-9.6, 5.0, "elephants"],
  [-6.6, 5.1, "elephants"],
  [-3.9, -1.8, "elephants"],
  [-3.6, -5.4, "elephants"],
  [-1.2, -1.25, "monkeys"],
  [2.1, -1.3, "monkeys"],
  [6.3, -1.25, "pandas"],
  [9.8, -1.3, "pandas"],
  [7.2, 5.75, "penguins"],
  [4.5, 1.8, "penguins"],
  [-1.4, 2.5, null],
  [2.6, 2.5, null],
  [3.0, 6.7, null],
  [-3.6, 6.6, null]
];

// ---------------------------------------------------------------- cameras
export const VIEWS: Record<"overview" | "door" | "plaza" | PenId, Cam> = {
  overview: { pos: [0, 16.5, 20.5], look: [0, 0, -0.6] },
  door: { pos: [7.4, 3.4, 11.6], look: [10.6, 0.9, 6.4] },
  plaza: { pos: [1.0, 5.4, 12.8], look: [0.8, 0.6, 4.8] },
  elephants: HABITATS.elephants.view,
  monkeys: HABITATS.monkeys.view,
  pandas: HABITATS.pandas.view,
  penguins: HABITATS.penguins.view
};

/** Follow camera while the player walks freely: offsets from the player, look point kept over the zoo. */
export const FOLLOW = { up: 5.0, back: 7.0, lookUp: 0.8, lookAhead: 1.6, look: { minX: -9, maxX: 9, minZ: -5.5, maxZ: 6.0 } as Rect };

// ---------------------------------------------------------------- navigation
const benchRect = (b: { x: number; z: number; yaw: number }): Rect => {
  const along = Math.abs(Math.cos(b.yaw)) > 0.5;
  const hw = along ? 0.5 : 0.2;
  const hd = along ? 0.2 : 0.5;
  return { minX: b.x - hw, maxX: b.x + hw, minZ: b.z - hd, maxZ: b.z + hd };
};

/** Everything visitors cannot walk through. */
export function visitorRects(): Rect[] {
  return [...Object.values(HABITATS).map((h) => h.rect), ...Object.values(BEDS), ...BENCHES.map(benchRect)];
}
export function visitorOvals(): Oval[] {
  return [FOUNTAIN];
}

/** The animals' own floor in a habitat (monkeys use the climbing graph instead). */
export function habitatNav(id: Exclude<PenId, "monkeys">): NavMap {
  const h = HABITATS[id];
  if (id === "elephants") {
    const e = ELEPHANT;
    return new NavMap(h.roam, [e.hayRack], h.radius, [e.water, ...e.rocks, ...e.trees.map(trunkOval), ...e.logs.map(logOval)]);
  }
  if (id === "pandas") {
    const p = PANDA;
    const bamboo = ANCHORS.bamboo.map((a) => ({ x: a.p[0], z: a.p[2], rx: p.bambooR, rz: p.bambooR }));
    return new NavMap(h.roam, [], h.radius, [...p.rocks, ...p.trees.map(trunkOval), ...p.logs.map(logOval), ...bamboo]);
  }
  const g = PENGUIN;
  return new NavMap(h.roam, [], h.radius, [g.pool, g.diveRock, ...g.rocks]);
}
