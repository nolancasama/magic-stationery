/**
 * Level 4: Mr. Green's supermarket, the same diorama shape as the shop: the
 * checkout on the left (Mr. Green behind it), a dairy fridge (milk, eggs) and
 * a bread shelf along the back wall, fruit and vegetable stands in front, and
 * the door in the right wall (z 1.0-2.4). Erased: empty crates and shelves with
 * faint outlines of the missing food.
 */
import * as THREE from "three";
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
export const GREEN_SPOT = { x: -3.3, z: -1.62 };
/** The clear aisle behind the checkout, beside the dairy fridge. */
export const GREEN_AISLE = { x: -1.98, z: -1.8 };
/** Where customers stand to pay (in front of the register). */
export const CHECKOUT = { x: -3.1, z: 0.05 };

export type MarketSlotId = "apples" | "oranges" | "tomatoes" | "carrots" | "milk" | "eggs";
export type CrateId = "apples" | "oranges" | "tomatoes" | "carrots";
type FloorPoint = { x: number; z: number };
type MarketSlot = Slot & { serve: FloorPoint & { facing: number } };

/** Crate centres along the two stands (fruit on the left, vegetables on the right). */
export const CRATES: Record<CrateId, number> = { apples: -0.8, oranges: 0.2, tomatoes: 1.6, carrots: 2.6 };
const STAND_Z = 0.4;
const TABLE_TOP = 0.74;
/** Crates lean back so the camera sees into them. */
const CRATE_TILT = 0.32;
/** Fridge shelf tops (milk above, eggs below). */
const MILK_Y = 1.3;
const EGG_Y = 0.66;
const FRIDGE_Z = -2.6;

const OBSTACLES: Rect[] = [
  { minX: -4.25, maxX: -1.85, minZ: -1.2, maxZ: -0.4 }, // checkout counter
  { minX: -1.5, maxX: 1.5, minZ: -2.95, maxZ: -2.25 }, // dairy fridge
  { minX: 1.85, maxX: 4.45, minZ: -2.95, maxZ: -2.4 }, // bread shelf
  { minX: -1.35, maxX: 0.75, minZ: -0.05, maxZ: 0.85 }, // fruit stand
  { minX: 1.05, maxX: 3.15, minZ: -0.05, maxZ: 0.85 }, // vegetable stand
  { minX: -4.45, maxX: -3.6, minZ: 2.1, maxZ: 2.95 } // basket stack
];

export const VIEWS: RoomArea["views"] = {
  overview: { pos: v(0.25, 6.7, 9.7), look: v(0.15, 1.2, -0.95) },
  door: { pos: v(1.6, 2.6, 4.6), look: v(3.6, 1.0, 1.4) },
  checkout: { pos: v(-1.3, 2.75, 3.05), look: v(-3.25, 1.15, -1.1) },
  fruit: { pos: v(-0.3, 2.5, 3.7), look: v(-0.3, 0.85, 0.35) },
  veg: { pos: v(2.1, 2.5, 3.7), look: v(2.1, 0.85, 0.35) },
  fridge: { pos: v(0.0, 2.3, 1.1), look: v(0.0, 1.0, -2.6) }
};

export class MarketArea implements RoomArea {
  readonly scene = new THREE.Scene();
  readonly bounds = ROOM;
  readonly door = DOOR;
  readonly views = VIEWS;
  readonly hostSpot = { x: GREEN_SPOT.x, z: GREEN_SPOT.z, facing: 0 };
  readonly ambientSpots: [number, number, string | null][] = [
    [-0.8, 1.35, "apples"],
    [0.2, 1.35, "oranges"],
    [1.6, 1.35, "tomatoes"],
    [2.6, 1.35, "carrots"],
    [-0.5, -1.75, "milk"],
    [0.6, -1.75, "eggs"],
    [3.0, -1.8, null],
    [0.9, 2.3, null]
  ];
  readonly nav: NavMap;
  readonly slots: Record<MarketSlotId, MarketSlot>;
  readonly spots = {};
  readonly floor: THREE.Mesh;
  readonly solids: THREE.Object3D[] = [];
  private doorLeaf: THREE.Group;
  private sign: THREE.Mesh;
  private fridgeGlow: THREE.MeshBasicMaterial;
  private bunting: THREE.Group;
  private level = 0;

