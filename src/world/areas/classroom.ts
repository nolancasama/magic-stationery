/**
 * Level 2: Ms. Mori's classroom, the same diorama shape as the shop (front
 * wall cut away, door in the right wall). Erased: no desks or chairs (faint
 * outlines mark their places), a clock with no numbers or hands, and four
 * blank cards in the alphabet strip.
 *
 * The clock face and the alphabet strip are each ONE canvas texture (26 cards
 * as one mesh: Chromebook draw-call budget). The child's handwriting is
 * painted into them in its own colours.
 */
import * as THREE from "three";
import { artToDrawing, type Art } from "../../draw/art.ts";
import { renderDrawing } from "../../draw/drawing.ts";
import { WORD_KINDS } from "../../objects/registry.ts";
import type { WordId } from "../../recognition/vocab.ts";
import { GLYPH_CHARS, type GlyphKey } from "../../game/save.ts";
import { ghostMaterial, lampMat, worldBasicMaterial, worldMat } from "../materials.ts";
import { NavMap, type Rect } from "../nav.ts";
import { Parts, mix } from "../parts.ts";
import { signTexture } from "../signs.ts";
import type { Anchor, RoomArea, Slot, View, WriteSpot } from "./room.ts";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const e = (x = 0, y = 0, z = 0) => new THREE.Euler(x, y, z);

export const ROOM: Rect = { minX: -4.45, maxX: 4.45, minZ: -2.95, maxZ: 2.95 };
export const DOOR = { x: 4.25, z: 1.7, outsideX: 5.6 };
export const MORI_SPOT = { x: -3.0, z: -2.35 };

/** Student places: desk centre (the chair is just behind, towards the camera). */
export const SEATS: { x: number; z: number }[] = [
  { x: -0.35, z: -0.75 },
  { x: 1.75, z: -0.75 },
  { x: -0.35, z: 0.95 },
  { x: 1.75, z: 0.95 }
];
const CHAIR_DZ = 0.5;

/** The wall clock. */
export const CLOCK = { x: 3.1, y: 1.85, z: -2.97, r: 0.62 };
/** The alphabet strip above the blackboard. */
const STRIP = { y: 2.98, z: -2.98, card: 0.27, gap: 0.03 };
const LETTERS = "abcdefghijklmnopqrstuvwxyz";
export const MISSING: Record<string, GlyphKey> = { d: "ld", g: "lg", m: "lm", t: "lt" };

const OBSTACLES: Rect[] = [
  { minX: -3.95, maxX: -2.05, minZ: -1.75, maxZ: -1.05 }, // teacher's desk
  { minX: -4.45, maxX: -3.85, minZ: -0.1, maxZ: 2.6 }, // cubbies
  { minX: 3.55, maxX: 4.45, minZ: -2.95, maxZ: -2.15 }, // plant corner
  ...SEATS.map((s) => ({ minX: s.x - 0.42, maxX: s.x + 0.42, minZ: s.z - 0.3, maxZ: s.z + 0.28 }))
];

export const VIEWS: RoomArea["views"] = {
  overview: { pos: v(0.25, 6.7, 9.7), look: v(0.15, 1.3, -0.95) },
  door: { pos: v(1.6, 2.6, 4.6), look: v(3.6, 1.0, 1.4) },
  teacher: { pos: v(-1.2, 2.7, 1.6), look: v(-3.0, 1.2, -2.0) },
  board: { pos: v(0.0, 2.6, 2.6), look: v(0.0, 2.1, -2.9) },
  strip: { pos: v(0.0, 3.0, 2.2), look: v(0.0, 2.75, -2.95) },
  clock: { pos: v(2.3, 2.3, 0.9), look: v(3.1, 1.85, -2.95) },
  desks: { pos: v(0.9, 3.6, 5.0), look: v(0.8, 0.5, 0.0) },
  class: { pos: v(0.4, 3.2, 4.9), look: v(0.0, 1.2, -1.4) }
};

