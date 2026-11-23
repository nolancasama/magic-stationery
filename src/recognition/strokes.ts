/**
 * Stroke geometry shared by the game and the model-training scripts.
 *
 * This module is plain, DOM-free TypeScript using only erasable syntax, so the
 * training tools run the very same code under Node (`node file.ts`). The model
 * therefore sees training drawings prepared exactly like a child's drawing.
 */

export type Point = [number, number];
export type Stroke = Point[];
/** One stroke in the Quick, Draw! "simplified" format: [xs, ys]. */
export type QDStroke = [number[], number[]];

export function fromQD(drawing: QDStroke[]): Stroke[] {
  return drawing.map(([xs, ys]) => xs.map((x, i) => [x, ys[i]] as Point));
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(strokes: readonly Stroke[]): Box | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const [x, y] of s) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/** Resample a polyline at a fixed spacing (keeps both ends). */
export function resample(points: Stroke, spacing: number): Stroke {
  if (points.length < 2) return points.slice();
  const out: Stroke = [[points[0][0], points[0][1]]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (len === 0) continue;
    let t = spacing - carry;
    while (t <= len) {
      out.push([ax + ((bx - ax) * t) / len, ay + ((by - ay) * t) / len]);
      t += spacing;
    }
    carry = len - (t - spacing);
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (tail[0] !== last[0] || tail[1] !== last[1]) out.push([last[0], last[1]]);
  return out;
}

function perpendicular(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / Math.sqrt(len2);
}

/** Ramer-Douglas-Peucker simplification (iterative, no recursion limit). */
export function rdp(points: Stroke, epsilon: number): Stroke {
  const n = points.length;
  if (n < 3) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: number[] = [0, n - 1];
  while (stack.length) {
    const end = stack.pop() as number;
    const start = stack.pop() as number;
    let maxD = -1;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicular(points[i], points[start], points[end]);
      if (d > maxD) {
        maxD = d;
        index = i;
      }
    }
    if (index > 0 && maxD > epsilon) {
      keep[index] = 1;
      stack.push(start, index, index, end);
    }
  }
  const out: Stroke = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/**
 * Normalise exactly like the Quick, Draw! simplified set: align to the top-left,
 * scale uniformly so the larger side is 255, resample at 1 unit, simplify with
 * RDP epsilon 2 and round to integers.
 */
export function simplifyLikeQuickDraw(strokes: readonly Stroke[]): Stroke[] {
  const usable = strokes.filter((s) => s.length > 0);
  const b = bounds(usable);
  if (!b) return [];
  const size = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  const scale = size > 0 ? 255 / size : 1;
  const out: Stroke[] = [];
  for (const s of usable) {
    const moved = s.map(([x, y]) => [(x - b.minX) * scale, (y - b.minY) * scale] as Point);
    const simple = rdp(resample(moved, 1), 2).map(([x, y]) => [Math.round(x), Math.round(y)] as Point);
    out.push(simple);
  }
  return out;
}

/** Total ink length (in the strokes' own units). */
export function inkLength(strokes: readonly Stroke[]): number {
  let total = 0;
  for (const s of strokes) {
    for (let i = 1; i < s.length; i++) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  }
  return total;
}
