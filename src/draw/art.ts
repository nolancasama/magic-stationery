/**
 * The child's artwork, kept exactly: their strokes, colours, proportions and
 * wobbles, tightly cropped. This is what appears in the world (never a premade
 * model) and what is saved, so a reload brings back *their* drawing.
 *
 * Coordinates are canvas pixels relative to the crop (integers), with the pen
 * width in the same units, so the drawing renders at its original weight.
 */
import { rdp, type Point } from "../recognition/strokes.ts";
import type { Drawing } from "./drawing.ts";

export interface ArtStroke {
  /** Colour (#rrggbb). */
  c: string;
  /** Flat point list x0,y0,x1,y1,... */
  p: number[];
}

export interface Art {
  w: number;
  h: number;
  /** Pen width in art units. */
  lw: number;
  strokes: ArtStroke[];
}

/** The pen width of the drawing canvas (ui/drawPanel.ts LINE). */
export const CANVAS_LINE = 9;

export function artFromDrawing(d: Drawing, lineWidth = CANVAS_LINE): Art {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of d.strokes)
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  if (minX === Infinity) return { w: 1, h: 1, lw: lineWidth, strokes: [] };
  const pad = lineWidth / 2 + 1;
  const ox = minX - pad;
  const oy = minY - pad;
  const strokes = d.strokes.map((s) => {
    // A very light simplification (sub-pixel) keeps the wobbles but not redundant points.
    const pts = s.points.length > 2 ? rdp(s.points, 0.6) : s.points;
    const p: number[] = [];
    for (const [x, y] of pts) p.push(Math.round(x - ox), Math.round(y - oy));
    return { c: s.color, p };
  });
  return { w: Math.ceil(maxX - minX + pad * 2), h: Math.ceil(maxY - minY + pad * 2), lw: lineWidth, strokes };
}

export function artToDrawing(a: Art): Drawing {
  return {
    strokes: a.strokes.map((s) => {
      const points: Point[] = [];
      for (let i = 0; i + 1 < s.p.length; i += 2) points.push([s.p[i], s.p[i + 1]]);
      return { color: s.c, points };
    })
  };
}

/** Principal-axis angle of the ink (radians, -PI/2..PI/2), from x axis. */
function principalAngle(a: Art): number {
  let n = 0, mx = 0, my = 0;
  for (const s of a.strokes) for (let i = 0; i + 1 < s.p.length; i += 2) { mx += s.p[i]; my += s.p[i + 1]; n++; }
  if (n < 2) return Math.PI / 2;
  mx /= n;
  my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const s of a.strokes)
    for (let i = 0; i + 1 < s.p.length; i += 2) {
      const dx = s.p[i] - mx;
      const dy = s.p[i + 1] - my;
      sxx += dx * dx;
      syy += dy * dy;
      sxy += dx * dy;
    }
  return 0.5 * Math.atan2(2 * sxy, sxx - syy);
}

/**
 * Turn a long thin drawing (pencil, crayon, ruler) so it stands upright in its
 * display. Only a rotation: the artwork itself is unchanged.
 */
export function uprightArt(a: Art): Art {
  const ang = principalAngle(a);
  const rot = Math.PI / 2 - ang;
  // Already close to vertical: leave it exactly as drawn.
  const norm = Math.atan2(Math.sin(rot), Math.cos(rot));
  const turn = Math.abs(norm) > Math.PI / 2 ? norm - Math.sign(norm) * Math.PI : norm;
  if (Math.abs(turn) < 0.2) return a;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const cx = a.w / 2;
  const cy = a.h / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const strokes = a.strokes.map((st) => {
    const p: number[] = [];
    for (let i = 0; i + 1 < st.p.length; i += 2) {
      const x = st.p[i] - cx;
      const y = st.p[i + 1] - cy;
      const rx = x * c - y * s;
      const ry = x * s + y * c;
      p.push(rx, ry);
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      maxX = Math.max(maxX, rx);
      maxY = Math.max(maxY, ry);
    }
    return { c: st.c, p };
  });
  const pad = a.lw / 2 + 1;
  for (const st of strokes) for (let i = 0; i + 1 < st.p.length; i += 2) { st.p[i] = Math.round(st.p[i] - minX + pad); st.p[i + 1] = Math.round(st.p[i + 1] - minY + pad); }
  return { w: Math.ceil(maxX - minX + pad * 2), h: Math.ceil(maxY - minY + pad * 2), lw: a.lw, strokes };
}

export interface ArtRender {
  canvas: HTMLCanvasElement;
  /** Texture width / height. */
  aspect: number;
}

/**
 * Draw the artwork on a transparent canvas at its own proportions (longer
 * side `maxPx`). `glow` adds a soft halo behind the lines (transformation only).
 */
export function renderArt(a: Art, maxPx = 256, opts: { glowOnly?: string } = {}): ArtRender {
  const scale = Math.min(4, maxPx / Math.max(a.w, a.h));
  const glowPad = opts.glowOnly ? Math.ceil(maxPx * 0.08) : 0;
  const W = Math.max(2, Math.ceil(a.w * scale) + glowPad * 2);
  const H = Math.max(2, Math.ceil(a.h * scale) + glowPad * 2);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = Math.max(1.5, a.lw * scale);
  if (opts.glowOnly) {
    g.shadowColor = opts.glowOnly;
    g.shadowBlur = glowPad * 0.9;
    g.lineWidth *= 1.6;
  }
  for (const s of a.strokes) {
    g.strokeStyle = opts.glowOnly ?? s.c;
    g.fillStyle = opts.glowOnly ?? s.c;
    const pts = s.p;
    if (pts.length <= 2) {
      g.beginPath();
      g.arc(pts[0] * scale + glowPad, pts[1] * scale + glowPad, g.lineWidth / 2, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    g.beginPath();
    g.moveTo(pts[0] * scale + glowPad, pts[1] * scale + glowPad);
    for (let i = 2; i + 1 < pts.length; i += 2) g.lineTo(pts[i] * scale + glowPad, pts[i + 1] * scale + glowPad);
    g.stroke();
  }
  return { canvas, aspect: W / H };
}

const isHex = (x: unknown): x is string => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x);

/** Rebuild artwork from untrusted saved JSON (null if unusable). */
export function sanitizeArt(raw: unknown): Art | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (x: unknown, max: number) => typeof x === "number" && Number.isFinite(x) && x > 0 && x <= max;
  if (!num(r.w, 4000) || !num(r.h, 4000) || !num(r.lw, 100) || !Array.isArray(r.strokes)) return null;
  const strokes: ArtStroke[] = [];
  for (const s of (r.strokes as unknown[]).slice(0, 200)) {
    const st = s as Record<string, unknown>;
    if (!st || !isHex(st.c) || !Array.isArray(st.p)) continue;
    const p = (st.p as unknown[]).slice(0, 4000).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (p.length >= 2) strokes.push({ c: st.c, p: p.length % 2 ? p.slice(0, -1) : p });
  }
  return strokes.length ? { w: r.w as number, h: r.h as number, lw: r.lw as number, strokes } : null;
}
