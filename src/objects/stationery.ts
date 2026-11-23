/**
 * Level 1 models: pencil, eraser, scissors, crayon, book, notebook, ruler,
 * schoolbag (a red randoseru by default) and the magic pen.
 * Toy scale (about 2.5x real) so they read from the shop's diorama camera.
 */
import * as THREE from "three";
import { Parts, mix, shade } from "../world/parts.ts";
import { addMesh, made, type Made } from "./made.ts";

const t = (tint: THREE.Color | null, fallback: THREE.ColorRepresentation) => (tint ? tint.clone() : new THREE.Color(fallback));

export function buildPencil(tint: THREE.Color | null): Made {
  const m = made("pencil", 0.42, tint);
  const body = t(tint, "#ffc928");
  const p = new Parts();
  p.cyl(0.028, 0.028, 0.05, "#f48fb1", { p: [0, 0.03, 0] }, 12);
  p.sphere(0.028, "#f48fb1", { p: [0, 0.008, 0], s: [1, 0.35, 1] }, 12, 6);
  p.cyl(0.0295, 0.0295, 0.04, "#c3c9cf", { p: [0, 0.074, 0] }, 12);
  p.cyl(0.031, 0.031, 0.006, "#9aa3ab", { p: [0, 0.064, 0] }, 12);
  p.cyl(0.031, 0.031, 0.006, "#9aa3ab", { p: [0, 0.084, 0] }, 12);
  p.cyl(0.028, 0.028, 0.245, body, { p: [0, 0.2165, 0] }, 6);
  p.box(0.004, 0.2, 0.012, shade(body, 0.8), { p: [0, 0.22, 0.026] });
  p.cyl(0.008, 0.028, 0.065, "#f3d2a2", { p: [0, 0.3715, 0] }, 6);
  p.cone(0.0082, 0.024, "#3d3d46", { p: [0, 0.416, 0] }, 8);
  addMesh(m, p);
  return m;
}

export function buildEraser(tint: THREE.Color | null): Made {
  const m = made("eraser", 0.09, tint);
  const sleeve = t(tint, "#42a5f5");
  const p = new Parts();
  p.rbox(0.2, 0.085, 0.12, 0.022, "#fbfbf8", { p: [0, 0.0425, 0] }, 3);
  p.rbox(0.12, 0.092, 0.126, 0.012, sleeve, { p: [0.03, 0.0425, 0] }, 2);
  p.box(0.022, 0.094, 0.128, "#ffffff", { p: [-0.01, 0.0425, 0] });
  p.sphere(0.018, "#fff59d", { p: [0.05, 0.089, 0.01], s: [1, 0.2, 1] }, 8, 4);
  addMesh(m, p);
  return m;
}

/** Scissors hang handles-up; halves pivot at the screw for snipping. */
export function buildScissors(tint: THREE.Color | null): Made {
  const m = made("scissors", 0.38, tint);
  const handle = t(tint, "#e53935");
  const pivot = new THREE.Vector3(0, 0.215, 0);
  const blade = new THREE.Shape();
  blade.moveTo(-0.006, 0.01);
  blade.lineTo(0.026, -0.012);
  blade.lineTo(0.012, -0.2);
  blade.quadraticCurveTo(0.004, -0.212, -0.004, -0.2);
  blade.lineTo(-0.012, -0.01);
  blade.closePath();
  for (const side of [-1, 1]) {
    const p = new Parts();
    const s = side;
    p.extrude(blade, 0.012, "#d5dde2", { p: [pivot.x, pivot.y, s * 0.007], s: [-s, 1, 1] }, 0.002);
    p.box(0.02, 0.07, 0.014, handle, { p: [pivot.x + s * 0.024, pivot.y + 0.045, s * 0.007], r: [0, 0, s * -0.45] });
    p.torus(0.048, 0.015, handle, { p: [pivot.x + s * 0.058, pivot.y + 0.115, s * 0.007], s: [1, 1.15, 1] }, Math.PI * 2, 6, 18);
    addMesh(m, p, s < 0 ? "halfA" : "halfB", pivot);
  }
  const screw = new Parts();
  screw.cyl(0.013, 0.013, 0.036, "#f4c542", { p: [pivot.x, pivot.y, 0], r: [Math.PI / 2, 0, 0] }, 10);
  addMesh(m, screw);
  return m;
}

export function buildCrayon(tint: THREE.Color | null): Made {
  const m = made("crayon", 0.3, tint);
  const c = t(tint, "#e53935");
  const wrap = mix(c, "#ffffff", 0.5);
  const p = new Parts();
  p.cyl(0.03, 0.03, 0.24, c, { p: [0, 0.12, 0] }, 12);
  p.cyl(0.0318, 0.0318, 0.17, wrap, { p: [0, 0.125, 0] }, 12);
  p.cyl(0.0325, 0.0325, 0.012, shade(c, 0.7), { p: [0, 0.06, 0] }, 12);
  p.cyl(0.0325, 0.0325, 0.012, shade(c, 0.7), { p: [0, 0.19, 0] }, 12);
  p.cyl(0.0095, 0.03, 0.062, c, { p: [0, 0.271, 0] }, 12);
  addMesh(m, p);
  return m;
}

