/**
 * Things children often draw instead of the target. Each appears and plays
 * briefly when recognised as a "surprise" (it does not complete the task).
 * Anything recognised without a model here becomes a living doodle (doodle.ts).
 */
import * as THREE from "three";
import { audio } from "../audio/audio.ts";
import type { Effects } from "../world/effects.ts";
import { Parts, mix, shade } from "../world/parts.ts";
import { animate, arc, ease, wait } from "../world/tween.ts";
import { addMesh, made, type Made } from "./made.ts";

export interface Roam {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PlayContext {
  effects: Effects;
  roam: Roam;
  /** Where the camera is looking from (things turn to show their face). */
  camera: THREE.Vector3;
}

const col = (tint: THREE.Color | null, fallback: THREE.ColorRepresentation) => (tint ? tint.clone() : new THREE.Color(fallback));

function eyes(p: Parts, x: number, y: number, z: number, r = 0.022, gap = 0.05) {
  for (const s of [-1, 1]) {
    p.sphere(r, "#262033", { p: [x + s * gap, y, z] }, 8, 6);
    p.sphere(r * 0.35, "#ffffff", { p: [x + s * gap + r * 0.3, y + r * 0.35, z + r * 0.8] }, 5, 4);
  }
}

function randomSpot(r: Roam, margin = 0.4): THREE.Vector3 {
  return new THREE.Vector3(
    r.minX + margin + Math.random() * (r.maxX - r.minX - margin * 2),
    0,
    r.minZ + margin + Math.random() * (r.maxZ - r.minZ - margin * 2)
  );
}

function headingTo(o: THREE.Object3D, x: number, z: number) {
  return Math.atan2(x - o.position.x, z - o.position.z);
}

async function turnTo(o: THREE.Object3D, h: number, dur = 0.25) {
  const h0 = o.rotation.y;
  let d = h - h0;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  await animate(dur, (k) => (o.rotation.y = h0 + d * ease.inOut(k)));
}

// ---------------------------------------------------------------- rabbit
export function buildRabbit(tint: THREE.Color | null): Made {
  const m = made("rabbit", 0.55, tint);
  const fur = col(tint, "#f5f1ea");
  const p = new Parts();
  p.sphere(0.16, fur, { p: [0, 0.16, 0], s: [1, 0.95, 1.15] }, 14, 10);
  p.sphere(0.12, fur, { p: [0, 0.34, 0.1] }, 14, 10);
  p.sphere(0.06, "#ffffff", { p: [0, 0.18, -0.17] }, 8, 6);
  p.sphere(0.018, "#ff8fab", { p: [0, 0.33, 0.215] }, 6, 4);
  eyes(p, 0, 0.37, 0.2, 0.02, 0.05);
  for (const s of [-1, 1]) {
    p.capsule(0.035, 0.2, fur, { p: [s * 0.05, 0.55, 0.06], r: [-0.15, 0, s * -0.18] });
    p.capsule(0.018, 0.16, "#ffc2d1", { p: [s * 0.052, 0.55, 0.085], r: [-0.15, 0, s * -0.18] });
    p.sphere(0.05, fur, { p: [s * 0.08, 0.04, 0.12], s: [1, 0.6, 1.6] }, 8, 6);
  }
  addMesh(m, p);
  return m;
}

async function playRabbit(m: Made, ctx: PlayContext) {
  const o = m.root;
  for (let i = 0; i < 5; i++) {
    const to = randomSpot(ctx.roam);
    const from = o.position.clone();
    to.sub(from).clampLength(0, 1.1).add(from);
    await turnTo(o, headingTo(o, to.x, to.z), 0.15);
    if (i % 2 === 0) audio.animal("rabbit");
    await animate(0.42, (k) => {
      o.position.lerpVectors(from, to, k);
      m.inner.position.y = arc(k) * 0.35;
      m.inner.scale.set(1, 1 + Math.sin(k * Math.PI) * 0.15, 1);
    });
    audio.bounce(1.8);
    await animate(0.12, (k) => m.inner.scale.set(1 + 0.15 * Math.sin(k * Math.PI), 1 - 0.18 * Math.sin(k * Math.PI), 1));
  }
}

// ---------------------------------------------------------------- cat
export function buildCat(tint: THREE.Color | null): Made {
  const m = made("cat", 0.5, tint);
  const fur = col(tint, "#ffb74d");
  const p = new Parts();
  p.capsule(0.12, 0.2, fur, { p: [0, 0.2, 0], r: [Math.PI / 2, 0, 0] });
  p.sphere(0.14, fur, { p: [0, 0.36, 0.17] }, 14, 10);
  for (const s of [-1, 1]) {
    p.cone(0.05, 0.09, fur, { p: [s * 0.08, 0.49, 0.15], r: [0, 0, s * -0.3] }, 6);
    p.cone(0.028, 0.05, "#ffc2d1", { p: [s * 0.08, 0.485, 0.17], r: [0, 0, s * -0.3] }, 6);
    p.cyl(0.035, 0.03, 0.14, fur, { p: [s * 0.07, 0.07, 0.14] }, 8);
    p.cyl(0.035, 0.03, 0.14, fur, { p: [s * 0.07, 0.07, -0.14] }, 8);
  }
  p.sphere(0.02, "#ff8fab", { p: [0, 0.34, 0.31] }, 6, 4);
  eyes(p, 0, 0.39, 0.29, 0.022, 0.055);
  p.sphere(0.05, mix(fur, "#ffffff", 0.6), { p: [0, 0.31, 0.27], s: [1.3, 0.7, 0.7] }, 8, 6);
  addMesh(m, p, "body");
  const tail = new Parts();
  tail.capsule(0.03, 0.28, shade(fur, 0.9), { p: [0, 0.4, -0.3], r: [-0.5, 0, 0] });
  addMesh(m, tail, "tail", { x: 0, y: 0.28, z: -0.24 });
  return m;
}

async function playCat(m: Made, ctx: PlayContext) {
  const o = m.root;
  const tail = m.parts.tail;
  let swish = 0;
  const swishing = animate(5, (_k, dt) => {
    swish += dt;
    tail.rotation.z = Math.sin(swish * 4) * 0.4;
  });
  for (let i = 0; i < 2; i++) {
    const to = randomSpot(ctx.roam);
    const from = o.position.clone();
    to.sub(from).clampLength(0, 1.6).add(from);
    await turnTo(o, headingTo(o, to.x, to.z), 0.25);
    const dist = from.distanceTo(to);
    await animate(dist / 0.9, (k) => {
      o.position.lerpVectors(from, to, k);
      m.inner.position.y = Math.abs(Math.sin(k * dist * 10)) * 0.02;
    });
  }
  await turnTo(o, headingTo(o, ctx.camera.x, ctx.camera.z), 0.3);
  audio.animal("cat");
  await animate(0.6, (k) => (m.inner.rotation.x = -Math.sin(k * Math.PI) * 0.15));
  await wait(0.6);
  swishing.cancel();
}

// ---------------------------------------------------------------- dog
export function buildDog(tint: THREE.Color | null): Made {
  const m = made("dog", 0.55, tint);
  const fur = col(tint, "#c58b5a");
  const p = new Parts();
  p.rbox(0.22, 0.2, 0.38, 0.09, fur, { p: [0, 0.24, 0] }, 2);
  p.sphere(0.15, fur, { p: [0, 0.42, 0.2] }, 14, 10);
  p.sphere(0.075, mix(fur, "#ffffff", 0.5), { p: [0, 0.38, 0.32], s: [1.1, 0.8, 1] }, 10, 8);
  p.sphere(0.03, "#2a2233", { p: [0, 0.41, 0.4] }, 8, 6);
  eyes(p, 0, 0.47, 0.32, 0.022, 0.06);
  for (const s of [-1, 1]) {
    p.sphere(0.07, shade(fur, 0.7), { p: [s * 0.14, 0.42, 0.16], s: [0.5, 1.3, 0.8] }, 8, 6);
    p.cyl(0.04, 0.035, 0.16, fur, { p: [s * 0.07, 0.08, 0.13] }, 8);
    p.cyl(0.04, 0.035, 0.16, fur, { p: [s * 0.07, 0.08, -0.13] }, 8);
  }
  addMesh(m, p, "body");
  const tail = new Parts();
  tail.capsule(0.03, 0.12, fur, { p: [0, 0.4, -0.23], r: [-0.8, 0, 0] });
  addMesh(m, tail, "tail", { x: 0, y: 0.33, z: -0.19 });
  return m;
}

async function playDog(m: Made, ctx: PlayContext) {
  const o = m.root;
  let wag = 0;
  const wagging = animate(6, (_k, dt) => {
    wag += dt;
    m.parts.tail.rotation.y = Math.sin(wag * 18) * 0.6;
  });
  for (let i = 0; i < 3; i++) {
    const to = randomSpot(ctx.roam);
    const from = o.position.clone();
    to.sub(from).clampLength(0, 2).add(from);
    await turnTo(o, headingTo(o, to.x, to.z), 0.15);
    const dist = from.distanceTo(to);
    await animate(dist / 2.2, (k) => {
      o.position.lerpVectors(from, to, k);
      m.inner.position.y = Math.abs(Math.sin(k * dist * 8)) * 0.06;
    });
    if (i === 1) {
      await turnTo(o, headingTo(o, ctx.camera.x, ctx.camera.z), 0.2);
      audio.animal("dog");
      await animate(0.5, (k) => (m.inner.position.y = arc(k) * 0.12));
    }
  }
  wagging.cancel();
}

// ---------------------------------------------------------------- fish
export function buildFish(tint: THREE.Color | null): Made {
  const m = made("fish", 0.3, tint);
  const c = col(tint, "#ff8a3d");
  const p = new Parts();
  p.sphere(0.16, c, { p: [0, 0.16, 0], s: [0.55, 0.85, 1.25] }, 14, 10);
  const fin = new THREE.Shape();
  fin.moveTo(0, 0);
  fin.lineTo(0.13, 0.11);
  fin.lineTo(0.13, -0.11);
  fin.closePath();
  p.extrude(fin, 0.02, shade(c, 0.85), { p: [0, 0.16, -0.18], r: [0, Math.PI / 2, 0] });
  p.extrude(fin, 0.015, shade(c, 0.85), { p: [0, 0.3, -0.02], r: [0, Math.PI / 2, Math.PI / 2], s: 0.6 });
  for (const s of [-1, 1]) {
    p.sphere(0.03, "#ffffff", { p: [s * 0.07, 0.2, 0.12] }, 8, 6);
    p.sphere(0.018, "#262033", { p: [s * 0.085, 0.2, 0.13] }, 6, 4);
  }
  p.torus(0.025, 0.006, shade(c, 0.6), { p: [0, 0.13, 0.19], r: [0, 0, Math.PI] }, Math.PI, 4, 8);
  addMesh(m, p);
  return m;
}

async function playFish(m: Made, ctx: PlayContext) {
  // A fish out of water flops about (and needs water!).
  for (let i = 0; i < 6; i++) {
    const from = m.root.position.clone();
    const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.5));
    to.x = Math.min(ctx.roam.maxX - 0.3, Math.max(ctx.roam.minX + 0.3, to.x));
    to.z = Math.min(ctx.roam.maxZ - 0.3, Math.max(ctx.roam.minZ + 0.3, to.z));
    const flip = i % 2 === 0 ? 1 : -1;
    audio.animal("fish");
    await animate(0.38, (k) => {
      m.root.position.lerpVectors(from, to, k);
      m.inner.position.y = arc(k) * 0.3;
      m.inner.rotation.z = flip * (Math.PI / 2) * (1 - Math.abs(k * 2 - 1)) * 0.9;
      m.inner.rotation.y = Math.sin(k * Math.PI * 2) * 0.5;
    });
    ctx.effects.burst({ x: to.x, y: 0.05, z: to.z }, 6, { colors: ["#bde7ff", "#ffffff"], speed: 1, size: 0.07 });
  }
}

