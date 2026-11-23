/**
 * Level 4 models: apple, orange, tomato, carrot, egg, milk, and the shopping
 * basket customers carry. Chunky primitives in the same toy style as the
 * stationery. The foods are the faint "missing" outlines in the supermarket
 * and, in models mode (?models=1), the food itself. Origin at the bottom,
 * facing +Z.
 */
import * as THREE from "three";
import { vividMat } from "../world/materials.ts";
import { Parts, shade } from "../world/parts.ts";
import { addMesh, made, type Made } from "./made.ts";

const col = (tint: THREE.Color | null, fallback: string) => (tint ? "#" + tint.getHexString() : fallback);

export function buildApple(tint: THREE.Color | null, seed = 0): Made {
  const m = made("apple", 0.24, tint);
  const c = col(tint, ["#e53935", "#c62828", "#7cb342"][seed % 3]);
  const p = new Parts();
  p.sphere(0.11, c, { p: [0, 0.1, 0], s: [1.05, 0.92, 1.05] }, 14, 10);
  p.sphere(0.03, shade(c, 0.7), { p: [0, 0.19, 0] }, 8, 6);
  p.cyl(0.008, 0.01, 0.06, "#6d4c41", { p: [0.005, 0.22, 0], r: [0, 0, -0.25] }, 6);
  p.sphere(0.028, "#66bb6a", { p: [0.035, 0.23, 0], s: [1.6, 0.35, 0.8], r: [0, 0, 0.5] }, 8, 6);
  addMesh(m, p);
  return m;
}

export function buildOrange(tint: THREE.Color | null): Made {
  const m = made("orange", 0.22, tint);
  const c = col(tint, "#fb8c00");
  const p = new Parts();
  p.sphere(0.105, c, { p: [0, 0.1, 0] }, 14, 10);
  p.sphere(0.018, shade(c, 0.75), { p: [0, 0.2, 0] }, 6, 4);
  p.sphere(0.022, "#43a047", { p: [0.03, 0.205, 0], s: [1.5, 0.35, 0.8], r: [0, 0, 0.35] }, 8, 6);
  addMesh(m, p);
  return m;
}

export function buildTomato(tint: THREE.Color | null): Made {
  const m = made("tomato", 0.2, tint);
  const c = col(tint, "#e53935");
  const p = new Parts();
  p.sphere(0.11, c, { p: [0, 0.09, 0], s: [1.1, 0.82, 1.1] }, 14, 10);
  // The green star on top.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.box(0.07, 0.012, 0.02, "#2e7d32", { p: [Math.cos(a) * 0.03, 0.18, Math.sin(a) * 0.03], r: [0, -a, 0] });
  }
  p.cyl(0.008, 0.01, 0.035, "#2e7d32", { p: [0, 0.195, 0] }, 6);
  addMesh(m, p);
  return m;
}

export function buildCarrot(tint: THREE.Color | null): Made {
  const m = made("carrot", 0.36, tint);
  const c = col(tint, "#fb8c00");
  const p = new Parts();
  // Lying a little tilted: the root points down, the leaves up.
  p.cone(0.055, 0.26, c, { p: [0, 0.13, 0], r: [Math.PI, 0, 0] }, 10);
  for (const y of [0.08, 0.14, 0.2]) p.torus(0.045 - y * 0.12, 0.004, shade(c, 0.85), { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }, Math.PI * 2, 4, 10);
  for (const [x, rz] of [[-0.02, 0.35], [0, 0], [0.02, -0.35]] as const) p.cyl(0.008, 0.012, 0.1, "#43a047", { p: [x, 0.3, 0], r: [0, 0, rz] }, 5);
  addMesh(m, p);
  return m;
}

export function buildEgg(tint: THREE.Color | null): Made {
  const m = made("egg", 0.15, tint);
  const c = col(tint, "#fff3e0");
  const p = new Parts();
  // Narrower at the top.
  p.lathe(
    [[0, 0], [0.04, 0.006], [0.058, 0.03], [0.062, 0.06], [0.055, 0.095], [0.04, 0.125], [0.02, 0.143], [0, 0.148]],
    c,
    {},
    14
  );
  addMesh(m, p);
  return m;
}

export function buildMilk(tint: THREE.Color | null): Made {
  const m = made("milk", 0.34, tint);
  const c = col(tint, "#42a5f5");
  const p = new Parts();
  // A gable-top carton: white body, a coloured band, a roof and its fin.
  p.box(0.15, 0.24, 0.15, "#fafafa", { p: [0, 0.12, 0] });
  p.box(0.152, 0.08, 0.152, c, { p: [0, 0.07, 0] });
  for (const sx of [-1, 1]) p.box(0.11, 0.012, 0.155, "#eeeeee", { p: [sx * 0.037, 0.272, 0], r: [0, 0, sx * -0.75] });
  p.box(0.012, 0.035, 0.15, "#eeeeee", { p: [0, 0.31, 0] });
  // A drop of milk on the label.
  p.sphere(0.02, "#ffffff", { p: [0, 0.16, 0.077], s: [1, 1.3, 0.3] }, 8, 6);
  addMesh(m, p);
  return m;
}

/** A red plastic shopping basket with a handle (customers carry it at their side). */
export function buildBasket(): THREE.Group {
  const p = new Parts();
  const red = "#e53935";
  p.box(0.36, 0.02, 0.24, shade(red, 0.8), { p: [0, 0.01, 0] });
  for (const sz of [-1, 1]) p.box(0.36, 0.17, 0.015, red, { p: [0, 0.095, sz * 0.12] });
  for (const sx of [-1, 1]) p.box(0.015, 0.17, 0.24, red, { p: [sx * 0.18, 0.095, 0] });
  // Slots in the sides.
  for (let i = 0; i < 4; i++) for (const sz of [-1, 1]) p.box(0.05, 0.05, 0.004, "#b71c1c", { p: [-0.11 + i * 0.075, 0.11, sz * 0.129] });
  p.torus(0.15, 0.012, "#c62828", { p: [0, 0.18, 0] }, Math.PI, 5, 14);
  const g = new THREE.Group();
  g.add(p.mesh(vividMat));
  g.name = "basket";
  return g;
}
