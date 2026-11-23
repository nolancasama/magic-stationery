/**
 * Level 3: Mr. Oka's zoo, the same diorama shape as the shop and classroom:
 * four enclosures along the back (elephants, monkeys, pandas, penguins), a
 * path in front for visitors, and a gate in the right-hand fence (z 1.0-2.4).
 * Erased: empty enclosures with faint outlines of the missing animals.
 */
import * as THREE from "three";
import { WORD_KINDS } from "../../objects/registry.ts";
import type { WordId } from "../../recognition/vocab.ts";
import { ghostMaterial, worldBasicMaterial, worldMat } from "../materials.ts";
import { NavMap, type Rect } from "../nav.ts";
import { Parts, mix } from "../parts.ts";
import { signTexture } from "../signs.ts";
import type { Anchor, RoomArea, Slot, View } from "./room.ts";
import type { Roam } from "../../objects/living.ts";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const e = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z);

export const ROOM: Rect = { minX: -4.45, maxX: 4.45, minZ: -2.95, maxZ: 2.95 };
export const DOOR = { x: 4.25, z: 1.7, outsideX: 5.6 };
export const OKA_SPOT = { x: -3.3, z: 0.35 };
/** Front of the enclosures (the fence line). */
export const FENCE_Z = -0.45;

export type ZooSlotId = "elephants" | "monkeys" | "bananas" | "pandas" | "bamboo" | "penguins";

/** Each enclosure: x range, and where its animals may wander. */
export const PENS = {
  elephants: { minX: -4.4, maxX: -2.25, name: "ELEPHANTS", color: "#8d9db0" },
  monkeys: { minX: -2.2, maxX: -0.05, name: "MONKEYS", color: "#a1887f" },
  pandas: { minX: 0.0, maxX: 2.15, name: "PANDAS", color: "#66bb6a" },
  penguins: { minX: 2.2, maxX: 4.4, name: "PENGUINS", color: "#4fc3f7" }
} as const;
export type PenId = keyof typeof PENS;

export const ROAMS: Record<PenId, Roam> = {
  elephants: { minX: -4.3, maxX: -2.35, minZ: -2.2, maxZ: -0.75 },
  monkeys: { minX: -2.1, maxX: -0.15, minZ: -1.6, maxZ: -0.75 },
  pandas: { minX: 0.1, maxX: 2.05, minZ: -1.7, maxZ: -0.75 },
  penguins: { minX: 2.3, maxX: 4.3, minZ: -1.4, maxZ: -0.75 }
};
/** The penguins' pool (they dive here). */
export const POOL = { x: 3.3, z: -2.1, rx: 1.0, rz: 0.55 };
/** The elephants' pool. */
export const ELE_POOL = { x: -3.7, z: -2.35 };

const OBSTACLES: Rect[] = [
  { minX: -4.45, maxX: 4.45, minZ: -2.95, maxZ: -0.32 }, // the enclosures behind their fence
  { minX: -4.45, maxX: -3.75, minZ: 0.9, maxZ: 1.7 } // the feed cart
];

export const VIEWS: RoomArea["views"] = {
  overview: { pos: v(0.25, 6.9, 9.4), look: v(0.15, 1.0, -1.0) },
  door: { pos: v(1.6, 2.6, 4.6), look: v(3.6, 1.0, 1.4) },
  elephants: { pos: v(-2.6, 2.6, 2.4), look: v(-3.3, 0.8, -1.5) },
  monkeys: { pos: v(-0.6, 2.7, 2.4), look: v(-1.1, 1.2, -1.5) },
  pandas: { pos: v(1.4, 2.5, 2.4), look: v(1.05, 0.8, -1.5) },
  penguins: { pos: v(3.0, 2.6, 2.4), look: v(3.3, 0.6, -1.5) },
  path: { pos: v(0.4, 3.2, 4.9), look: v(0.0, 1.0, -0.6) }
};

export class ZooArea implements RoomArea {
  readonly scene = new THREE.Scene();
  readonly bounds = ROOM;
  readonly door = DOOR;
  readonly views = VIEWS;
  readonly hostSpot = { x: OKA_SPOT.x, z: OKA_SPOT.z, facing: 0.35 };
  readonly ambientSpots: [number, number, string | null][] = [
    [-3.3, 0.1, "elephants"],
    [-1.1, 0.1, "monkeys"],
    [1.05, 0.1, "pandas"],
    [3.3, 0.1, "penguins"],
    [0.0, 2.2, null],
    [2.4, 1.6, null]
  ];
  readonly nav: NavMap;
  readonly slots: Record<ZooSlotId, Slot>;
  readonly spots = {};
  readonly floor: THREE.Mesh;
  readonly solids: THREE.Object3D[] = [];
  private gate: THREE.Group;
  private sign: THREE.Mesh;
  private waterMat: THREE.MeshBasicMaterial;
  private flags: THREE.Group;

