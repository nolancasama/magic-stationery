/**
 * The town: five places around a plaza. Each building has its own restoration
 * level (its own uniforms), so a restored shop stands in colour on a grey
 * street; the plaza follows the average of all places.
 */
import * as THREE from "three";
import { makeRestoreUniforms, worldBasicMaterial, worldMaterial, type RestoreUniforms } from "../materials.ts";
import { NavMap, type Rect } from "../nav.ts";
import { Parts, shade } from "../parts.ts";
import { signTexture } from "../signs.ts";

export type PlaceId = "store" | "school" | "zoo" | "market" | "gym";

export interface Place {
  id: PlaceId;
  name: string;
  ja: string;
  group: THREE.Group;
  uniforms: RestoreUniforms;
  door: { x: number; z: number };
  label: THREE.Vector3;
  hotspot: THREE.Mesh;
}

const BOUNDS: Rect = { minX: -10.5, maxX: 10.5, minZ: -8.5, maxZ: 7.5 };

export const TOWN_VIEW = { pos: new THREE.Vector3(0, 15.5, 19.5), look: new THREE.Vector3(0, 0.2, -2.4) };

interface PlaceSpec {
  id: PlaceId;
  name: string;
  ja: string;
  at: [number, number];
  rot: number;
  build: (p: Parts) => void;
  signText: string;
  signColor: string;
}

function house(p: Parts, w: number, h: number, d: number, wall: string, roof: string) {
  p.box(w, h, d, wall, { p: [0, h / 2, 0] });
  p.box(w + 0.3, 0.25, d + 0.3, shade(roof, 0.85), { p: [0, h + 0.12, 0] });
  p.box(w * 0.92, 0.12, 0.05, "#ffffff", { p: [0, 0.06, d / 2 + 0.01] });
}

function windows(p: Parts, w: number, y: number, z: number, n: number, color = "#bfe6ff") {
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    p.box(0.7, 0.6, 0.06, "#ffffff", { p: [x, y, z] });
    p.box(0.56, 0.46, 0.07, color, { p: [x, y, z + 0.005] });
  }
}

