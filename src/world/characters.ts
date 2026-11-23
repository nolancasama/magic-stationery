/**
 * Chibi characters: six merged parts (body, head, two arms, two legs), posed
 * procedurally. No skinning, no animation files; six draw calls each.
 * Characters face +Z at heading 0. The root sits at the feet.
 */
import * as THREE from "three";
import { blobShadow, vividMat } from "./materials.ts";
import { Parts, shade, type Col } from "./parts.ts";

export type HairStyle = "short" | "bob" | "pigtails" | "bun" | "spiky";
export type Extra = "apron" | "glasses" | "cap" | "yellowHat" | "bows" | "hoodie";

export interface Look {
  skin: Col;
  hair: Col;
  hairStyle: HairStyle;
  shirt: Col;
  legs: Col;
  skirt?: boolean;
  shorts?: boolean;
  shoes: Col;
  extras?: Extra[];
  extraColor?: Col;
  scale?: number;
}

export type Pose = "idle" | "walk" | "talk" | "cheer" | "wave" | "point" | "give" | "sad" | "think" | "surprised" | "nod" | "shake" | "jump" | "laugh" | "sit";

export type Collide = (x: number, z: number, radius: number) => boolean;

/** Key steering: an axis slide needs at least this share of the step, else the corner is rounded. */
const DRIVE_SLIDE_MIN = 0.25;
/** Route walking: an axis slide needs at least this share of the step, else the walk ends there. */
const ROUTE_SLIDE_MIN = 0.05;
/**
 * Turns (radians) tried when a key-steered step is blocked both straight and along each axis:
 * up to ~70° either way, smallest first. A step turned less than 90° never slides along a flat
 * wall pushed head-on, nor round a person walked straight at; it rounds convex corners.
 */
const CORNER_TURNS = [0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2];

const tmp = new THREE.Vector3();

const HEAD_R = 0.27;
const FRAME = "#5b3a29";

/** A box from a to b (a temple arm of the glasses). */
function rod(p: Parts, a: [number, number, number], b: [number, number, number], t: number, col: Col) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  const yaw = Math.atan2(d.x, d.z);
  const pitch = -Math.asin(d.y / len);
  p.box(t, t, len, col, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [pitch, yaw, 0] });
}

/**
 * Glasses fitted to a head of radius r: rims stand clear of the eyes (which
 * bulge to ~0.96 r), each rim turned to follow the face's curve, a bridge on the
 * nose line, and temple arms that bow outside the cheek to the ears.
 */
function addGlasses(p: Parts, r: number) {
  const ex = r * 0.34;
  const rim = r * 0.215;
  const z = r * 1.005;
  for (const sx of [-1, 1]) {
    p.torus(rim, 0.0095, FRAME, { p: [sx * ex, -0.005, z], r: [0, sx * 0.32, 0] }, Math.PI * 2, 5, 16);
    const outer: [number, number, number] = [sx * (ex + rim * Math.cos(0.32)), 0.01, z - rim * Math.sin(0.32)];
    const bend: [number, number, number] = [sx * r * 0.87, 0.012, r * 0.63];
    const ear: [number, number, number] = [sx * r * 1.05, 0.0, r * 0.12];
    rod(p, outer, bend, 0.011, FRAME);
    rod(p, bend, ear, 0.011, FRAME);
  }
  p.box(ex * 2 - rim * 2 + 0.01, 0.011, 0.011, FRAME, { p: [0, 0.012, z + 0.012] });
}

