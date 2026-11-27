import * as THREE from "three";
import { WORD_KINDS } from "../../objects/registry.ts";
import type { WordId } from "../../recognition/vocab.ts";
import { ghostMaterial, worldBasicMaterial, worldFoliageMaterial, worldMat, worldWaterMaterial } from "../materials.ts";
import { NavMap, type Oval, type Rect } from "../nav.ts";
import { Parts, type Col } from "../parts.ts";
import { signTexture } from "../signs.ts";
import type { RoomArea, Slot, View } from "./room.ts";
import {
  AMBIENT, ANCHORS, BACK_PATH, BEDS, BENCHES, CROSS_EW, CROSS_NS, DOOR, EAST_PATH, ELEPHANT, ELEPHANT_DECK,
  FOLLOW, FOUNTAIN, GATE_GAP, GROUND, HABITATS, HOTSPOTS, MONKEY, PANDA, PENGUIN, PLAZA, PROMENADE,
  ROOM, SLOT_PEN, VIEWS as LAYOUT_VIEWS, WEST_PATH, ropePoint, visitorOvals, visitorRects,
  type Habitat, type Log, type P2, type Rock, type Tree, type V3, type ZooSlotId
} from "./zooLayout.ts";

export type { PenId, ZooSlotId } from "./zooLayout.ts";
export const VIEWS = Object.fromEntries(Object.entries(LAYOUT_VIEWS).map(([id, view]) => [id, {
  pos: new THREE.Vector3(...view.pos), look: new THREE.Vector3(...view.look)
}])) as Record<keyof typeof LAYOUT_VIEWS, View>;

const WORDS: Record<ZooSlotId, WordId> = {
  elephants: "elephant", monkeys: "monkey", bananas: "banana", pandas: "panda", bamboo: "bamboo", penguins: "penguin"
};
const paths = [PROMENADE, ELEPHANT_DECK, WEST_PATH, BACK_PATH, EAST_PATH, CROSS_NS, CROSS_EW];
const wood = "#895c49";
const rail = "#b18467";
const leaf = ["#558947", "#71a74f", "#89b85d"];
const flowers = ["#e5838d", "#f4cd70", "#b7a0dd", "#fff1ca"];
const width = (rect: Rect) => rect.maxX - rect.minX;
const depth = (rect: Rect) => rect.maxZ - rect.minZ;
const mid = (first: number, last: number) => (first + last) / 2;
const inset = (oval: Oval, amount: number): Oval => ({ ...oval, rx: oval.rx - amount, rz: oval.rz - amount });

function slab(parts: Parts, rect: Rect, top: number, thickness: number, color: Col, bevel = 0) {
  const at = { p: [mid(rect.minX, rect.maxX), top - thickness / 2, mid(rect.minZ, rect.maxZ)] as V3 };
  if (bevel) parts.rbox(width(rect), thickness, depth(rect), bevel, color, at, 1);
  else parts.box(width(rect), thickness, depth(rect), color, at);
}

function disc(parts: Parts, oval: Oval, y: number, color: Col) {
  parts.add(new THREE.CircleGeometry(1, 48), color, { p: [oval.x, y, oval.z], r: [-Math.PI / 2, 0, 0], s: [oval.rx, oval.rz, 1] });
}

function ovalSlab(parts: Parts, oval: Oval, top: number, thickness: number, color: Col, taper = 1) {
  parts.cyl(1, taper, thickness, color, { p: [oval.x, top - thickness / 2, oval.z], s: [oval.rx, 1, oval.rz] }, 48);
}

function ellipseHole(shape: THREE.Shape, oval: Oval) {
  const hole = new THREE.Path();
  hole.absellipse(oval.x, -oval.z, oval.rx, oval.rz, 0, Math.PI * 2, true);
  shape.holes.push(hole);
}

function beam(parts: Parts, from: V3, to: V3, radius: number, color: Col, segments = 8) {
  const direction = new THREE.Vector3(...to).sub(new THREE.Vector3(...from));
  const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
  parts.cyl(radius, radius, direction.length(), color, {
    p: [mid(from[0], to[0]), mid(from[1], to[1]), mid(from[2], to[2])], r: [rotation.x, rotation.y, rotation.z]
  }, segments);
}