const SPECS: PlaceSpec[] = [
  {
    id: "store",
    name: "Stationery Store",
    ja: "ぶんぼうぐや",
    at: [-6.6, 1.2],
    rot: 0.75,
    signText: "STATIONERY",
    signColor: "#ff8fb1",
    build: (p) => {
      house(p, 4.2, 2.8, 3.2, "#ffe3ec", "#ff8fb1");
      p.box(1.1, 1.9, 0.1, "#a1663f", { p: [0.9, 0.95, 1.62] });
      p.box(1.6, 1.2, 0.08, "#bfe6ff", { p: [-0.9, 1.4, 1.62] });
      p.box(1.8, 0.12, 0.3, "#ff8fb1", { p: [-0.9, 2.1, 1.75] });
      // A giant pencil on the roof.
      p.cyl(0.25, 0.25, 2.6, "#ffc928", { p: [0, 3.5, 0], r: [0, 0, Math.PI / 2] }, 6);
      p.cyl(0.05, 0.25, 0.6, "#f3d2a2", { p: [1.6, 3.5, 0], r: [0, 0, -Math.PI / 2] }, 6);
      p.cyl(0.26, 0.26, 0.35, "#c3c9cf", { p: [-1.45, 3.5, 0], r: [0, 0, Math.PI / 2] }, 10);
      p.cyl(0.25, 0.25, 0.3, "#f48fb1", { p: [-1.75, 3.5, 0], r: [0, 0, Math.PI / 2] }, 10);
    }
  },
  {
    id: "school",
    name: "Classroom",
    ja: "きょうしつ",
    at: [-4.2, -4.6],
    rot: 0.35,
    signText: "SCHOOL",
    signColor: "#64b5f6",
    build: (p) => {
      house(p, 5.2, 3.2, 3.2, "#f5f5f0", "#64b5f6");
      windows(p, 5.0, 2.0, 1.6, 4);
      p.box(1.2, 2.0, 0.1, "#795548", { p: [0, 1.0, 1.62] });
      p.box(1.3, 1.6, 1.3, "#f5f5f0", { p: [0, 4.0, 0] });
      p.cone(1.0, 0.9, "#64b5f6", { p: [0, 5.25, 0] }, 4);
      p.cyl(0.42, 0.42, 0.08, "#ffffff", { p: [0, 4.1, 0.66], r: [Math.PI / 2, 0, 0] }, 20);
      p.box(0.05, 0.3, 0.02, "#37474f", { p: [0, 4.2, 0.71] });
    }
  },
  {
    id: "zoo",
    name: "Zoo",
    ja: "どうぶつえん",
    at: [0.6, -6.2],
    rot: 0,
    signText: "ZOO",
    signColor: "#66bb6a",
    build: (p) => {
      for (const sx of [-1, 1]) {
        p.box(0.6, 3.2, 0.6, "#8d6e63", { p: [sx * 1.6, 1.6, 0] });
        p.sphere(0.45, "#66bb6a", { p: [sx * 1.6, 3.4, 0] }, 10, 8);
      }
      p.box(3.8, 0.7, 0.4, "#a1887f", { p: [0, 2.7, 0] });
      for (let i = 0; i < 9; i++) {
        p.box(0.12, 1.2, 0.12, "#a1887f", { p: [-6 + i * 0.5, 0.6, -0.2] });
        p.box(0.12, 1.2, 0.12, "#a1887f", { p: [2.2 + i * 0.5, 0.6, -0.2] });
      }
      p.box(4.2, 0.1, 0.1, "#8d6e63", { p: [-4.0, 1.0, -0.2] });
      p.box(4.2, 0.1, 0.1, "#8d6e63", { p: [4.2, 1.0, -0.2] });
      for (const [x, z, s] of [[-3, -2.5, 1.4], [3.5, -2.2, 1.6], [0, -3.2, 1.8]] as const) {
        p.cyl(0.18, 0.22, 1.6, "#8d6e63", { p: [x, 0.8, z] }, 8);
        p.sphere(s, "#81c784", { p: [x, 2.3, z] }, 10, 8);
      }
    }
  },
  {
    id: "market",
    name: "Supermarket",
    ja: "スーパー",
    at: [5.4, -4.5],
    rot: -0.4,
    signText: "SUPERMARKET",
    signColor: "#43a047",
    build: (p) => {
      house(p, 5.0, 2.9, 3.4, "#fff8e1", "#43a047");
      for (let i = 0; i < 8; i++) p.box(0.62, 0.5, 0.7, i % 2 ? "#ffffff" : "#43a047", { p: [-2.2 + i * 0.63, 2.15, 1.95], r: [0.5, 0, 0] });
      p.box(3.2, 1.4, 0.08, "#bfe6ff", { p: [-0.6, 1.1, 1.72] });
      p.box(1.0, 1.9, 0.1, "#9e9e9e", { p: [1.8, 0.95, 1.72] });
    }
  },
  {
    id: "gym",
    name: "Gym",
    ja: "たいいくかん",
    at: [6.9, 1.4],
    rot: -0.8,
    signText: "GYM",
    signColor: "#ff7043",
    build: (p) => {
      p.box(4.6, 2.6, 3.6, "#e3f2fd", { p: [0, 1.3, 0] });
      p.cyl(2.3, 2.3, 4.0, "#ff7043", { p: [0, 2.6, 0], r: [Math.PI / 2, 0, 0] }, 16);
      p.box(4.7, 0.3, 4.1, "#e3f2fd", { p: [0, 2.6, 0] });
      p.box(1.4, 2.0, 0.1, "#607d8b", { p: [0, 1.0, 1.82] });
      p.sphere(0.5, "#ff9800", { p: [1.7, 3.8, 1.2] }, 12, 10);
    }
  }
];

export class TownArea {
  readonly scene = new THREE.Scene();
  readonly places: Record<PlaceId, Place>;
  readonly nav: NavMap;
  readonly ground: THREE.Mesh;
  readonly plazaUniforms = makeRestoreUniforms(0.1);
  private fountainWater: THREE.Mesh;

