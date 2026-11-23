/**
 * Level 3 models: elephant, monkey, panda, penguin, banana, bamboo. Chunky
 * primitives in the same toy style as the stationery. They are the faint
 * "missing" outlines in the zoo and, in models mode (?models=1), the animals.
 * Origin at the feet, facing +Z.
 */
import * as THREE from "three";
import { Parts, shade } from "../world/parts.ts";
import { addMesh, made, type Made } from "./made.ts";

const col = (tint: THREE.Color | null, fallback: string) => (tint ? "#" + tint.getHexString() : fallback);

export function buildElephant(tint: THREE.Color | null): Made {
  const m = made("elephant", 0.9, tint);
  const c = col(tint, "#9aa5b1");
  const p = new Parts();
  p.sphere(0.36, c, { p: [0, 0.5, 0], s: [1, 0.85, 1.25] }, 16, 12);
  for (const [x, z] of [[-0.2, 0.25], [0.2, 0.25], [-0.2, -0.25], [0.2, -0.25]]) p.cyl(0.1, 0.11, 0.36, c, { p: [x, 0.18, z] }, 10);
  p.sphere(0.25, c, { p: [0, 0.72, 0.42] }, 14, 10);
  for (const sx of [-1, 1]) p.sphere(0.2, shade(c, 0.9), { p: [sx * 0.27, 0.74, 0.36], s: [0.35, 1, 0.9] }, 12, 8);
  p.cyl(0.07, 0.05, 0.35, c, { p: [0, 0.52, 0.68], r: [0.35, 0, 0] }, 10);
  for (const sx of [-1, 1]) p.sphere(0.035, "#2a2233", { p: [sx * 0.1, 0.8, 0.62] }, 8, 6);
  p.cyl(0.015, 0.015, 0.18, shade(c, 0.8), { p: [0, 0.55, -0.48], r: [-0.6, 0, 0] }, 6);
  addMesh(m, p);
  return m;
}

export function buildMonkey(tint: THREE.Color | null): Made {
  const m = made("monkey", 0.6, tint);
  const c = col(tint, "#8d6e63");
  const face = "#f2cfa8";
  const p = new Parts();
  p.sphere(0.16, c, { p: [0, 0.25, 0], s: [1, 1.15, 0.9] }, 12, 10);
  p.sphere(0.15, c, { p: [0, 0.5, 0.02] }, 14, 10);
  p.sphere(0.1, face, { p: [0, 0.48, 0.1], s: [1.1, 0.9, 0.6] }, 12, 8);
  for (const sx of [-1, 1]) {
    p.sphere(0.06, face, { p: [sx * 0.16, 0.52, 0], s: [0.5, 1, 1] }, 8, 6);
    p.sphere(0.022, "#2a2233", { p: [sx * 0.05, 0.53, 0.15] }, 6, 4);
    p.capsule(0.04, 0.16, c, { p: [sx * 0.17, 0.25, 0.02], r: [0, 0, sx * 0.4] });
    p.capsule(0.045, 0.12, c, { p: [sx * 0.08, 0.07, 0.03] });
  }
  p.torus(0.12, 0.022, c, { p: [0, 0.2, -0.17], r: [0, Math.PI / 2, 0] }, Math.PI * 1.3, 5, 10);
  addMesh(m, p);
  return m;
}

export function buildPanda(tint: THREE.Color | null): Made {
  const m = made("panda", 0.7, tint);
  const black = tint ? "#" + tint.getHexString() : "#2b2b2b";
  const p = new Parts();
  p.sphere(0.26, "#f7f7f2", { p: [0, 0.28, 0], s: [1, 1, 0.9] }, 14, 12);
  p.sphere(0.2, "#f7f7f2", { p: [0, 0.6, 0.04] }, 14, 12);
  for (const sx of [-1, 1]) {
    p.sphere(0.07, black, { p: [sx * 0.15, 0.76, 0] }, 8, 6);
    p.sphere(0.055, black, { p: [sx * 0.075, 0.62, 0.17], s: [0.8, 1.1, 0.5] }, 8, 6);
    p.sphere(0.018, "#ffffff", { p: [sx * 0.075, 0.63, 0.2] }, 6, 4);
    p.capsule(0.07, 0.12, black, { p: [sx * 0.22, 0.32, 0.08], r: [0.6, 0, sx * 0.3] });
    p.sphere(0.09, black, { p: [sx * 0.15, 0.07, 0.14], s: [1, 0.7, 1.2] }, 8, 6);
  }
  p.sphere(0.035, black, { p: [0, 0.56, 0.2] }, 8, 6);
  addMesh(m, p);
  return m;
}

export function buildPenguin(tint: THREE.Color | null): Made {
  const m = made("penguin", 0.55, tint);
  const back = col(tint, "#263238");
  const p = new Parts();
  p.sphere(0.17, back, { p: [0, 0.26, 0], s: [1, 1.45, 0.95] }, 14, 12);
  p.sphere(0.13, "#fafafa", { p: [0, 0.24, 0.06], s: [1, 1.4, 0.8] }, 12, 10);
  p.sphere(0.12, back, { p: [0, 0.48, 0] }, 12, 10);
  p.sphere(0.08, "#fafafa", { p: [0, 0.47, 0.06], s: [1.1, 0.9, 0.7] }, 10, 8);
  p.cone(0.035, 0.08, "#ffb300", { p: [0, 0.47, 0.15], r: [Math.PI / 2, 0, 0] }, 8);
  for (const sx of [-1, 1]) {
    p.sphere(0.02, "#2a2233", { p: [sx * 0.045, 0.51, 0.11] }, 6, 4);
    p.sphere(0.07, back, { p: [sx * 0.17, 0.27, 0], s: [0.3, 1.2, 0.7], r: [0, 0, sx * 0.25] }, 8, 6);
    p.sphere(0.05, "#ffb300", { p: [sx * 0.07, 0.015, 0.06], s: [1, 0.35, 1.5] }, 8, 6);
  }
  addMesh(m, p);
  return m;
}

export function buildBanana(tint: THREE.Color | null): Made {
  const m = made("banana", 0.3, tint);
  const c = col(tint, "#ffd54f");
  const p = new Parts();
  p.torus(0.14, 0.035, c, { p: [0, 0.16, 0], r: [0, 0, Math.PI * 0.25] }, Math.PI * 0.7, 8, 12);
  p.cyl(0.012, 0.014, 0.05, "#795548", { p: [0.075, 0.29, 0], r: [0, 0, -0.5] }, 6);
  addMesh(m, p);
  return m;
}

export function buildBamboo(tint: THREE.Color | null): Made {
  const m = made("bamboo", 1.1, tint);
  const c = col(tint, "#7cb342");
  const p = new Parts();
  for (let i = 0; i < 5; i++) {
    p.cyl(0.04, 0.042, 0.2, c, { p: [0, 0.11 + i * 0.22, 0] }, 10);
    p.cyl(0.048, 0.048, 0.025, shade(c, 0.8), { p: [0, 0.22 + i * 0.22, 0] }, 10);
  }
  for (const [y, sx] of [[0.7, 1], [0.95, -1], [1.05, 1]] as const) p.sphere(0.07, "#9ccc65", { p: [sx * 0.08, y, 0], s: [1.6, 0.35, 0.6], r: [0, 0, sx * 0.4] }, 8, 6);
  addMesh(m, p);
  return m;
}
