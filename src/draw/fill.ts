/**
 * Region filling for drawings (DOM-free, works on a line mask).
 * - A paint-bucket fill floods the region around a seed point, bounded by the
 *   child's lines; if it would reach the picture's edge it is refused (it is
 *   outside the drawing), so fills never paint the background.
 * - "Inside" is everything the outside cannot reach: those areas get an
 *   automatic fill when the child leaves them empty.
 * Lines are thickened in the mask so small gaps in an outline still close.
 */

/** 1 where there is a line. */
export type Mask = Uint8Array;

/** Flood from (sx, sy) through non-line pixels. Null if it touches the border (outside). */
export function floodRegion(line: Mask, w: number, h: number, sx: number, sy: number): Uint8Array | null {
  sx = Math.round(sx);
  sy = Math.round(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const start = sy * w + sx;
  if (line[start]) return null;
  const out = new Uint8Array(w * h);
  const stack = [start];
  out[start] = 1;
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i / w) | 0;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return null;
    const n = [i - 1, i + 1, i - w, i + w];
    for (const j of n) {
      if (!out[j] && !line[j]) {
        out[j] = 1;
        stack.push(j);
      }
    }
  }
  return out;
}

/** Pixels the outside cannot reach (and that are not lines). */
export function interior(line: Mask, w: number, h: number): Uint8Array {
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!outside[i] && !line[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const inside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inside[i] = !outside[i] && !line[i] ? 1 : 0;
  return inside;
}

/** Grow a region into neighbouring line pixels (so the fill tucks under the strokes). */
export function growIntoLines(region: Uint8Array, line: Mask, w: number, h: number, steps: number): Uint8Array {
  let cur = region;
  for (let s = 0; s < steps; s++) {
    const next = cur.slice();
    for (let i = 0; i < w * h; i++) {
      if (cur[i] || !line[i]) continue;
      const x = i % w;
      if ((x > 0 && cur[i - 1]) || (x < w - 1 && cur[i + 1]) || (i >= w && cur[i - w]) || (i < w * (h - 1) && cur[i + w])) next[i] = 1;
    }
    cur = next;
  }
  return cur;
}

/** A soft, light version of a colour for automatic fills. */
export function softTint(hex: string, amount = 0.6): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}
