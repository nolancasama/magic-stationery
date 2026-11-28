/**
 * The town: a small neighbourhood (layout in townLayout.ts). A shop row on the
 * main street (Stationery Store, Supermarket, neighbours' houses), the school
 * and its gym behind a schoolyard, and the zoo behind its fence at the edge of
 * town. Each building has its own restoration level, so a restored shop stands
 * in colour on a grey street; each district (shops, campus, zoo) follows its
 * places, and the streets follow the whole town. Restored districts flower,
 * their lamps light, and sports-day flags go up when the festival is ready.
 */
import * as THREE from "three";
import { makeRestoreUniforms, worldBasicMaterial, worldMaterial, type RestoreUniforms } from "../materials.ts";
import type { NavMap } from "../nav.ts";
import { Parts, shade } from "../parts.ts";
import { signTexture } from "../signs.ts";
import * as L from "./townLayout.ts";

export type PlaceId = L.PlaceId;

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

export type District = "street" | "shops" | "campus" | "zoo";

/** What the town shows of the player's progress. */
export interface TownLife {
  progress: Record<PlaceId, number>;
  /** The four places before the gym are restored: the sports festival can start. */
  festivalOpen: boolean;
  festivalDone: boolean;
}

interface PlaceSpec {
  id: PlaceId;
  name: string;
  ja: string;
  label: number;
  build: (p: Parts) => Facade;
  signText: string;
  signColor: string;
  signMax: number;
}

/** The clear section of the front face that can carry a sign. */
interface Facade {
  width: number;
  bottom: number;
  top: number;
  frontZ: number;
}

function house(p: Parts, w: number, h: number, d: number, wall: string, roof: string) {
  p.box(w, h, d, wall, { p: [0, h / 2, 0] });
  p.box(w + 0.3, 0.25, d + 0.3, shade(roof, 0.85), { p: [0, h + 0.12, 0] });
  p.box(w * 0.92, 0.12, 0.05, "#ffffff", { p: [0, 0.06, d / 2 + 0.01] });
  // Leave clearance below the roof overhang for the elevated town camera.
  return { width: w, top: h - 0.12, frontZ: d / 2 };
}

/** A gable roof (ridge along x): a triangular prism from the eaves up. */
function gable(p: Parts, len: number, depth: number, height: number, color: string, x: number, eaveY: number, z: number) {
  const r = depth / Math.sqrt(3);
  const sz = height / (1.5 * r);
  p.cyl(r, r, len, color, { p: [x, eaveY + 0.5 * r * sz, z], r: [-Math.PI / 2, 0, Math.PI / 2], s: [1, 1, sz] }, 3);
}

function tree(p: Parts, x: number, z: number, s: number, kind: "round" | "sakura" | "pine") {
  p.cyl(0.13 * s, 0.19 * s, 1.3 * s, "#8d6e63", { p: [x, 0.65 * s, z] }, 7);
  if (kind === "pine") {
    p.cone(0.95 * s, 1.5 * s, "#4f8f5b", { p: [x, 1.7 * s, z] }, 8);
    p.cone(0.7 * s, 1.2 * s, "#5fa36a", { p: [x, 2.4 * s, z] }, 8);
    return;
  }
  const [a, b] = kind === "sakura" ? ["#f6b8cf", "#fbd3e1"] : ["#66bb6a", "#81c784"];
  p.sphere(0.95 * s, a, { p: [x, 1.85 * s, z] }, 9, 7);
  p.sphere(0.65 * s, b, { p: [x + 0.4 * s, 2.35 * s, z + 0.2 * s] }, 8, 6);
  p.sphere(0.55 * s, b, { p: [x - 0.45 * s, 2.15 * s, z - 0.25 * s] }, 8, 6);
}

/** A neighbour's house: plaster walls, a tiled gable roof, a door and windows facing the street. */
function neighbour(p: Parts, x: number, z: number, w: number, d: number, wall: string, roof: string) {
  const h = 2.3;
  p.box(w, h, d, wall, { p: [x, h / 2, z] });
  gable(p, w + 0.4, d + 0.5, 1.1, roof, x, h, z);
  p.box(0.75, 1.5, 0.06, "#8a6a52", { p: [x - w * 0.25, 0.75, z + d / 2 + 0.02] });
  p.box(0.9, 0.6, 0.06, "#ffffff", { p: [x + w * 0.2, 1.45, z + d / 2 + 0.02] });
  p.box(0.76, 0.48, 0.07, "#cfe8f7", { p: [x + w * 0.2, 1.45, z + d / 2 + 0.025] });
  p.box(w + 0.1, 0.08, 0.1, shade(wall, 0.8), { p: [x, 0.04, z + d / 2 + 0.02] });
}