function buildHead(look: Look): THREE.BufferGeometry {
  const p = new Parts();
  const hy = 0.27;
  p.sphere(HEAD_R, look.skin, { p: [0, 0, 0] }, 18, 14);
  // Ears.
  p.sphere(0.05, look.skin, { p: [-0.265, -0.02, 0], s: [0.6, 1, 0.8] });
  p.sphere(0.05, look.skin, { p: [0.265, -0.02, 0], s: [0.6, 1, 0.8] });
  // Eyes with highlights, blush, smile.
  for (const sx of [-1, 1]) {
    p.sphere(0.042, "#2a2233", { p: [sx * 0.092, -0.005, 0.238], s: [0.9, 1.25, 0.5] }, 10, 8);
    p.sphere(0.014, "#ffffff", { p: [sx * 0.092 + 0.012, 0.018, 0.26] }, 6, 4);
    p.sphere(0.042, "#ff9aa8", { p: [sx * 0.155, -0.075, 0.205], s: [1, 0.55, 0.35] }, 8, 6);
  }
  p.torus(0.034, 0.009, "#7a3340", { p: [0, -0.085, 0.255], r: [0.25, 0, Math.PI] }, Math.PI, 5, 10);
  // Hair. Under a hat, only what shows below the brim is built: a short fringe
  // tucked under the front rim and no spikes (they would pierce the crown).
  const hair = look.hair;
  const style = look.hairStyle;
  const extras = look.extras ?? [];
  const hatted = extras.includes("cap") || extras.includes("yellowHat");
  p.dome(0.288, hair, { p: [0, 0.005, -0.01], r: [-0.55, 0, 0] }, style === "bob" ? Math.PI * 0.62 : Math.PI * 0.55, 18, 8);
  if (hatted) p.sphere(0.15, hair, { p: [0, 0.075, 0.19], s: [1.3, 0.32, 0.55] });
  else p.sphere(0.17, hair, { p: [0, 0.165, 0.14], s: [1.45, 0.42, 0.7] });
  if (style === "bob") {
    p.sphere(0.14, hair, { p: [-0.2, -0.06, -0.03], s: [0.75, 1.25, 1] });
    p.sphere(0.14, hair, { p: [0.2, -0.06, -0.03], s: [0.75, 1.25, 1] });
  } else if (style === "pigtails") {
    p.sphere(0.1, hair, { p: [-0.31, -0.06, -0.06], s: [0.85, 1.2, 0.85] });
    p.sphere(0.1, hair, { p: [0.31, -0.06, -0.06], s: [0.85, 1.2, 0.85] });
  } else if (style === "bun") {
    p.sphere(0.115, hair, { p: [0, 0.27, -0.12] });
  } else if (style === "spiky" && !hatted) {
    for (let i = 0; i < 5; i++) {
      const a = -0.6 + i * 0.3;
      p.cone(0.06, 0.14, hair, { p: [Math.sin(a) * 0.2, 0.24, -0.05 + Math.cos(a) * 0.02], r: [-0.4, 0, -a * 0.8] }, 6);
    }
  } else if (style === "spiky") {
    // Spikes poking out sideways under the cap.
    for (const sx of [-1, 1]) p.cone(0.045, 0.1, hair, { p: [sx * 0.25, 0.06, 0.05], r: [0, 0, -sx * 1.9] }, 6);
  }
  const ec = look.extraColor ?? "#ff7043";
  if (extras.includes("glasses")) addGlasses(p, HEAD_R);
  if (extras.includes("cap")) {
    p.dome(0.3, ec, { p: [0, 0.03, 0], r: [-0.25, 0, 0] }, Math.PI * 0.45, 16, 6);
    p.cyl(0.2, 0.2, 0.02, shade(ec, 0.85), { p: [0, 0.12, 0.26], r: [0.25, 0, 0], s: [1, 1, 0.75] }, 14);
  }
  if (extras.includes("yellowHat")) {
    p.dome(0.3, "#ffd23f", { p: [0, 0.04, 0], r: [-0.12, 0, 0] }, Math.PI * 0.42, 16, 6);
    // The brim sits at the crown's rim (no gap showing the hair through it).
    p.cyl(0.4, 0.4, 0.024, "#ffc61a", { p: [0, 0.114, 0], r: [-0.12, 0, 0] }, 18);
  }
  if (extras.includes("bows")) {
    for (const sx of [-1, 1]) {
      p.sphere(0.05, ec, { p: [sx * 0.31, 0.06, -0.06], s: [1.4, 0.8, 0.6] });
    }
  }
  const g = p.build();
  g.translate(0, hy, 0);
  return g;
}

