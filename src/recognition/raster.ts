/**
 * Anti-aliased stroke rasteriser that turns a drawing into the model's input.
 * Shared, byte for byte, by the game and the training scripts (see strokes.ts).
 */
import { bounds, type Stroke } from "./strokes.ts";

/** Model input is RASTER x RASTER, one channel, 0 = paper, 1 = ink. */
export const RASTER = 32;
/** The drawing is scaled to fit an INNER x INNER box, centred. */
export const INNER = 26;
/** Pen radius in model pixels. */
export const HALF_WIDTH = 0.85;

/**
 * Rasterise strokes (any coordinate space; normally the 0-255 simplified space)
 * into `out` (length RASTER*RASTER). Uniform scale, aspect kept, centred.
 */
export function rasterize(strokes: readonly Stroke[], out: Float32Array = new Float32Array(RASTER * RASTER)): Float32Array {
  out.fill(0);
  const b = bounds(strokes);
  if (!b) return out;
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const size = Math.max(w, h);
  const s = size > 0 ? INNER / size : 1;
  const ox = (RASTER - w * s) / 2 - b.minX * s;
  const oy = (RASTER - h * s) / 2 - b.minY * s;
  const reach = HALF_WIDTH + 0.5;
  for (const stroke of strokes) {
    if (stroke.length === 1) {
      const x = stroke[0][0] * s + ox;
      const y = stroke[0][1] * s + oy;
      segment(out, x, y, x, y, reach);
      continue;
    }
    for (let i = 1; i < stroke.length; i++) {
      segment(
        out,
        stroke[i - 1][0] * s + ox,
        stroke[i - 1][1] * s + oy,
        stroke[i][0] * s + ox,
        stroke[i][1] * s + oy,
        reach
      );
    }
  }
  return out;
}

function segment(out: Float32Array, ax: number, ay: number, bx: number, by: number, reach: number): void {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach));
  const x1 = Math.min(RASTER - 1, Math.ceil(Math.max(ax, bx) + reach));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - reach));
  const y1 = Math.min(RASTER - 1, Math.ceil(Math.max(ay, by) + reach));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  for (let py = y0; py <= y1; py++) {
    const cy = py + 0.5;
    for (let px = x0; px <= x1; px++) {
      const cx = px + 0.5;
      let t = len2 > 0 ? ((cx - ax) * dx + (cy - ay) * dy) / len2 : 0;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;
      const ex = cx - (ax + t * dx);
      const ey = cy - (ay + t * dy);
      const v = reach - Math.sqrt(ex * ex + ey * ey);
      if (v <= 0) continue;
      const c = v >= 1 ? 1 : v;
      const k = py * RASTER + px;
      if (c > out[k]) out[k] = c;
    }
  }
}

/** Quantise a raster to bytes (training files store uint8). */
export function toBytes(r: Float32Array, out: Uint8Array = new Uint8Array(r.length)): Uint8Array {
  for (let i = 0; i < r.length; i++) out[i] = Math.round(r[i] * 255);
  return out;
}

/** Debug: ASCII picture of a raster. */
export function ascii(r: Float32Array): string {
  const ramp = " .:-=+*#%@";
  let s = "";
  for (let y = 0; y < RASTER; y++) {
    for (let x = 0; x < RASTER; x++) s += ramp[Math.min(9, Math.floor(r[y * RASTER + x] * 9.99))];
    s += "\n";
  }
  return s;
}