// ---------------------------------------------------------------- bird
export function buildBird(tint: THREE.Color | null): Made {
  const m = made("bird", 0.3, tint);
  const c = col(tint, "#4fc3f7");
  const p = new Parts();
  p.sphere(0.12, c, { p: [0, 0.15, 0], s: [1, 0.95, 1.2] }, 14, 10);
  p.sphere(0.085, c, { p: [0, 0.27, 0.09] }, 12, 8);
  p.sphere(0.07, mix(c, "#ffffff", 0.6), { p: [0, 0.12, 0.07], s: [1, 1, 0.6] }, 10, 6);
  p.cone(0.03, 0.07, "#ffb300", { p: [0, 0.26, 0.19], r: [Math.PI / 2, 0, 0] }, 8);
  eyes(p, 0, 0.29, 0.155, 0.016, 0.045);
  p.cone(0.06, 0.12, shade(c, 0.8), { p: [0, 0.16, -0.17], r: [-Math.PI / 2 - 0.3, 0, 0], s: [1, 1, 0.3] }, 6);
  addMesh(m, p, "body");
  for (const s of [-1, 1]) {
    const w = new Parts();
    w.sphere(0.1, shade(c, 0.85), { p: [s * 0.14, 0.17, -0.01], s: [1, 0.25, 0.7] }, 10, 6);
    addMesh(m, w, s < 0 ? "wingL" : "wingR", { x: s * 0.08, y: 0.18, z: 0 });
  }
  return m;
}