function buildBody(look: Look): THREE.BufferGeometry {
  const p = new Parts();
  p.cyl(0.17, 0.2, 0.38, look.shirt, { p: [0, 0.53, 0] }, 14);
  p.sphere(0.17, look.shirt, { p: [0, 0.71, 0], s: [1, 0.45, 1] }, 14, 6);
  const extras = look.extras ?? [];
  if (extras.includes("hoodie")) {
    p.torus(0.16, 0.05, shade(look.shirt, 0.85), { p: [0, 0.72, -0.03], r: [Math.PI / 2 - 0.25, 0, 0] }, Math.PI * 2, 6, 14);
    p.box(0.16, 0.08, 0.02, shade(look.shirt, 0.8), { p: [0, 0.45, 0.198] });
  }
  if (extras.includes("apron")) {
    const ec = look.extraColor ?? "#f28fb0";
    p.box(0.27, 0.36, 0.03, ec, { p: [0, 0.48, 0.19] });
    p.box(0.12, 0.08, 0.035, shade(ec, 0.85), { p: [0, 0.42, 0.205] });
  }
  if (look.skirt) p.cyl(0.2, 0.28, 0.2, look.legs, { p: [0, 0.38, 0] }, 16);
  else p.cyl(0.2, 0.2, 0.08, look.legs, { p: [0, 0.37, 0] }, 14);
  return p.build();
}

function buildArm(look: Look): THREE.BufferGeometry {
  const p = new Parts();
  p.capsule(0.055, 0.17, look.shirt, { p: [0, -0.13, 0] });
  p.sphere(0.062, look.skin, { p: [0, -0.29, 0] }, 10, 8);
  return p.build();
}

function buildLeg(look: Look): THREE.BufferGeometry {
  const p = new Parts();
  const legCol = look.skirt || look.shorts ? look.skin : look.legs;
  if (look.shorts) p.cyl(0.08, 0.08, 0.1, look.legs, { p: [0, -0.04, 0] }, 10);
  p.capsule(0.066, 0.17, legCol, { p: [0, -0.15, 0] });
  if (look.skirt || look.shorts) p.cyl(0.07, 0.07, 0.07, "#ffffff", { p: [0, -0.27, 0] }, 10);
  p.rbox(0.13, 0.08, 0.19, 0.035, look.shoes, { p: [0, -0.31, 0.03] });
  return p.build();
}

export class Character {
  readonly root = new THREE.Group();
  readonly model = new THREE.Group();
  readonly body: THREE.Mesh;
  readonly head: THREE.Mesh;
  readonly armL: THREE.Group;
  readonly armR: THREE.Group;
  readonly legL: THREE.Group;
  readonly legR: THREE.Group;
  /** Attach held items here (palm of the right hand). */
  readonly hand = new THREE.Group();
  readonly back = new THREE.Group();
  heading = 0;
  private headingGoal = 0;
  pose: Pose = "idle";
  private poseUntil = 0;
  private basePose: Pose = "idle";
  private time = Math.random() * 10;
  private walkPhase = 0;
  private target: THREE.Vector3 | null = null;
  private arrive: (() => void) | null = null;
  speed = 1.7;
  moving = false;
  collide: Collide | null = null;
  readonly radius: number;
  onStep: (() => void) | null = null;
  private lastStep = 0;
  private hop = 0;
  /**
   * A world point to look at (a face). The head turns first; the body follows
   * only when the point is further round than `bodyTurn` radians, so small moves
   * of the other person never make the character spin.
   */
  lookTarget: THREE.Vector3 | null = null;
  bodyTurn = 1.0;
  private lookYaw = 0;
  private lookPitch = 0;
  /** Keyboard steering: desired direction (x, z), length 0..1. */
  readonly drive = new THREE.Vector2();
  private vel = new THREE.Vector2();
  /** Extra collision while steered by keys (other people). */
  driveCollide: Collide | null = null;