/** Hardcover book standing face-out; covers hinge at the spine (for flapping). */
export function buildBook(tint: THREE.Color | null, seed = 0): Made {
  const m = made("book", 0.42, tint);
  const c = t(tint, ["#ef5350", "#42a5f5", "#66bb6a", "#ffa726", "#ab47bc", "#26c6da"][seed % 6]);
  const W = 0.3;
  const H = 0.42;
  const spineX = -W / 2;
  const pages = new Parts();
  pages.box(W - 0.03, H - 0.03, 0.048, "#fff8e6", { p: [0.005, H / 2, 0] });
  pages.box(0.014, H, 0.074, shade(c, 0.78), { p: [spineX, H / 2, 0] });
  addMesh(m, pages, "pages");
  const front = new Parts();
  front.rbox(W, H, 0.012, 0.006, c, { p: [0, H / 2, 0.031] });
  front.cyl(0.07, 0.07, 0.006, mix(c, "#ffffff", 0.55), { p: [0.01, H * 0.6, 0.039], r: [Math.PI / 2, 0, 0] }, 16);
  front.box(0.17, 0.032, 0.006, "#ffffff", { p: [0.01, H * 0.27, 0.039] });
  front.box(0.11, 0.018, 0.006, mix(c, "#ffffff", 0.3), { p: [0.01, H * 0.2, 0.039] });
  addMesh(m, front, "front", { x: spineX, y: 0, z: 0.031 });
  const back = new Parts();
  back.rbox(W, H, 0.012, 0.006, shade(c, 0.9), { p: [0, H / 2, -0.031] });
  addMesh(m, back, "back", { x: spineX, y: 0, z: -0.031 });
  return m;
}

/** Spiral notebook lying flat. */
export function buildNotebook(tint: THREE.Color | null, seed = 0): Made {
  const m = made("notebook", 0.03, tint);
  const c = t(tint, ["#4fc3f7", "#81c784", "#ffb74d", "#f06292", "#9575cd"][seed % 5]);
  const p = new Parts();
  p.box(0.27, 0.018, 0.35, "#fffdf5", { p: [0.005, 0.012, 0] });
  p.rbox(0.28, 0.006, 0.36, 0.003, c, { p: [0, 0.024, 0] }, 1);
  p.rbox(0.28, 0.006, 0.36, 0.003, shade(c, 0.85), { p: [0, 0.003, 0] }, 1);
  p.box(0.15, 0.003, 0.07, "#ffffff", { p: [0.02, 0.0285, -0.08] });
  p.box(0.1, 0.003, 0.012, shade(c, 0.6), { p: [0.02, 0.0305, -0.08] });
  for (let i = 0; i < 7; i++) p.torus(0.016, 0.004, "#b0bec5", { p: [-0.14, 0.014, -0.15 + i * 0.05], r: [0, Math.PI / 2, 0] }, Math.PI * 2, 4, 10);
  addMesh(m, p);
  return m;
}

export function buildRuler(tint: THREE.Color | null): Made {
  const m = made("ruler", 0.6, tint);
  const c = t(tint, "#ffe082");
  const p = new Parts();
  p.rbox(0.075, 0.6, 0.014, 0.005, c, { p: [0, 0.3, 0] }, 1);
  for (let i = 0; i <= 14; i++) {
    const long = i % 5 === 0;
    p.box(long ? 0.03 : 0.017, 0.005, 0.004, shade(c, 0.35), { p: [-0.0375 + (long ? 0.015 : 0.0085), 0.025 + i * 0.039, 0.008] });
  }
  addMesh(m, p);
  return m;
}

/** A randoseru: red by default, any colour it was drawn in. Flap hinges at the back top. */
export function buildSchoolbag(tint: THREE.Color | null): Made {
  const m = made("schoolbag", 0.5, tint);
  const c = t(tint, "#d32f2f");
  const dark = shade(c, 0.78);
  const p = new Parts();
  p.rbox(0.36, 0.44, 0.2, 0.06, c, { p: [0, 0.22, 0] }, 3);
  p.rbox(0.37, 0.05, 0.21, 0.02, dark, { p: [0, 0.02, 0] }, 2);
  for (const sx of [-1, 1]) {
    p.capsule(0.022, 0.3, shade(c, 0.6), { p: [sx * 0.11, 0.25, -0.115] });
    p.torus(0.022, 0.008, "#f4c542", { p: [sx * 0.185, 0.16, 0.02], r: [0, Math.PI / 2, 0] }, Math.PI * 2, 4, 10);
  }
  p.torus(0.06, 0.012, dark, { p: [0, 0.455, -0.03], r: [0, 0, 0] }, Math.PI, 5, 12);
  addMesh(m, p, "body");
  const flap = new Parts();
  flap.rbox(0.38, 0.34, 0.026, 0.05, dark, { p: [0, 0.29, 0.112] }, 3);
  flap.rbox(0.38, 0.026, 0.2, 0.012, dark, { p: [0, 0.449, 0.012] }, 2);
  flap.rbox(0.07, 0.05, 0.02, 0.01, "#f4c542", { p: [0, 0.135, 0.13] }, 2);
  flap.rbox(0.3, 0.012, 0.006, 0.003, mix(c, "#ffffff", 0.35), { p: [0, 0.42, 0.126] }, 1);
  addMesh(m, flap, "flap", { x: 0, y: 0.45, z: -0.09 });
  return m;
}

export function buildMagicPen(): Made {
  const m = made("magicPen", 0.42, null);
  const p = new Parts();
  p.cyl(0.024, 0.024, 0.28, "#3f51b5", { p: [0, 0.2, 0] }, 12);
  p.cyl(0.027, 0.027, 0.02, "#f4c542", { p: [0, 0.07, 0] }, 12);
  p.cyl(0.027, 0.027, 0.02, "#f4c542", { p: [0, 0.31, 0] }, 12);
  p.cyl(0.006, 0.024, 0.06, "#f4c542", { p: [0, 0.03, 0] }, 12);
  p.sphere(0.012, "#ffffff", { p: [0, 0.0, 0] }, 8, 6);
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.06 : 0.026;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  star.closePath();
  p.extrude(star, 0.018, "#ffd54f", { p: [0, 0.39, 0] }, 0.004);
  addMesh(m, p);
  return m;
}
