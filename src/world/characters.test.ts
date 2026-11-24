import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CAST } from "../game/cast.ts";
import { buildBat, buildRacket } from "../objects/gym.ts";
import { buildBasket } from "../objects/market.ts";
import { Character, type Pose } from "./characters.ts";

vi.mock("./materials.ts", async (importOriginal) => ({
  ...await importOriginal<typeof import("./materials.ts")>(),
  blobShadow: () => new THREE.Mesh()
}));

const poses: Pose[] = ["idle", "walk", "talk", "cheer", "wave", "point", "give", "sad", "think", "surprised", "nod", "shake", "jump", "laugh", "sit"];

// Distance to the surface or interior of a finite circular frustum, in model units.
function bandDistance(r: number, y: number, bottom: number, top: number, lower: number, upper: number): number {
  if (y >= bottom && y <= top && r <= THREE.MathUtils.lerp(lower, upper, (y - bottom) / (top - bottom))) return 0;
  const dy = top - bottom, dr = upper - lower;
  const t = THREE.MathUtils.clamp(((y - bottom) * dy + (r - lower) * dr) / (dy * dy + dr * dr), 0, 1);
  return Math.min(
    Math.hypot(y - bottom - dy * t, r - lower - dr * t),
    Math.hypot(y - bottom, Math.max(0, r - lower)),
    Math.hypot(y - top, Math.max(0, r - upper))
  );
}

function bodyDistance(c: Character, p: THREE.Vector3): number {
  const r = Math.hypot(p.x, p.z), scale = c.body.scale.y;
  return Math.min(
    bandDistance(r, p.y, 0.34 * scale, 0.72 * scale, 0.2, 0.17),
    bandDistance(r, p.y, 0.71 * scale, 0.7865 * scale, 0.17, 0.17),
    c.look.skirt
      ? bandDistance(r, p.y, 0.28 * scale, 0.48 * scale, 0.28, 0.2)
      : bandDistance(r, p.y, 0.33 * scale, 0.41 * scale, 0.2, 0.2)
  );
}

function armClearance(c: Character, arm: THREE.Group): number {
  const shoulder = arm.getWorldPosition(new THREE.Vector3());
  const hand = arm.localToWorld(new THREE.Vector3(0, -0.29, 0));
  const p = new THREE.Vector3();
  const inverse = c.model.matrixWorld.clone().invert();
  let margin = Infinity;
  for (let i = 0; i <= 29; i++) {
    p.lerpVectors(shoulder, hand, i / 29).applyMatrix4(inverse);
    margin = Math.min(margin, bodyDistance(c, p));
  }
  // Check the thickness as well as the centre line, including the round sleeve ends and hand.
  for (let i = 0; i <= 17; i++) {
    p.lerpVectors(shoulder, hand, (0.045 + i * 0.01) / 0.29).applyMatrix4(inverse);
    margin = Math.min(margin, bodyDistance(c, p) - 0.055);
  }
  return Math.min(margin, bodyDistance(c, hand.applyMatrix4(inverse)) - 0.062);
}

function modelBounds(c: Character, obj: THREE.Object3D): THREE.Box3 {
  const inverse = c.model.matrixWorld.clone().invert();
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const box = new THREE.Box3();
  obj.updateWorldMatrix(true, true);
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    matrix.multiplyMatrices(inverse, o.matrixWorld);
    const vertices = o.geometry.getAttribute("position");
    for (let i = 0; i < vertices.count; i++) box.expandByPoint(point.fromBufferAttribute(vertices, i).applyMatrix4(matrix));
  });
  return box;
}

function propClearance(c: Character, obj: THREE.Object3D): number {
  const box = modelBounds(c, obj);
  const x = THREE.MathUtils.clamp(0, box.min.x, box.max.x);
  const z = THREE.MathUtils.clamp(0, box.min.z, box.max.z);
  const radialPoint = new THREE.Vector3(x, 0, z);
  let margin = Infinity;
  for (let i = 0; i <= 24; i++) {
    radialPoint.y = THREE.MathUtils.lerp(box.min.y, box.max.y, i / 24);
    margin = Math.min(margin, bodyDistance(c, radialPoint));
  }
  for (const leg of [c.legL, c.legR]) {
    const b = modelBounds(c, leg);
    const gap = Math.max(b.min.x - box.max.x, box.min.x - b.max.x, b.min.y - box.max.y, box.min.y - b.max.y, b.min.z - box.max.z, box.min.z - b.max.z);
    margin = Math.min(margin, gap);
  }
  return margin;
}