  constructor(readonly look: Look) {
    const s = look.scale ?? 1;
    this.radius = 0.26 * s;
    this.body = new THREE.Mesh(buildBody(look), vividMat);
    this.head = new THREE.Mesh(buildHead(look), vividMat);
    this.head.position.y = 0.74;
    const arm = buildArm(look);
    const leg = buildLeg(look);
    this.armL = new THREE.Group();
    this.armR = new THREE.Group();
    this.armL.add(new THREE.Mesh(arm, vividMat));
    this.armR.add(new THREE.Mesh(arm, vividMat));
    this.armL.position.set(-0.215, 0.69, 0);
    this.armR.position.set(0.215, 0.69, 0);
    this.hand.position.set(0, -0.3, 0.02);
    this.armR.add(this.hand);
    this.legL = new THREE.Group();
    this.legR = new THREE.Group();
    this.legL.add(new THREE.Mesh(leg, vividMat));
    this.legR.add(new THREE.Mesh(leg, vividMat));
    this.legL.position.set(-0.09, 0.355, 0);
    this.legR.position.set(0.09, 0.355, 0);
    this.back.position.set(0, 0.55, -0.2);
    this.model.add(this.body, this.head, this.armL, this.armR, this.legL, this.legR, this.back);
    this.model.scale.setScalar(s);
    this.root.add(this.model);
    this.root.add(blobShadow(0.3 * s));
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  place(x: number, z: number, heading = 0) {
    this.root.position.set(x, 0, z);
    this.heading = this.headingGoal = heading;
    this.root.rotation.y = heading;
  }

  faceTo(x: number, z: number) {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (dx * dx + dz * dz < 1e-4) return;
    this.headingGoal = Math.atan2(dx, dz);
  }

  faceHeading(h: number) {
    this.headingGoal = h;
  }

  /** Play a pose for `seconds` (0 = until changed), then return to the base pose. */
  emote(pose: Pose, seconds = 1.2) {
    this.pose = pose;
    this.poseUntil = seconds > 0 ? this.time + seconds : Infinity;
  }

  setBase(pose: Pose) {
    this.basePose = pose;
    if (this.poseUntil <= this.time) this.pose = pose;
  }

  walkTo(x: number, z: number): Promise<void> {
    this.arrive?.();
    this.target = new THREE.Vector3(x, 0, z);
    this.moving = true;
    return new Promise((resolve) => {
      this.arrive = () => {
        this.arrive = null;
        resolve();
      };
    });
  }

  stop() {
    this.routeToken++;
    this.target = null;
    this.moving = false;
    this.arrive?.();
  }

  private routeToken = 0;
  /** Set by the area: plans a path around furniture. */
  router: ((ax: number, az: number, bx: number, bz: number) => [number, number][]) | null = null;

  /** Walk along a planned route; a newer go() cancels an older one. */
  async go(x: number, z: number): Promise<boolean> {
    const token = ++this.routeToken;
    const pts = this.router ? this.router(this.position.x, this.position.z, x, z) : [[x, z] as [number, number]];
    for (const [px, pz] of pts) {
      if (token !== this.routeToken) return false;
      await this.walkTo(px, pz);
    }
    return token === this.routeToken;
  }

  /**
   * Hold an object in the right hand: across the fist (perpendicular to the
   * forearm, so it never runs up inside the arm), gripped `grip` of the way
   * along its length. `length` is the object's height along its own +y, with
   * its origin at one end; `flip` points the origin end forward (a pen's tip).
   * `turn` spins a flat object about its own axis so its face shows.
   */
  hold(obj: THREE.Object3D, opts: { length: number; grip: number; flip?: boolean; turn?: number; scale?: number }) {
    const s = opts.scale ?? 1;
    obj.removeFromParent();
    const holder = new THREE.Group();
    holder.rotation.x = opts.flip ? -Math.PI / 2 : Math.PI / 2;
    holder.position.z = (opts.flip ? 1 : -1) * opts.grip * opts.length * s;
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, opts.turn ?? 0, 0);
    obj.scale.setScalar(s);
    holder.add(obj);
    this.hand.add(holder);
  }

  /** Remove everything held. */
  emptyHand() {
    while (this.hand.children.length) this.hand.remove(this.hand.children[0]);
  }

  /**
   * Glide round a corner (or a person): take the blocked step turned a little either way,
   * shortened by the cosine of the turn, if that is free. Returns false if every turn is blocked.
   */
  private roundCorner(blocked: (x: number, z: number) => boolean, dx: number, dz: number): boolean {
    const p = this.root.position;
    for (const a of CORNER_TURNS) {
      const c = Math.cos(a);
      const s = Math.sin(a);
      const sx = (dx * c - dz * s) * c;
      const sz = (dx * s + dz * c) * c;
      if (!blocked(p.x + sx, p.z + sz)) {
        p.x += sx;
        p.z += sz;
        return true;
      }
    }
    return false;
  }