  constructor() {
    this.scene.background = new THREE.Color("#263a33");
    this.scene.add(new THREE.HemisphereLight("#fffdf2", "#a7b89a", 1.9));
    const sun = new THREE.DirectionalLight("#ffffff", 1.9);
    sun.position.set(3, 9, 7);
    this.scene.add(sun);
    this.nav = new NavMap(ROOM, OBSTACLES, 0.28);
    this.floor = this.buildRoom();
    this.buildCheckout();
    this.fridgeGlow = this.buildFridge();
    this.buildBreadShelf();
    this.buildStands();
    this.doorLeaf = this.buildDoor();
    const { sign, bunting } = this.buildDecor();
    this.sign = sign;
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
    p.box(9.4, 0.36, 6.4, "#5d4e44", { p: [0, -0.18, 0] });
    // Shop-floor tiles.
    for (let i = 0; i < 18; i++)
      for (let j = 0; j < 12; j++) p.box(0.49, 0.02, 0.49, (i + j) % 2 ? "#eceff1" : "#cfd8dc", { p: [-4.25 + i * 0.5, 0.01, -2.75 + j * 0.5] });
    // Back wall: pale green with a white band.
    p.box(9.2, 3.5, 0.2, "#dcedc8", { p: [0, 1.75, -3.1] });
    p.box(9.2, 0.5, 0.01, "#f1f8e9", { p: [0, 2.65, -2.995] });
    p.box(9.2, 0.18, 0.06, "#689f38", { p: [0, 0.09, -2.98] });
    p.box(9.2, 0.14, 0.12, "#8bc34a", { p: [0, 3.43, -2.97] });
    // Left wall.
    p.box(0.2, 3.5, 6.2, "#e6f1d8", { p: [-4.6, 1.75, 0] });
    p.box(0.06, 0.18, 6.0, "#689f38", { p: [-4.48, 0.09, 0] });
    // Right wall, door gap from z 1.0 to 2.4.
    p.box(0.2, 3.5, 4.0, "#e6f1d8", { p: [4.6, 1.75, -1.0] });
    p.box(0.2, 3.5, 0.55, "#e6f1d8", { p: [4.6, 1.75, 2.72] });
    p.box(0.2, 1.0, 1.45, "#e6f1d8", { p: [4.6, 3.0, 1.7] });
    p.box(0.06, 0.18, 4.0, "#689f38", { p: [4.48, 0.09, -1.0] });
    // A welcome mat inside the door.
    p.rbox(1.0, 0.02, 1.3, 0.1, "#8d6e63", { p: [3.75, 0.03, 1.7] }, 2);
    const mesh = p.mesh(worldMat);
    this.scene.add(mesh);
    this.solids.push(mesh);
    return mesh;
  }