  constructor() {
    this.scene.background = new THREE.Color("#2a3f52");
    this.scene.add(new THREE.HemisphereLight("#fffbea", "#8fae7a", 2.0));
    const sun = new THREE.DirectionalLight("#ffffff", 1.8);
    sun.position.set(-3, 9, 6);
    this.scene.add(sun);
    this.nav = new NavMap(ROOM, OBSTACLES, 0.28);
    this.waterMat = worldBasicMaterial({ color: new THREE.Color("#7fd3f7") });
    this.floor = this.buildGround();
    this.buildPens();
    this.gate = this.buildGate();
    const { sign, flags } = this.buildDecor();
    this.sign = sign;
    this.flags = flags;
    this.slots = this.buildSlots();
  }

  private solid(m: THREE.Object3D) {
    this.scene.add(m);
    this.solids.push(m);
  }

  // ------------------------------------------------------------------ ground, pens
  private buildGround(): THREE.Mesh {
    const p = new Parts();
    p.box(9.4, 0.36, 6.4, "#5d4a3d", { p: [0, -0.18, 0] });
    p.box(9.0, 0.02, 6.0, "#8bc34a", { p: [0, 0.01, 0] });
    // The visitors' path.
    p.box(9.0, 0.025, 1.7, "#e8d3a6", { p: [0, 0.013, 1.25] });
    for (let i = 0; i < 18; i++) p.box(0.42, 0.028, 0.08, "#d9c08e", { p: [-4.2 + i * 0.5, 0.014, 0.55 + (i % 3) * 0.6] });
    // Back hedge.
    for (let i = 0; i < 12; i++) p.sphere(0.45, "#558b2f", { p: [-4.2 + i * 0.77, 0.4, -3.05], s: [1, 0.9, 0.6] }, 8, 6);
    const mesh = p.mesh(worldMat);
    this.scene.add(mesh);
    this.solids.push(mesh);
    return mesh;
  }

