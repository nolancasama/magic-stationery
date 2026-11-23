// Shared helpers for the dataset builders (sketch model and glyph model):
// a seeded random generator and touchpad-style roughness for stroke drawings.
import { resample, simplifyLikeQuickDraw, type Point, type Stroke } from "../../src/recognition/strokes.ts";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gauss(rnd: () => number): number {
  const u = Math.max(1e-9, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

export function strokeLen(s: Stroke): number {
  let t = 0;
  for (let i = 1; i < s.length; i++) t += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return t;
}

export interface AugmentOptions {
  /** Chance of dropping one (not the longest) stroke when there are at least 4. */
  dropStroke: number;
  /** Maximum wobble amplitude (0-255 space). */
  wobble: number;
  /** Maximum rotation in degrees. */
  rotate: number;
  /** Maximum shear. */
  shear: number;
  /** Per-axis scale range: 1 +- squash. */
  squash: number;
}

/** The sketch model's settings (unchanged since the first training run). */
export const SKETCH_AUGMENT: AugmentOptions = { dropStroke: 0.3, wobble: 4, rotate: 10, shear: 0.15, squash: 0.15 };

/** Touchpad-style roughness: wobble, a missing stroke, skew and squash. */
export function augment(strokes: Stroke[], rnd: () => number, o: AugmentOptions = SKETCH_AUGMENT): Stroke[] {
  let s = strokes.map((st) => st.map((p) => [p[0], p[1]] as Point));
  if (s.length >= 4 && rnd() < o.dropStroke) {
    const lens = s.map(strokeLen);
    const longest = lens.indexOf(Math.max(...lens));
    let drop = Math.floor(rnd() * s.length);
    if (drop === longest) drop = (drop + 1) % s.length;
    s.splice(drop, 1);
  }
  const amp = rnd() * o.wobble;
  const fx = 0.015 + rnd() * 0.05;
  const fy = 0.015 + rnd() * 0.05;
  const px = rnd() * Math.PI * 2;
  const py = rnd() * Math.PI * 2;
  const jitter = rnd() * 1.2;
  s = s.map((st) => {
    const rs = resample(st, 5);
    let arc = 0;
    return rs.map((p, i) => {
      if (i > 0) arc += Math.hypot(p[0] - rs[i - 1][0], p[1] - rs[i - 1][1]);
      return [
        p[0] + amp * Math.sin(fx * arc + px) + jitter * gauss(rnd),
        p[1] + amp * Math.sin(fy * arc + py) + jitter * gauss(rnd)
      ] as Point;
    });
  });
  const angle = ((rnd() * 2 - 1) * o.rotate * Math.PI) / 180;
  const shear = (rnd() * 2 - 1) * o.shear;
  const sx = 1 - o.squash + rnd() * 2 * o.squash;
  const sy = 1 - o.squash + rnd() * 2 * o.squash;
  const c = Math.cos(angle);
  const n = Math.sin(angle);
  s = s.map((st) =>
    st.map(([x, y]) => {
      const x1 = (x - 128) * sx + shear * (y - 128);
      const y1 = (y - 128) * sy;
      return [x1 * c - y1 * n, x1 * n + y1 * c] as Point;
    })
  );
  return simplifyLikeQuickDraw(s);
}
