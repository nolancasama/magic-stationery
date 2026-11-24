/**
 * Level 5: Coach Kato's school gym on sports-festival day, the same diorama
 * shape as the other rooms: a wooden court with lines, two backboards on the
 * back wall (their hoops are a display), a soccer goal at the left wall, a ball
 * cart, a ball rack, a racket wall and a bat bucket, and the door in the right
 * wall (z 1.0-2.4). Erased: empty displays with faint outlines.
 */
import * as THREE from "three";
import { buildGoalNet } from "../../objects/gym.ts";
import { WORD_KINDS } from "../../objects/registry.ts";
import type { WordId } from "../../recognition/vocab.ts";
import { ghostMaterial, lampMat, worldBasicMaterial, worldMat } from "../materials.ts";
import { NavMap, type Rect } from "../nav.ts";
import { Parts, mix } from "../parts.ts";
import { signTexture } from "../signs.ts";
import type { Anchor, RoomArea, Slot, View } from "./room.ts";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const e = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z);

export const ROOM: Rect = { minX: -4.45, maxX: 4.45, minZ: -2.95, maxZ: 2.95 };
export const DOOR = { x: 4.25, z: 1.7, outsideX: 5.6 };
export const KATO_SPOT = { x: -1.8, z: -1.5 };
/** The soccer goal's mouth (balls are kicked into it) at the left wall. */
export const GOAL = { x: -3.95, z: 0.6 };
/** The hoops' rings (balls drop through them). */
export const RINGS = [v(-2.4, 2.6, -2.55), v(2.4, 2.6, -2.55)];

export type GymSlotId = "soccerBalls" | "basketballs" | "hoops" | "rackets" | "bats";

const OBSTACLES: Rect[] = [
  { minX: -3.45, maxX: -2.35, minZ: 1.95, maxZ: 2.65 }, // ball cart
  { minX: 2.95, maxX: 4.45, minZ: -2.95, maxZ: -2.35 }, // ball rack
  { minX: 0.6, maxX: 1.25, minZ: -2.95, maxZ: -2.3 }, // bat bucket
  { minX: 1.4, maxX: 3.3, minZ: 2.45, maxZ: 2.95 }, // bench
  { minX: -4.45, maxX: -3.9, minZ: -0.4, maxZ: 1.6 } // the goal
];

export const VIEWS: RoomArea["views"] = {
  overview: { pos: v(0.25, 6.7, 9.7), look: v(0.15, 1.2, -0.95) },
  door: { pos: v(1.6, 2.6, 2.9), look: v(4.5, 0.65, 1.65) },
  cart: { pos: v(-2.15, 3.15, 4.0), look: v(-2.9, 0.5, 2.3) },
  goal: { pos: v(-0.6, 2.4, 3.6), look: v(-3.4, 0.6, 0.6) },
  hoops: { pos: v(0.0, 2.3, 3.4), look: v(0.0, 2.3, -2.6) },
  rack: { pos: v(2.5, 2.1, 0.8), look: v(3.6, 0.8, -2.6) },
  wall: { pos: v(0.1, 2.0, 0.9), look: v(0.0, 1.0, -2.7) },
  court: { pos: v(0.2, 3.1, 4.8), look: v(0.0, 0.8, -0.2) }
};

export class GymArea implements RoomArea {
  readonly scene = new THREE.Scene();
  readonly bounds = ROOM;
  readonly door = DOOR;
  readonly views = VIEWS;
  readonly hostSpot = { x: KATO_SPOT.x, z: KATO_SPOT.z, facing: 0.3 };
  readonly ambientSpots: [number, number, string | null][] = [
    [-2.9, 1.5, "soccerBalls"],
    [3.4, -1.8, "basketballs"],
    [-2.4, -1.4, "hoops"],
    [-0.4, -1.8, "rackets"],
    [0.9, -1.8, "bats"],
    [0.5, 0.6, null],
    [2.2, 1.9, null]
  ];
  readonly nav: NavMap;
  readonly slots: Record<GymSlotId, Slot>;
  readonly spots = {};
  readonly floor: THREE.Mesh;
  readonly solids: THREE.Object3D[] = [];
  private doorLeaf: THREE.Group;
  private banner: THREE.Mesh;
  private bunting: THREE.Group;
  private level = 0;