function tree(parts: Parts, leaves: Parts, spec: Tree, base: number, flatness: number) {
  const { x, z, trunk, h, canopyY, canopy } = spec;
  parts.cyl(trunk * 0.72, trunk, h, wood, { p: [x, base + h / 2, z] }, 9);
  leaves.sphere(canopy, leaf[0], { p: [x, canopyY, z], s: [0.77, flatness, 0.65] }, 10, 6);
  for (let index = 0; index < 5; index++) {
    const angle = index * Math.PI * 2 / 5;
    leaves.sphere(canopy * 0.48, leaf[(index % 2) + 1], {
      p: [x + Math.cos(angle) * canopy * 0.49, canopyY + (index % 2) * 0.1, z + Math.sin(angle) * canopy * 0.4],
      s: [1, flatness * 1.25, 0.91]
    }, 9, 5);
  }
}

function rock(parts: Parts, feature: Rock, base = 0, color: Col = "#92897f") {
  const geometry = new THREE.DodecahedronGeometry(1);
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox!;
  const half = feature.h / (max.y - min.y);
  parts.add(geometry, color, { p: [feature.x, base - min.y * half, feature.z], s: [feature.rx / max.x, half, feature.rz / max.z] });
}

function log(parts: Parts, feature: Log) {
  const { x, z, len, r, axis } = feature;
  const dx = axis === "x" ? len / 2 : 0;
  const dz = axis === "z" ? len / 2 : 0;
  beam(parts, [x - dx, r, z - dz], [x + dx, r, z + dz], r, wood, 10);
  for (const sign of [-1, 1]) {
    beam(parts, [x + sign * dx, r, z + sign * dz], [x + sign * dx * 1.005, r, z + sign * dz * 1.005], r * 0.75, "#d3a77b", 10);
  }
}

function fence(parts: Parts, from: P2, to: P2, height: number) {
  const alongX = from.z === to.z;
  const length = Math.hypot(to.x - from.x, to.z - from.z);
  const count = Math.ceil(length / 0.62);
  for (let index = 0; index <= count; index++) {
    const t = index / count;
    parts.rbox(0.082, height, 0.082, 0.018, wood, { p: [THREE.MathUtils.lerp(from.x, to.x, t), height / 2, THREE.MathUtils.lerp(from.z, to.z, t)] }, 1);
  }
  for (const fraction of [0.35, 0.78]) {
    parts.box(alongX ? length : 0.055, 0.065, alongX ? 0.055 : length, rail, {
      p: [mid(from.x, to.x), height * fraction, mid(from.z, to.z)]
    });
  }
}

function signedRect(rect: Rect, x: number, z: number) {
  const dx = Math.max(rect.minX - x, x - rect.maxX);
  const dz = Math.max(rect.minZ - z, z - rect.maxZ);
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(0, Math.max(dx, dz));
}

function paving(rects: Rect[], ovals: Oval[]) {
  const distance = (x: number, z: number) => {
    let clearance = -signedRect(ROOM, x, z);
    for (const rect of rects) {
      const edge = signedRect(rect, x, z);
      const round = Math.max(0, 0.12 - Math.abs(clearance - edge)) / 0.12;
      clearance = Math.min(clearance, edge) - round * round * 0.03;
    }
    for (const oval of ovals) {
      const edge = (Math.hypot((x - oval.x) / oval.rx, (z - oval.z) / oval.rz) - 1) * Math.min(oval.rx, oval.rz);
      clearance = Math.min(clearance, edge);
    }
    return clearance - 0.065;
  };
  const cols = Math.ceil(width(ROOM) / 0.13);
  const rows = Math.ceil(depth(ROOM) / 0.13);
  const points = Array.from({ length: rows + 1 }, (_, row) => Array.from({ length: cols + 1 }, (_, col): V3 => {
    const x = THREE.MathUtils.lerp(ROOM.minX, ROOM.maxX, col / cols);
    const z = THREE.MathUtils.lerp(ROOM.minZ, ROOM.maxZ, row / rows);
    return [x, z, distance(x, z)];
  }));
  const vertices: number[] = [];
  const colors: number[] = [];
  const border = new THREE.Color("#d7b98a");
  const gravel = new THREE.Color("#e8d3a6");
  const timber = new THREE.Color("#d8b58c");
  const color = new THREE.Color();
  const vertex = ([x, z, edge]: V3) => {
    const major = paths.some((path) => signedRect(path, x, z) <= 0.12);
    const deck = 1 - THREE.MathUtils.smoothstep(signedRect(ELEPHANT_DECK, x, z), -0.08, 0.08);
    const grain = 0.98 + 0.022 * Math.sin(x * 1.2 + z * 1.5) + 0.018 * Math.cos(x * 4.5 - z * 3.8);
    color.copy(gravel).lerp(timber, deck).lerp(border, (major ? 0.46 : 0.56) * (1 - THREE.MathUtils.smoothstep(edge, 0, 0.23))).multiplyScalar(grain);
    vertices.push(x, 0.008, z);
    colors.push(color.r, color.g, color.b);
  };
  const clip = (triangle: V3[]) => {
    const polygon: V3[] = [];
    for (let index = 0; index < 3; index++) {
      const current = triangle[index];
      const next = triangle[(index + 1) % 3];
      if (current[2] >= 0) polygon.push(current);
      if ((current[2] >= 0) !== (next[2] >= 0)) {
        const t = current[2] / (current[2] - next[2]);
        polygon.push([THREE.MathUtils.lerp(current[0], next[0], t), THREE.MathUtils.lerp(current[1], next[1], t), 0]);
      }
    }
    for (let index = 1; index + 1 < polygon.length; index++) {
      vertex(polygon[0]); vertex(polygon[index]); vertex(polygon[index + 1]);
    }
  };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const top = points[row];
      const bottom = points[row + 1];
      clip([top[col], bottom[col], top[col + 1]]);
      clip([top[col + 1], bottom[col], bottom[col + 1]]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, worldMat);
}

