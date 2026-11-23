/**
 * Level 1: Ms. Penny's stationery store, seen as a diorama (front wall cut
 * away, fixed camera framing the whole room). Everything here is "world": it
 * fades to grey while erased and regains colour as slots are restored.
 */
import * as THREE from "three";
import { WORD_KINDS } from "../../objects/registry.ts";
import type { WordId } from "../../recognition/vocab.ts";
import { ghostMaterial, lampMat, worldBasicMaterial, worldMat } from "../materials.ts";
import { NavMap, type Rect } from "../nav.ts";
import { Parts, mix, shade } from "../parts.ts";
import { signTexture } from "../signs.ts";
import type { Anchor, RoomArea, Slot as BaseSlot, View } from "./room.ts";

export type SlotId = "pencilCup" | "erasers" | "scissors" | "rulers" | "crayons" | "books" | "notebooks" | "schoolbags";

export type { Anchor, View };
/** A shop display slot. */
export type Slot = BaseSlot & { id: SlotId };

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const e = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z);

export const ROOM: Rect = { minX: -4.45, maxX: 4.45, minZ: -2.95, maxZ: 2.95 };
export const DOOR = { x: 4.25, z: 1.7, outsideX: 5.6 };
export const COUNTER_FRONT = { x: -2.75, z: 0.05 };
export const PENNY_SPOT = { x: -3.5, z: -1.58 };

const OBSTACLES: Rect[] = [
  { minX: -4.25, maxX: -1.85, minZ: -1.2, maxZ: -0.4 }, // counter
  { minX: -0.05, maxX: 3.45, minZ: -0.25, maxZ: 0.85 }, // display table
  { minX: -1.35, maxX: 1.55, minZ: -2.95, maxZ: -2.45 }, // book rack
  { minX: -4.45, maxX: -3.55, minZ: 1.9, maxZ: 2.95 } // plant corner
];

export const VIEWS: RoomArea["views"] = {
  overview: { pos: v(0.25, 6.7, 9.7), look: v(0.15, 1.3, -0.95) },
  counter: { pos: v(-1.3, 2.75, 3.05), look: v(-3.25, 1.15, -1.1) },
  door: { pos: v(1.6, 2.6, 4.6), look: v(3.6, 1.0, 1.4) },
  center: { pos: v(0.6, 3.2, 4.4), look: v(0.2, 0.9, -0.6) }
};

export class StoreArea implements RoomArea {
  readonly scene = new THREE.Scene();
  readonly bounds = ROOM;
  readonly door = DOOR;
  readonly views = VIEWS;
  readonly hostSpot = { x: PENNY_SPOT.x, z: PENNY_SPOT.z, facing: 0 };
  readonly ambientSpots: [number, number, string | null][] = [
    [0.1, -1.8, "books"],
    [3.1, -1.8, "schoolbags"],
    [0.9, 1.45, "crayons"],
    [2.5, 1.45, "notebooks"],
    [-2.0, 0.45, null],
    [1.8, 2.3, null]
  ];
  readonly nav: NavMap;
  readonly slots: Record<SlotId, Slot>;
  readonly spots = {};
  readonly floor: THREE.Mesh;
  readonly doorLeaf: THREE.Group;
  private sign: THREE.Mesh;
  private plantBloom: THREE.Group;
  private windowGlass: THREE.Mesh;
  private windowMat: THREE.MeshBasicMaterial;
  private level = 0;
  /** Walls and furniture (for camera line-of-sight checks). */
  readonly solids: THREE.Object3D[] = [];

  constructor() {
    this.scene.background = new THREE.Color("#2d2645");
    this.scene.add(new THREE.HemisphereLight("#fff8ec", "#b89a86", 1.9));
    const sun = new THREE.DirectionalLight("#ffffff", 1.9);
    sun.position.set(3, 9, 7);
    this.scene.add(sun);
    this.nav = new NavMap(ROOM, OBSTACLES, 0.28);
    this.floor = this.buildRoom();
    this.buildCounter();
    this.buildPegboard();
    this.buildBookRack();
    this.buildBagWall();
    this.buildTable();
    this.doorLeaf = this.buildDoor();
    const { sign, bloom, glass, glassMat } = this.buildDecor();
    this.sign = sign;
    this.plantBloom = bloom;
    this.windowGlass = glass;
    this.windowMat = glassMat;
    this.slots = this.buildSlots();
  }