async function playBird(m: Made, ctx: PlayContext) {
  const o = m.root;
  const c = new THREE.Vector3((ctx.roam.minX + ctx.roam.maxX) / 2, 0, (ctx.roam.minZ + ctx.roam.maxZ) / 2);
  const start = o.position.clone();
  const rx = (ctx.roam.maxX - ctx.roam.minX) * 0.3;
  const rz = (ctx.roam.maxZ - ctx.roam.minZ) * 0.3;
  audio.animal("bird");
  let flap = 0;
  await animate(4.2, (k, dt) => {
    flap += dt;
    m.parts.wingL.rotation.z = Math.sin(flap * 24) * 0.9;
    m.parts.wingR.rotation.z = -Math.sin(flap * 24) * 0.9;
    const a = k * Math.PI * 3;
    const target = new THREE.Vector3(c.x + Math.cos(a) * rx, 1.2 + Math.sin(a * 2) * 0.3, c.z + Math.sin(a) * rz);
    const blend = Math.min(1, k * 4);
    const prev = o.position.clone();
    o.position.lerpVectors(start, target, blend);
    if (k < 0.25) o.position.y = start.y + (1.2 - start.y) * blend;
    const d = o.position.clone().sub(prev);
    if (d.lengthSq() > 1e-6) o.rotation.y = Math.atan2(d.x, d.z);
    if (Math.random() < 0.02) audio.animal("bird");
  });
}

