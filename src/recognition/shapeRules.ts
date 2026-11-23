/**
 * Geometric recognisers for things the Quick, Draw! dataset does not contain.
 * They look at the drawing's overall shape, so they are forgiving by nature:
 * a ruler is "a long, thin shape", however it was drawn.
 */
import { resample, type Stroke } from "./strokes.ts";

export interface ShapeFeatures {
  /** Length of the main axis / length of the cross axis (oriented box). */
  aspect: number;
  /** Main-axis length in input units. */
  major: number;
  minor: number;
}

/** Oriented bounding box via the principal axis of evenly spaced ink points. */
export function shapeFeatures(strokes: readonly Stroke[]): ShapeFeatures {
  const pts: [number, number][] = [];
  for (const s of strokes) for (const p of resample(s, 3)) pts.push(p);
  if (pts.length < 2) return { aspect: 1, major: 0, minor: 0 };
  let mx = 0;
  let my = 0;
  for (const [x, y] of pts) {
    mx += x;
    my += y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) * (x - mx);
    syy += (y - my) * (y - my);
    sxy += (x - mx) * (y - my);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  let a0 = Infinity;
  let a1 = -Infinity;
  let b0 = Infinity;
  let b1 = -Infinity;
  for (const [x, y] of pts) {
    const a = (x - mx) * ux + (y - my) * uy;
    const b = -(x - mx) * uy + (y - my) * ux;
    if (a < a0) a0 = a;
    if (a > a1) a1 = a;
    if (b < b0) b0 = b;
    if (b > b1) b1 = b;
  }
  const major = a1 - a0;
  const minor = b1 - b0;
  // A pen line has some width even when perfectly straight.
  return { aspect: major / Math.max(minor, major * 0.02, 1), major, minor };
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 0..1: how much the drawing looks like a long, thin thing (a ruler). */
export function longThinScore(f: ShapeFeatures): number {
  return smoothstep(2.2, 3.6, f.aspect);
}