export class ZooArea implements RoomArea {
  readonly scene = new THREE.Scene();
  readonly bounds = ROOM;
  readonly door = DOOR;
  readonly nav = new NavMap(ROOM, visitorRects(), 0.28, visitorOvals());
  readonly views = VIEWS;
  readonly follow = FOLLOW;
  readonly hostSpot = { ...PLAZA.oka, facing: PLAZA.okaFacing };
  readonly ambientSpots = AMBIENT;
  readonly slots: Record<ZooSlotId, Slot>;
  readonly spots = {};
  readonly floor: THREE.Mesh;
  readonly solids: THREE.Object3D[] = [];
  private readonly gate: THREE.Mesh;
  private readonly sway = { value: 0.012 };
  private readonly shimmer = { value: 0.022 };
  private readonly foliageMat = worldFoliageMaterial(this.sway);

  constructor() {
    this.scene.background = new THREE.Color("#2a3f52");
    this.scene.add(new THREE.HemisphereLight("#fffbea", "#8fae7a", 2.0));
    const sun = new THREE.DirectionalLight("#ffffff", 1.8);
    sun.position.set(-3, 9, 6);
    this.scene.add(sun);
    this.floor = this.buildGround();
    const water = new Parts();
    this.buildGarden(water);
    this.buildElephants(water);
    this.buildMonkeys(water);
    this.buildPandas();
    this.buildPenguins(water);
    this.scene.add(water.mesh(worldWaterMaterial(this.shimmer)));
    this.buildFences();
    this.gate = this.buildGate();
    this.slots = this.buildSlots();
  }

  private solid(mesh: THREE.Mesh, name: string) {
    mesh.name = name;
    this.scene.add(mesh);
    this.solids.push(mesh);
    return mesh;
  }