  constructor() {
    this.scene.background = new THREE.Color("#2b2f45");
    this.scene.add(new THREE.HemisphereLight("#fffaf0", "#b39a7c", 1.9));
    const sun = new THREE.DirectionalLight("#ffffff", 1.9);
    sun.position.set(3, 9, 7);
    this.scene.add(sun);
    this.nav = new NavMap(ROOM, OBSTACLES, 0.28);
    this.floor = this.buildRoom();
    this.buildBackboards();
    this.buildEquipment();
    this.doorLeaf = this.buildDoor();
    const { banner, bunting } = this.buildDecor();
    this.banner = banner;
    this.bunting = bunting;
    this.slots = this.buildSlots();
  }

  private solid(m: THREE.Object3D) {
    this.scene.add(m);
    this.solids.push(m);
  }

  // ------------------------------------------------------------------ room
  private buildRoom(): THREE.Mesh {
    const p = new Parts();
    p.box(9.4, 0.36, 6.4, "#5d4a3d", { p: [0, -0.18, 0] });
    // Gym floor boards.
    for (let i = 0; i < 24; i++) p.box(0.37, 0.02, 6.0, i % 2 ? "#e4b97c" : "#ddb072", { p: [-4.32 + i * 0.375, 0.01, 0] });
    // Court lines: the boundary, the centre line and the centre circle.
    const line = "#fafafa";
    p.box(8.0, 0.022, 0.05, line, { p: [0, 0.012, -2.2] });
    p.box(8.0, 0.022, 0.05, line, { p: [0, 0.012, 2.2] });
    for (const x of [-4.0, 4.0]) p.box(0.05, 0.022, 4.4, line, { p: [x, 0.012, 0] });
    p.box(0.05, 0.022, 4.4, line, { p: [0, 0.012, 0] });
    p.torus(0.9, 0.025, line, { p: [0, 0.013, 0], r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 4, 40);
    p.torus(0.9, 0.02, "#ef6c00", { p: [-2.4, 0.013, -2.2], r: [Math.PI / 2, 0, 0] }, Math.PI, 4, 24);
    p.torus(0.9, 0.02, "#ef6c00", { p: [2.4, 0.013, -2.2], r: [Math.PI / 2, 0, 0] }, Math.PI, 4, 24);
    // Back wall: wood panels below, cream above.
    p.box(9.2, 3.5, 0.2, "#f3e5c8", { p: [0, 1.75, -3.1] });
    p.box(9.2, 1.1, 0.02, "#c9a27a", { p: [0, 0.55, -2.995] });
    p.box(9.2, 0.18, 0.06, "#8d6e63", { p: [0, 0.09, -2.98] });
    p.box(9.2, 0.14, 0.12, "#a1887f", { p: [0, 3.43, -2.97] });
    // Left wall with high windows.
    p.box(0.2, 3.5, 6.2, "#efe2c4", { p: [-4.6, 1.75, 0] });
    p.box(0.02, 1.1, 6.0, "#c9a27a", { p: [-4.49, 0.55, 0] });
    for (const z of [-1.9, -0.4, 1.1]) p.box(0.04, 0.7, 1.1, "#bfe6ff", { p: [-4.49, 2.75, z] });
    // Right wall, door gap from z 1.0 to 2.4.
    p.box(0.2, 3.5, 4.0, "#efe2c4", { p: [4.6, 1.75, -1.0] });
    p.box(0.2, 3.5, 0.55, "#efe2c4", { p: [4.6, 1.75, 2.72] });
    p.box(0.2, 1.0, 1.45, "#efe2c4", { p: [4.6, 3.0, 1.7] });
    p.box(0.02, 1.1, 4.0, "#c9a27a", { p: [4.49, 0.55, -1.0] });
    const mesh = p.mesh(worldMat);
    this.scene.add(mesh);
    this.solids.push(mesh);
    return mesh;
  }

  /** Two backboards on the back wall; their rings and nets are the "hoops" display. */
  private buildBackboards() {
    const p = new Parts();
    for (const ring of RINGS) {
      p.box(0.08, 0.5, 0.3, "#90a4ae", { p: [ring.x, 2.9, -2.8] });
      p.box(1.2, 0.8, 0.05, "#fafafa", { p: [ring.x, 2.95, -2.62] });
      // Red edge all round the board.
      for (const y of [3.33, 2.57]) p.box(1.2, 0.04, 0.052, "#e53935", { p: [ring.x, y, -2.6] });
      for (const sx of [-1, 1]) p.box(0.04, 0.8, 0.052, "#e53935", { p: [ring.x + sx * 0.58, 2.95, -2.6] });
      // The small target square.
      p.box(0.4, 0.03, 0.054, "#e53935", { p: [ring.x, 2.94, -2.6] });
      p.box(0.4, 0.03, 0.054, "#e53935", { p: [ring.x, 2.68, -2.6] });
      for (const sx of [-1, 1]) p.box(0.03, 0.29, 0.054, "#e53935", { p: [ring.x + sx * 0.2, 2.81, -2.6] });
    }
    this.solid(p.mesh(worldMat));
  }

  /** The cart, rack, racket wall and bat bucket (their contents are slots); the goal; a bench. */
  private buildEquipment() {
    const p = new Parts();
    // Ball cart: a wire basket on wheels.
    p.box(1.0, 0.04, 0.6, "#90a4ae", { p: [-2.9, 0.3, 2.3] });
    for (const sx of [-1, 1]) p.box(0.03, 0.5, 0.6, "#b0bec5", { p: [-2.9 + sx * 0.5, 0.55, 2.3] });
    for (const sz of [-1, 1]) p.box(1.0, 0.5, 0.02, "#b0bec5", { p: [-2.9, 0.55, 2.3 + sz * 0.3] });
    // Wire bars on the long walls only: no dividers inside, the balls share one basket.
    for (let i = 1; i < 6; i++) for (const sz of [-1, 1]) p.box(0.012, 0.5, 0.012, "#cfd8dc", { p: [-3.4 + i * 0.167, 0.55, 2.3 + sz * 0.31] });
    for (const [x, z] of [[-3.3, 2.05], [-2.5, 2.05], [-3.3, 2.55], [-2.5, 2.55]]) p.cyl(0.07, 0.07, 0.05, "#424242", { p: [x, 0.08, z], r: [Math.PI / 2, 0, 0] }, 10);
    for (const [x, z] of [[-3.3, 2.05], [-2.5, 2.05], [-3.3, 2.55], [-2.5, 2.55]]) p.box(0.03, 0.25, 0.03, "#90a4ae", { p: [x, 0.2, z] });
    // Ball rack: two shelves against the back wall.
    for (const x of [3.0, 4.35]) p.box(0.06, 1.3, 0.55, "#78909c", { p: [x, 0.65, -2.65] });
    for (const y of [0.42, 0.92]) p.box(1.4, 0.04, 0.55, "#90a4ae", { p: [3.67, y, -2.65] });
    // Racket wall: a board with pegs.
    p.box(1.2, 0.9, 0.04, "#a1887f", { p: [-0.4, 1.45, -2.97] });
    for (const x of [-0.75, -0.4, -0.05]) p.cyl(0.015, 0.015, 0.1, "#5d4037", { p: [x, 1.7, -2.92], r: [Math.PI / 2, 0, 0] }, 6);
    // Bat bucket.
    p.cyl(0.26, 0.22, 0.45, "#1e88e5", { p: [0.92, 0.225, -2.62] }, 16);
    p.cyl(0.27, 0.27, 0.04, "#1565c0", { p: [0.92, 0.45, -2.62] }, 16);
    // A long bench at the front.
    p.box(1.9, 0.06, 0.35, "#a1887f", { p: [2.35, 0.42, 2.7] });
    for (const x of [1.5, 3.2]) p.box(0.06, 0.4, 0.3, "#8d6e63", { p: [x, 0.2, 2.7] });
    this.solid(p.mesh(worldMat));
    const goal = buildGoalNet();
    goal.position.set(GOAL.x, 0, GOAL.z);
    this.scene.add(goal);
    const labels: [string, string, THREE.Vector3, number][] = [
      ["BALLS", "#43a047", v(-2.9, 0.62, 2.62), 0],
      ["RACKETS", "#1e88e5", v(-0.4, 1.95, -2.94), 0],
      ["BATS", "#1e88e5", v(0.92, 0.25, -2.36), 0]
    ];
    for (const [text, color, at] of labels) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.14), worldBasicMaterial({ map: signTexture(text, { bg: "#ffffff", fg: color }), transparent: true }));
      s.position.copy(at);
      this.scene.add(s);
    }
  }

  private buildDoor(): THREE.Group {
    const frame = new Parts();
    // The jamb wraps 2 cm past the wall's end (z 1.0): no coplanar faces to z-fight.
    frame.box(0.24, 2.5, 0.12, "#8d6e63", { p: [4.6, 1.25, 0.96] });
    frame.box(0.24, 2.5, 0.1, "#8d6e63", { p: [4.6, 1.25, 2.45] });
    frame.box(0.24, 0.12, 1.6, "#8d6e63", { p: [4.6, 2.52, 1.7] });
    this.solid(frame.mesh(worldMat));
    const door = new THREE.Group();
    door.position.set(4.6, 0, 2.4);
    const d = new Parts();
    d.box(0.07, 2.4, 1.38, "#90a4ae", { p: [0, 1.2, -0.7] });
    d.box(0.08, 0.6, 0.5, "#d6f0ff", { p: [0, 1.7, -0.7] });
    d.box(0.09, 0.05, 0.5, "#546e7a", { p: [-0.06, 1.05, -1.1] });
    door.add(d.mesh(worldMat));
    this.scene.add(door);
    return door;
  }

  private buildDecor() {
    // Scoreboard.
    const p = new Parts();
    p.box(1.3, 0.55, 0.06, "#263238", { p: [0, 2.85, -2.95] });
    for (const x of [-0.35, 0.35]) p.box(0.36, 0.32, 0.01, "#ffb300", { p: [x, 2.82, -2.915] });
    p.box(0.06, 0.06, 0.01, "#ffb300", { p: [0, 2.88, -2.915] });
    p.box(0.06, 0.06, 0.01, "#ffb300", { p: [0, 2.76, -2.915] });
    // Wall lamps.
    const bulbs = new Parts();
    for (const x of [-1.2, 1.2]) {
      p.box(0.06, 0.2, 0.06, "#8d6e63", { p: [x, 2.85, -2.96] });
      p.cone(0.16, 0.18, "#ffe0b2", { p: [x, 3.02, -2.82], r: [Math.PI, 0, 0] }, 12);
      bulbs.sphere(0.07, "#fff3c4", { p: [x, 2.92, -2.82] }, 10, 8);
    }
    this.scene.add(p.mesh(worldMat), bulbs.mesh(lampMat));
    // The festival banner over the scoreboard.
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.34),
      worldBasicMaterial({ map: signTexture("SPORTS FESTIVAL", { bg: "#ff7043", fg: "#ffffff", w: 640, h: 96, border: "#ffffff" }), transparent: true })
    );
    banner.position.set(0, 3.28, -2.9);
    this.scene.add(banner);
    // Bunting along the left wall: it sways when the gym is alive.
    const bunting = new THREE.Group();
    const f = new Parts();
    for (let i = 0; i < 10; i++) f.cone(0.09, 0.18, ["#ef5350", "#ffca28", "#66bb6a", "#42a5f5"][i % 4], { p: [-4.4, 3.3, -2.6 + i * 0.55], r: [Math.PI, 0, 0] }, 3);
    bunting.add(f.mesh(worldMat));
    this.scene.add(bunting);
    return { banner, bunting };
  }

  // ------------------------------------------------------------------ slots
  private buildSlots(): Record<GymSlotId, Slot> {
    // Three balls rest on the basket floor, with two nestled above them.
    const balls: Anchor[] = [
      { p: v(-3.22, 0.325, 2.3), r: e(), s: 0.85 },
      { p: v(-2.9, 0.325, 2.32), r: e(0, 0.5, 0), s: 0.85 },
      { p: v(-2.58, 0.325, 2.28), r: e(0, -0.4, 0), s: 0.85 },
      { p: v(-3.06, 0.55, 2.36), r: e(0, 0.9, 0), s: 0.85 },
      { p: v(-2.74, 0.55, 2.32), r: e(0, -0.8, 0), s: 0.85 }
    ];
    const basketballs: Anchor[] = [
      { p: v(3.3, 0.44, -2.6), r: e() },
      { p: v(3.9, 0.44, -2.6), r: e(0, 0.6, 0) },
      { p: v(3.3, 0.94, -2.6), r: e(0, -0.5, 0) },
      { p: v(3.9, 0.94, -2.6), r: e(0, 0.3, 0) }
    ];
    // Ring and net below each backboard (the drawing's bottom is the bottom of the net).
    const hoops: Anchor[] = RINGS.map((r) => ({ p: v(r.x, r.y - 0.48, r.z), r: e() }));
    const rackets: Anchor[] = [-0.75, -0.4, -0.05].map((x, i) => ({ p: v(x, 1.08, -2.9), r: e(0, 0, (i - 1) * 0.08) }));
    const bats: Anchor[] = [
      { p: v(0.84, 0.3, -2.62), r: e(0, 0, 0.12) },
      { p: v(0.94, 0.3, -2.56), r: e(0, 0, -0.05) },
      { p: v(1.02, 0.3, -2.66), r: e(0, 0, -0.16) }
    ];
    const make = (id: GymSlotId, word: WordId, anchors: Anchor[], marker: THREE.Vector3, stand: { x: number; z: number }, view: View, hot: [THREE.Vector3, THREE.Vector3]): Slot => {
      const ghosts = anchors.map((a, i) => {
        const g = WORD_KINDS[word].build(null, i);
        g.root.position.copy(a.p);
        g.root.rotation.copy(a.r);
        g.root.scale.setScalar(a.s ?? 1);
        g.root.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = ghostMaterial;
        });
        this.scene.add(g.root);
        return g.root;
      });
      const size = hot[1].clone().sub(hot[0]);
      const hotspot = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
      hotspot.position.copy(hot[0]).add(size.multiplyScalar(0.5));
      hotspot.userData.slot = id;
      this.scene.add(hotspot);
      return { id, word, anchors, ghosts, items: [], hotspot, marker, stand, view };
    };
    return {
      soccerBalls: make("soccerBalls", "soccerBall", balls, v(-2.9, 1.35, 2.3), { x: -2.9, z: 1.55 }, VIEWS.cart, [v(-3.45, 0.2, 1.95), v(-2.35, 1.05, 2.65)]),
      basketballs: make("basketballs", "basketball", basketballs, v(3.6, 1.75, -2.6), { x: 3.5, z: -1.8 }, VIEWS.rack, [v(2.95, 0.3, -2.95), v(4.4, 1.4, -2.3)]),
      hoops: make("hoops", "hoop", hoops, v(-2.4, 1.85, -2.4), { x: -2.4, z: -1.5 }, VIEWS.hoops, [v(-3.05, 2.0, -2.95), v(-1.75, 3.4, -2.3)]),
      rackets: make("rackets", "racket", rackets, v(-0.4, 2.25, -2.7), { x: -0.4, z: -1.75 }, VIEWS.wall, [v(-1.0, 0.95, -2.95), v(0.2, 1.9, -2.55)]),
      bats: make("bats", "bat", bats, v(0.92, 1.45, -2.5), { x: 0.92, z: -1.7 }, VIEWS.wall, [v(0.6, 0.05, -2.95), v(1.25, 1.15, -2.3)])
    };
  }

  get pickables(): THREE.Object3D[] {
    return Object.values(this.slots).map((s) => s.hotspot);
  }

  /** 0..1 restoration: lamps, the banner and the bunting follow it. */
  setLevel(level: number) {
    this.level = level;
    lampMat.emissiveIntensity = Math.max(0, (level - 0.2) * 1.2);
    (this.banner.material as THREE.MeshBasicMaterial).color.set(level >= 1 ? "#ffffff" : mix("#bbbbbb", "#ffffff", level));
    this.bunting.visible = level > 0.3;
  }

  update(t: number) {
    if (this.level > 0.3) this.bunting.rotation.z = Math.sin(t * 1.3) * 0.012;
  }

  /** Open or close the gym door (0 = shut, 1 = open). */
  setDoor(open: number) {
    this.doorLeaf.rotation.y = -open * 1.25;
  }
}