describe("character arm poses", () => {
  it.each(Object.values(CAST))("keeps $name's arm segments clear in every pose and with props", ({ look }) => {
    const c = new Character(look);
    const racket = buildRacket(null);
    const bat = buildBat(null);
    const basket = buildBasket();
    const scale = 0.8 / (look.scale ?? 1);
    for (const prop of [null, basket, racket.root, bat.root]) {
      c.carry(prop === basket ? basket : null);
      c.emptyHand();
      if (prop === racket.root) c.hold(prop, { length: racket.height, grip: 0.14, scale, turn: 0.7 });
      if (prop === bat.root) c.hold(prop, { length: bat.height, grip: 0.12, scale, turn: 0.7 });
      for (const pose of poses) {
        c.place(3, -2, 0.73);
        c.emote(pose, 2);
        if (pose === "walk") void c.walkTo(7, -2);
        let armMargin = Infinity, propMargin = Infinity;
        // Over a full walk cycle and through the damped transition into each pose.
        for (let frame = 0; frame < 30; frame++) {
          c.update(1 / 30);
          armMargin = Math.min(armMargin, armClearance(c, c.armL), armClearance(c, c.armR));
          if (prop && frame % 5 === 0) propMargin = Math.min(propMargin, propClearance(c, prop));
        }
        expect(armMargin, `${pose}, ${prop?.name || "empty hands"}`).toBeGreaterThan(0.002);
        if (prop) expect(propMargin, `${pose}, ${prop.name}`).toBeGreaterThan(0.001);
        c.stop();
      }
    }
  });

  it("detects the old unclamped idle pose cutting into a skirt", () => {
    const c = new Character(CAST.penny.look);
    c.armL.rotation.set(0, 0, 0.1);
    expect(armClearance(c, c.armL)).toBeLessThan(0);
    c.update(1 / 12);
    expect(armClearance(c, c.armL)).toBeGreaterThan(0.002);
  });
});

describe("character separation", () => {
  const scene = new THREE.Scene();
  const dt = 1 / 30;
  const npc = (x: number, z: number, id: "ken" | "penny" | "mori" | "player" = "ken") => {
    const c = new Character(CAST[id].look);
    scene.add(c.root);
    c.place(x, z);
    if (id === "player") c.driveCollide = () => false;
    return c;
  };
  const gap = (a: Character, b: Character) => a.position.distanceTo(b.position) - a.radius - b.radius;

  afterEach(() => scene.clear());

  it("finishes two routes toward the same target at separate free points", async () => {
    const a = npc(-2, 0), b = npc(2, 0);
    const aWalk = a.go(0, 0), bWalk = b.go(0, 0);
    for (let i = 0; i < 150; i++) {
      a.update(dt);
      b.update(dt);
      expect(gap(a, b)).toBeGreaterThanOrEqual(-1e-8);
    }
    expect(a.moving || b.moving).toBe(false);
    expect(await Promise.all([aWalk, bWalk])).toEqual([true, true]);
    expect(gap(a, b)).toBeGreaterThan(0.14);
    expect(Math.min(a.position.length(), b.position.length())).toBeLessThan(0.05);
    expect(Math.max(a.position.length(), b.position.length())).toBeLessThan(0.725);
  });

  it("steers a walking NPC around a standing NPC even with doorway wall collision disabled", async () => {
    const a = npc(-2, 0), b = npc(0, 0);
    const walk = a.walkTo(2, 0);
    let sidestep = 0;
    for (let i = 0; i < 150; i++) {
      a.update(dt);
      b.update(dt);
      expect(gap(a, b)).toBeGreaterThanOrEqual(-1e-8);
      sidestep = Math.max(sidestep, Math.abs(a.position.z));
    }
    expect(a.moving).toBe(false);
    await walk;
    expect(sidestep).toBeGreaterThan(0.5);
    expect(a.position.distanceTo(new THREE.Vector3(2, 0, 0))).toBeLessThan(0.05);
    expect(b.position.toArray()).toEqual([0, 0, 0]);
  });

  it("projects an occupied target to the nearest free point in open space", async () => {
    const a = npc(-2, 0), b = npc(0, 0);
    const walk = a.go(-0.1, 0.1);
    for (let i = 0; i < 150; i++) a.update(dt);
    expect(a.moving).toBe(false);
    await walk;
    const expected = new THREE.Vector3(-1, 0, 1).setLength(a.radius + b.radius + 0.15);
    expect(a.position.distanceTo(expected)).toBeLessThan(0.015);
  });

  it("ends a blocked route when two people cannot pass in a narrow corridor", async () => {
    const a = npc(-2, 0), b = npc(0, 0);
    a.collide = (_x, z, r) => Math.abs(z) + r > 0.43;
    const walk = a.go(2, 0);
    for (let i = 0; i < 150; i++) {
      a.update(dt);
      expect(gap(a, b)).toBeGreaterThanOrEqual(-1e-8);
    }
    expect(a.moving).toBe(false);
    await walk;
    expect(a.position.x).toBeLessThan(-0.45);
  });

  it("unwinds a scripted overlap without pushing the player or crossing a wall", () => {
    const player = npc(-0.1, 0, "player"), a = npc(0, 0);
    a.collide = (x, _z, r) => x + r > 0.26;
    for (let i = 0; i < 120; i++) {
      player.update(dt);
      a.update(dt);
      expect(a.position.x + a.radius).toBeLessThanOrEqual(0.26);
    }
    expect(gap(a, player)).toBeGreaterThanOrEqual(-1e-6);
    expect(player.position.toArray()).toEqual([-0.1, 0, 0]);
  });

  it("keeps talking positions and ignores people in other scenes", async () => {
    const a = npc(0, 0, "penny"), b = npc(0.85, 0, "mori");
    a.setBase("talk");
    b.setBase("talk");
    for (let i = 0; i < 30; i++) {
      a.update(dt);
      b.update(dt);
    }
    expect(a.position.x).toBe(0);
    expect(b.position.x).toBe(0.85);
    const otherScene = new THREE.Scene();
    otherScene.add(b.root);
    try {
      const walk = a.go(0.85, 0);
      for (let i = 0; i < 60; i++) a.update(dt);
      expect(a.moving).toBe(false);
      await walk;
      expect(a.position.distanceTo(b.position)).toBeLessThan(0.05);
    } finally {
      otherScene.clear();
    }
  });
});