export class ClassroomArea implements RoomArea {
  readonly scene = new THREE.Scene();
  readonly bounds = ROOM;
  readonly door = DOOR;
  readonly views = VIEWS;
  readonly hostSpot = { x: MORI_SPOT.x, z: MORI_SPOT.z, facing: 0 };
  readonly ambientSpots: [number, number, string | null][] = [
    [3.0, -2.0, "n3"],
    [0.6, -2.2, "lm"],
    [-1.2, -2.2, "ld"],
    [0.7, 2.2, null],
    [-2.4, 0.3, null],
    [2.9, 0.2, null]
  ];
  readonly nav: NavMap;
  readonly slots: Record<"desks" | "chairs", Slot>;
  readonly spots: Record<string, WriteSpot> = {};
  readonly floor: THREE.Mesh;
  readonly solids: THREE.Object3D[] = [];
  private doorLeaf: THREE.Group;
  private sign: THREE.Mesh;
  private windowMat: THREE.MeshBasicMaterial;
  private clockCanvas = document.createElement("canvas");
  private clockTex: THREE.CanvasTexture;
  private stripCanvas = document.createElement("canvas");
  private stripTex: THREE.CanvasTexture;
  private hands: THREE.Group;
  private hourHand: THREE.Object3D;
  private minuteHand: THREE.Object3D;
  private glyphArt: Partial<Record<GlyphKey, Art>> = {};
  private clockFull = false;
  private bellRing = 0;
  private bell: THREE.Object3D;

  constructor() {
    this.scene.background = new THREE.Color("#263a4a");
    this.scene.add(new THREE.HemisphereLight("#f6fbff", "#a89a86", 1.9));
    const sun = new THREE.DirectionalLight("#ffffff", 1.9);
    sun.position.set(-4, 9, 7);
    this.scene.add(sun);
    this.nav = new NavMap(ROOM, OBSTACLES, 0.28);
    this.floor = this.buildRoom();
    this.buildBoard();
    this.buildTeacherDesk();
    this.buildCubbies();
    this.doorLeaf = this.buildDoor();
    const { sign, glassMat, bell } = this.buildDecor();
    this.sign = sign;
    this.windowMat = glassMat;
    this.bell = bell;
    this.clockTex = this.buildClock();
    const hands = this.buildHands();
    this.hands = hands.group;
    this.hourHand = hands.hour;
    this.minuteHand = hands.minute;
    this.stripTex = this.buildStrip();
    this.slots = this.buildSlots();
    this.buildWriteSpots();
    this.paintClock();
    this.paintStrip();
    this.setTime(8, 0, false);
  }

  private solid(m: THREE.Object3D) {
    this.scene.add(m);
    this.solids.push(m);
  }

  // ------------------------------------------------------------------ room
  private buildRoom(): THREE.Mesh {
    const p = new Parts();
    p.box(9.4, 0.36, 6.4, "#5d4a3d", { p: [0, -0.18, 0] });
    // Light classroom floorboards.
    for (let i = 0; i < 16; i++) {
      const x = -4.5 + 0.28 + i * 0.5625;
      p.box(0.55, 0.02, 6.0, i % 2 ? "#e2bd8a" : "#dcb582", { p: [x, 0.01, 0] });
    }
    // Back wall: cream above, pale green wainscot below.
    p.box(9.2, 3.5, 0.2, "#f6f0dc", { p: [0, 1.75, -3.1] });
    p.box(9.2, 0.95, 0.04, "#cfe3cf", { p: [0, 0.475, -2.99] });
    p.box(9.2, 0.06, 0.06, "#9cb79c", { p: [0, 0.95, -2.97] });
    p.box(9.2, 0.14, 0.12, "#a7c4a7", { p: [0, 3.43, -2.97] });
    // Left wall (windows, cubbies) and right wall with the door gap (z 1.0 - 2.4).
    p.box(0.2, 3.5, 6.2, "#f1ead4", { p: [-4.6, 1.75, 0] });
    p.box(0.04, 0.95, 6.0, "#cfe3cf", { p: [-4.49, 0.475, 0] });
    p.box(0.2, 3.5, 4.0, "#f1ead4", { p: [4.6, 1.75, -1.0] });
    p.box(0.2, 3.5, 0.55, "#f1ead4", { p: [4.6, 1.75, 2.72] });
    p.box(0.2, 1.0, 1.45, "#f1ead4", { p: [4.6, 3.0, 1.7] });
    p.box(0.04, 0.95, 4.0, "#cfe3cf", { p: [4.49, 0.475, -1.0] });
    // The teacher's platform in front of the board.
    p.box(5.2, 0.12, 1.0, "#c99a62", { p: [-0.3, 0.06, -2.45] });
    p.box(5.2, 0.02, 0.04, "#a77a48", { p: [-0.3, 0.12, -1.96] });
    const mesh = p.mesh(worldMat);
    this.scene.add(mesh);
    this.solids.push(mesh);
    return mesh;
  }