  update(dt: number) {
    this.time += dt;
    if (this.poseUntil <= this.time && this.pose !== this.basePose) this.pose = this.basePose;
    // Keyboard steering: smooth acceleration and stopping, slides along obstacles.
    const want = this.drive;
    if (want.lengthSq() > 0.0001 || this.vel.lengthSq() > 0.0004) {
      if (want.lengthSq() > 0.0001 && this.target) {
        this.routeToken++;
        this.target = null;
        this.arrive?.();
      }
      const k = Math.min(1, dt * (want.lengthSq() > 0.0001 ? 7 : 10));
      this.vel.x += (want.x * this.speed - this.vel.x) * k;
      this.vel.y += (want.y * this.speed - this.vel.y) * k;
      const p = this.root.position;
      const dx = this.vel.x * dt;
      const dz = this.vel.y * dt;
      const r = this.radius;
      const blocked = (x: number, z: number) => !!this.collide?.(x, z, r) || !!this.driveCollide?.(x, z, r);
      // An axis part this small is no slide: it only creeps (the player stuck on a table corner).
      const min = Math.hypot(dx, dz) * DRIVE_SLIDE_MIN;
      if (!blocked(p.x + dx, p.z + dz)) {
        p.x += dx;
        p.z += dz;
      } else if (Math.abs(dx) > min && !blocked(p.x + dx, p.z)) {
        p.x += dx;
        this.vel.y = 0;
      } else if (Math.abs(dz) > min && !blocked(p.x, p.z + dz)) {
        p.z += dz;
        this.vel.x = 0;
      } else if (!this.roundCorner(blocked, dx, dz)) this.vel.set(0, 0);
      const sp = this.vel.length();
      this.moving = sp > 0.15;
      if (sp > 0.05) this.headingGoal = Math.atan2(this.vel.x, this.vel.y);
      if (this.moving) {
        this.walkPhase += dt * sp * 6.2;
        if (this.time - this.lastStep > 0.32) {
          this.lastStep = this.time;
          this.onStep?.();
        }
      }
      if (want.lengthSq() <= 0.0001 && sp <= 0.02) {
        this.vel.set(0, 0);
        this.moving = false;
      }
    }
    // Movement along a route.
    if (this.target) {
      const p = this.root.position;
      tmp.subVectors(this.target, p);
      tmp.y = 0;
      const dist = tmp.length();
      if (dist < 0.05) {
        this.target = null;
        this.moving = false;
        this.arrive?.();
      } else {
        const step = Math.min(dist, this.speed * dt);
        tmp.multiplyScalar(step / dist);
        const nx = p.x + tmp.x;
        const nz = p.z + tmp.z;
        const r = this.radius;
        const blocked = this.collide;
        // A slide must make real progress; a zero-length "slide" would walk on the spot forever
        // and the script awaiting this walk would never go on.
        const min = step * ROUTE_SLIDE_MIN;
        if (!blocked || !blocked(nx, nz, r)) {
          p.x = nx;
          p.z = nz;
        } else if (Math.abs(tmp.x) > min && !blocked(nx, p.z, r)) p.x = nx;
        else if (Math.abs(tmp.z) > min && !blocked(p.x, nz, r)) p.z = nz;
        else {
          this.target = null;
          this.moving = false;
          this.arrive?.();
        }
        this.headingGoal = Math.atan2(tmp.x, tmp.z);
        this.walkPhase += dt * this.speed * 6.2;
        if (this.time - this.lastStep > 0.32) {
          this.lastStep = this.time;
          this.onStep?.();
        }
      }
    }
    // Looking at someone: head first, body only when they are far round.
    let yawGoal = 0;
    let pitchGoal = 0;
    if (this.lookTarget && !this.moving) {
      const p = this.root.position;
      const dx = this.lookTarget.x - p.x;
      const dz = this.lookTarget.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.2) {
        let rel = Math.atan2(dx, dz) - this.heading;
        while (rel > Math.PI) rel -= Math.PI * 2;
        while (rel < -Math.PI) rel += Math.PI * 2;
        if (Math.abs(rel) > this.bodyTurn && Math.abs(this.headingGoal - this.heading) < 0.05) {
          // Turn the body just enough that the head can do the rest comfortably.
          this.headingGoal = this.heading + rel - Math.sign(rel) * 0.35;
        }
        yawGoal = Math.max(-0.8, Math.min(0.8, rel));
        const eye = 1.0 * (this.look.scale ?? 1);
        pitchGoal = Math.max(-0.3, Math.min(0.35, Math.atan2(eye - this.lookTarget.y, dist)));
      }
    }
    const lk = Math.min(1, dt * 6);
    this.lookYaw += (yawGoal - this.lookYaw) * lk;
    this.lookPitch += (pitchGoal - this.lookPitch) * lk;
    // Turn.
    let dh = this.headingGoal - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += dh * Math.min(1, dt * 9);
    this.root.rotation.y = this.heading;
    this.applyPose(dt);
  }

  private applyPose(dt: number) {
    const t = this.time;
    const pose = this.moving ? "walk" : this.pose;
    let aLx = 0, aLz = 0.1, aRx = 0, aRz = -0.1, lL = 0, lR = 0, hx = 0, hy = 0, hz = 0, bodyY = 0, lift = 0;
    const breathe = Math.sin(t * 1.8) * 0.012;
    switch (pose) {
      case "walk": {
        const s = Math.sin(this.walkPhase);
        lL = s * 0.6;
        lR = -s * 0.6;
        aLx = -s * 0.5;
        aRx = s * 0.5;
        bodyY = Math.abs(Math.cos(this.walkPhase)) * 0.035;
        break;
      }
      case "talk":
        hx = Math.sin(t * 8.5) * 0.04;
        aRx = -0.5 + Math.sin(t * 3.1) * 0.25;
        aRz = -0.25;
        hz = Math.sin(t * 1.3) * 0.06;
        break;
      case "cheer":
        aLz = 2.6 + Math.sin(t * 12) * 0.15;
        aRz = -2.6 - Math.sin(t * 12) * 0.15;
        lift = Math.abs(Math.sin(t * 7)) * 0.16;
        hx = -0.15;
        break;
      case "laugh":
        hx = -0.2 + Math.sin(t * 14) * 0.05;
        aLx = -0.4;
        aRx = -0.4;
        aLz = 0.5;
        aRz = -0.5;
        bodyY = Math.abs(Math.sin(t * 14)) * 0.02;
        break;
      case "jump":
        lift = Math.abs(Math.sin(t * 6)) * 0.28;
        aLz = 1.6;
        aRz = -1.6;
        break;
      case "wave":
        aRz = -2.5 + Math.sin(t * 9) * 0.35;
        hz = 0.1;
        break;
      case "point":
        aRx = -1.45;
        aRz = -0.1;
        break;
      case "give":
        aLx = -1.25;
        aRx = -1.25;
        aLz = 0.25;
        aRz = -0.25;
        break;
      case "sad":
        hx = 0.32;
        aLz = 0.05;
        aRz = -0.05;
        bodyY = -0.02;
        break;
      case "think":
        aRx = -2.2;
        aRz = 0.55;
        hz = 0.18;
        hx = -0.08;
        break;
      case "surprised":
        aLz = 1.1;
        aRz = -1.1;
        hx = -0.18;
        lift = Math.max(0, Math.sin(Math.min(1, (this.poseUntil - t) / 1.2) * Math.PI)) * 0.08;
        break;
      case "nod":
        hx = Math.sin(t * 11) * 0.22;
        break;
      case "shake":
        hy = Math.sin(t * 12) * 0.35;
        break;
      case "sit":
        // Seated at a desk: thighs forward, hands resting in front, a little lower.
        lL = -1.45;
        lR = -1.45;
        aLx = -0.75;
        aRx = -0.75;
        aLz = 0.15;
        aRz = -0.15;
        bodyY = -0.05;
        hy = Math.sin(t * 0.43) * 0.06;
        break;
      default:
        hz = Math.sin(t * 0.7) * 0.05;
        // Idle glances around, but much less while looking at someone.
        hy = Math.sin(t * 0.43) * (this.lookTarget ? 0.04 : 0.12);
    }
    // The head turns towards whoever they are looking at (on top of the pose).
    hy += this.lookYaw;
    hx += this.lookPitch * 0.8;
    const k = Math.min(1, dt * 12);
    const damp = (cur: number, goal: number) => cur + (goal - cur) * k;
    this.armL.rotation.x = damp(this.armL.rotation.x, aLx);
    this.armL.rotation.z = damp(this.armL.rotation.z, aLz);
    this.armR.rotation.x = damp(this.armR.rotation.x, aRx);
    this.armR.rotation.z = damp(this.armR.rotation.z, aRz);
    this.legL.rotation.x = damp(this.legL.rotation.x, lL);
    this.legR.rotation.x = damp(this.legR.rotation.x, lR);
    this.head.rotation.x = damp(this.head.rotation.x, hx);
    this.head.rotation.y = damp(this.head.rotation.y, hy);
    this.head.rotation.z = damp(this.head.rotation.z, hz);
    this.body.scale.y = 1 + breathe;
    this.hop = damp(this.hop, lift);
    this.model.position.y = bodyY + this.hop;
    // A carried basket hangs upright from the hand whatever the arm does (exact inverse of the arm's XYZ turn).
    if (this.carrier) this.carrier.rotation.set(-this.armL.rotation.x, -this.armL.rotation.y, -this.armL.rotation.z, "ZYX");
  }

  private carrier: THREE.Group | null = null;

  /**
   * Carry something in the left hand by its handle (a shopping basket, origin at its bottom,
   * `handle` metres above it). Same size in the world whatever the person's scale; null drops it.
   */
  carry(obj: THREE.Object3D | null, handle = 0.33) {
    this.carrier?.removeFromParent();
    this.carrier = null;
    if (!obj) return;
    const s = this.look.scale ?? 1;
    const holder = new THREE.Group();
    holder.position.copy(this.hand.position);
    obj.scale.setScalar(1 / s);
    obj.position.set(0, -handle / s, 0.02 / s);
    holder.add(obj);
    this.armL.add(holder);
    this.carrier = holder;
  }

  /** What the left hand carries, if anything. */
  get carried(): THREE.Object3D | null {
    return this.carrier?.children[0] ?? null;
  }
}