  constructor() {
    this.scene.background = new THREE.Color("#c9d6e3");
    this.scene.fog = new THREE.Fog("#c9d6e3", 30, 60);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#9fb08f", 2.0));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.0);
    sun.position.set(-6, 12, 8);
    this.scene.add(sun);
    const plazaMat = worldMaterial({}, this.plazaUniforms);
    const g = new Parts();
    g.box(26, 0.4, 19, "#86c06c", { p: [0, -0.2, -0.5] });
    g.cyl(5.2, 5.2, 0.05, "#e8dcc6", { p: [0, 0.02, 0] }, 40);
    g.cyl(4.6, 4.6, 0.06, "#ddd0b8", { p: [0, 0.025, 0] }, 40);
    for (const s of SPECS) {
      const [x, z] = s.at;
      const len = Math.hypot(x, z) - 4.4;
      const a = Math.atan2(x, z);
      g.box(1.6, 0.05, len, "#e8dcc6", { p: [Math.sin(a) * (4.4 + len / 2), 0.03, Math.cos(a) * (4.4 + len / 2)], r: [0, a, 0] });
    }
    g.box(1.8, 0.05, 4.0, "#e8dcc6", { p: [0, 0.03, 6.0] });
    // Fountain.
    g.cyl(1.3, 1.4, 0.5, "#b0bec5", { p: [0, 0.25, 0] }, 24);
    g.cyl(0.25, 0.3, 1.2, "#b0bec5", { p: [0, 0.6, 0] }, 12);
    g.cyl(0.6, 0.4, 0.2, "#b0bec5", { p: [0, 1.25, 0] }, 16);
    // Trees, benches, lamps.
    const trees: [number, number][] = [[-9, 5], [-9.5, -1.5], [-1.8, -8], [9.5, -1.8], [9, 5], [3.4, 5.6], [-3.6, 5.8], [-7.6, -7.4], [8, -7.6]];
    for (const [x, z] of trees) {
      g.cyl(0.16, 0.22, 1.4, "#8d6e63", { p: [x, 0.7, z] }, 8);
      g.sphere(1.0, "#66bb6a", { p: [x, 2.0, z] }, 10, 8);
      g.sphere(0.7, "#81c784", { p: [x + 0.4, 2.5, z + 0.2] }, 8, 6);
    }
    for (const [x, z, r] of [[-2.6, 4.2, 0.3], [2.6, 4.2, -0.3]] as const) {
      g.box(1.6, 0.1, 0.45, "#a1887f", { p: [x, 0.45, z], r: [0, r, 0] });
      g.box(1.6, 0.4, 0.08, "#a1887f", { p: [x, 0.7, z + 0.2], r: [0, r, 0] });
    }
    for (const [x, z] of [[-5, 4], [5, 4], [-3, -3.8], [3, -3.8]] as const) {
      g.cyl(0.06, 0.08, 2.4, "#546e7a", { p: [x, 1.2, z] }, 8);
      g.sphere(0.22, "#fff9c4", { p: [x, 2.5, z] }, 10, 8);
    }
    this.ground = g.mesh(plazaMat);
    this.scene.add(this.ground);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.05, 24), worldMaterial({ color: new THREE.Color("#7fc8f8"), vertexColors: false }, this.plazaUniforms));
    water.position.set(0, 0.48, 0);
    this.fountainWater = water;
    this.scene.add(water);

    const places = {} as Record<PlaceId, Place>;
    const obstacles: Rect[] = [{ minX: -1.5, maxX: 1.5, minZ: -1.5, maxZ: 1.5 }];
    for (const s of SPECS) {
      const uniforms = makeRestoreUniforms(0.08);
      const group = new THREE.Group();
      const p = new Parts();
      s.build(p);
      group.add(p.mesh(worldMaterial({}, uniforms)));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.55), worldBasicMaterial({ map: signTexture(s.signText, { bg: s.signColor, fg: "#ffffff", border: "#ffffff" }), transparent: true }, uniforms));
      sign.position.set(0, s.id === "zoo" ? 2.7 : 3.05, s.id === "zoo" ? 0.22 : 1.75);
      group.add(sign);
      const [x, z] = s.at;
      group.position.set(x, 0, z);
      group.rotation.y = s.rot;
      this.scene.add(group);
      const fwd = new THREE.Vector3(Math.sin(s.rot), 0, Math.cos(s.rot));
      const door = { x: x + fwd.x * 2.4, z: z + fwd.z * 2.4 };
      const hot = new THREE.Mesh(new THREE.BoxGeometry(5, 4, 4), new THREE.MeshBasicMaterial({ visible: false }));
      hot.position.set(x, 2, z);
      hot.rotation.y = s.rot;
      hot.userData.place = s.id;
      this.scene.add(hot);
      places[s.id] = { id: s.id, name: s.name, ja: s.ja, group, uniforms, door, label: new THREE.Vector3(x, s.id === "zoo" ? 4.2 : 4.6, z), hotspot: hot };
      const half = s.id === "zoo" ? 2.0 : 2.4;
      obstacles.push({ minX: x - half, maxX: x + half, minZ: z - half, maxZ: z + half });
    }
    this.places = places;
    this.nav = new NavMap(BOUNDS, obstacles, 0.3);
  }

  get pickables(): THREE.Object3D[] {
    return Object.values(this.places).map((p) => p.hotspot);
  }

  setPlaceLevel(id: PlaceId, level: number) {
    this.places[id].uniforms.uRestore.value = level;
  }

  setPlazaLevel(level: number) {
    this.plazaUniforms.uRestore.value = level;
  }

  update(t: number) {
    this.fountainWater.position.y = 0.48 + Math.sin(t * 2) * 0.01;
  }
}