const SPECS: PlaceSpec[] = [
  {
    id: "store",
    name: "Stationery Store",
    ja: "ぶんぼうぐや",
    label: 4.6,
    signText: "STATIONERY",
    signColor: "#ff8fb1",
    signMax: 2.6,
    build: (p) => {
      const facade = house(p, 4.2, 2.8, 3.2, "#ffe3ec", "#ff8fb1");
      p.box(1.1, 1.9, 0.1, "#a1663f", { p: [0.9, 0.95, 1.62] });
      p.box(1.6, 1.2, 0.08, "#bfe6ff", { p: [-0.9, 1.4, 1.62] });
      p.box(1.8, 0.12, 0.3, "#ff8fb1", { p: [-0.9, 2.1, 1.75] });
      // A display table out front with notebooks.
      p.box(1.2, 0.5, 0.45, "#c99a6e", { p: [-0.9, 0.25, 1.95] });
      for (let i = 0; i < 3; i++) p.box(0.3, 0.05, 0.22, ["#64b5f6", "#ffd54f", "#81c784"][i], { p: [-1.3 + i * 0.4, 0.53, 1.95] });
      // A giant pencil on the roof.
      p.cyl(0.25, 0.25, 2.6, "#ffc928", { p: [0, 3.5, 0], r: [0, 0, Math.PI / 2] }, 6);
      p.cyl(0.05, 0.25, 0.6, "#f3d2a2", { p: [1.6, 3.5, 0], r: [0, 0, -Math.PI / 2] }, 6);
      p.cyl(0.26, 0.26, 0.35, "#c3c9cf", { p: [-1.45, 3.5, 0], r: [0, 0, Math.PI / 2] }, 10);
      p.cyl(0.25, 0.25, 0.3, "#f48fb1", { p: [-1.75, 3.5, 0], r: [0, 0, Math.PI / 2] }, 10);
      return { ...facade, bottom: 2.17 };
    }
  },
  {
    id: "school",
    name: "Classroom",
    ja: "きょうしつ",
    label: 6.6,
    signText: "SCHOOL",
    signColor: "#64b5f6",
    signMax: 2.8,
    build: (p) => {
      // A two-storey school: long, pale, rows of classroom windows, a clock tower.
      const w = 9.4;
      const d = 3.2;
      p.box(w, 4.4, d, "#f5f5f0", { p: [0, 2.2, 0] });
      p.box(w + 0.2, 0.3, d + 0.2, "#d7dde3", { p: [0, 4.55, 0] });
      p.box(w, 0.1, 0.06, "#64b5f6", { p: [0, 2.25, d / 2 + 0.02] });
      for (const x of [-3.4, 3.4]) {
        for (const y of [1.25, 3.25]) {
          for (let i = 0; i < 3; i++) {
            const wx = x - 1.3 + (2.6 / 3) * (i + 0.5);
            p.box(0.7, 0.6, 0.06, "#ffffff", { p: [wx, y, d / 2 + 0.01] });
            p.box(0.56, 0.46, 0.07, "#bfe6ff", { p: [wx, y, d / 2 + 0.015] });
          }
        }
      }
      // Entrance with a canopy.
      p.box(1.6, 2.0, 0.1, "#795548", { p: [0, 1.0, d / 2 + 0.02] });
      p.box(2.4, 0.14, 1.0, "#e0e4e8", { p: [0, 2.15, d / 2 + 0.5] });
      // Clock tower.
      p.box(1.6, 1.8, 1.6, "#f5f5f0", { p: [0, 5.5, 0] });
      p.cone(1.25, 1.0, "#64b5f6", { p: [0, 6.9, 0] }, 4);
      p.cyl(0.5, 0.5, 0.08, "#ffffff", { p: [0, 5.55, 0.81], r: [Math.PI / 2, 0, 0] }, 20);
      p.box(0.05, 0.34, 0.02, "#37474f", { p: [0, 5.66, 0.86] });
      p.box(0.24, 0.05, 0.02, "#37474f", { p: [0.1, 5.55, 0.86] });
      return { width: 2.0, bottom: 2.6, top: 3.0, frontZ: d / 2 + 0.01 };
    }
  },
  {
    id: "zoo",
    name: "Zoo",
    ja: "どうぶつえん",
    label: 4.2,
    signText: "ZOO",
    signColor: "#66bb6a",
    signMax: 2.6,
    build: (p) => {
      for (const sx of [-1, 1]) {
        p.box(0.6, 3.2, 0.6, "#8d6e63", { p: [sx * 1.6, 1.6, 0] });
        p.sphere(0.45, "#66bb6a", { p: [sx * 1.6, 3.4, 0] }, 10, 8);
      }
      const beam = { width: 3.8, height: 0.7, depth: 0.4, y: 2.7 };
      p.box(beam.width, beam.height, beam.depth, "#a1887f", { p: [0, beam.y, 0] });
      // The fence runs from the edge of town to the lane (gate at local x 0).
      const left = L.BOUNDS.minX - L.PLACES.zoo.at.x;
      const right = L.LANE.minX - 0.4 - L.PLACES.zoo.at.x;
      for (const [a, b] of [[left, -1.9], [1.9, right]] as const) {
        for (let x = a; x <= b + 1e-6; x += 0.5) p.box(0.12, 1.2, 0.12, "#a1887f", { p: [x, 0.6, -0.1] });
        p.box(b - a, 0.1, 0.08, "#8d6e63", { p: [(a + b) / 2, 1.0, -0.1] });
        p.box(b - a, 0.1, 0.08, "#8d6e63", { p: [(a + b) / 2, 0.4, -0.1] });
      }
      // Greenery behind the fence, and a giraffe looking over it.
      for (const [x, z, s] of [[-5.5, -2.0, 1.5], [-2.8, -3.4, 1.7], [3.2, -2.8, 1.6], [5.6, -1.8, 1.2], [0.6, -4.0, 1.9]] as const) {
        p.cyl(0.18, 0.22, 1.6, "#8d6e63", { p: [x, 0.8, z] }, 8);
        p.sphere(s, "#81c784", { p: [x, 2.3, z] }, 10, 8);
      }
      p.sphere(0.8, "#9e9e9e", { p: [-3.8, 0.4, -1.2] }, 9, 6);
      const gx = 2.6;
      const gz = -1.3;
      p.rbox(1.3, 0.8, 0.6, 0.2, "#f4c35a", { p: [gx, 1.6, gz - 0.2] });
      for (const [lx, lz] of [[-0.45, -0.4], [0.45, -0.4], [-0.45, 0.0], [0.45, 0.0]]) p.cyl(0.07, 0.07, 1.3, "#e8b04a", { p: [gx + lx, 0.65, gz + lz] }, 6);
      p.cyl(0.13, 0.18, 1.9, "#f4c35a", { p: [gx + 0.45, 2.75, gz + 0.05], r: [0.25, 0, -0.25] }, 8);
      p.rbox(0.55, 0.3, 0.32, 0.1, "#f4c35a", { p: [gx + 0.75, 3.7, gz + 0.35] });
      for (const s of [-1, 1]) {
        p.cyl(0.03, 0.03, 0.2, "#8d5a2b", { p: [gx + 0.65 + s * 0.08, 3.92, gz + 0.3] }, 5);
        p.sphere(0.035, "#263238", { p: [gx + 0.75 + s * 0.15, 3.76, gz + 0.5] }, 6, 4);
      }
      for (const [x, y, z] of [[-0.3, 1.8, 0.11], [0.2, 1.5, 0.11], [0.4, 1.85, 0.11], [0.45, 2.5, 0.25], [0.5, 3.0, 0.15]]) p.sphere(0.1, "#b5762f", { p: [gx + x, y, gz + z] }, 6, 4);
      return { width: beam.width, bottom: beam.y - beam.height / 2, top: beam.y + beam.height / 2, frontZ: beam.depth / 2 };
    }
  },
  {
    id: "market",
    name: "Supermarket",
    ja: "スーパー",
    label: 4.2,
    signText: "SUPERMARKET",
    signColor: "#43a047",
    signMax: 3.8,
    build: (p) => {
      const facade = house(p, 5.0, 3.24, 3.4, "#fff8e1", "#43a047");
      for (let i = 0; i < 8; i++) p.box(0.62, 0.5, 0.7, i % 2 ? "#ffffff" : "#43a047", { p: [-2.2 + i * 0.63, 2.15, 1.95], r: [0.5, 0, 0] });
      p.box(3.2, 1.4, 0.08, "#bfe6ff", { p: [-0.6, 1.1, 1.72] });
      p.box(1.0, 1.9, 0.1, "#9e9e9e", { p: [1.8, 0.95, 1.72] });
      // A fruit stand on the pavement.
      p.box(1.6, 0.6, 0.6, "#a1887f", { p: [-1.2, 0.3, 2.05], r: [-0.15, 0, 0] });
      for (let i = 0; i < 5; i++) p.sphere(0.12, ["#ef5350", "#ffa726", "#ef5350", "#66bb6a", "#ffa726"][i], { p: [-1.8 + i * 0.3, 0.68, 2.1] }, 8, 6);
      return { ...facade, bottom: 2.57 };
    }
  },
  {
    id: "gym",
    name: "Gym",
    ja: "たいいくかん",
    label: 4.8,
    signText: "GYM",
    signColor: "#ff7043",
    signMax: 2.6,
    build: (p) => {
      p.box(4.6, 2.6, 3.6, "#e3f2fd", { p: [0, 1.3, 0] });
      // A half barrel roof (a whole cylinder would cover the door with its end).
      p.add(new THREE.CylinderGeometry(2.3, 2.3, 4.0, 16, 1, false, Math.PI / 2, Math.PI), "#ff7043", { p: [0, 2.6, 0], r: [Math.PI / 2, 0, 0] });
      const fascia = { width: 4.7, height: 0.5, depth: 4.1, y: 2.6 };
      p.box(fascia.width, fascia.height, fascia.depth, "#e3f2fd", { p: [0, fascia.y, 0] });
      p.box(1.4, 2.0, 0.1, "#607d8b", { p: [0, 1.0, 1.82] });
      p.sphere(0.5, "#ff9800", { p: [1.7, 3.8, 1.2] }, 12, 10);
      return { width: fascia.width, bottom: fascia.y - fascia.height / 2, top: fascia.y + fascia.height / 2, frontZ: fascia.depth / 2 };
    }
  }
];