// ---------------------------------------------------------------- car
export function buildCar(tint: THREE.Color | null): Made {
  const m = made("car", 0.32, tint);
  const c = col(tint, "#e53935");
  const p = new Parts();
  p.rbox(0.3, 0.13, 0.5, 0.05, c, { p: [0, 0.12, 0] }, 2);
  p.rbox(0.26, 0.12, 0.26, 0.05, c, { p: [0, 0.23, -0.03] }, 2);
  p.box(0.27, 0.07, 0.2, "#a8e4ff", { p: [0, 0.24, -0.03] });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) p.cyl(0.06, 0.06, 0.05, "#2b2b33", { p: [sx * 0.15, 0.06, sz * 0.16], r: [0, 0, Math.PI / 2] }, 12);
    p.sphere(0.025, "#fff59d", { p: [sx * 0.09, 0.13, 0.25] }, 8, 6);
  }
  addMesh(m, p);
  return m;
}

async function playCar(m: Made, ctx: PlayContext) {
  const o = m.root;
  const center = o.position.clone();
  const r = Math.min(1.2, (ctx.roam.maxX - ctx.roam.minX) * 0.25);
  audio.animal("car");
  const start = o.position.clone();
  await animate(3.4, (k) => {
    const a = k * Math.PI * 2.5;
    const target = new THREE.Vector3(center.x + Math.sin(a) * r, 0, center.z + (1 - Math.cos(a)) * r * 0.6);
    const prev = o.position.clone();
    o.position.lerpVectors(start, target, Math.min(1, k * 6));
    const d = o.position.clone().sub(prev);
    if (d.lengthSq() > 1e-7) o.rotation.y = Math.atan2(d.x, d.z);
    m.inner.position.y = Math.abs(Math.sin(k * 60)) * 0.008;
  });
  audio.animal("car");
}

// ---------------------------------------------------------------- sun, star
export function buildSun(tint: THREE.Color | null): Made {
  const m = made("sun", 0.6, tint);
  const c = col(tint, "#ffca28");
  const p = new Parts();
  p.sphere(0.2, c, { p: [0, 0.3, 0] }, 16, 12);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.cone(0.05, 0.12, "#ffa000", { p: [Math.cos(a) * 0.27, 0.3 + Math.sin(a) * 0.27, 0], r: [0, 0, a - Math.PI / 2] }, 6);
  }
  eyes(p, 0, 0.34, 0.18, 0.025, 0.07);
  p.torus(0.06, 0.012, "#c56000", { p: [0, 0.26, 0.19], r: [0.2, 0, Math.PI] }, Math.PI, 4, 10);
  addMesh(m, p);
  return m;
}