  private buildBoard() {
    const p = new Parts();
    p.box(3.6, 1.45, 0.06, "#7a5634", { p: [-0.3, 1.75, -2.97] });
    p.box(3.44, 1.29, 0.02, "#2f5d46", { p: [-0.3, 1.75, -2.93] });
    p.box(3.5, 0.06, 0.16, "#8b6440", { p: [-0.3, 1.04, -2.88] });
    // Chalk and an eraser on the tray.
    for (const [x, c] of [[-1.5, "#ffffff"], [-1.38, "#ffeb3b"], [-1.26, "#f48fb1"]] as const) p.box(0.09, 0.02, 0.02, c, { p: [x, 1.085, -2.86] });
    p.rbox(0.22, 0.05, 0.08, 0.01, "#5c6bc0", { p: [0.9, 1.095, -2.86] }, 2);
    this.solid(p.mesh(worldMat));
    // The date and a greeting, chalked.
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.2), worldBasicMaterial({ map: boardTexture(), transparent: true }));
    board.position.set(-0.3, 1.75, -2.915);
    this.scene.add(board);
  }

  private buildTeacherDesk() {
    const p = new Parts();
    p.box(1.9, 0.08, 0.7, "#b98a58", { p: [-3.0, 0.78, -1.4] });
    p.box(1.8, 0.7, 0.62, "#9a9fa6", { p: [-3.0, 0.38, -1.4] });
    p.box(1.8, 0.02, 0.02, "#7d838b", { p: [-3.0, 0.58, -1.08] });
    // A book, a mug of pencils, an apple.
    p.box(0.36, 0.06, 0.26, "#ef5350", { p: [-3.45, 0.85, -1.4], r: [0, 0.2, 0] });
    p.cyl(0.07, 0.07, 0.14, "#fff59d", { p: [-2.7, 0.89, -1.45] }, 12);
    for (let i = 0; i < 3; i++) p.cyl(0.01, 0.01, 0.16, ["#42a5f5", "#66bb6a", "#ffca28"][i], { p: [-2.72 + i * 0.02, 0.98, -1.45], r: [0.1 * (i - 1), 0, 0.12 * (i - 1)] }, 6);
    p.sphere(0.07, "#e53935", { p: [-2.35, 0.89, -1.35] }, 10, 8);
    p.cyl(0.008, 0.008, 0.05, "#6d4c41", { p: [-2.35, 0.97, -1.35] }, 5);
    this.solid(p.mesh(worldMat));
  }

  private buildCubbies() {
    const p = new Parts();
    p.box(0.55, 1.05, 2.7, "#c89a66", { p: [-4.18, 0.525, 1.25] });
    for (let r = 0; r < 2; r++)
      for (let c = 0; c < 5; c++) {
        p.box(0.03, 0.42, 0.46, "#8a6440", { p: [-3.9, 0.3 + r * 0.48, 0.2 + c * 0.525] });
        // A randoseru in each cubby.
        const col = ["#d32f2f", "#3949ab", "#6d4c41", "#ec407a", "#212121"][(r * 5 + c) % 5];
        p.rbox(0.26, 0.3, 0.36, 0.05, col, { p: [-4.05, 0.3 + r * 0.48, 0.2 + c * 0.525] }, 2);
      }
    this.solid(p.mesh(worldMat));
  }

  private buildDoor(): THREE.Group {
    const frame = new Parts();
    frame.box(0.24, 2.5, 0.1, "#8d6e63", { p: [4.6, 1.25, 0.95] });
    frame.box(0.24, 2.5, 0.1, "#8d6e63", { p: [4.6, 1.25, 2.45] });
    frame.box(0.24, 0.12, 1.6, "#8d6e63", { p: [4.6, 2.52, 1.7] });
    this.solid(frame.mesh(worldMat));
    // A sliding classroom door: it slides back along the wall.
    const door = new THREE.Group();
    door.position.set(4.62, 0, 1.7);
    const d = new Parts();
    d.box(0.06, 2.4, 1.4, "#c8a77c", { p: [0, 1.2, 0] });
    d.box(0.07, 0.8, 0.9, "#cfeaff", { p: [0, 1.75, 0] });
    d.box(0.075, 0.04, 0.9, "#a58258", { p: [0, 1.75, 0] });
    d.box(0.08, 0.16, 0.04, "#7d6040", { p: [-0.02, 1.05, 0.6] });
    door.add(d.mesh(worldMat));
    this.scene.add(door);
    return door;
  }

  private buildDecor() {
    // Two windows on the left wall above the cubbies.
    const w = new Parts();
    const glassMat = worldBasicMaterial({ color: new THREE.Color("#cfe9ff") });
    const glassGeo = new THREE.PlaneGeometry(1.5, 1.25);
    for (const z of [-1.6, 0.9]) {
      w.box(0.12, 1.45, 1.7, "#a0a8b0", { p: [-4.5, 2.15, z] });
      w.box(0.13, 1.3, 0.05, "#a0a8b0", { p: [-4.44, 2.15, z] });
      const g = new THREE.Mesh(glassGeo, glassMat);
      g.rotation.y = Math.PI / 2;
      g.position.set(-4.43, 2.15, z);
      this.scene.add(g);
    }
    // Ceiling lights hanging into view along the top.
    const lamps = new Parts();
    const bulbs = new Parts();
    for (const x of [-2.2, 2.2]) {
      lamps.box(0.04, 0.2, 0.04, "#9e9e9e", { p: [x, 3.4, -2.7] });
      lamps.box(1.4, 0.06, 0.18, "#eceff1", { p: [x, 3.28, -2.7] });
      bulbs.box(1.3, 0.04, 0.12, "#fffbe8", { p: [x, 3.24, -2.7] });
    }
    // A plant in the back corner.
    lamps.cyl(0.28, 0.22, 0.5, "#7e8c99", { p: [4.0, 0.25, -2.55] }, 14);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      lamps.sphere(0.2, "#43a047", { p: [4.0 + Math.cos(a) * 0.16, 0.8 + (i % 3) * 0.12, -2.55 + Math.sin(a) * 0.14], s: [1, 1.4, 1] }, 8, 6);
    }
    // The school speaker / bell above the door.
    const bellParts = new Parts();
    bellParts.rbox(0.34, 0.34, 0.1, 0.05, "#eeeeee", { p: [0, 0, 0] }, 2);
    bellParts.cyl(0.11, 0.11, 0.02, "#90a4ae", { p: [0, 0, 0.05], r: [Math.PI / 2, 0, 0] }, 14);
    bellParts.cyl(0.05, 0.05, 0.025, "#607d8b", { p: [0, 0, 0.06], r: [Math.PI / 2, 0, 0] }, 10);
    const bell = bellParts.mesh(worldMat);
    bell.position.set(4.48, 2.95, 1.7);
    bell.rotation.y = -Math.PI / 2;
    this.scene.add(lamps.mesh(worldMat), bulbs.mesh(lampMat), bell);
    // A noticeboard with pictures.
    const nb = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.05), worldBasicMaterial({ map: noticeTexture(), transparent: true }));
    nb.position.set(-3.3, 1.95, -2.98);
    this.scene.add(nb);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.34),
      worldBasicMaterial({ map: signTexture("Class 4-1", { bg: "#7cb342", fg: "#ffffff", w: 448, h: 108, border: "#ffffff" }), transparent: true })
    );
    sign.position.set(4.49, 2.6, 2.75);
    sign.rotation.y = -Math.PI / 2;
    this.scene.add(sign);
    return { sign, glassMat, bell };
  }

  // ------------------------------------------------------------------ the clock
  private buildClock(): THREE.CanvasTexture {
    const p = new Parts();
    p.cyl(CLOCK.r + 0.06, CLOCK.r + 0.06, 0.08, "#ffffff", { p: [CLOCK.x, CLOCK.y, CLOCK.z], r: [Math.PI / 2, 0, 0] }, 32);
    p.torus(CLOCK.r + 0.05, 0.04, "#42a5f5", { p: [CLOCK.x, CLOCK.y, CLOCK.z + 0.04] }, Math.PI * 2, 6, 32);
    this.solid(p.mesh(worldMat));
    this.clockCanvas.width = this.clockCanvas.height = 512;
    const tex = new THREE.CanvasTexture(this.clockCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const face = new THREE.Mesh(new THREE.CircleGeometry(CLOCK.r, 40), worldBasicMaterial({ map: tex }));
    face.position.set(CLOCK.x, CLOCK.y, CLOCK.z + 0.045);
    this.scene.add(face);
    return tex;
  }

  private buildHands() {
    const group = new THREE.Group();
    group.position.set(CLOCK.x, CLOCK.y, CLOCK.z + 0.06);
    const mk = (len: number, width: number, color: string) => {
      const pivot = new THREE.Group();
      const p = new Parts();
      p.box(width, len, 0.015, color, { p: [0, len / 2 - 0.05, 0] });
      pivot.add(p.mesh(worldMat));
      group.add(pivot);
      return pivot;
    };
    const hour = mk(CLOCK.r * 0.55, 0.05, "#37474f");
    const minute = mk(CLOCK.r * 0.82, 0.032, "#37474f");
    const hub = new Parts();
    hub.cyl(0.04, 0.04, 0.03, "#ef5350", { p: [0, 0, 0.02], r: [Math.PI / 2, 0, 0] }, 12);
    group.add(hub.mesh(worldMat));
    this.scene.add(group);
    return { group, hour, minute };
  }

  /** Position (face coordinates, 0..512) of hour number n. */
  private static numberPos(n: number): [number, number] {
    const a = (n / 12) * Math.PI * 2;
    return [256 + Math.sin(a) * 186, 256 - Math.cos(a) * 186];
  }

  private paintClock() {
    const g = this.clockCanvas.getContext("2d") as CanvasRenderingContext2D;
    g.clearRect(0, 0, 512, 512);
    g.fillStyle = "#fffdf5";
    g.beginPath();
    g.arc(256, 256, 256, 0, Math.PI * 2);
    g.fill();
    // Minute ticks are always there (the numbers are what is missing).
    g.strokeStyle = "#b0bec5";
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r0 = i % 5 === 0 ? 228 : 238;
      g.lineWidth = i % 5 === 0 ? 6 : 3;
      g.beginPath();
      g.moveTo(256 + Math.sin(a) * r0, 256 - Math.cos(a) * r0);
      g.lineTo(256 + Math.sin(a) * 248, 256 - Math.cos(a) * 248);
      g.stroke();
    }
    const written: Record<number, GlyphKey> = { 12: "n12", 3: "n3", 6: "n6", 9: "n9" };
    for (let n = 1; n <= 12; n++) {
      const [x, y] = ClassroomArea.numberPos(n);
      const key = written[n];
      const art = key ? this.glyphArt[key] : undefined;
      if (art) {
        // The child's own number, in their own colour.
        const size = n === 12 ? 132 : 104;
        const img = renderDrawing(artToDrawing(art), { size, pad: size * 0.08, lineWidth: size * 0.075 });
        g.drawImage(img, x - size / 2, y - size / 2);
      } else if (key) {
        dashedCircle(g, x, y, 44);
      } else if (this.clockFull) {
        g.fillStyle = "#37474f";
        g.font = `bold 76px "Arial Rounded MT Bold", "Segoe UI", Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(n), x, y + 4);
      }
    }
    this.clockTex.needsUpdate = true;
  }

  /** Show the hands at a time (hidden until the clock has its numbers). */
  setTime(h: number, m: number, visible = true) {
    this.hands.visible = visible;
    this.minuteHand.rotation.z = -(m / 60) * Math.PI * 2;
    this.hourHand.rotation.z = -(((h % 12) + m / 60) / 12) * Math.PI * 2;
  }

  /** The hands spin round to a time (for the magic moment). */
  get handObjects() {
    return { group: this.hands, hour: this.hourHand, minute: this.minuteHand };
  }

  setClockFull(full: boolean) {
    this.clockFull = full;
    this.paintClock();
  }

  // ------------------------------------------------------------------ the alphabet strip
  private buildStrip(): THREE.CanvasTexture {
    const n = LETTERS.length;
    const w = n * STRIP.card + (n - 1) * STRIP.gap;
    this.stripCanvas.width = 2048;
    this.stripCanvas.height = Math.round((2048 * STRIP.card * 1.2) / w);
    const tex = new THREE.CanvasTexture(this.stripCanvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, STRIP.card * 1.2), worldBasicMaterial({ map: tex, transparent: true }));
    mesh.position.set(0, STRIP.y, STRIP.z);
    this.scene.add(mesh);
    return tex;
  }

  /** World x of a letter card. */
  static cardX(i: number): number {
    const n = LETTERS.length;
    const w = n * STRIP.card + (n - 1) * STRIP.gap;
    return -w / 2 + STRIP.card / 2 + i * (STRIP.card + STRIP.gap);
  }

  private paintStrip() {
    const c = this.stripCanvas;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const n = LETTERS.length;
    const unit = c.width / (n * STRIP.card + (n - 1) * STRIP.gap);
    const cw = STRIP.card * unit;
    const gap = STRIP.gap * unit;
    const H = c.height;
    g.clearRect(0, 0, c.width, H);
    const colours = ["#ef9a9a", "#ffcc80", "#fff59d", "#a5d6a7", "#90caf9", "#ce93d8"];
    for (let i = 0; i < n; i++) {
      const ch = LETTERS[i];
      const x = i * (cw + gap);
      const key = MISSING[ch];
      const art = key ? this.glyphArt[key] : undefined;
      if (key && !art) {
        g.setLineDash([10, 8]);
        g.strokeStyle = "#90a4ae";
        g.lineWidth = 5;
        g.beginPath();
        g.roundRect(x + 4, 4, cw - 8, H - 8, 14);
        g.stroke();
        g.setLineDash([]);
        continue;
      }
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.roundRect(x + 2, 2, cw - 4, H - 4, 14);
      g.fill();
      g.fillStyle = colours[i % colours.length];
      g.fillRect(x + 2, 2, cw - 4, H * 0.12);
      // Four-line guide like the children's worksheets.
      g.strokeStyle = "#e3ebf5";
      g.lineWidth = 2;
      for (const f of [0.28, 0.5, 0.72]) {
        g.beginPath();
        g.moveTo(x + 8, H * f + H * 0.06);
        g.lineTo(x + cw - 8, H * f + H * 0.06);
        g.stroke();
      }
      if (art) {
        const size = Math.min(cw, H) * 0.86;
        const img = renderDrawing(artToDrawing(art), { size: Math.round(size), pad: size * 0.08, lineWidth: size * 0.08 });
        g.drawImage(img, x + (cw - size) / 2, H * 0.12 + (H * 0.88 - size) / 2);
      } else {
        g.fillStyle = "#37474f";
        g.font = `bold ${Math.round(H * 0.62)}px "Arial Rounded MT Bold", "Segoe UI", Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "alphabetic";
        g.fillText(ch, x + cw / 2, H * 0.78);
      }
    }
    this.stripTex.needsUpdate = true;
  }

  // ------------------------------------------------------------------ slots and writing spots
  private buildSlots(): Record<"desks" | "chairs", Slot> {
    const desks: Anchor[] = SEATS.map((s) => ({ p: v(s.x, 0, s.z), r: e(0, 0, 0) }));
    const chairs: Anchor[] = SEATS.map((s) => ({ p: v(s.x, 0, s.z + CHAIR_DZ), r: e(0, Math.PI, 0) }));
    const make = (id: "desks" | "chairs", word: WordId, anchors: Anchor[], marker: THREE.Vector3, stand: { x: number; z: number }, view: View, hot: [THREE.Vector3, THREE.Vector3]): Slot => {
      const ghosts = anchors.map((a, i) => {
        const gh = WORD_KINDS[word].build(null, i);
        gh.root.position.copy(a.p);
        gh.root.rotation.copy(a.r);
        gh.root.traverse((c) => {
          if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).material = ghostMaterial;
        });
        this.scene.add(gh.root);
        return gh.root;
      });
      const size = hot[1].clone().sub(hot[0]);
      const hotspot = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
      hotspot.position.copy(hot[0]).add(size.multiplyScalar(0.5));
      hotspot.userData.slot = id;
      this.scene.add(hotspot);
      return { id, word, anchors, ghosts, items: [], hotspot, marker, stand, view };
    };
    return {
      desks: make("desks", "desk", desks, v(0.7, 1.35, -0.75), { x: 0.7, z: 0.1 }, VIEWS.desks, [v(-0.85, 0, -1.1), v(2.25, 0.8, 1.3)]),
      chairs: make("chairs", "chair", chairs, v(0.7, 1.35, 0.95 + CHAIR_DZ), { x: 0.7, z: 2.1 }, VIEWS.desks, [v(-0.85, 0, -1.1), v(2.25, 0.9, 1.8)])
    };
  }

  private buildWriteSpots() {
    const hot = (w: number, h: number, at: THREE.Vector3, id: string) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), new THREE.MeshBasicMaterial({ visible: false }));
      m.position.copy(at);
      m.userData.slot = id;
      this.scene.add(m);
      return m;
    };
    const numbers: [GlyphKey, number][] = [["n12", 12], ["n3", 3], ["n6", 6], ["n9", 9]];
    for (const [key, n] of numbers) {
      const [fx, fy] = ClassroomArea.numberPos(n);
      const at = v(CLOCK.x + ((fx - 256) / 256) * CLOCK.r, CLOCK.y - ((fy - 256) / 256) * CLOCK.r, CLOCK.z + 0.08);
      this.spots[key] = {
        id: key,
        hotspot: hot(n === 12 ? 0.36 : 0.26, 0.26, at, key),
        marker: at.clone().add(v(0, 0.25, 0.1)),
        stand: { x: 3.05, z: -1.75 },
        view: VIEWS.clock,
        face: v(CLOCK.x, CLOCK.y, CLOCK.z)
      };
    }
    for (const [ch, key] of Object.entries(MISSING)) {
      const i = LETTERS.indexOf(ch);
      const x = ClassroomArea.cardX(i);
      const at = v(x, STRIP.y, STRIP.z + 0.04);
      this.spots[key] = {
        id: key,
        hotspot: hot(STRIP.card, STRIP.card * 1.2, at, key),
        marker: at.clone().add(v(0, -0.38, 0.1)),
        stand: { x: Math.max(-1.7, Math.min(3.2, x)), z: -1.75 },
        view: { pos: v(x * 0.7, 2.9, 1.6), look: v(x, 2.7, -2.95) },
        face: v(x, STRIP.y, STRIP.z)
      };
    }
  }

  get pickables(): THREE.Object3D[] {
    return [...Object.values(this.slots).map((s) => s.hotspot), ...Object.values(this.spots).map((s) => s.hotspot)];
  }

  /** Show the child's saved handwriting (clock numbers, letter cards). */
  rebuildWriting(glyphs: Partial<Record<GlyphKey, Art>>, _drawingMode: boolean) {
    this.glyphArt = { ...glyphs };
    this.clockFull = (["n12", "n3", "n6", "n9"] as GlyphKey[]).every((k) => this.glyphArt[k]);
    this.paintClock();
    this.paintStrip();
    this.hands.visible = this.clockFull;
  }

  /** One character has been written: paint it in. */
  setGlyph(key: GlyphKey, art: Art) {
    this.glyphArt[key] = art;
    if (key.startsWith("n")) this.paintClock();
    else this.paintStrip();
  }

  hasGlyph(key: GlyphKey): boolean {
    return !!this.glyphArt[key];
  }

  /** The character a writing spot asks for. */
  static charOf(key: GlyphKey): string {
    return GLYPH_CHARS[key];
  }

  /** The bell (speaker) shakes while the chime plays. */
  ring(seconds: number) {
    this.bellRing = seconds;
  }

  // ------------------------------------------------------------------ level
  setLevel(level: number) {
    lampMat.emissiveIntensity = Math.max(0, (level - 0.2) * 1.2);
    this.windowMat.color.set(mix("#c9d3dd", "#bfe8ff", level));
    (this.sign.material as THREE.MeshBasicMaterial).color.set(level >= 1 ? "#ffffff" : mix("#bbbbbb", "#ffffff", level));
  }

  private last = 0;
  update(t: number) {
    const dt = Math.min(0.1, Math.max(0, t - this.last));
    this.last = t;
    if (this.bellRing > 0) {
      this.bellRing -= dt;
      this.bell.position.x = 4.48 + Math.sin(t * 60) * 0.006;
      this.bell.scale.setScalar(1 + Math.abs(Math.sin(t * 9)) * 0.08);
    } else this.bell.scale.setScalar(1);
  }

  setDoor(open: number) {
    // Japanese classroom doors slide.
    this.doorLeaf.position.z = 1.7 - open * 1.3;
  }
}