export class TownArea {
  readonly scene = new THREE.Scene();
  readonly places: Record<PlaceId, Place>;
  readonly nav: NavMap;
  /** The walkable ground (click to walk). */
  readonly ground: THREE.Mesh;
  readonly districts: Record<District, RestoreUniforms> = {
    street: makeRestoreUniforms(0.1),
    shops: makeRestoreUniforms(0.1),
    campus: makeRestoreUniforms(0.1),
    zoo: makeRestoreUniforms(0.1)
  };
  /** Things that appear with progress. */
  private flowers: Record<"shops" | "campus" | "zoo" | "park", THREE.Object3D>;
  private festival: THREE.Group;
  private balloons: THREE.Group;
  private lamps: THREE.Mesh;

  constructor() {
    this.scene.background = new THREE.Color("#c9d6e3");
    this.scene.fog = new THREE.Fog("#c9d6e3", 26, 58);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#9fb08f", 2.0));
    const sun = new THREE.DirectionalLight("#fff4e0", 2.0);
    sun.position.set(-6, 12, 8);
    this.scene.add(sun);

    const parts: Record<District, Parts> = { street: new Parts(), shops: new Parts(), campus: new Parts(), zoo: new Parts() };
    this.buildGround(parts.street, parts.campus, parts.zoo);
    this.buildStreetThings(parts.street, parts.shops);
    this.buildPark(parts.street);
    this.buildCampus(parts.campus);
    for (const d of Object.keys(parts) as District[]) this.scene.add(parts[d].mesh(worldMaterial({}, this.districts[d])));

    const flowerParts = { shops: new Parts(), campus: new Parts(), zoo: new Parts(), park: new Parts() };
    for (const [x, z, w, d, where] of L.BEDS) {
      const n = Math.max(3, Math.round(w / 0.3));
      for (let i = 0; i < n; i++) {
        const fx = x - w / 2 + (w / n) * (i + 0.5);
        for (const fz of d > 0.6 ? [z - d / 4, z + d / 4] : [z]) {
          flowerParts[where].sphere(0.1, ["#ff7aa2", "#ffd54f", "#ffffff", "#ba68c8"][(i + Math.round(fz * 3)) & 3], { p: [fx, 0.42, fz] }, 6, 4);
        }
      }
    }
    const flowerUniform: Record<keyof typeof flowerParts, District> = { shops: "shops", campus: "campus", zoo: "zoo", park: "street" };
    this.flowers = {} as typeof this.flowers;
    for (const k of Object.keys(flowerParts) as (keyof typeof flowerParts)[]) {
      const m = flowerParts[k].mesh(worldMaterial({}, this.districts[flowerUniform[k]]));
      m.visible = false;
      this.flowers[k] = m;
      this.scene.add(m);
    }

    // Street lamps on the poles: they light up as the shops come back.
    const lampParts = new Parts();
    for (const x of L.POLES) lampParts.box(0.3, 0.12, 0.2, "#fff3b0", { p: [x, 3.62, L.POLE_Z + 0.6] });
    this.lamps = lampParts.mesh(worldBasicMaterial({}, this.districts.shops));
    this.scene.add(this.lamps);

    this.festival = this.buildFestival();
    this.festival.visible = false;
    this.scene.add(this.festival);
    this.balloons = this.buildBalloons();
    this.balloons.visible = false;
    this.scene.add(this.balloons);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(L.BOUNDS.maxX - L.BOUNDS.minX + 8, L.BOUNDS.maxZ - L.BOUNDS.minZ + 6), new THREE.MeshBasicMaterial({ visible: false }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((L.BOUNDS.minX + L.BOUNDS.maxX) / 2, 0, (L.BOUNDS.minZ + L.BOUNDS.maxZ) / 2);
    this.ground = ground;
    this.scene.add(ground);

    const places = {} as Record<PlaceId, Place>;
    for (const s of SPECS) {
      const lay = L.PLACES[s.id];
      const uniforms = makeRestoreUniforms(0.08);
      const group = new THREE.Group();
      const p = new Parts();
      const facade = s.build(p);
      group.add(p.mesh(worldMaterial({}, uniforms)));
      const width = Math.min(facade.width * 0.82, s.signMax);
      const height = Math.min(0.55, facade.top - facade.bottom - 0.06);
      const map = signTexture(s.signText, { w: 512, h: Math.round(512 * height / width), bg: s.signColor, fg: "#ffffff", border: "#ffffff" });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(width, height), worldBasicMaterial({ map, transparent: true }, uniforms));
      sign.position.set(0, (facade.bottom + facade.top) / 2, facade.frontZ + 0.035);
      group.add(sign);
      group.position.set(lay.at.x, 0, lay.at.z);
      this.scene.add(group);
      const hot = new THREE.Mesh(
        s.id === "zoo" ? new THREE.BoxGeometry(5.2, 4, 2.4) : new THREE.BoxGeometry(lay.w + 0.4, s.label - 0.6, lay.d + 0.4),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hot.position.set(lay.at.x, s.id === "zoo" ? 2 : (s.label - 0.6) / 2, lay.at.z);
      hot.userData.place = s.id;
      this.scene.add(hot);
      places[s.id] = { id: s.id, name: s.name, ja: s.ja, group, uniforms, door: { ...lay.door }, label: new THREE.Vector3(lay.at.x, s.label, lay.at.z), hotspot: hot };
    }
    this.places = places;
    this.nav = L.townNav();
  }

  // ------------------------------------------------------------ building
  private buildGround(street: Parts, campus: Parts, zoo: Parts) {
    const flat = (p: Parts, r: L.P2 & { w: number; d: number }, y: number, color: string) => p.box(r.w, 0.04, r.d, color, { p: [r.x, y, r.z] });
    const area = (r: { minX: number; maxX: number; minZ: number; maxZ: number }) => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2, w: r.maxX - r.minX, d: r.maxZ - r.minZ });
    // Grass beyond the town fades into the fog.
    street.box(110, 0.4, 90, "#86c06c", { p: [0, -0.2, -4] });
    // Main street, pavements, kerbs and the centre line.
    flat(street, area({ minX: -60, maxX: 60, minZ: L.STREET.minZ, maxZ: L.STREET.maxZ }), 0.01, "#9aa1a8");
    for (let x = -40; x < 40; x += 2.4) street.box(1.3, 0.02, 0.12, "#f2f2ee", { p: [x, 0.035, L.STREET.z] });
    flat(street, area({ minX: -60, maxX: 60, ...L.PAVEMENT.north }), 0.03, "#e3dccd");
    flat(street, area({ minX: -60, maxX: 60, ...L.PAVEMENT.south }), 0.03, "#e3dccd");
    for (const z of [L.STREET.minZ, L.STREET.maxZ]) street.box(120, 0.1, 0.14, "#c9c2b4", { p: [0, 0.05, z] });
    // Crosswalk at the lane.
    for (let z = L.STREET.minZ + 0.35; z < L.STREET.maxZ - 0.2; z += 0.6) street.box(2.4, 0.02, 0.34, "#ffffff", { p: [L.LANE.x, 0.04, z] });
    // The lane, the zoo forecourt and the park path.
    flat(street, area({ minX: L.LANE.minX, maxX: L.LANE.maxX, minZ: -13.4, maxZ: L.PAVEMENT.north.minZ }), 0.02, "#e8dcc6");
    flat(zoo, area(L.ZOO_FORECOURT), 0.025, "#e8d9bd");
    const fc = L.ZOO_FORECOURT;
    for (const z of [fc.minZ + 0.15, fc.maxZ - 0.15]) zoo.box(fc.maxX - fc.minX, 0.03, 0.3, "#cdb48c", { p: [(fc.minX + fc.maxX) / 2, 0.04, z] });
    flat(street, area(L.PARK_PATH), 0.02, "#e8dcc6");
    // Paths from the pavement to the doors (round the backs of the shop row).
    flat(street, { x: L.PLACES.store.door.x, z: 4.45, w: 1.4, d: 0.5 }, 0.035, "#d8cfbd");
    flat(street, { x: L.PLACES.market.door.x, z: 4.45, w: 1.4, d: 0.5 }, 0.035, "#d8cfbd");
    // The schoolyard: packed earth with a white running track.
    flat(campus, area(L.SCHOOLYARD), 0.02, "#e4cfa3");
    flat(campus, area({ minX: L.SCHOOLYARD.minX, maxX: L.SCHOOLYARD.maxX, minZ: -11.9, maxZ: L.SCHOOLYARD.minZ }), 0.022, "#e8dcc6");
    for (const [rx, rz] of [[L.TRACK.rx, L.TRACK.rz], [L.TRACK.rx + 0.9, L.TRACK.rz + 0.9]]) {
      campus.add(new THREE.RingGeometry(rx - 0.06, rx + 0.06, 48), "#ffffff", { p: [L.TRACK.x, 0.045, L.TRACK.z], r: [-Math.PI / 2, 0, 0], s: [1, rz / rx, 1] });
    }
    // The town's far edge: low hills, so the horizon is not a flat line.
    for (const [x, z, s] of [[-28, -22, 9], [-8, -26, 11], [14, -24, 10], [32, -18, 8]] as const) street.sphere(s, "#9ccf86", { p: [x, -s * 0.55, z] }, 14, 8);
  }

  private buildStreetThings(street: Parts, shops: Parts) {
    for (const [x, z, w, d, wall, roof] of L.HOUSES) neighbour(shops, x, z, w, d, wall, roof);
    for (const [x, z, w, d, wall, roof] of L.FAR_HOUSES) {
      neighbour(street, x, z, w, d, wall, roof);
      // Low garden walls in front (they face away: the camera sees their backs).
      street.box(w + 1.2, 0.6, 0.2, "#cfc6b6", { p: [x, 0.3, z - d / 2 - 0.5] });
    }
    // Utility poles with wires, Japanese-street style; a lamp arm over the pavement.
    for (const x of L.POLES) {
      street.cyl(0.08, 0.1, 4.6, "#9e9a92", { p: [x, 2.3, L.POLE_Z] }, 8);
      street.box(0.9, 0.07, 0.07, "#8d8a83", { p: [x, 4.3, L.POLE_Z] });
      street.box(0.05, 0.05, 0.6, "#6f6c66", { p: [x, 3.7, L.POLE_Z + 0.3] });
    }
    for (let i = 0; i + 1 < L.POLES.length; i++) {
      const a = L.POLES[i];
      const b = L.POLES[i + 1];
      for (const dx of [-0.5, 0.5]) street.box(b - a, 0.025, 0.025, "#4a4a4a", { p: [(a + b) / 2 + dx * 0, 4.35, L.POLE_Z + dx * 0.08] });
    }
    for (const x of [L.POLES[0], L.POLES[L.POLES.length - 1]]) {
      const end = x < 0 ? -40 : 40;
      street.box(Math.abs(end - x), 0.025, 0.025, "#4a4a4a", { p: [(x + end) / 2, 4.35, L.POLE_Z] });
    }
    // Vending machines and bicycles by the store.
    for (const [i, v] of L.VENDING.entries()) {
      shops.box(0.7, 1.7, 0.55, i ? "#e53935" : "#1e88e5", { p: [v.x, 0.85, v.z] });
      shops.box(0.5, 0.7, 0.04, "#e3f2fd", { p: [v.x, 1.15, v.z + 0.28] });
      for (let k = 0; k < 4; k++) shops.box(0.08, 0.18, 0.03, ["#ffd54f", "#ef5350", "#66bb6a", "#ffffff"][k], { p: [v.x - 0.18 + k * 0.12, 1.2, v.z + 0.31] });
    }
    for (const [x, z, r] of L.BIKES) {
      for (const dz of [-0.42, 0.42]) shops.torus(0.28, 0.03, "#37474f", { p: [x, 0.3, z + dz], r: [0, Math.PI / 2 + r, 0] }, Math.PI * 2, 4, 14);
      shops.box(0.04, 0.04, 0.8, "#e53935", { p: [x, 0.5, z], r: [0, r, 0] });
      shops.box(0.04, 0.4, 0.04, "#e53935", { p: [x, 0.6, z - 0.2] });
      shops.box(0.16, 0.05, 0.22, "#263238", { p: [x, 0.82, z - 0.22] });
      shops.box(0.4, 0.04, 0.04, "#90a4ae", { p: [x, 0.85, z + 0.36] });
      shops.box(0.28, 0.18, 0.2, "#90a4ae", { p: [x, 0.7, z + 0.5] });
    }
    // Bus stop on the far pavement.
    const s = L.BUS_STOP;
    street.box(1.6, 0.08, 0.4, "#78909c", { p: [s.x, 0.42, s.z + 0.05] });
    for (const dx of [-0.65, 0.65]) street.box(0.06, 0.42, 0.3, "#607d8b", { p: [s.x + dx, 0.21, s.z + 0.05] });
    street.cyl(0.04, 0.04, 2.3, "#90a4ae", { p: [s.x + 1.1, 1.15, s.z - 0.15] }, 6);
    street.cyl(0.25, 0.25, 0.05, "#1e88e5", { p: [s.x + 1.1, 2.3, s.z - 0.15], r: [Math.PI / 2, 0, 0] }, 16);
    // Shop-row hedge stubs between the houses and the park.
    street.box(0.4, 0.7, 0.6, "#5b9b56", { p: [-16.8, 0.35, 0.9] });
  }

  private buildPark(p: Parts) {
    for (const [x, z, s, kind] of [...L.TREES, ...L.BACK_TREES]) tree(p, x, z, s, kind);
    for (const [x, z, r] of L.BENCHES) {
      p.box(1.5, 0.08, 0.42, "#a1887f", { p: [x, 0.42, z], r: [0, r, 0] });
      const bx = x - Math.sin(r) * 0.2;
      const bz = z - Math.cos(r) * 0.2;
      p.box(1.5, 0.36, 0.06, "#a1887f", { p: [bx, 0.7, bz], r: [0, r, 0] });
      for (const s of [-0.62, 0.62]) p.box(0.06, 0.42, 0.36, "#6d4c41", { p: [x + Math.cos(r) * s, 0.21, z - Math.sin(r) * s], r: [0, r, 0] });
    }
    for (const [x, z, w, d] of L.BEDS) p.box(w, 0.32, d, "#8d6e63", { p: [x, 0.16, z] }).box(w - 0.1, 0.06, d - 0.1, "#6d8f4e", { p: [x, 0.33, z] });
    // Sandbox and a slide.
    const sb = L.SANDBOX;
    p.box(1.8, 0.2, 1.8, "#bca07a", { p: [sb.x, 0.1, sb.z] }).box(1.6, 0.05, 1.6, "#f1dfb2", { p: [sb.x, 0.21, sb.z] });
    const sl = L.SLIDE;
    p.box(0.6, 1.4, 0.5, "#ef5350", { p: [sl.x, 0.7, sl.z - 0.8] });
    p.box(0.5, 0.06, 1.8, "#ffd54f", { p: [sl.x, 0.75, sl.z + 0.25], r: [0.62, 0, 0] });
    // A little shrine at the top of the lane.
    const sx = L.LANE.x;
    const sz = -12.6;
    for (const dx of [-0.75, 0.75]) p.cyl(0.08, 0.09, 1.9, "#e0452b", { p: [sx + dx, 0.95, sz + 0.6] }, 8);
    p.box(2.1, 0.13, 0.18, "#e0452b", { p: [sx, 1.95, sz + 0.6] }).box(2.4, 0.1, 0.22, "#37302c", { p: [sx, 2.07, sz + 0.6] });
    p.box(1.7, 0.1, 0.12, "#e0452b", { p: [sx, 1.62, sz + 0.6] });
    p.box(1.1, 0.9, 0.9, "#c7a77f", { p: [sx, 0.65, sz - 0.4] });
    gable(p, 1.5, 1.4, 0.55, "#4e5a66", sx, 1.1, sz - 0.4);
    for (const dx of [-1.3, 1.3]) p.cyl(0.12, 0.16, 0.8, "#b0aaa2", { p: [sx + dx, 0.4, sz + 0.8] }, 6).box(0.32, 0.25, 0.32, "#c7c1b8", { p: [sx + dx, 0.92, sz + 0.8] });
  }

  private buildCampus(p: Parts) {
    // Fence along the lane, with gate posts and a name plate.
    const fx = -0.6;
    for (const [a, b] of [[-11.9, L.SCHOOL_GATE.minZ], [L.SCHOOL_GATE.maxZ, 0.6]] as const) {
      p.box(0.06, 1.0, b - a, "#9fb3bf", { p: [fx, 0.9, (a + b) / 2] });
      for (let z = a; z <= b + 1e-6; z += 1.2) p.box(0.08, 1.4, 0.08, "#78909c", { p: [fx, 0.7, z] });
      p.box(0.18, 0.3, b - a, "#c2b8a8", { p: [fx, 0.15, (a + b) / 2] });
    }
    for (const z of [L.SCHOOL_GATE.minZ, L.SCHOOL_GATE.maxZ]) p.box(0.5, 1.6, 0.5, "#cfc6b6", { p: [fx, 0.8, z] });
    // Hedge between the schoolyard and the shop row.
    p.box(L.BOUNDS.maxX - fx + 2, 0.8, 0.7, "#5b9b56", { p: [(fx + L.BOUNDS.maxX + 2) / 2, 0.4, -0.1] });
    // Horizontal bars and a goal.
    const b = L.BARS;
    for (const dx of [-0.8, 0, 0.8]) p.cyl(0.04, 0.04, 1.2, "#90a4ae", { p: [b.x + dx, 0.6, b.z] }, 6);
    p.cyl(0.025, 0.025, 1.6, "#cfd8dc", { p: [b.x, 1.05, b.z], r: [0, 0, Math.PI / 2] }, 6);
    const g = L.GOAL;
    for (const dz of [-1.0, 1.0]) p.cyl(0.05, 0.05, 1.3, "#ffffff", { p: [g.x, 0.65, g.z + dz] }, 6);
    p.cyl(0.05, 0.05, 2.0, "#ffffff", { p: [g.x, 1.3, g.z], r: [Math.PI / 2, 0, 0] }, 6);
    p.box(0.6, 1.2, 1.9, "#e0e0e0", { p: [g.x + 0.35, 0.65, g.z] });
    // Flag poles for sports day stand all year.
    for (const [a, c] of L.BUNTING) for (const e of [a, c]) p.cyl(0.05, 0.05, L.BUNTING_Y + 0.3, "#b0bec5", { p: [e.x, (L.BUNTING_Y + 0.3) / 2, e.z] }, 6);
  }

  /** Sports-day flags across the schoolyard and a banner on the school. */
  private buildFestival(): THREE.Group {
    const g = new THREE.Group();
    const p = new Parts();
    const colors = ["#e53935", "#fdd835", "#1e88e5", "#43a047", "#ffffff", "#fb8c00", "#8e24aa"];
    for (const [a, c] of L.BUNTING) {
      const len = Math.hypot(c.x - a.x, c.z - a.z);
      const n = Math.floor(len / 0.55);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const sag = Math.sin(Math.PI * t) * 0.6;
        const x = a.x + (c.x - a.x) * t;
        const z = a.z + (c.z - a.z) * t;
        if (i < n) p.box(len / n, 0.02, 0.02, "#eeeeee", { p: [x + (c.x - a.x) / n / 2, L.BUNTING_Y - sag - 0.03, z] });
        if (i > 0 && i < n) p.box(0.32, 0.24, 0.02, colors[i % colors.length], { p: [x, L.BUNTING_Y - sag - 0.17, z] });
      }
    }
    g.add(p.mesh(worldMaterial({}, this.districts.campus)));
    const school = L.PLACES.school;
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 0.62),
      worldBasicMaterial({ map: signTexture("SPORTS DAY  うんどうかい", { w: 1024, h: 152, bg: "#e53935", fg: "#ffffff", border: "#fff59d" }), transparent: true }, this.districts.campus)
    );
    banner.position.set(school.at.x - 3.2, 3.9, school.at.z + school.d / 2 + 0.06);
    g.add(banner);
    return g;
  }

  /** Balloons tied to the zoo gate once the zoo is back. */
  private buildBalloons(): THREE.Group {
    const g = new THREE.Group();
    const z = L.PLACES.zoo;
    for (const [i, sx] of [-1, 1].entries()) {
      const p = new Parts();
      for (const [k, [dx, dy, c]] of ([[-0.25, 0.15, "#ef5350"], [0.2, 0.35, "#ffd54f"], [0, 0.7, "#42a5f5"]] as const).entries()) {
        p.sphere(0.24, c, { p: [dx, dy, 0] }, 10, 8);
        p.box(0.01, 0.6 + dy, 0.01, "#eeeeee", { p: [dx * 0.5, dy - 0.45 - k * 0.02, 0] });
      }
      const m = p.mesh(worldMaterial({}, this.districts.zoo));
      m.position.set(z.at.x + sx * 1.6, 4.1, z.at.z + 0.35);
      m.userData.phase = i * 1.7;
      g.add(m);
    }
    return g;
  }

  // ------------------------------------------------------------ progress
  get pickables(): THREE.Object3D[] {
    return Object.values(this.places).map((p) => p.hotspot);
  }

  setPlaceLevel(id: PlaceId, level: number) {
    this.places[id].uniforms.uRestore.value = level;
  }

  /** Districts, streets and the town's extras follow restoration. */
  setLife(life: TownLife) {
    const p = life.progress;
    const level = (v: number) => 0.1 + 0.9 * v;
    const shops = (p.store + p.market) / 2;
    const campus = (p.school + p.gym) / 2;
    const all = (p.store + p.school + p.zoo + p.market + p.gym) / 5;
    this.districts.shops.uRestore.value = level(shops);
    this.districts.campus.uRestore.value = level(campus);
    this.districts.zoo.uRestore.value = level(p.zoo);
    this.districts.street.uRestore.value = level(all);
    this.flowers.shops.visible = shops >= 0.5;
    this.flowers.campus.visible = campus >= 0.5;
    this.flowers.zoo.visible = p.zoo >= 1;
    this.flowers.park.visible = all >= 0.4;
    this.lamps.visible = true;
    this.festival.visible = life.festivalOpen || life.festivalDone;
    this.balloons.visible = p.zoo >= 1;
  }

  /** The map view sees the whole town: push the fog back. */
  setMapMode(on: boolean) {
    const fog = this.scene.fog as THREE.Fog;
    fog.near = on ? 45 : 26;
    fog.far = on ? 95 : 58;
  }

  update(t: number) {
    if (!this.balloons.visible) return;
    for (const b of this.balloons.children) b.position.y = 4.1 + Math.sin(t * 1.3 + (b.userData.phase as number)) * 0.08;
  }
}