  // ------------------------------------------------------------------ room
  private buildRoom(): THREE.Mesh {
    const p = new Parts();
    // Diorama base with a visible cut edge.
    p.box(9.4, 0.36, 6.4, "#6b4a3a", { p: [0, -0.18, 0] });
    for (let i = 0; i < 12; i++) {
      const z = -3 + 0.25 + i * 0.5;
      const c = i % 2 === 0 ? "#dba26b" : "#d29a62";
      p.box(9.0, 0.02, 0.47, c, { p: [0, 0.01, z] });
      for (let j = 0; j < 3; j++) p.box(0.02, 0.022, 0.47, "#b98252", { p: [-4.5 + ((i * 1.7 + j * 3.1) % 9), 0.011, z] });
    }
    // Back wall with wallpaper stripes, skirting and a cornice.
    p.box(9.2, 3.5, 0.2, "#f8e6c8", { p: [0, 1.75, -3.1] });
    for (let i = 0; i < 19; i++) p.box(0.16, 3.2, 0.01, "#f3d7ad", { p: [-4.5 + i * 0.5, 1.8, -2.995] });
    p.box(9.2, 0.18, 0.06, "#a8714a", { p: [0, 0.09, -2.98] });
    p.box(9.2, 0.14, 0.12, "#c98f62", { p: [0, 3.43, -2.97] });
    // Left wall with a window opening.
    p.box(0.2, 3.5, 6.2, "#f1dcbd", { p: [-4.6, 1.75, 0] });
    p.box(0.06, 0.18, 6.0, "#a8714a", { p: [-4.48, 0.09, 0] });
    // Right wall, door gap from z 1.0 to 2.4.
    p.box(0.2, 3.5, 4.0, "#f1dcbd", { p: [4.6, 1.75, -1.0] });
    p.box(0.2, 3.5, 0.55, "#f1dcbd", { p: [4.6, 1.75, 2.72] });
    p.box(0.2, 1.0, 1.45, "#f1dcbd", { p: [4.6, 3.0, 1.7] });
    p.box(0.06, 0.18, 4.0, "#a8714a", { p: [4.48, 0.09, -1.0] });
    // Rug.
    p.rbox(3.2, 0.02, 1.7, 0.2, "#7e57c2", { p: [0.6, 0.03, 1.95] }, 2);
    p.rbox(2.9, 0.025, 1.4, 0.16, "#b39ddb", { p: [0.6, 0.032, 1.95] }, 2);
    for (let i = 0; i < 5; i++) p.box(0.2, 0.027, 1.2, i % 2 ? "#9575cd" : "#d1c4e9", { p: [-0.4 + i * 0.5, 0.034, 1.95] });
    const mesh = p.mesh(worldMat);
    this.scene.add(mesh);
    this.solids.push(mesh);
    return mesh;
  }

  private solid(m: THREE.Object3D) {
    this.scene.add(m);
    this.solids.push(m);
  }