  private buildGround() {
    const ground = new Parts();
    slab(ground, GROUND, -0.06, 0.34, "#785744", 0.06);
    slab(ground, GROUND, -0.015, 0.06, "#99b866", 0.028);
    this.scene.add(ground.mesh(worldMat), paving(this.nav.obstacles, this.nav.ovals));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width(GROUND), depth(GROUND)), new THREE.MeshBasicMaterial({ visible: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(mid(GROUND.minX, GROUND.maxX), 0, mid(GROUND.minZ, GROUND.maxZ));
    this.scene.add(floor);
    return floor;
  }

  private buildGarden(water: Parts) {
    const bases = new Parts();
    const planted = new Parts();
    const trunks = new Parts();
    const crowns = new Parts();
    const perimeter = new Parts();
    const perimeterCrowns = new Parts();
    const gardenTree = (x: number, z: number, scale: number, base: number, bark: Parts, leaves: Parts) => {
      tree(bark, leaves, { x, z, h: 1.9 * scale, trunk: 0.13 * scale, canopyY: base + 2.12 * scale, canopy: 0.91 * scale }, base, 0.65);
    };
    for (const [id, bed] of Object.entries(BEDS)) {
      slab(bases, bed, 0.17, 0.19, "#b9a48a", 0.08);
      const soil = { minX: bed.minX + 0.07, maxX: bed.maxX - 0.07, minZ: bed.minZ + 0.07, maxZ: bed.maxZ - 0.07 };
      slab(bases, soil, 0.185, 0.065, "#78654a", 0.03);
      const tall = id.startsWith("hedge") || id === "cornerWest";
      if (tall) {
        const count = Math.ceil(depth(bed) / 0.68);
        const x = mid(bed.minX, bed.maxX);
        for (let index = 0; index < count; index++) {
          const z = bed.minZ + (index + 0.5) * depth(bed) / count;
          crowns.sphere(0.43, leaf[index % leaf.length], { p: [x, 0.53, z], s: [Math.min(0.96, width(bed) * 0.9), 1, 1.05] }, 8, 5);
          if (index % 3 === 1) gardenTree(x, z, 0.94 + (index % 4) * 0.09, 0.18, trunks, crowns);
        }
        continue;
      }
      const front = id === "front";
      const cols = Math.ceil(width(bed) / 0.49);
      const rows = Math.ceil(depth(bed) / 0.52);
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const x = bed.minX + (col + 0.5 + 0.13 * Math.sin(row + col)) * width(bed) / cols;
        const z = bed.minZ + (row + 0.5 + 0.13 * Math.cos(row - col)) * depth(bed) / rows;
        const index = row + col;
        const height = (front ? 0.25 : 0.18) + (index % 5) * (front ? 0.12 : 0.078);
        planted.sphere(0.18, leaf[index % leaf.length], { p: [x, 0.26, z], s: [1, 0.55, 0.9] }, 7, 5);
        planted.cyl(0.016, 0.023, height, "#6f9551", { p: [x, 0.18 + height / 2, z] }, 5);
        planted.sphere(0.092 + (col % 3) * 0.015, flowers[index % flowers.length], { p: [x, 0.18 + height, z], s: [1, 0.68, 1] }, 7, 5);
      }
      if (front) for (const x of [bed.minX + depth(bed) / 2, bed.maxX - depth(bed) / 2]) {
        gardenTree(x, mid(bed.minZ, bed.maxZ), 0.88, 0.18, trunks, crowns);
      }
    }
    const hedgeLine = (from: P2, to: P2, change: number) => {
      const count = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.79);
      for (let index = 0; index < count; index++) {
        const t = (index + 0.5) / count;
        const x = THREE.MathUtils.lerp(from.x, to.x, t);
        const z = THREE.MathUtils.lerp(from.z, to.z, t);
        perimeterCrowns.sphere(0.48, leaf[(index + change) % leaf.length], { p: [x, 0.38, z], s: [1, 0.98, 1] }, 8, 5);
        if (index % 3 === 1) gardenTree(x, z, 0.98 + (index % 5) * 0.08, 0, perimeter, perimeterCrowns);
      }
    };
    const backZ = GROUND.minZ - 0.14;
    const westX = GROUND.minX - 0.12;
    const eastX = GROUND.maxX + 0.16;
    hedgeLine({ x: westX, z: backZ }, { x: eastX, z: backZ }, 0);
    hedgeLine({ x: westX, z: ROOM.minZ }, { x: westX, z: BEDS.cornerWest.minZ }, 1);
    hedgeLine({ x: eastX, z: ROOM.minZ }, { x: eastX, z: GATE_GAP.minZ - 0.48 }, 2);
    hedgeLine({ x: eastX, z: GATE_GAP.maxZ + 0.48 }, { x: eastX, z: ROOM.maxZ }, 1);

    for (const bench of BENCHES) {
      const at = (x: number, y: number, z: number) => ({
        p: [bench.x + Math.cos(bench.yaw) * x + Math.sin(bench.yaw) * z, y, bench.z - Math.sin(bench.yaw) * x + Math.cos(bench.yaw) * z] as V3,
        r: [0, bench.yaw, 0] as V3
      });
      bases.rbox(1, 0.075, 0.38, 0.027, rail, at(0, 0.42, 0), 1);
      for (const x of [-0.38, 0.38]) bases.box(0.075, 0.68, 0.075, wood, at(x, 0.34, 0.14));
      for (const x of [-0.38, 0.38]) bases.box(0.075, 0.4, 0.075, wood, at(x, 0.2, -0.14));
      bases.rbox(1, 0.13, 0.047, 0.02, rail, at(0, 0.64, 0.17), 1);
    }
    ovalSlab(bases, FOUNTAIN, 0.14, 0.15, "#a09186");
    ovalSlab(bases, inset(FOUNTAIN, 0.04), 0.37, 0.24, "#d7c9ae");
    bases.torus(FOUNTAIN.rx - 0.08, 0.045, "#e6d7be", { p: [FOUNTAIN.x, 0.4, FOUNTAIN.z], r: [-Math.PI / 2, 0, 0] }, Math.PI * 2, 8, 40);
    disc(water, inset(FOUNTAIN, 0.095), 0.392, "#64bcca");
    bases.cyl(0.13, 0.2, 0.64, "#bdab98", { p: [FOUNTAIN.x, 0.42, FOUNTAIN.z] }, 12);
    bases.cyl(0.26, 0.13, 0.09, "#d7c9ae", { p: [FOUNTAIN.x, 0.71, FOUNTAIN.z] }, 20);
    disc(water, { ...FOUNTAIN, rx: 0.224, rz: 0.224 }, 0.763, "#87d9df");