function dashedCircle(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.setLineDash([9, 7]);
  g.strokeStyle = "#90a4ae";
  g.lineWidth = 5;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
}

function boardTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 660;
  c.height = 240;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "rgba(255,255,255,0.92)";
  g.font = `bold 46px "Comic Sans MS", "Segoe Print", "Arial Rounded MT Bold", sans-serif`;
  g.textAlign = "left";
  g.fillText("Good morning!", 40, 90);
  g.fillStyle = "rgba(255,241,118,0.9)";
  g.font = `bold 34px "Comic Sans MS", "Segoe Print", "Arial Rounded MT Bold", sans-serif`;
  g.fillText("What time is it?", 60, 170);
  g.strokeStyle = "rgba(244,143,177,0.85)";
  g.lineWidth = 5;
  g.beginPath();
  g.arc(560, 120, 55, 0, Math.PI * 2);
  g.moveTo(560, 120);
  g.lineTo(560, 80);
  g.moveTo(560, 120);
  g.lineTo(590, 120);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noticeTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 300;
  c.height = 210;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#c69c6d";
  g.fillRect(0, 0, 300, 210);
  g.fillStyle = "#e9cfa6";
  g.fillRect(8, 8, 284, 194);
  const papers: [number, number, string, number][] = [[20, 18, "#ffffff", -0.06], [110, 22, "#fff9c4", 0.05], [200, 16, "#e1f5fe", -0.03], [40, 112, "#fce4ec", 0.04], [140, 110, "#ffffff", -0.05], [220, 116, "#f1f8e9", 0.06]];
  for (const [x, y, col, r] of papers) {
    g.save();
    g.translate(x + 35, y + 38);
    g.rotate(r);
    g.fillStyle = col;
    g.fillRect(-35, -38, 70, 76);
    g.fillStyle = ["#ef5350", "#42a5f5", "#66bb6a", "#ffca28"][(x + y) % 4];
    g.beginPath();
    g.arc(0, -6, 16, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-20, 16, 40, 6);
    g.fillStyle = "#e53935";
    g.beginPath();
    g.arc(0, -34, 4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
