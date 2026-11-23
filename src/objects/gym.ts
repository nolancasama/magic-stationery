/**
 * Level 5 models: soccer ball, basketball, hoop (ring and net), racket, bat,
 * and the small balls the people play with. Chunky primitives in the same toy
 * style as the stationery. They are the faint "missing" outlines in the gym and,
 * in models mode (?models=1), the equipment itself. Origin at the bottom, +Z front.
 */
import * as THREE from "three";
import { vividMat } from "../world/materials.ts";
import { Parts, shade } from "../world/parts.ts";
import { addMesh, made, type Made } from "./made.ts";

const col = (tint: THREE.Color | null, fallback: string) => (tint ? "#" + tint.getHexString() : fallback);

export function buildSoccerBall(tint: THREE.Color | null): Made {
  const m = made("soccerBall", 0.3, tint);
  const c = col(tint, "#fafafa");
  const p = new Parts();
  p.sphere(0.15, c, { p: [0, 0.15, 0] }, 16, 12);
  // Dark patches around the ball.
  for (const [x, y, z] of [[0, 0.15, 0.148], [0.14, 0.2, 0.04], [-0.14, 0.2, 0.04], [0.08, 0.04, 0.1], [-0.08, 0.04, 0.1], [0, 0.29, 0.03], [0, 0.15, -0.148]] as const)
    p.sphere(0.045, "#263238", { p: [x, y, z], s: [1, 1, 0.35] }, 6, 4);
  addMesh(m, p);
  return m;
}

export function buildBasketball(tint: THREE.Color | null): Made {
  const m = made("basketball", 0.3, tint);
  const c = col(tint, "#ef6c00");
  const p = new Parts();
  p.sphere(0.15, c, { p: [0, 0.15, 0] }, 16, 12);
  p.torus(0.151, 0.005, shade(c, 0.4), { p: [0, 0.15, 0] }, Math.PI * 2, 4, 24);
  p.torus(0.151, 0.005, shade(c, 0.4), { p: [0, 0.15, 0], r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 4, 24);
  p.torus(0.151, 0.005, shade(c, 0.4), { p: [0, 0.15, 0], r: [0, Math.PI / 2, 0] }, Math.PI * 2, 4, 24);
  addMesh(m, p);
  return m;
}

/** A ring with its net hanging below (origin at the bottom of the net). */
export function buildHoop(tint: THREE.Color | null): Made {
  const m = made("hoop", 0.5, tint);
  const c = col(tint, "#e53935");
  const p = new Parts();
  p.torus(0.2, 0.018, c, { p: [0, 0.48, 0], r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 6, 24);
  // The net: strands narrowing towards the bottom.
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const top = new THREE.Vector3(Math.cos(a) * 0.19, 0.47, Math.sin(a) * 0.19);
    const bot = new THREE.Vector3(Math.cos(a + 0.4) * 0.11, 0.08, Math.sin(a + 0.4) * 0.11);
    const mid = top.clone().add(bot).multiplyScalar(0.5);
    const len = top.distanceTo(bot);
    const dir = bot.clone().sub(top).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const e = new THREE.Euler().setFromQuaternion(q);
    p.cyl(0.006, 0.006, len, "#fafafa", { p: [mid.x, mid.y, mid.z], r: [e.x, e.y, e.z] }, 4);
  }
  p.torus(0.11, 0.006, "#fafafa", { p: [0, 0.08, 0], r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 4, 16);
  addMesh(m, p);
  return m;
}

export function buildRacket(tint: THREE.Color | null): Made {
  const m = made("racket", 0.62, tint);
  const c = col(tint, "#1e88e5");
  const p = new Parts();
  // Handle at the bottom, the head above.
  p.cyl(0.02, 0.022, 0.26, "#37474f", { p: [0, 0.13, 0] }, 8);
  p.cyl(0.012, 0.012, 0.1, c, { p: [0, 0.3, 0] }, 6);
  p.torus(0.13, 0.014, c, { p: [0, 0.47, 0], s: [1, 1.25, 1] }, Math.PI * 2, 6, 22);
  for (let i = -2; i <= 2; i++) {
    p.box(0.004, 0.3, 0.004, "#eceff1", { p: [i * 0.045, 0.47, 0] });
    p.box(0.24, 0.004, 0.004, "#eceff1", { p: [0, 0.47 + i * 0.055, 0] });
  }
  addMesh(m, p);
  return m;
}

export function buildBat(tint: THREE.Color | null): Made {
  const m = made("bat", 0.8, tint);
  const c = col(tint, "#c69a6d");
  const p = new Parts();
  // Handle at the bottom, thickening towards the top.
  p.cyl(0.022, 0.022, 0.03, shade(c, 0.7), { p: [0, 0.015, 0] }, 10);
  p.cyl(0.05, 0.018, 0.75, c, { p: [0, 0.405, 0] }, 12);
  p.sphere(0.05, c, { p: [0, 0.78, 0], s: [1, 0.5, 1] }, 10, 6);
  addMesh(m, p);
  return m;
}

/** The small balls people play with (tennis: yellow, baseball: white). Origin at the centre. */
export function buildPlayBall(color: string, r = 0.05): THREE.Mesh {
  const p = new Parts();
  p.sphere(r, color, {}, 12, 8);
  if (color === "#fafafa") p.torus(r * 0.98, r * 0.08, "#e53935", { r: [0, 0, 0.5] }, Math.PI * 2, 4, 16);
  return p.mesh(vividMat);
}

/** A goal frame with a net, facing +X (decor at the left wall of the gym). */
export function buildGoalNet(): THREE.Group {
  const p = new Parts();
  for (const z of [-1, 1]) p.box(0.06, 1.2, 0.06, "#fafafa", { p: [0, 0.6, z * 0.95] });
  p.box(0.06, 0.06, 1.96, "#fafafa", { p: [0, 1.2, 0] });
  // The net behind: a slanted back and sides.
  for (let i = 0; i <= 8; i++) p.box(0.01, 1.2, 0.01, "#e0e0e0", { p: [-0.45, 0.6, -0.95 + i * 0.2375] });
  for (let j = 0; j <= 5; j++) p.box(0.01, 0.01, 1.9, "#e0e0e0", { p: [-0.45, j * 0.24, 0] });
  for (const z of [-1, 1]) p.box(0.45, 0.01, 0.01, "#e0e0e0", { p: [-0.225, 1.2, z * 0.95] });
  const g = new THREE.Group();
  g.add(p.mesh(vividMat));
  return g;
}
