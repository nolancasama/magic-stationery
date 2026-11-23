/**
 * The child's artwork, kept exactly: their strokes, colours, proportions and
 * wobbles, tightly cropped, plus their colouring-in. This is what appears in
 * the world (never a premade model) and what is saved, so a reload brings back
 * *their* drawing.
 *
 * Coordinates are canvas pixels relative to the crop (integers), with the pen
 * width in the same units, so the drawing renders at its original weight.
 *
 * Rendering: the child's paint-bucket fills first, then an automatic soft fill
 * of any closed area they left empty (in a light tint of their line colour),
 * then their lines on top. Outside the drawing stays transparent.
 */
import { rdp, type Point } from "../recognition/strokes.ts";
import type { Drawing } from "./drawing.ts";
import { floodRegion, growIntoLines, interior, softTint } from "./fill.ts";

export interface ArtStroke {
  /** Colour (#rrggbb). */
  c: string;
  /** Flat point list x0,y0,x1,y1,... */
  p: number[];
}

export interface ArtFill {
  x: number;
  y: number;
  c: string;
}

export interface Art {
  w: number;
  h: number;
  /** Pen width in art units. */
  lw: number;
  strokes: ArtStroke[];
  /** The child's own fills (paint bucket). */
  fills?: ArtFill[];
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
  const art: Art = { w: Math.ceil(maxX - minX + pad * 2), h: Math.ceil(maxY - minY + pad * 2), lw: lineWidth, strokes };
  const fills = (d.fills ?? []).map((f) => ({ x: Math.round(f.x - ox), y: Math.round(f.y - oy), c: f.color })).filter((f) => f.x > 0 && f.y > 0 && f.x < art.w && f.y < art.h);
  if (fills.length) art.fills = fills;
  return art;
}