  private buildCheckout() {
    const p = new Parts();
    p.box(2.3, 0.9, 0.76, "#78909c", { p: [-3.05, 0.45, -0.8] });
    p.box(2.42, 0.06, 0.88, "#eceff1", { p: [-3.05, 0.93, -0.8] });
    // The conveyor belt.
    p.box(1.3, 0.03, 0.42, "#37474f", { p: [-2.55, 0.975, -0.8] });
    for (let i = 0; i < 9; i++) p.box(0.02, 0.031, 0.42, "#546e7a", { p: [-3.15 + i * 0.15, 0.976, -0.8] });
    // Register with a screen and a scanner glass.
    p.rbox(0.5, 0.2, 0.42, 0.04, "#455a64", { p: [-3.75, 1.06, -0.85] }, 2);
    p.rbox(0.36, 0.24, 0.05, 0.03, "#263238", { p: [-3.75, 1.3, -1.0], r: [-0.3, 0, 0] }, 2);
    p.box(0.28, 0.16, 0.01, "#a5d6a7", { p: [-3.75, 1.31, -0.97], r: [-0.3, 0, 0] });
    p.box(0.26, 0.01, 0.2, "#90caf9", { p: [-3.3, 0.965, -0.8] });
    // A "CHECKOUT" light on a pole.
    p.cyl(0.025, 0.025, 1.0, "#90a4ae", { p: [-2.05, 1.4, -1.1] }, 8);
    p.box(0.34, 0.2, 0.08, "#43a047", { p: [-2.05, 1.95, -1.1] });
    this.solid(p.mesh(worldMat));
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.14), worldBasicMaterial({ map: signTexture("CHECKOUT", { bg: "#43a047", fg: "#ffffff" }), transparent: true }));
    tag.position.set(-2.05, 1.95, -1.055);
    this.scene.add(tag);
  }

  /** The dairy fridge: an open-front cabinet with two shelves and a cold light. */
  private buildFridge(): THREE.MeshBasicMaterial {
    const p = new Parts();
    const w = 2.9;
    p.box(w, 0.42, 0.62, "#eceff1", { p: [0, 0.21, FRIDGE_Z] });
    p.box(w, 2.15, 0.06, "#b3e5fc", { p: [0, 1.08, -2.92] });
    for (const sx of [-1, 1]) p.box(0.08, 2.15, 0.66, "#eceff1", { p: [sx * (w / 2 + 0.02), 1.08, FRIDGE_Z] });
    p.box(w + 0.12, 0.3, 0.7, "#eceff1", { p: [0, 2.3, FRIDGE_Z] });
    // Shelves with blue price strips.
    for (const y of [EGG_Y, MILK_Y]) {
      p.box(w, 0.04, 0.56, "#cfd8dc", { p: [0, y - 0.02, FRIDGE_Z] });
      p.box(w, 0.07, 0.02, "#1e88e5", { p: [0, y - 0.04, FRIDGE_Z + 0.29] });
    }
    // An egg tray on the lower shelf.
    p.box(2.0, 0.05, 0.34, "#d7ccc8", { p: [0, EGG_Y + 0.025, FRIDGE_Z + 0.03] });
    this.solid(p.mesh(worldMat));
    const glow = worldBasicMaterial({ color: new THREE.Color("#ffffff") });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.1, 0.06), glow);
    strip.rotation.x = Math.PI / 2;
    strip.position.set(0, 2.14, FRIDGE_Z + 0.05);
    this.scene.add(strip);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.24), worldBasicMaterial({ map: signTexture("MILK & EGGS", { bg: "#1e88e5", fg: "#ffffff" }), transparent: true }));
    sign.position.set(0, 2.3, FRIDGE_Z + 0.36);
    this.scene.add(sign);
    return glow;
  }

  /** Bread, cereal and cans along the back wall (decor; brings colour back with the room). */
  private buildBreadShelf() {
    const p = new Parts();
    const x0 = 1.9;
    const x1 = 4.4;
    for (const sx of [x0, x1]) p.box(0.06, 2.0, 0.5, "#a1887f", { p: [sx, 1.0, -2.7] });
    for (const y of [0.3, 0.95, 1.6]) p.box(x1 - x0, 0.05, 0.5, "#bcaaa4", { p: [(x0 + x1) / 2, y, -2.7] });
    // Loaves.
    for (let i = 0; i < 5; i++) p.capsule(0.08, 0.16, "#d7a86e", { p: [2.15 + i * 0.47, 1.73, -2.7], r: [0, 0, Math.PI / 2] });
    // Cereal boxes.
    const boxes = ["#ef5350", "#ffca28", "#42a5f5", "#ab47bc", "#66bb6a"];
    for (let i = 0; i < 5; i++) p.box(0.3, 0.42, 0.12, boxes[i], { p: [2.15 + i * 0.47, 1.19, -2.72] });
    // Cans.
    for (let i = 0; i < 8; i++) p.cyl(0.07, 0.07, 0.16, ["#e53935", "#fdd835", "#43a047", "#1e88e5"][i % 4], { p: [2.05 + i * 0.29, 0.41, -2.7] }, 10);
    this.solid(p.mesh(worldMat));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.2), worldBasicMaterial({ map: signTexture("BREAD", { bg: "#fff8e1", fg: "#6d4c41", border: "#d7a86e" }), transparent: true }));
    sign.position.set((x0 + x1) / 2, 2.15, -2.9);
    this.scene.add(sign);
  }

  /** Two stands with tilted wooden crates (their food is the slots), and labels. */
  private buildStands() {
    const p = new Parts();
    for (const [x0, x1] of [[-1.3, 0.7], [1.1, 3.1]] as const) {
      const cx = (x0 + x1) / 2;
      p.box(x1 - x0, 0.06, 0.86, "#a1887f", { p: [cx, TABLE_TOP - 0.03, STAND_Z] });
      p.box(x1 - x0, 0.5, 0.04, "#8d6e63", { p: [cx, TABLE_TOP - 0.31, STAND_Z + 0.41] });
      for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [STAND_Z - 0.38, STAND_Z + 0.38]) p.box(0.07, TABLE_TOP - 0.06, 0.07, "#6d4c41", { p: [x, (TABLE_TOP - 0.06) / 2, z] });
    }
    this.solid(p.mesh(worldMat));
    const colours: Record<CrateId, string> = { apples: "#e53935", oranges: "#fb8c00", tomatoes: "#c62828", carrots: "#ef6c00" };
    for (const id of Object.keys(CRATES) as CrateId[]) {
      const crate = new Parts();
      // A crate built level around its centre, then leaned back as a whole.
      crate.box(0.86, 0.03, 0.6, "#bc8a5f", { p: [0, 0.015, 0] });
      for (const sz of [-1, 1]) crate.box(0.86, 0.14, 0.03, "#c69a6d", { p: [0, 0.07, sz * 0.3] });
      for (const sx of [-1, 1]) crate.box(0.03, 0.14, 0.6, "#c69a6d", { p: [sx * 0.43, 0.07, 0] });
      const mesh = crate.mesh(worldMat);
      mesh.position.set(CRATES[id], TABLE_TOP, STAND_Z);
      mesh.rotation.x = CRATE_TILT;
      this.solid(mesh);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.15), worldBasicMaterial({ map: signTexture(id.toUpperCase(), { bg: "#ffffff", fg: colours[id] }), transparent: true }));
      label.position.set(CRATES[id], TABLE_TOP - 0.16, STAND_Z + 0.435);
      this.scene.add(label);
    }
  }

  private buildDoor(): THREE.Group {
    const frame = new Parts();
    // The jamb wraps 2 cm past the wall's end (z 1.0): no coplanar faces to z-fight.
    frame.box(0.24, 2.5, 0.12, "#7cb342", { p: [4.6, 1.25, 0.96] });
    frame.box(0.24, 2.5, 0.1, "#7cb342", { p: [4.6, 1.25, 2.45] });
    frame.box(0.24, 0.12, 1.6, "#7cb342", { p: [4.6, 2.52, 1.7] });
    this.solid(frame.mesh(worldMat));
    const door = new THREE.Group();
    door.position.set(4.6, 0, 2.4);
    const d = new Parts();
    // A glass shop door.
    d.box(0.07, 2.4, 1.38, "#9e9e9e", { p: [0, 1.2, -0.7] });
    d.box(0.08, 2.0, 1.1, "#d6f0ff", { p: [0, 1.25, -0.7] });
    d.box(0.09, 0.05, 0.4, "#616161", { p: [-0.06, 1.1, -1.15] });
    door.add(d.mesh(worldMat));
    this.scene.add(door);
    return door;
  }

  private buildDecor() {
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 0.42),
      worldBasicMaterial({ map: signTexture("Green's Supermarket", { bg: "#43a047", fg: "#ffffff", w: 640, h: 104, border: "#ffffff" }), transparent: true })
    );
    sign.position.set(-3.0, 3.1, -2.9);
    this.scene.add(sign);
    // Wall lamps above the fridge and the bread shelf (clear of the sign; nothing hangs between the camera and the stands).
    const lamps = new Parts();
    const bulbs = new Parts();
    for (const x of [-1.0, 1.0, 3.1]) {
      lamps.box(0.06, 0.2, 0.06, "#7cb342", { p: [x, 2.85, -2.96] });
      lamps.cone(0.16, 0.18, "#dcedc8", { p: [x, 3.02, -2.82], r: [Math.PI, 0, 0] }, 12);
      bulbs.sphere(0.07, "#fff3c4", { p: [x, 2.92, -2.82] }, 10, 8);
    }
    this.scene.add(lamps.mesh(worldMat), bulbs.mesh(lampMat));
    // A stack of red shopping baskets by the window corner.
    const b = new Parts();
    for (let i = 0; i < 4; i++) {
      const y = 0.02 + i * 0.07;
      b.box(0.42, 0.16, 0.3, "#e53935", { p: [-4.0, y + 0.08, 2.5], r: [0, 0.05 * i, 0] });
    }
    b.torus(0.17, 0.012, "#c62828", { p: [-4.0, 0.42, 2.5] }, Math.PI, 5, 12);
    this.scene.add(b.mesh(worldMat));
    // Bunting along the back wall, right of the sign: it sways when the supermarket is alive.
    const bunting = new THREE.Group();
    const f = new Parts();
    for (let i = 0; i < 10; i++) f.cone(0.09, 0.18, ["#ef5350", "#ffca28", "#66bb6a", "#42a5f5"][i % 4], { p: [-1.3 + i * 0.57, 3.3, -2.9], r: [Math.PI, 0, 0] }, 3);
    bunting.add(f.mesh(worldMat));
    this.scene.add(bunting);
    return { sign, bunting };
  }

  // ------------------------------------------------------------------ slots
  private buildSlots(): Record<MarketSlotId, MarketSlot> {
    // Five in each leaning crate: three at the front (lower), two behind (higher).
    const crate = (id: CrateId): Anchor[] => {
      const cx = CRATES[id];
      const lean = (dz: number) => TABLE_TOP + 0.03 - dz * Math.sin(CRATE_TILT);
      return [
        { p: v(cx - 0.26, lean(0.14), STAND_Z + 0.14), r: e(0, 0.2, 0) },
        { p: v(cx, lean(0.16), STAND_Z + 0.16), r: e(0, -0.3, 0) },
        { p: v(cx + 0.26, lean(0.14), STAND_Z + 0.14), r: e(0, 0.4, 0) },
        { p: v(cx - 0.13, lean(-0.1), STAND_Z - 0.1), r: e(0, -0.5, 0) },
        { p: v(cx + 0.13, lean(-0.1), STAND_Z - 0.1), r: e(0, 0.6, 0) }
      ];
    };
    const milk: Anchor[] = [-1.05, -0.52, 0, 0.52, 1.05].map((x) => ({ p: v(x, MILK_Y, FRIDGE_Z + 0.04), r: e() }));
    const eggs: Anchor[] = [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75].map((x, i) => ({ p: v(x, EGG_Y + 0.05, FRIDGE_Z + 0.03 + (i % 2) * 0.06), r: e(0, i * 0.7, 0), s: 1.2 }));

    const make = (id: MarketSlotId, word: WordId, anchors: Anchor[], marker: THREE.Vector3, stand: FloorPoint, serve: FloorPoint, view: View, hot: [THREE.Vector3, THREE.Vector3]): MarketSlot => {
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
      return {
        id, word, anchors, ghosts, items: [], hotspot, marker, stand, view,
        serve: { ...serve, facing: Math.atan2(stand.x - serve.x, stand.z - serve.z) }
      };
    };
    const crateSlot = (id: CrateId, word: WordId, view: View) => {
      const cx = CRATES[id];
      return make(id, word, crate(id), v(cx, 1.55, STAND_Z), { x: cx, z: 1.4 }, { x: cx + 0.35, z: -0.7 }, view, [v(cx - 0.47, TABLE_TOP - 0.05, STAND_Z - 0.4), v(cx + 0.47, TABLE_TOP + 0.5, STAND_Z + 0.45)]);
    };
    // The fridge backs up to the wall, so Mr. Green serves from its left end.
    const dairyServe = GREEN_AISLE;
    return {
      apples: crateSlot("apples", "apple", VIEWS.fruit),
      oranges: crateSlot("oranges", "orange", VIEWS.fruit),
      tomatoes: crateSlot("tomatoes", "tomato", VIEWS.veg),
      carrots: crateSlot("carrots", "carrot", VIEWS.veg),
      milk: make("milk", "milk", milk, v(0, 2.0, -2.3), { x: -0.2, z: -1.75 }, dairyServe, VIEWS.fridge, [v(-1.42, MILK_Y - 0.02, -2.92), v(1.42, MILK_Y + 0.62, -2.28)]),
      eggs: make("eggs", "egg", eggs, v(0, EGG_Y + 0.4, -2.2), { x: 0.3, z: -1.75 }, dairyServe, VIEWS.fridge, [v(-1.42, EGG_Y - 0.02, -2.92), v(1.42, MILK_Y - 0.04, -2.28)])
    };
  }

  get pickables(): THREE.Object3D[] {
    return Object.values(this.slots).map((s) => s.hotspot);
  }

  /** 0..1 restoration: lamps, the fridge's cold light, the sign and the bunting follow it. */
  setLevel(level: number) {
    this.level = level;
    lampMat.emissiveIntensity = Math.max(0, (level - 0.2) * 1.2);
    this.fridgeGlow.color.set(mix("#9e9e9e", "#e1f5fe", level));
    (this.sign.material as THREE.MeshBasicMaterial).color.set(level >= 1 ? "#ffffff" : mix("#bbbbbb", "#ffffff", level));
    this.bunting.visible = level > 0.3;
  }

  update(t: number) {
    if (this.level > 0.3) this.bunting.rotation.x = Math.sin(t * 1.3) * 0.015;
  }

  /** Open or close the shop door (0 = shut, 1 = open). */
  setDoor(open: number) {
    this.doorLeaf.rotation.y = -open * 1.25;
  }
}
