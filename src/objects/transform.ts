/**
 * The magical transformation (plan §4): the sketch glows, lifts off the page,
 * flies along an arc leaving sparkles, bursts at its place, and the object
 * unfolds while its colours are painted in from bottom to top behind a golden
 * line. Then the kind's own entrance plays.
 */
import * as THREE from "three";
import { audio } from "../audio/audio.ts";
import { renderDrawing, type Drawing } from "../draw/drawing.ts";
import type { Effects } from "../world/effects.ts";
import type { Engine } from "../world/engine.ts";
import { magicMaterial, vividMat } from "../world/materials.ts";
import { animate, arc, ease } from "../world/tween.ts";
import { meshesOf, type Made } from "./made.ts";

export interface FlyFrom {
  /** Centre of the drawing on screen (CSS px) and its size. */
  x: number;
  y: number;
  size: number;
}

/** The glowing sketch flies from the page to a point in the world. */
export async function flySketch(engine: Engine, scene: THREE.Scene, effects: Effects, drawing: Drawing, from: FlyFrom, to: THREE.Vector3, endSize: number): Promise<void> {
  const canvas = renderDrawing(drawing, { size: 256, color: "#fff7d6", glow: "#ffd54f", lineWidth: 11, pad: 26 });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.renderOrder = 20;
  const dist = 3;
  const start = engine.fromScreen(from.x, from.y, dist);
  const worldH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2));
  const startSize = (from.size / window.innerHeight) * worldH;
  sprite.scale.setScalar(startSize);
  sprite.position.copy(start);
  scene.add(sprite);
  audio.whoosh(0.9);
  const ctrl = start.clone().lerp(to, 0.5);
  ctrl.y += 1.4;
  const p = new THREE.Vector3();
  await animate(0.95, (k) => {
    const e = ease.inOut(k);
    const a = (1 - e) * (1 - e);
    const b = 2 * (1 - e) * e;
    const c = e * e;
    p.set(a * start.x + b * ctrl.x + c * to.x, a * start.y + b * ctrl.y + c * to.y, a * start.z + b * ctrl.z + c * to.z);
    sprite.position.copy(p);
    sprite.scale.setScalar(startSize + (endSize - startSize) * e);
    mat.rotation = e * Math.PI * 2;
    for (let i = 0; i < 3; i++) effects.emit(p, { spread: 0.25, life: 0.7, size: 0.1, gravity: -0.4 });
  });
  scene.remove(sprite);
  mat.dispose();
  tex.dispose();
}

/** Unfold a built object at its place with the colour reveal. */
export async function materialize(scene: THREE.Scene, effects: Effects, m: Made, at: THREE.Vector3, rot: THREE.Euler | number = 0): Promise<void> {
  m.root.position.copy(at);
  if (typeof rot === "number") m.root.rotation.set(0, rot, 0);
  else m.root.rotation.copy(rot);
  scene.add(m.root);
  m.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(m.inner);
  const magic = magicMaterial(box.min.y, box.max.y + 0.02);
  const meshes = meshesOf(m.inner).filter((x) => x.material === vividMat);
  meshes.forEach((x) => (x.material = magic.material));
  audio.magic();
  const center = box.getCenter(new THREE.Vector3());
  effects.burst(center, 46, { speed: 2.4, size: 0.12 });
  await animate(0.85, (k) => {
    const s = ease.back(Math.min(1, k * 1.25));
    m.inner.scale.set(1.25 - 0.25 * s, Math.max(0.05, s), 1.25 - 0.25 * s);
    m.inner.rotation.y = (1 - ease.out(k)) * Math.PI;
    magic.reveal.value = ease.inOut(k);
    if (Math.random() < 0.6) effects.twinkle(center, Math.max(0.15, m.height * 0.6));
  });
  m.inner.scale.set(1, 1, 1);
  m.inner.rotation.y = 0;
  meshes.forEach((x) => (x.material = vividMat));
  magic.material.dispose();
}

/** A magic copy hops out of `from` to its own place. */
export async function copyFrom(scene: THREE.Scene, effects: Effects, from: THREE.Vector3, m: Made, at: THREE.Vector3, rot: THREE.Euler): Promise<void> {
  m.root.position.copy(from);
  m.root.rotation.copy(rot);
  m.inner.scale.setScalar(0.2);
  scene.add(m.root);
  audio.pop(1.2 + Math.random() * 0.4);
  const start = from.clone();
  await animate(0.55, (k) => {
    m.root.position.lerpVectors(start, at, ease.inOut(k));
    m.root.position.y += arc(k) * 0.45;
    m.inner.scale.setScalar(0.2 + 0.8 * ease.back(k));
    m.inner.rotation.y = (1 - k) * Math.PI * 2;
  });
  m.root.position.copy(at);
  m.inner.rotation.y = 0;
  m.inner.scale.setScalar(1);
  effects.burst(at.clone().add(new THREE.Vector3(0, m.height * 0.5, 0)), 10, { speed: 1, size: 0.08 });
}

/** Puff! (a surprise leaves). */
export async function poof(scene: THREE.Scene, effects: Effects, m: Made): Promise<void> {
  const c = new THREE.Box3().setFromObject(m.root).getCenter(new THREE.Vector3());
  audio.pop(0.8);
  effects.burst(c, 36, { speed: 2, size: 0.13, colors: ["#ffffff", "#e3f2fd", "#fff9c4"] });
  await animate(0.25, (k) => m.root.scale.setScalar(1 - ease.in(k)));
  scene.remove(m.root);
}