export function artToDrawing(a: Art): Drawing {
  const d: Drawing = {
    strokes: a.strokes.map((s) => {
      const points: Point[] = [];
      for (let i = 0; i + 1 < s.p.length; i += 2) points.push([s.p[i], s.p[i + 1]]);
      return { color: s.c, points };
    })
  };
  if (a.fills?.length) d.fills = a.fills.map((f) => ({ x: f.x, y: f.y, color: f.c }));
  return d;
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
  const norm = Math.atan2(Math.sin(rot), Math.cos(rot));
  const turn = Math.abs(norm) > Math.PI / 2 ? norm - Math.sign(norm) * Math.PI : norm;
  // Already close to vertical: leave it exactly as drawn.
  if (Math.abs(turn) < 0.2) return a;
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const cx = a.w / 2;
  const cy = a.h / 2;
  const rotP = (x: number, y: number): [number, number] => [(x - cx) * c - (y - cy) * s, (x - cx) * s + (y - cy) * c];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const strokes = a.strokes.map((st) => {
    const p: number[] = [];
    for (let i = 0; i + 1 < st.p.length; i += 2) {
      const [rx, ry] = rotP(st.p[i], st.p[i + 1]);
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
  const out: Art = { w: Math.ceil(maxX - minX + pad * 2), h: Math.ceil(maxY - minY + pad * 2), lw: a.lw, strokes };
  if (a.fills?.length) {
    out.fills = a.fills.map((f) => {
      const [rx, ry] = rotP(f.x, f.y);
      return { x: Math.round(rx - minX + pad), y: Math.round(ry - minY + pad), c: f.c };
    });
  }
  return out;
}

/** The colour with the most ink (for the automatic fill). */
export function mainColour(a: Art): string {
  const ink = new Map<string, number>();
  for (const s of a.strokes) ink.set(s.c, (ink.get(s.c) ?? 0) + s.p.length);
  let best = "#2f3a75";
  let n = -1;
  for (const [c, v] of ink) if (v > n) [best, n] = [c, v];
  return best;
}

export interface ArtRender {
  canvas: HTMLCanvasElement;
  /** Texture width / height. */
  aspect: number;
}

function strokePaths(g: CanvasRenderingContext2D, a: Art, scale: number, off: number, colour: string | null) {
  for (const s of a.strokes) {
    g.strokeStyle = colour ?? s.c;
    g.fillStyle = colour ?? s.c;
    const pts = s.p;
    if (pts.length <= 2) {
      g.beginPath();
      g.arc(pts[0] * scale + off, pts[1] * scale + off, g.lineWidth / 2, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    g.beginPath();
    g.moveTo(pts[0] * scale + off, pts[1] * scale + off);
    for (let i = 2; i + 1 < pts.length; i += 2) g.lineTo(pts[i] * scale + off, pts[i + 1] * scale + off);
    g.stroke();
  }
}

/**
 * Draw the artwork on a transparent canvas at its own proportions (longer
 * side `maxPx`). `glowOnly` draws just a soft halo (transformation effect).
 * `autoFill` (default on) softly fills closed areas the child left empty.
 */
export function renderArt(a: Art, maxPx = 256, opts: { glowOnly?: string; autoFill?: boolean } = {}): ArtRender {
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
  const lw = Math.max(1.5, a.lw * scale);
  if (opts.glowOnly) {
    g.shadowColor = opts.glowOnly;
    g.shadowBlur = glowPad * 0.9;
    g.lineWidth = lw * 1.6;
    strokePaths(g, a, scale, glowPad, opts.glowOnly);
    return { canvas, aspect: W / H };
  }
  if (opts.autoFill !== false || a.fills?.length) paintFills(g, a, scale, W, H, lw, opts.autoFill !== false);
  g.lineWidth = lw;
  strokePaths(g, a, scale, 0, null);
  return { canvas, aspect: W / H };
}

/** The child's fills, then the automatic fill of closed areas left empty. */
function paintFills(g: CanvasRenderingContext2D, a: Art, scale: number, W: number, H: number, lw: number, auto: boolean) {
  const mc = document.createElement("canvas");
  mc.width = W;
  mc.height = H;
  const m = mc.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  m.lineCap = "round";
  m.lineJoin = "round";
  // Thicker than the real line so small gaps in an outline still close.
  m.lineWidth = Math.max(3, lw * 1.8);
  strokePaths(m, a, scale, 0, "#000");
  const px = m.getImageData(0, 0, W, H).data;
  const line = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) line[i] = px[i * 4 + 3] > 40 ? 1 : 0;
  const colour = new Array<string | null>(W * H).fill(null);
  for (const f of a.fills ?? []) {
    const r = floodRegion(line, W, H, f.x * scale, f.y * scale);
    if (!r) continue;
    for (let i = 0; i < W * H; i++) if (r[i]) colour[i] = f.c;
  }
  if (auto) {
    const inside = interior(line, W, H);
    const tint = softTint(mainColour(a));
    for (let i = 0; i < W * H; i++) if (inside[i] && !colour[i]) colour[i] = tint;
  }
  // Tuck the fill under the lines so no gap shows between fill and stroke.
  const byColour = new Map<string, Uint8Array>();
  for (let i = 0; i < W * H; i++) {
    const c = colour[i];
    if (!c) continue;
    let r = byColour.get(c);
    if (!r) byColour.set(c, (r = new Uint8Array(W * H)));
    r[i] = 1;
  }
  const img = g.createImageData(W, H);
  const steps = Math.ceil(lw);
  for (const [c, region] of byColour) {
    const grown = growIntoLines(region, line, W, H, steps);
    const n = parseInt(c.slice(1), 16);
    for (let i = 0; i < W * H; i++) {
      if (!grown[i]) continue;
      img.data[i * 4] = (n >> 16) & 255;
      img.data[i * 4 + 1] = (n >> 8) & 255;
      img.data[i * 4 + 2] = n & 255;
      img.data[i * 4 + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
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
  if (!strokes.length) return null;
  const art: Art = { w: r.w as number, h: r.h as number, lw: r.lw as number, strokes };
  if (Array.isArray(r.fills)) {
    const fills = (r.fills as unknown[])
      .slice(0, 50)
      .map((f) => f as Record<string, unknown>)
      .filter((f) => f && isHex(f.c) && typeof f.x === "number" && typeof f.y === "number" && Number.isFinite(f.x) && Number.isFinite(f.y))
      .map((f) => ({ x: f.x as number, y: f.y as number, c: f.c as string }));
    if (fills.length) art.fills = fills;
  }
  return art;
}