  private buildCounter() {
    const p = new Parts();
    p.box(2.3, 0.92, 0.76, "#9c6644", { p: [-3.05, 0.46, -0.8] });
    p.box(2.42, 0.07, 0.88, "#d9a066", { p: [-3.05, 0.945, -0.8] });
    p.box(2.3, 0.16, 0.02, "#f48fb1", { p: [-3.05, 0.62, -0.41] });
    for (let i = 0; i < 4; i++) p.sphere(0.05, "#fff59d", { p: [-3.95 + i * 0.6, 0.62, -0.4], s: [1, 1, 0.3] }, 8, 6);
    // Cash register.
    p.rbox(0.5, 0.18, 0.4, 0.04, "#78909c", { p: [-3.8, 1.07, -0.85] }, 2);
    p.rbox(0.42, 0.16, 0.06, 0.03, "#90a4ae", { p: [-3.8, 1.22, -0.98], r: [-0.4, 0, 0] }, 2);
    p.box(0.3, 0.08, 0.01, "#a5d6a7", { p: [-3.8, 1.235, -0.945], r: [-0.4, 0, 0] });
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) p.box(0.06, 0.02, 0.05, ["#ef5350", "#fff176", "#64b5f6"][j], { p: [-3.92 + i * 0.12, 1.17, -0.8 + j * 0.07] });
    // Pencil cup and ruler bin (their contents are slots).
    p.cyl(0.13, 0.12, 0.22, "#5c8fd6", { p: [-2.95, 1.09, -0.8] }, 16);
    p.cyl(0.132, 0.132, 0.04, "#ffffff", { p: [-2.95, 1.12, -0.8] }, 16);
    p.cyl(0.115, 0.115, 0.005, "#33456b", { p: [-2.95, 1.2, -0.8] }, 16);
    p.box(0.28, 0.24, 0.02, "#81c784", { p: [-2.28, 1.1, -0.72] });
    p.box(0.28, 0.24, 0.02, "#66bb6a", { p: [-2.28, 1.1, -0.88] });
    p.box(0.02, 0.24, 0.16, "#66bb6a", { p: [-2.42, 1.1, -0.8] });
    p.box(0.02, 0.24, 0.16, "#66bb6a", { p: [-2.14, 1.1, -0.8] });
    this.solid(p.mesh(worldMat));
  }

  private buildPegboard() {
    const p = new Parts();
    p.box(2.7, 1.5, 0.05, "#e7cfa8", { p: [-3.0, 2.05, -2.97] });
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 6; j++) p.cyl(0.018, 0.018, 0.01, "#b8956a", { p: [-4.2 + i * 0.22, 1.45 + j * 0.24, -2.94], r: [Math.PI / 2, 0, 0] }, 6);
    p.box(2.4, 0.05, 0.32, "#a1887f", { p: [-3.0, 1.72, -2.8] });
    p.box(2.4, 0.08, 0.02, "#8d6e63", { p: [-3.0, 1.77, -2.645] });
    for (const x of [-3.5, -2.5]) {
      p.cyl(0.012, 0.012, 0.14, "#9e9e9e", { p: [x, 2.5, -2.88], r: [Math.PI / 2, 0, 0] }, 6);
      p.sphere(0.02, "#9e9e9e", { p: [x, 2.5, -2.81] }, 6, 4);
    }
    this.solid(p.mesh(worldMat));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.24), worldBasicMaterial({ map: signTexture("ERASERS · SCISSORS", { bg: "#fff3d6", fg: "#6d4c41" }), transparent: true }));
    label.position.set(-3.0, 2.95, -2.93);
    this.scene.add(label);
  }

  private buildBookRack() {
    const p = new Parts();
    p.box(2.9, 2.2, 0.08, "#8d6e63", { p: [0.1, 1.1, -2.9] });
    for (const sx of [-1, 1]) p.box(0.08, 2.2, 0.5, "#795548", { p: [0.1 + sx * 1.41, 1.1, -2.7] });
    for (const [y, z] of [[0.8, -2.52], [1.55, -2.62]] as const) {
      p.box(2.8, 0.05, 0.4, "#a1887f", { p: [0.1, y, z - 0.1] });
      p.box(2.8, 0.1, 0.03, "#6d4c41", { p: [0.1, y + 0.05, z + 0.1] });
    }
    p.box(2.9, 0.06, 0.5, "#6d4c41", { p: [0.1, 2.2, -2.7] });
    p.box(2.8, 0.3, 0.45, "#8d6e63", { p: [0.1, 0.2, -2.7] });
    this.solid(p.mesh(worldMat));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.24), worldBasicMaterial({ map: signTexture("BOOKS", { bg: "#fff3d6", fg: "#6d4c41" }), transparent: true }));
    label.position.set(0.1, 2.45, -2.85);
    this.scene.add(label);
    // Wall clock (a Level 2 teaser): face + hands.
    const c = new Parts();
    c.cyl(0.26, 0.26, 0.06, "#ffffff", { p: [0.1, 2.95, -2.97], r: [Math.PI / 2, 0, 0] }, 24);
    c.torus(0.26, 0.03, "#ff8a65", { p: [0.1, 2.95, -2.94] }, Math.PI * 2, 6, 24);
    c.box(0.025, 0.16, 0.01, "#37474f", { p: [0.1, 3.0, -2.93] });
    c.box(0.12, 0.022, 0.01, "#37474f", { p: [0.15, 2.95, -2.93] });
    this.scene.add(c.mesh(worldMat));
  }

  private buildBagWall() {
    const p = new Parts();
    p.box(2.5, 0.12, 0.08, "#8d6e63", { p: [3.1, 2.1, -2.94] });
    for (const x of [2.35, 3.1, 3.85]) {
      p.cyl(0.015, 0.015, 0.16, "#9e9e9e", { p: [x, 2.05, -2.86], r: [Math.PI / 2, 0, 0] }, 6);
      p.sphere(0.024, "#9e9e9e", { p: [x, 2.06, -2.78] }, 6, 4);
    }
    // A small bench below the bags.
    p.box(2.4, 0.08, 0.5, "#a1887f", { p: [3.1, 0.45, -2.7] });
    for (const x of [2.0, 4.2]) p.box(0.08, 0.45, 0.45, "#8d6e63", { p: [x, 0.225, -2.7] });
    this.solid(p.mesh(worldMat));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.24), worldBasicMaterial({ map: signTexture("SCHOOLBAGS", { bg: "#fff3d6", fg: "#6d4c41" }), transparent: true }));
    label.position.set(3.1, 2.75, -2.93);
    this.scene.add(label);
  }

  private buildTable() {
    const p = new Parts();
    p.box(3.5, 0.07, 1.1, "#c58b5a", { p: [1.7, 0.72, 0.3] });
    for (const x of [0.1, 3.3]) for (const z of [-0.15, 0.75]) p.box(0.09, 0.7, 0.09, "#9c6644", { p: [x, 0.35, z] });
    // Crayon box: a slanted open box (crayons are a slot).
    p.box(0.62, 0.05, 0.22, "#fbc02d", { p: [0.9, 0.78, 0.3] });
    p.box(0.62, 0.2, 0.03, "#fdd835", { p: [0.9, 0.86, 0.42] });
    p.box(0.62, 0.36, 0.03, "#f9a825", { p: [0.9, 0.94, 0.18] });
    for (const sx of [-1, 1]) p.box(0.03, 0.26, 0.24, "#f9a825", { p: [0.9 + sx * 0.31, 0.88, 0.3] });
    p.box(0.5, 0.1, 0.005, "#e53935", { p: [0.9, 0.88, 0.437] });
    // Notebook stand: a slanted board.
    p.box(1.3, 0.04, 0.5, "#90a4ae", { p: [2.5, 0.95, 0.3], r: [-0.95, 0, 0] });
    p.box(1.3, 0.06, 0.04, "#78909c", { p: [2.5, 0.78, 0.5] });
    this.solid(p.mesh(worldMat));
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.15), worldBasicMaterial({ map: signTexture("CRAYONS", { bg: "#ffffff", fg: "#e53935" }), transparent: true }));
    label.position.set(0.9, 0.9, 0.44);
    this.scene.add(label);
    const nb = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.17), worldBasicMaterial({ map: signTexture("NOTEBOOKS", { bg: "#fff3d6", fg: "#455a64" }), transparent: true }));
    nb.position.set(2.5, 0.76, 0.525);
    this.scene.add(nb);
  }

  private buildDoor(): THREE.Group {
    const frame = new Parts();
    frame.box(0.24, 2.5, 0.1, "#8d6e63", { p: [4.6, 1.25, 0.95] });
    frame.box(0.24, 2.5, 0.1, "#8d6e63", { p: [4.6, 1.25, 2.45] });
    frame.box(0.24, 0.12, 1.6, "#8d6e63", { p: [4.6, 2.52, 1.7] });
    frame.sphere(0.07, "#f4c542", { p: [4.44, 2.36, 1.7] }, 10, 8);
    frame.cone(0.09, 0.12, "#f4c542", { p: [4.44, 2.3, 1.7] }, 10);
    this.solid(frame.mesh(worldMat));
    const door = new THREE.Group();
    door.position.set(4.6, 0, 2.4);
    const d = new Parts();
    d.box(0.07, 2.4, 1.38, "#a1663f", { p: [0, 1.2, -0.7] });
    d.box(0.08, 1.0, 0.9, "#bfe6ff", { p: [0, 1.6, -0.7] });
    d.box(0.09, 0.05, 0.9, "#8d5a3b", { p: [0, 1.6, -0.7] });
    d.sphere(0.05, "#f4c542", { p: [-0.07, 1.1, -1.25] }, 8, 6);
    door.add(d.mesh(worldMat));
    this.scene.add(door);
    return door;
  }

  private buildDecor() {
    // Window on the left wall.
    const w = new Parts();
    w.box(0.12, 1.5, 1.9, "#8d6e63", { p: [-4.5, 1.75, 0.9] });
    const glassMat = worldBasicMaterial({ color: new THREE.Color("#cfe9ff") });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.3), glassMat);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(-4.43, 1.75, 0.9);
    w.box(0.13, 0.06, 1.8, "#8d6e63", { p: [-4.44, 1.75, 0.9] });
    w.box(0.13, 1.4, 0.06, "#8d6e63", { p: [-4.44, 1.75, 0.9] });
    w.box(0.3, 0.06, 2.0, "#a1887f", { p: [-4.38, 0.98, 0.9] });
    this.scene.add(w.mesh(worldMat), glass);
    // Wall lamps.
    const lamps = new Parts();
    const bulbs = new Parts();
    for (const x of [-1.6, 1.85]) {
      lamps.box(0.06, 0.2, 0.06, "#8d6e63", { p: [x, 2.85, -2.96] });
      lamps.cone(0.16, 0.18, "#ffe0b2", { p: [x, 3.02, -2.82], r: [Math.PI, 0, 0] }, 12);
      bulbs.sphere(0.07, "#fff3c4", { p: [x, 2.92, -2.82] }, 10, 8);
    }
    this.scene.add(lamps.mesh(worldMat), bulbs.mesh(lampMat));
    // Shop sign.
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.42),
      worldBasicMaterial({ map: signTexture("Penny's Stationery", { bg: "#ff8fb1", fg: "#ffffff", w: 640, h: 104, border: "#ffffff" }), transparent: true })
    );
    sign.position.set(-3.0, 3.22, -2.9);
    this.scene.add(sign);
    // Potted plant in the corner; flowers bloom as the shop comes back.
    const pot = new Parts();
    pot.cyl(0.3, 0.24, 0.5, "#d47e5a", { p: [-4.0, 0.25, 2.45] }, 14);
    pot.cyl(0.31, 0.31, 0.06, "#c0694a", { p: [-4.0, 0.5, 2.45] }, 14);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      pot.sphere(0.2, "#4caf50", { p: [-4.0 + Math.cos(a) * 0.18, 0.78 + (i % 3) * 0.1, 2.45 + Math.sin(a) * 0.16], s: [1, 1.3, 1] }, 8, 6);
    }
    pot.sphere(0.22, "#66bb6a", { p: [-4.0, 1.05, 2.45] }, 8, 6);
    this.scene.add(pot.mesh(worldMat));
    const bloom = new THREE.Group();
    const f = new Parts();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const cx = Math.cos(a) * 0.24;
      const cz = Math.sin(a) * 0.22;
      const cy = 0.95 + (i % 2) * 0.18;
      const c = ["#ff80ab", "#ffd54f", "#ff8a65"][i % 3];
      for (let k = 0; k < 5; k++) {
        const b = (k / 5) * Math.PI * 2;
        f.sphere(0.045, c, { p: [cx + Math.cos(b) * 0.05, cy + Math.sin(b) * 0.05, cz + 0.08] }, 6, 4);
      }
      f.sphere(0.035, "#fff59d", { p: [cx, cy, cz + 0.1] }, 6, 4);
    }
    bloom.add(f.mesh(worldMat));
    bloom.position.set(-4.0, 0, 2.45);
    bloom.scale.setScalar(0.01);
    this.scene.add(bloom);
    // A poster on the left wall.
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), worldBasicMaterial({ map: posterTexture(), transparent: true }));
    poster.rotation.y = Math.PI / 2;
    poster.position.set(-4.48, 1.9, -1.7);
    this.scene.add(poster);
    return { sign, bloom, glass, glassMat };
  }

  // ------------------------------------------------------------------ slots
  private buildSlots(): Record<SlotId, Slot> {
    const pencil: Anchor[] = [
      { p: v(-2.99, 1.0, -0.79), r: e(0.04, 0.3, 0.13), s: 1.2 },
      { p: v(-2.9, 1.0, -0.77), r: e(-0.05, 1.2, -0.11), s: 1.2 },
      { p: v(-2.95, 1.0, -0.85), r: e(0.12, 2.1, 0.02), s: 1.2 }
    ];
    const rulers: Anchor[] = [-0.075, 0, 0.075].map((dx, i) => ({ p: v(-2.28 + dx, 1.0, -0.8), r: e(0, Math.PI / 2, (i - 1) * 0.08), s: 1.15 }));
    const erasers: Anchor[] = [-3.7, -3.0, -2.3].map((x, i) => ({ p: v(x, 1.745, -2.79), r: e(0, (i - 1) * 0.25, 0), s: 1.55 }));
    const scissors: Anchor[] = [-3.5, -2.5].map((x) => ({ p: v(x, 2.03, -2.84), r: e(0, 0, 0), s: 1.3 }));
    const books: Anchor[] = [];
    for (const [y, z] of [[0.825, -2.55], [1.575, -2.66]] as const) for (const x of [-0.8, 0.1, 1.0]) books.push({ p: v(x, y, z), r: e(-0.16, 0, 0) });
    const bags: Anchor[] = [2.35, 3.1, 3.85].map((x) => ({ p: v(x, 1.56, -2.8), r: e(0, 0, 0) }));
    const crayons: Anchor[] = [0, 1, 2, 3, 4, 5].map((i) => ({ p: v(0.9 - 0.225 + i * 0.09, 0.8, 0.3), r: e(-0.18, 0, 0), s: 1.1 }));
    const notebooks: Anchor[] = [2.08, 2.5, 2.92].map((x) => ({ p: v(x, 0.84, 0.46), r: e(Math.PI / 2 - 0.95, 0, 0) }));

    const make = (id: SlotId, word: WordId, anchors: Anchor[], marker: THREE.Vector3, stand: { x: number; z: number }, view: View, hot: [THREE.Vector3, THREE.Vector3]): Slot => {
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
      pencilCup: make("pencilCup", "pencil", pencil, v(-2.95, 1.75, -0.8), { x: -2.8, z: 0.15 }, { pos: v(-1.85, 2.3, 1.85), look: v(-2.95, 1.2, -0.8) }, [v(-3.15, 0.95, -1.0), v(-2.75, 1.5, -0.6)]),
      rulers: make("rulers", "ruler", rulers, v(-2.28, 1.95, -0.8), { x: -2.4, z: 0.15 }, { pos: v(-1.3, 2.4, 1.9), look: v(-2.35, 1.25, -0.8) }, [v(-2.45, 0.95, -1.0), v(-2.1, 1.65, -0.6)]),
      erasers: make("erasers", "eraser", erasers, v(-3.0, 2.1, -2.75), { x: -3.1, z: 0.15 }, { pos: v(-2.4, 2.6, 0.6), look: v(-3.0, 1.85, -2.8) }, [v(-3.95, 1.7, -2.95), v(-2.05, 1.95, -2.6)]),
      scissors: make("scissors", "scissors", scissors, v(-3.0, 2.85, -2.75), { x: -3.4, z: 0.15 }, { pos: v(-2.5, 2.8, 0.8), look: v(-3.0, 2.25, -2.8) }, [v(-3.75, 2.05, -2.95), v(-2.25, 2.6, -2.65)]),
      books: make("books", "book", books, v(0.1, 2.15, -2.5), { x: 0.1, z: -1.75 }, { pos: v(0.4, 2.3, 1.2), look: v(0.1, 1.25, -2.6) }, [v(-1.3, 0.75, -2.9), v(1.5, 2.1, -2.4)]),
      schoolbags: make("schoolbags", "schoolbag", bags, v(3.1, 2.45, -2.7), { x: 3.1, z: -1.75 }, { pos: v(2.6, 2.4, 1.0), look: v(3.1, 1.6, -2.8) }, [v(1.95, 1.4, -2.95), v(4.25, 2.15, -2.6)]),
      crayons: make("crayons", "crayon", crayons, v(0.9, 1.45, 0.3), { x: 0.9, z: 1.35 }, { pos: v(1.4, 2.0, 2.6), look: v(0.95, 0.9, 0.3) }, [v(0.55, 0.75, 0.1), v(1.25, 1.15, 0.5)]),
      notebooks: make("notebooks", "notebook", notebooks, v(2.5, 1.5, 0.3), { x: 2.5, z: 1.35 }, { pos: v(2.9, 2.0, 2.6), look: v(2.5, 0.95, 0.35) }, [v(1.8, 0.75, 0.0), v(3.2, 1.2, 0.6)])
    };
  }

  get pickables(): THREE.Object3D[] {
    return Object.values(this.slots).map((s) => s.hotspot);
  }

  /** 0..1 restoration: lamps, window, flowers and the sign follow it. */
  setLevel(level: number) {
    this.level = level;
    lampMat.emissiveIntensity = Math.max(0, (level - 0.2) * 1.2);
    this.windowMat.color.set(mix("#c9d3dd", "#bfe8ff", level));
    const bloom = Math.max(0.01, Math.min(1, (level - 0.35) * 2.2));
    this.plantBloom.scale.set(bloom, 0.6 + bloom * 0.4, bloom);
    (this.sign.material as THREE.MeshBasicMaterial).color.set(level >= 1 ? "#ffffff" : mix("#bbbbbb", "#ffffff", level));
  }

  get restoreLevel(): number {
    return this.level;
  }

  update(t: number) {
    this.windowGlass.visible = true;
    if (this.level > 0.35) this.plantBloom.rotation.z = Math.sin(t * 1.3) * 0.01;
  }

  /** Open or close the shop door (0 = shut, 1 = open). */
  setDoor(open: number) {
    this.doorLeaf.rotation.y = -open * 1.25;
  }
}

function posterTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 320;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#fff8e1";
  g.fillRect(0, 0, 256, 320);
  g.strokeStyle = "#ffb74d";
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 310);
  const items: [string, number, number][] = [["#ffca28", 60, 90], ["#ef5350", 150, 70], ["#42a5f5", 200, 150], ["#66bb6a", 80, 200], ["#ab47bc", 170, 240]];
  for (const [col, x, y] of items) {
    g.save();
    g.translate(x, y);
    g.rotate((x + y) * 0.01);
    g.fillStyle = col;
    g.fillRect(-12, -45, 24, 80);
    g.fillStyle = "#f3d2a2";
    g.beginPath();
    g.moveTo(-12, -45);
    g.lineTo(12, -45);
    g.lineTo(0, -68);
    g.fill();
    g.restore();
  }
  g.fillStyle = "#6d4c41";
  g.font = 'bold 30px "Arial Rounded MT Bold", Arial, sans-serif';
  g.textAlign = "center";
  g.fillText("DRAW!", 128, 300);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export const shadeColor = shade;
