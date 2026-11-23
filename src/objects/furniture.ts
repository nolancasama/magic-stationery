/**
 * Level 2 models: a Japanese school desk and chair (wooden top/seat on a
 * steel frame). Used as the faint "missing" outlines in the classroom and, in
 * models mode (?models=1), as the restored objects themselves.
 * Sized for the classroom diorama (characters are ~1.1 high).
 */
import * as THREE from "three";
import { Parts, shade } from "../world/parts.ts";
import { addMesh, made, type Made } from "./made.ts";

const STEEL = "#9aa7b4";

export function buildDesk(tint: THREE.Color | null): Made {
  const m = made("desk", 0.62, tint);
  const wood = tint ? "#" + tint.getHexString() : "#d9a86c";
  const p = new Parts();
  p.rbox(0.78, 0.045, 0.5, 0.015, wood, { p: [0, 0.6, 0] }, 2);
  p.box(0.78, 0.012, 0.5, shade(wood, 0.82), { p: [0, 0.572, 0] });
  // Book box under the top.
  p.box(0.7, 0.012, 0.42, "#8d99a6", { p: [0, 0.5, -0.02] });
  p.box(0.7, 0.08, 0.012, "#8d99a6", { p: [0, 0.54, -0.23] });
  for (const sx of [-1, 1]) {
    p.box(0.025, 0.58, 0.025, STEEL, { p: [sx * 0.36, 0.29, 0.22] });
    p.box(0.025, 0.58, 0.025, STEEL, { p: [sx * 0.36, 0.29, -0.22] });
    p.box(0.025, 0.025, 0.46, STEEL, { p: [sx * 0.36, 0.08, 0] });
    p.box(0.035, 0.02, 0.05, "#5f6b77", { p: [sx * 0.36, 0.01, 0.22] });
    p.box(0.035, 0.02, 0.05, "#5f6b77", { p: [sx * 0.36, 0.01, -0.22] });
  }
  addMesh(m, p);
  return m;
}

export function buildChair(tint: THREE.Color | null): Made {
  const m = made("chair", 0.72, tint);
  const wood = tint ? "#" + tint.getHexString() : "#d9a86c";
  const p = new Parts();
  p.rbox(0.38, 0.035, 0.36, 0.012, wood, { p: [0, 0.36, 0] }, 2);
  p.rbox(0.36, 0.16, 0.03, 0.012, wood, { p: [0, 0.6, -0.17], r: [-0.08, 0, 0] }, 2);
  for (const sx of [-1, 1]) {
    p.box(0.022, 0.36, 0.022, STEEL, { p: [sx * 0.17, 0.18, 0.15] });
    p.box(0.022, 0.72, 0.022, STEEL, { p: [sx * 0.17, 0.36, -0.16] });
    p.box(0.022, 0.022, 0.32, STEEL, { p: [sx * 0.17, 0.07, 0] });
  }
  addMesh(m, p);
  return m;
}