async function playSun(m: Made, ctx: PlayContext) {
  const y0 = m.root.position.y;
  await animate(1.3, (k) => {
    m.root.position.y = y0 + ease.out(k) * 1.6;
    m.inner.rotation.z = k * Math.PI;
  });
  for (let i = 0; i < 20; i++) ctx.effects.twinkle({ x: m.root.position.x, y: m.root.position.y + 0.3, z: m.root.position.z }, 0.5, "#fff59d");
  audio.sparkle(6, 784);
  await animate(1.8, (k) => (m.inner.rotation.z = Math.PI + k * Math.PI * 1.5));
}

export function buildStar(tint: THREE.Color | null): Made {
  const m = made("star", 0.4, tint);
  const c = col(tint, "#ffd54f");
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.22 : 0.1;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const p = new Parts();
  p.extrude(shape, 0.07, c, { p: [0, 0.24, 0] }, 0.02);
  eyes(p, 0, 0.26, 0.06, 0.02, 0.045);
  p.torus(0.03, 0.008, shade(c, 0.5), { p: [0, 0.21, 0.065], r: [0, 0, Math.PI] }, Math.PI, 4, 8);
  addMesh(m, p);
  return m;
}

async function playStar(m: Made, ctx: PlayContext) {
  const y0 = m.root.position.y;
  audio.sparkle(7, 1046);
  await animate(3, (k) => {
    m.root.position.y = y0 + ease.out(Math.min(1, k * 1.5)) * 1.2 + Math.sin(k * 12) * 0.05;
    m.inner.rotation.y = k * Math.PI * 6;
    if (Math.random() < 0.4) ctx.effects.twinkle({ x: m.root.position.x, y: m.root.position.y + 0.24, z: m.root.position.z }, 0.3, "#fff59d");
  });
}

// ---------------------------------------------------------------- flower
export function buildFlower(tint: THREE.Color | null): Made {
  const m = made("flower", 0.5, tint);
  const c = col(tint, "#f06292");
  const p = new Parts();
  p.cyl(0.015, 0.018, 0.36, "#43a047", { p: [0, 0.18, 0] }, 6);
  for (const s of [-1, 1]) p.sphere(0.06, "#66bb6a", { p: [s * 0.06, 0.14, 0], s: [1.4, 0.3, 0.7], r: [0, 0, s * 0.5] }, 8, 6);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.sphere(0.065, c, { p: [Math.cos(a) * 0.08, 0.42 + Math.sin(a) * 0.08, 0], s: [1, 1, 0.4] }, 10, 6);
  }
  p.sphere(0.055, "#ffd54f", { p: [0, 0.42, 0.02], s: [1, 1, 0.6] }, 10, 8);
  eyes(p, 0, 0.43, 0.05, 0.012, 0.022);
  addMesh(m, p);
  return m;
}

async function playFlower(m: Made, ctx: PlayContext) {
  await animate(0.8, (k) => m.inner.scale.setScalar(0.2 + 0.8 * ease.elastic(k)));
  audio.sparkle(4, 1318);
  ctx.effects.burst({ x: m.root.position.x, y: 0.45, z: m.root.position.z }, 18, { colors: ["#f8bbd0", "#fff59d", "#ffffff"], speed: 1.2 });
  await animate(2.4, (k) => (m.inner.rotation.z = Math.sin(k * Math.PI * 4) * 0.15));
}

// ---------------------------------------------------------------- balls, apple
export function buildBall(kind: "soccer ball" | "basketball" | "baseball", tint: THREE.Color | null): Made {
  const m = made(kind, 0.32, tint);
  const p = new Parts();
  const r = kind === "baseball" ? 0.11 : 0.16;
  if (kind === "soccer ball") {
    p.sphere(r, "#fafafa", { p: [0, r, 0] }, 18, 14);
    const dirs = [[0, 1, 0], [0, -1, 0], [1, 0.3, 0.5], [-1, 0.3, 0.5], [0.4, 0.3, -1], [-0.4, 0.3, -1], [0.7, -0.4, 0.8], [-0.7, -0.4, 0.8], [0, -0.3, 1], [0, 0.4, -0.9], [1, -0.5, -0.4], [-1, -0.5, -0.4]];
    for (const d of dirs) {
      const v = new THREE.Vector3(...(d as [number, number, number])).normalize().multiplyScalar(r * 0.93);
      const patch = new THREE.CircleGeometry(r * 0.34, 5);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().normalize());
      patch.applyQuaternion(q);
      patch.translate(v.x, v.y + r, v.z);
      p.add(patch, "#262626", { p: v.clone().normalize().multiplyScalar(0.012).toArray() as [number, number, number] });
    }
  } else if (kind === "basketball") {
    const c = col(tint, "#f57c00");
    p.sphere(r, c, { p: [0, r, 0] }, 18, 14);
    p.torus(r * 1.005, 0.006, "#3b2314", { p: [0, r, 0] }, Math.PI * 2, 4, 28);
    p.torus(r * 1.005, 0.006, "#3b2314", { p: [0, r, 0], r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 4, 28);
    p.torus(r * 0.8, 0.006, "#3b2314", { p: [0, r, r * 0.6] }, Math.PI * 2, 4, 24);
    p.torus(r * 0.8, 0.006, "#3b2314", { p: [0, r, -r * 0.6] }, Math.PI * 2, 4, 24);
  } else {
    p.sphere(r, "#fafafa", { p: [0, r, 0] }, 16, 12);
    p.torus(r * 0.7, 0.006, "#e53935", { p: [r * 0.45, r, 0], r: [0, Math.PI / 2, 0] }, Math.PI * 2, 4, 20);
    p.torus(r * 0.7, 0.006, "#e53935", { p: [-r * 0.45, r, 0], r: [0, Math.PI / 2, 0] }, Math.PI * 2, 4, 20);
  }
  addMesh(m, p);
  m.height = r * 2;
  return m;
}