  private buildPens() {
    const p = new Parts();
    // Ground per pen.
    p.box(2.15, 0.03, 2.45, "#c9a46b", { p: [-3.32, 0.02, -1.72] }); // elephants: dry earth
    p.box(2.15, 0.03, 2.45, "#7cb342", { p: [-1.12, 0.021, -1.72] }); // monkeys: grass
    p.box(2.15, 0.03, 2.45, "#9ccc65", { p: [1.08, 0.022, -1.72] }); // pandas: grass
    p.box(2.2, 0.03, 2.45, "#e3f2fd", { p: [3.3, 0.023, -1.72] }); // penguins: snow
    // Fences: posts and two rails along the front, dividers between pens.
    for (let x = -4.4; x <= 4.41; x += 0.55) p.box(0.07, 0.6, 0.07, "#8d6e63", { p: [x, 0.3, FENCE_Z] });
    for (const y of [0.25, 0.52]) p.box(8.9, 0.05, 0.05, "#a1887f", { p: [0, y, FENCE_Z] });
    for (const x of [-2.22, -0.02, 2.18]) p.box(0.06, 0.55, 2.45, "#a1887f", { p: [x, 0.28, -1.72] });
    // Elephants: a pool and a rock.
    p.cyl(0.62, 0.62, 0.04, "#6d5a45", { p: [ELE_POOL.x, 0.03, ELE_POOL.z] }, 20);
    p.sphere(0.45, "#9e9e9e", { p: [-2.7, 0.2, -2.45], s: [1.3, 0.7, 1] }, 10, 8);
    // Monkeys: a tree with branches and a feeding stump.
    p.cyl(0.13, 0.18, 2.2, "#795548", { p: [-1.45, 1.1, -2.1] }, 10);
    p.cyl(0.05, 0.06, 0.9, "#795548", { p: [-1.05, 1.45, -2.0], r: [0, 0, -1.2] }, 6);
    p.cyl(0.05, 0.06, 0.8, "#795548", { p: [-1.8, 1.85, -2.0], r: [0, 0, 1.15] }, 6);
    for (const [x, y, z, s] of [[-1.45, 2.35, -2.1, 0.7], [-0.95, 2.1, -2.3, 0.5], [-1.95, 2.2, -2.25, 0.5]] as const) p.sphere(s, "#43a047", { p: [x, y, z] }, 10, 8);
    p.cyl(0.25, 0.28, 0.45, "#8d6e63", { p: [-0.55, 0.22, -1.25] }, 12);
    p.cyl(0.27, 0.27, 0.03, "#bcaaa4", { p: [-0.55, 0.46, -1.25] }, 12);
    // Pandas: a rock to sit by.
    p.sphere(0.4, "#8d8d8d", { p: [1.6, 0.18, -2.3], s: [1.4, 0.6, 1] }, 10, 8);
    // Penguins: ice floes around their pool.
    for (const [x, z, s] of [[2.55, -1.2, 0.5], [3.4, -1.05, 0.55], [4.05, -1.35, 0.42], [2.5, -2.55, 0.35]] as const) p.cyl(s, s * 1.05, 0.12, "#ffffff", { p: [x, 0.06, z], s: [1.3, 1, 0.8] }, 9);
    this.solid(p.mesh(worldMat));
    // Water (two pools).
    const ele = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), this.waterMat);
    ele.rotation.x = -Math.PI / 2;
    ele.position.set(ELE_POOL.x, 0.055, ELE_POOL.z);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 28), this.waterMat);
    pool.rotation.x = -Math.PI / 2;
    pool.scale.set(POOL.rx, POOL.rz, 1);
    pool.position.set(POOL.x, 0.045, POOL.z);
    this.scene.add(ele, pool);
    // Pen signs on the fence.
    for (const id of Object.keys(PENS) as PenId[]) {
      const pen = PENS[id];
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.24), worldBasicMaterial({ map: signTexture(pen.name, { bg: "#fff8e1", fg: "#5d4037", border: pen.color }), transparent: true }));
      s.position.set((pen.minX + pen.maxX) / 2, 0.75, FENCE_Z + 0.05);
      this.scene.add(s);
    }
  }

  private buildGate(): THREE.Group {
    const p = new Parts();
    // Right fence with the gate gap z 1.0-2.4 (same opening as the shop's door).
    for (let z = -2.9; z <= 0.95; z += 0.55) p.box(0.08, 0.9, 0.08, "#8d6e63", { p: [4.55, 0.45, z] });
    for (const y of [0.35, 0.8]) p.box(0.06, 0.06, 3.9, "#a1887f", { p: [4.55, y, -0.97] });
    p.box(0.08, 0.9, 0.5, "#a1887f", { p: [4.55, 0.45, 2.7] });
    // Gate pillars and an arch.
    for (const z of [0.95, 2.45]) p.box(0.26, 2.4, 0.26, "#8d6e63", { p: [4.6, 1.2, z] });
    p.box(0.3, 0.3, 1.86, "#a1887f", { p: [4.6, 2.5, 1.7] });
    this.solid(p.mesh(worldMat));
    const gate = new THREE.Group();
    gate.position.set(4.6, 0, 2.32);
    const g = new Parts();
    for (let i = 0; i < 6; i++) g.box(0.05, 1.0, 0.05, "#795548", { p: [0, 0.55, -0.12 - i * 0.24] });
    for (const y of [0.2, 0.95]) g.box(0.06, 0.06, 1.3, "#795548", { p: [0, y, -0.7] });
    gate.add(g.mesh(worldMat));
    this.scene.add(gate);
    return gate;
  }

  private buildDecor() {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.36), worldBasicMaterial({ map: signTexture("ZOO", { bg: "#66bb6a", fg: "#ffffff", w: 448, h: 108, border: "#ffffff" }), transparent: true }));
    sign.position.set(4.44, 2.5, 1.7);
    sign.rotation.y = -Math.PI / 2;
    this.scene.add(sign);
    // The keeper's feed cart.
    const c = new Parts();
    c.box(0.6, 0.45, 0.7, "#ef6c00", { p: [-4.1, 0.45, 1.3] });
    for (const z of [1.05, 1.55]) c.cyl(0.14, 0.14, 0.06, "#424242", { p: [-3.78, 0.16, z], r: [0, 0, Math.PI / 2] }, 10);
    c.box(0.5, 0.15, 0.6, "#ffcc80", { p: [-4.1, 0.73, 1.3] });
    // Benches and trees along the path.
    for (const x of [-1.0, 1.6]) {
      c.box(1.0, 0.06, 0.3, "#a1887f", { p: [x, 0.42, 2.55] });
      for (const dx of [-0.42, 0.42]) c.box(0.06, 0.4, 0.28, "#8d6e63", { p: [x + dx, 0.2, 2.55] });
    }
    this.scene.add(c.mesh(worldMat));
    // Bunting along the top of the hedge (sways when the zoo is alive).
    const flags = new THREE.Group();
    const f = new Parts();
    for (let i = 0; i < 16; i++) f.cone(0.09, 0.18, ["#ef5350", "#ffca28", "#42a5f5", "#66bb6a"][i % 4], { p: [-4.1 + i * 0.55, 1.05, -2.85], r: [Math.PI, 0, 0] }, 3);
    flags.add(f.mesh(worldMat));
    this.scene.add(flags);
    return { sign, flags };
  }

  // ------------------------------------------------------------------ slots
  private buildSlots(): Record<ZooSlotId, Slot> {
    const anchors: Record<ZooSlotId, Anchor[]> = {
      elephants: [v(-3.6, 0, -1.3), v(-2.8, 0, -1.7)].map((p) => ({ p, r: e() })),
      // Hanging under the two branches (below the leaves), and one on the ground.
      monkeys: [v(-0.72, 0.92, -1.9), v(-2.0, 1.2, -1.9), v(-1.45, 0.05, -1.1)].map((p) => ({ p, r: e() })),
      // On the feeding stump.
      bananas: [v(-0.65, 0.48, -1.2), v(-0.5, 0.48, -1.3), v(-0.45, 0.48, -1.12)].map((p, i) => ({ p, r: e(0, i * 0.6, 0) })),
      pandas: [v(0.55, 0, -1.3), v(1.55, 0, -1.6)].map((p) => ({ p, r: e() })),
      bamboo: [v(0.3, 0, -2.55), v(0.75, 0, -2.6), v(2.0, 0, -2.5)].map((p) => ({ p, r: e() })),
      penguins: [v(2.55, 0.12, -1.2), v(3.4, 0.12, -1.05), v(4.05, 0.12, -1.35)].map((p) => ({ p, r: e() }))
    };
    const pen = (id: PenId) => PENS[id];
    const make = (id: ZooSlotId, word: WordId, penId: PenId, view: View, hotY: [number, number]): Slot => {
      const a = anchors[id];
      const ghosts = a.map((an, i) => {
        const gh = WORD_KINDS[word].build(null, i);
        gh.root.position.copy(an.p);
        gh.root.rotation.copy(an.r);
        gh.root.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = ghostMaterial;
        });
        this.scene.add(gh.root);
        return gh.root;
      });
      const P = pen(penId);
      const lo = v(P.minX + 0.05, hotY[0], -2.9);
      const hi = v(P.maxX - 0.05, hotY[1], FENCE_Z + 0.1);
      const size = hi.clone().sub(lo);
      const hotspot = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
      hotspot.position.copy(lo).add(size.multiplyScalar(0.5));
      hotspot.userData.slot = id;
      this.scene.add(hotspot);
      const cx = (P.minX + P.maxX) / 2;
      return { id, word, anchors: a, ghosts, items: [], hotspot, marker: v(cx, hotY[1] + 0.35, -1.0), stand: { x: cx, z: 0.0 }, view };
    };
    return {
      elephants: make("elephants", "elephant", "elephants", VIEWS.elephants, [0, 1.6]),
      monkeys: make("monkeys", "monkey", "monkeys", VIEWS.monkeys, [0.6, 2.6]),
      bananas: make("bananas", "banana", "monkeys", VIEWS.monkeys, [0, 0.6]),
      pandas: make("pandas", "panda", "pandas", VIEWS.pandas, [0, 1.3]),
      bamboo: make("bamboo", "bamboo", "pandas", VIEWS.pandas, [0, 1.6]),
      penguins: make("penguins", "penguin", "penguins", VIEWS.penguins, [0, 1.2])
    };
  }

  get pickables(): THREE.Object3D[] {
    return Object.values(this.slots).map((s) => s.hotspot);
  }

  setLevel(level: number) {
    this.waterMat.color.set(mix("#c9d3dd", "#7fd3f7", level));
    (this.sign.material as THREE.MeshBasicMaterial).color.set(level >= 1 ? "#ffffff" : mix("#bbbbbb", "#ffffff", level));
    this.flags.visible = level > 0.3;
  }

  update(t: number) {
    if (this.flags.visible) this.flags.rotation.x = Math.sin(t * 1.4) * 0.02;
  }

  setDoor(open: number) {
    this.gate.rotation.y = -open * 1.3;
  }
}