    this.scene.add(bases.mesh(worldMat), planted.mesh(this.foliageMat));
    this.solid(trunks.mesh(worldMat), "Garden trunks");
    this.solid(crowns.mesh(this.foliageMat), "Garden foliage");
    this.solid(perimeter.mesh(worldMat), "Perimeter trunks");
    this.solid(perimeterCrowns.mesh(this.foliageMat), "Perimeter foliage");
  }

  private buildElephants(water: Parts) {
    const land = new Parts();
    const terrain = new Parts();
    const trunks = new Parts();
    const crowns = new Parts();
    slab(land, HABITATS.elephants.rect, 0, 0.04, "#b8bb76");
    for (const dirt of ELEPHANT.dirt) disc(land, dirt, 0.01, "#c7a875");
    disc(land, ELEPHANT.water, 0.029, "#685c46");
    disc(water, inset(ELEPHANT.water, 0.11), 0.04, "#68b3b1");
    disc(land, ELEPHANT.mud, 0.024, "#987252");
    disc(land, inset(ELEPHANT.mud, 0.07), 0.03, "#765746");
    for (const feature of ELEPHANT.rocks) rock(terrain, feature);
    for (const feature of ELEPHANT.logs) log(terrain, feature);
    for (const spec of ELEPHANT.trees) tree(trunks, crowns, spec, 0, 0.25);
    const rack = ELEPHANT.hayRack;
    slab(terrain, rack, 0.49, 0.1, rail, 0.04);
    for (const x of [rack.minX + 0.06, rack.maxX - 0.06]) for (const z of [rack.minZ + 0.07, rack.maxZ - 0.07]) {
      terrain.box(0.1, 0.75, 0.1, wood, { p: [x, 0.375, z] });
    }
    for (const side of [-1, 1]) {
      const z = mid(rack.minZ, rack.maxZ) + side * (depth(rack) / 2 - 0.045);
      terrain.box(width(rack), 0.09, 0.075, wood, { p: [mid(rack.minX, rack.maxX), 0.69, z] });
    }
    for (let index = 0; index < 7; index++) {
      terrain.rbox(width(rack) * 0.72, 0.16 + (index % 3) * 0.05, 0.18, 0.055, ["#dec075", "#ebce85"][index % 2], {
        p: [mid(rack.minX, rack.maxX), 0.56, rack.minZ + (index + 0.5) * depth(rack) / 7], r: [0, Math.sin(index) * 0.12, 0]
      }, 1);
    }
    this.scene.add(land.mesh(worldMat));
    this.solid(terrain.mesh(worldMat), "Elephant rocks and rack");
    this.solid(trunks.mesh(worldMat), "Elephant trees");
    this.solid(crowns.mesh(this.foliageMat), "Elephant canopies");
  }

  private buildMonkeys(water: Parts) {
    const land = new Parts();
    const trunks = new Parts();
    const crowns = new Parts();
    const structures = new Parts();
    const { rect } = HABITATS.monkeys;
    slab(water, rect, 0.027, 0.034, "#6eacb6");
    ovalSlab(land, inset(MONKEY.island, 0.13), 0.117, 0.22, "#927659", 1.03);
    ovalSlab(land, inset(MONKEY.island, 0.2), MONKEY.groundY, 0.04, "#9db06d");
    for (const spec of MONKEY.trees) tree(trunks, crowns, spec, MONKEY.groundY, 0.25);
    for (const branch of MONKEY.branches) beam(trunks, branch.from, branch.to, branch.r, wood);
    const furniture = (spec: typeof MONKEY.table, topColor: Col) => {
      const { x, z, w, d, top } = spec;
      const leg = 0.046;
      for (const dx of [-w / 2 + 0.1, w / 2 - 0.1]) for (const dz of [-d / 2 + 0.08, d / 2 - 0.08]) {
        beam(structures, [x + dx, MONKEY.groundY, z + dz], [x + dx, top - 0.045, z + dz], leg, wood);
      }
      for (let index = 0; index < 5; index++) {
        structures.rbox(w / 5 - 0.008, 0.085, d, 0.017, index % 2 ? rail : topColor, {
          p: [x - w / 2 + (index + 0.5) * w / 5, top - 0.0425, z]
        }, 1);
      }
    };
    furniture(MONKEY.platform, "#c89971");
    furniture(MONKEY.table, "#d8ad86");
    const pole = (point: P2, top: number, radius: number) => beam(structures, [point.x, MONKEY.groundY, point.z], [point.x, top, point.z], radius, wood);
    pole(MONKEY.platform.pole, MONKEY.platform.top, 0.068);
    for (const post of MONKEY.platform.ropePosts) pole(post, MONKEY.platform.postTop, 0.06);
    for (const rope of MONKEY.ropes) {
      const points = Array.from({ length: 17 }, (_, index) => new THREE.Vector3(...ropePoint(rope, index / 16)));
      structures.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, 0.025, 6, false), "#d2b278");
    }
    const count = Math.ceil(width(rect) / 0.52);
    for (let index = 0; index < count; index++) {
      const x = rect.minX + (index + 0.5) * width(rect) / count;
      rock(structures, { x, z: rect.minZ + 0.16, rx: 0.29, rz: 0.22, h: 0.65 + 0.12 * Math.sin(index) });
    }
    this.scene.add(land.mesh(worldMat));
    this.solid(structures.mesh(worldMat), "Monkey structures and back wall");
    this.solid(trunks.mesh(worldMat), "Monkey trees");
    this.solid(crowns.mesh(this.foliageMat), "Monkey canopies");
  }

  private buildPandas() {
    const grass = new Parts();
    const rocks = new Parts();
    const trunks = new Parts();
    const crowns = new Parts();
    const ferns = new Parts();
    const { rect, roam } = HABITATS.pandas;
    slab(grass, rect, 0, 0.04, "#96ba6d");
    for (const feature of PANDA.rocks) rock(rocks, feature);
    for (const feature of PANDA.logs) log(rocks, feature);
    for (const spec of PANDA.trees) tree(trunks, crowns, spec, 0, 0.44);
    const count = Math.ceil(width(rect) / 0.6);
    for (let index = 0; index < count; index++) {
      const x = rect.minX + (index + 0.5) * width(rect) / count;
      const z = mid(roam.maxZ, rect.maxZ);
      for (let blade = 0; blade < 5; blade++) {
        const offset = blade - 2;
        ferns.sphere(0.11, leaf[(index + blade) % leaf.length], {
          p: [x + offset * 0.043, 0.12 + 0.018 * (2 - Math.abs(offset)), z],
          r: [0, 0, -offset * 0.38], s: [0.28, 1.12, 0.35]
        }, 7, 5);
      }
    }
    // Low planting the pandas walk through (tufts, flowers, moss under the shade tree), kept off
    // their eating and resting places, and two bushes in corners they cannot reach.
    for (const spec of PANDA.trees) disc(grass, { x: spec.x - 0.2, z: spec.z + 0.9, rx: 1.5, rz: 1.1 }, 0.045, "#7fa55c");
    const keepClear = [...Object.values(PANDA.poi), ...ANCHORS.pandas.map((a) => ({ x: a.p[0], z: a.p[2] }))];
    let seed = 7;
    const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let tuft = 0; tuft < 46; tuft++) {
      const x = roam.minX + next() * width(roam);
      const z = roam.minZ + next() * depth(roam);
      if (keepClear.some((p) => Math.hypot(p.x - x, p.z - z) < 0.65)) continue;
      const flower = tuft % 5 === 0;
      for (let blade = 0; blade < 3; blade++) {
        ferns.sphere(0.07, leaf[(tuft + blade) % leaf.length], { p: [x + (blade - 1) * 0.05, 0.08, z], r: [0, 0, (1 - blade) * 0.4], s: [0.3, 1.1, 0.3] }, 6, 4);
      }
      if (flower) ferns.sphere(0.045, tuft % 2 ? "#fff3c4" : "#f8bbd0", { p: [x, 0.17, z] }, 6, 4);
    }
    for (const [x, z, r] of [[4.85, -8.35, 0.42], [11.35, -2.8, 0.36]] as const) {
      ferns.sphere(r, leaf[1], { p: [x, r * 0.75, z], s: [1, 0.85, 1] }, 9, 7);
      ferns.sphere(r * 0.7, leaf[2], { p: [x + r * 0.35, r * 1.05, z + r * 0.2] }, 8, 6);
    }
    this.scene.add(grass.mesh(worldMat), ferns.mesh(this.foliageMat));
    this.solid(rocks.mesh(worldMat), "Panda rocks and log");
    this.solid(trunks.mesh(worldMat), "Panda trees");
    this.solid(crowns.mesh(this.foliageMat), "Panda canopies");
  }

  private buildPenguins(water: Parts) {
    const ice = new Parts();
    const rocks = new Parts();
    const { pool, landY, surfaceY } = PENGUIN;
    const { minX, maxX, minZ, maxZ } = HABITATS.penguins.rect;
    const iceEdge = inset(pool, -0.12);
    const shore = new THREE.Shape();
    shore.moveTo(minX, -maxZ); shore.lineTo(maxX, -maxZ); shore.lineTo(maxX, -minZ); shore.lineTo(minX, -minZ); shore.closePath();
    ellipseHole(shore, iceEdge);
    ice.add(new THREE.ShapeGeometry(shore, 12), "#e4f2f5", { p: [0, landY, 0], r: [-Math.PI / 2, 0, 0] });
    const rim = new THREE.Shape();
    rim.absellipse(iceEdge.x, -iceEdge.z, iceEdge.rx, iceEdge.rz, 0, Math.PI * 2, false);
    ellipseHole(rim, pool);
    ice.add(new THREE.ShapeGeometry(rim, 12), "#b8dee8", { p: [0, landY, 0], r: [-Math.PI / 2, 0, 0] });
    disc(water, pool, surfaceY, "#73ccdf");
    disc(water, inset(pool, PENGUIN.swimInset * 0.52), surfaceY + 0.001, "#59b7d0");
    for (const { land, water: end } of PENGUIN.ramps) {
      const dx = end.x - land.x;
      const dz = end.z - land.z;
      const length = Math.hypot(dx, dz);
      const ramp = new THREE.PlaneGeometry(0.48, length, 1, 4).rotateX(-Math.PI / 2);
      const position = ramp.attributes.position;
      for (let index = 0; index < position.count; index++) {
        const t = position.getZ(index) / length + 0.5;
        position.setY(index, THREE.MathUtils.lerp(landY + 0.024, surfaceY - 0.045, t * t));
      }
      ramp.computeVertexNormals();
      ice.add(ramp, "#c8e7ee", { p: [mid(land.x, end.x), 0, mid(land.z, end.z)], r: [0, Math.atan2(dx, dz), 0] });
    }
    for (const feature of PENGUIN.rocks) rock(rocks, feature, landY, "#acc6cd");
    rock(rocks, { ...PENGUIN.diveRock, h: PENGUIN.diveRock.h - landY }, landY, "#a7c1cb");
    this.scene.add(ice.mesh(worldMat));
    this.solid(rocks.mesh(worldMat), "Penguin rocks");
  }

  private buildFences() {
    const fences = new Parts();
    for (const habitat of Object.values(HABITATS)) {
      const { id, rect: { minX, maxX, minZ, maxZ } } = habitat;
      const west = minX + 0.043;
      const east = maxX - 0.043;
      const north = minZ + 0.043;
      const south = maxZ - 0.05;
      if (minX > ROOM.minX) fence(fences, { x: west, z: north }, { x: west, z: south }, 0.88);
      if (maxX < ROOM.maxX) fence(fences, { x: east, z: north }, { x: east, z: south }, 0.88);
      if (minZ > ROOM.minZ) fence(fences, { x: west, z: north }, { x: east, z: north }, 0.79);
      if (id === "penguins" || id === "monkeys") {
        const ice = id === "penguins";
        const wall = { minX: west, maxX: east, minZ: maxZ - 0.17, maxZ };
        slab(fences, wall, 0.45, 0.47, ice ? "#ecf7fa" : "#ab9988", 0.055);
        slab(fences, { ...wall, minZ: maxZ - 0.135, maxZ: maxZ - 0.025 }, 0.51, 0.085, ice ? "#77b9d3" : "#c4b3a2", 0.035);
      } else {
        fence(fences, { x: west, z: south }, { x: east, z: south }, 0.7);
      }
      this.exhibitSign(habitat);
    }
    const east = ROOM.maxX + 0.1;
    fence(fences, { x: east, z: ROOM.minZ }, { x: east, z: GATE_GAP.minZ }, 0.92);
    fence(fences, { x: east, z: GATE_GAP.maxZ }, { x: east, z: ROOM.maxZ }, 0.92);
    fence(fences, { x: ROOM.minX, z: ROOM.minZ }, { x: east, z: ROOM.minZ }, 0.95);
    fence(fences, { x: ROOM.minX, z: ROOM.minZ }, { x: ROOM.minX, z: ROOM.maxZ }, 0.92);
    this.solid(fences.mesh(worldMat), "Habitat and perimeter fences");
  }

  private exhibitSign(habitat: Habitat) {
    const { x, z } = habitat.sign;
    const board = new Parts();
    board.rbox(1.2, 0.3, 0.055, 0.025, "#c3a284", { p: [x, 0.79, z] }, 1);
    for (const offset of [-0.38, 0.38]) board.box(0.06, 0.72, 0.07, wood, { p: [x + offset, 0.36, z] });
    this.solid(board.mesh(worldMat), habitat.name + " sign frame");
    this.sign(habitat.name, 1.16, 0.27, habitat.color, [x, 0.79, z + 0.029]);
  }

  private sign(text: string, w: number, h: number, border: string, p: V3, yaw = 0) {
    const map = signTexture(text, { bg: "#fff8e1", fg: "#5d4037", border, w: 448, h: Math.round(448 * h / w) });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), worldBasicMaterial({ map, transparent: true }));
    mesh.position.set(...p);
    mesh.rotation.y = yaw;
    this.scene.add(mesh);
  }

  private buildGate() {
    const arch = new Parts();
    const x = ROOM.maxX + 0.1;
    const { minZ, maxZ } = GATE_GAP;
    const span = maxZ - minZ;
    for (const z of [minZ - 0.055, maxZ + 0.055]) {
      arch.rbox(0.28, 2.32, 0.24, 0.052, wood, { p: [x, 1.16, z] });
      arch.rbox(0.34, 0.17, 0.31, 0.047, rail, { p: [x, 2.24, z] });
    }
    const center = mid(minZ, maxZ);
    const crown = (angle: number): V3 => [x, 2.25 + Math.sin(angle) * 0.49, center + Math.cos(angle) * (span / 2 + 0.055)];
    for (let index = 0; index < 12; index++) {
      beam(arch, crown(index * Math.PI / 12), crown((index + 1) * Math.PI / 12), 0.13, rail);
    }
    arch.rbox(0.22, 0.42, span * 0.86, 0.07, "#78a962", { p: [x, 2.68, center] });
    this.solid(arch.mesh(worldMat), "Zoo gate arch");
    this.sign("ZOO", span * 0.79, 0.33, "#78a962", [x - 0.112, 2.68, center], -Math.PI / 2);

    const leaf = new Parts();
    const length = span - 0.14;
    for (let index = 0; index < 7; index++) {
      leaf.rbox(0.055, 1.08, 0.062, 0.018, wood, { p: [0, 0.57, -(index + 0.5) * length / 7] }, 1);
    }
    for (const y of [0.22, 0.89]) leaf.box(0.07, 0.08, length, rail, { p: [0, y, -length / 2] });
    const gate = this.solid(leaf.mesh(worldMat), "Zoo gate leaf");
    gate.position.set(x, 0, maxZ - 0.065);
    return gate;
  }

  private buildSlots() {
    const invisible = new THREE.MeshBasicMaterial({ visible: false });
    const slots = {} as Record<ZooSlotId, Slot>;
    for (const id of Object.keys(ANCHORS) as ZooSlotId[]) {
      const word = WORDS[id];
      const habitat = HABITATS[SLOT_PEN[id]];
      const anchors = ANCHORS[id].map(({ p, yaw, s }) => ({ p: new THREE.Vector3(...p), r: new THREE.Euler(0, yaw ?? 0, 0), s }));
      const ghosts = anchors.map((anchor, index) => {
        const { root } = WORD_KINDS[word].build(null, index);
        root.position.copy(anchor.p);
        root.rotation.copy(anchor.r);
        root.scale.setScalar(anchor.s ?? 1);
        root.traverse((object) => {
          if (object instanceof THREE.Mesh) object.material = ghostMaterial;
        });
        this.scene.add(root);
        return root;
      });
      const box = HOTSPOTS[id];
      const geometry = new THREE.BoxGeometry(width(box), box.maxY - box.minY, depth(box));
      geometry.computeBoundingBox();
      const hotspot = new THREE.Mesh(geometry, invisible);
      hotspot.position.set(mid(box.minX, box.maxX), mid(box.minY, box.maxY), mid(box.minZ, box.maxZ));
      hotspot.userData.slot = id;
      this.scene.add(hotspot);
      const marker = id === "bananas" ? new THREE.Vector3(MONKEY.table.x, MONKEY.table.top + 0.44, MONKEY.table.z) : new THREE.Vector3(...habitat.marker);
      slots[id] = { id, word, anchors, ghosts, items: [], hotspot, marker, stand: habitat.stand, view: VIEWS[habitat.id] };
    }
    return slots;
  }

  get pickables(): THREE.Object3D[] {
    return Object.values(this.slots).map((slot) => slot.hotspot);
  }

  setLevel(level: number) {
    this.sway.value = THREE.MathUtils.lerp(0.012, 0.045, level);
    this.shimmer.value = THREE.MathUtils.lerp(0.022, 0.065, level);
  }

  update() {}

  setDoor(open: number) {
    this.gate.rotation.y = -open * Math.PI / 2;
  }
}