/** Flat SVG portrait for the dialogue panel, drawn from the same look. */
export function portraitSvg(look: Look): string {
  const c = (x: Col) => "#" + new THREE.Color(x).getHexString();
  const skin = c(look.skin);
  const hair = c(look.hair);
  const shirt = c(look.shirt);
  const ex = look.extras ?? [];
  const ec = c(look.extraColor ?? "#ff7043");
  let back = "";
  let front = "";
  if (look.hairStyle === "bob") back += `<ellipse cx="50" cy="56" rx="38" ry="36" fill="${hair}"/>`;
  if (look.hairStyle === "pigtails") back += `<circle cx="14" cy="60" r="13" fill="${hair}"/><circle cx="86" cy="60" r="13" fill="${hair}"/>`;
  if (look.hairStyle === "bun") back += `<circle cx="50" cy="12" r="13" fill="${hair}"/>`;
  front += `<path d="M18 46 Q22 14 50 14 Q78 14 82 46 Q70 30 50 32 Q30 30 18 46Z" fill="${hair}"/>`;
  if (look.hairStyle === "spiky") front += `<path d="M24 30 L30 10 L40 24 L50 6 L60 24 L70 10 L76 30Z" fill="${hair}"/>`;
  if (ex.includes("cap")) front += `<path d="M18 36 Q20 10 50 10 Q80 10 82 36Z" fill="${ec}"/><rect x="40" y="32" width="46" height="7" rx="3" fill="${ec}"/>`;
  if (ex.includes("yellowHat")) front += `<ellipse cx="50" cy="31" rx="44" ry="8" fill="#ffc61a"/><path d="M22 31 Q24 6 50 6 Q76 6 78 31Z" fill="#ffd23f"/>`;
  if (ex.includes("bows")) front += `<circle cx="16" cy="44" r="6" fill="${ec}"/><circle cx="84" cy="44" r="6" fill="${ec}"/>`;
  let face = `<circle cx="36" cy="56" r="5" fill="#2a2233"/><circle cx="64" cy="56" r="5" fill="#2a2233"/><circle cx="37.6" cy="54" r="1.6" fill="#fff"/><circle cx="65.6" cy="54" r="1.6" fill="#fff"/>`;
  face += `<ellipse cx="27" cy="66" rx="6" ry="3.4" fill="#ff9aa8" opacity=".8"/><ellipse cx="73" cy="66" rx="6" ry="3.4" fill="#ff9aa8" opacity=".8"/>`;
  face += `<path d="M43 69 Q50 76 57 69" stroke="#7a3340" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  if (ex.includes("glasses")) face += `<circle cx="36" cy="56" r="9" stroke="#5b3a29" stroke-width="2.5" fill="none"/><circle cx="64" cy="56" r="9" stroke="#5b3a29" stroke-width="2.5" fill="none"/><path d="M45 56 L55 56" stroke="#5b3a29" stroke-width="2.5"/>`;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="22" y="80" width="56" height="30" rx="16" fill="${shirt}"/>
    ${back}<ellipse cx="50" cy="56" rx="32" ry="31" fill="${skin}"/>${front}${face}</svg>`;
}