/** Simple sphere physics: gravity, floor bounce, wall bounce (Level 5 preview). */
async function playBall(m: Made, ctx: PlayContext) {
  const r = m.height / 2;
  const v = new THREE.Vector3((Math.random() - 0.5) * 3, 3.2, (Math.random() - 0.5) * 2);
  const o = m.root;
  await animate(4, (_k, dt) => {
    v.y -= 9.8 * dt;
    o.position.addScaledVector(v, dt);
    if (o.position.y < 0) {
      o.position.y = 0;
      if (v.y < -0.6) audio.bounce(1.2 + Math.random() * 0.2);
      v.y = -v.y * 0.72;
      v.x *= 0.92;
      v.z *= 0.92;
    }
    if (o.position.x < ctx.roam.minX + r || o.position.x > ctx.roam.maxX - r) v.x = -v.x;
    if (o.position.z < ctx.roam.minZ + r || o.position.z > ctx.roam.maxZ - r) v.z = -v.z;
    o.position.x = Math.min(ctx.roam.maxX - r, Math.max(ctx.roam.minX + r, o.position.x));
    o.position.z = Math.min(ctx.roam.maxZ - r, Math.max(ctx.roam.minZ + r, o.position.z));
    m.inner.rotation.x += v.z * dt / r;
    m.inner.rotation.z -= v.x * dt / r;
  });
}

export function buildApple(tint: THREE.Color | null): Made {
  const m = made("apple", 0.3, tint);
  const c = col(tint, "#e53935");
  const p = new Parts();
  p.sphere(0.13, c, { p: [0, 0.13, 0], s: [1.05, 0.95, 1.05] }, 16, 12);
  p.cyl(0.008, 0.01, 0.07, "#6d4c41", { p: [0, 0.27, 0], r: [0, 0, 0.2] }, 6);
  p.sphere(0.04, "#66bb6a", { p: [0.04, 0.28, 0], s: [1.4, 0.35, 0.8], r: [0, 0, -0.4] }, 8, 6);
  addMesh(m, p);
  return m;
}

async function playApple(m: Made, ctx: PlayContext) {
  await playBall(m, { ...ctx, roam: ctx.roam });
}

// ---------------------------------------------------------------- registry
export interface SurpriseKind {
  build(tint: THREE.Color | null): Made;
  play(m: Made, ctx: PlayContext): Promise<void>;
}

export const SURPRISES: Record<string, SurpriseKind> = {
  rabbit: { build: buildRabbit, play: playRabbit },
  cat: { build: buildCat, play: playCat },
  dog: { build: buildDog, play: playDog },
  fish: { build: buildFish, play: playFish },
  bird: { build: buildBird, play: playBird },
  duck: { build: (t) => buildBird(t ?? new THREE.Color("#ffe066")), play: playBird },
  car: { build: buildCar, play: playCar },
  bus: { build: (t) => buildCar(t ?? new THREE.Color("#ffb300")), play: playCar },
  sun: { build: buildSun, play: playSun },
  star: { build: buildStar, play: playStar },
  flower: { build: buildFlower, play: playFlower },
  "soccer ball": { build: (t) => buildBall("soccer ball", t), play: playBall },
  basketball: { build: (t) => buildBall("basketball", t), play: playBall },
  baseball: { build: (t) => buildBall("baseball", t), play: playBall },
  apple: { build: buildApple, play: playApple }
};
