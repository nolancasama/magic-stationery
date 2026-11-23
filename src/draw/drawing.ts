/** A child's drawing: coloured strokes in canvas pixels. */
import type { Stroke } from "../recognition/strokes.ts";

export interface DrawnStroke {
  points: Stroke;
  color: string;
}

/** A paint-bucket fill: the region around this point, bounded by the lines. */
export interface DrawnFill {
  x: number;
  y: number;
  color: string;
}

export interface Drawing {
  strokes: DrawnStroke[];
  fills?: DrawnFill[];
}

export interface Crayon {
  id: string;
  en: string;
  ja: string;
  hex: string;
}

/** The magic ink is the default; drawing in it keeps an object's natural colours. */
export const INK: Crayon = { id: "ink", en: "magic ink", ja: "まほうのインク", hex: "#2f3a75" };

export const CRAYONS: Crayon[] = [
  INK,
  { id: "red", en: "red", ja: "あか", hex: "#e53935" },
  { id: "orange", en: "orange", ja: "オレンジ", hex: "#fb8c00" },
  { id: "yellow", en: "yellow", ja: "きいろ", hex: "#fdd835" },
  { id: "green", en: "green", ja: "みどり", hex: "#43a047" },
  { id: "blue", en: "blue", ja: "あお", hex: "#1e88e5" },
  { id: "purple", en: "purple", ja: "むらさき", hex: "#8e24aa" },
  { id: "pink", en: "pink", ja: "ピンク", hex: "#ec407a" },
  { id: "brown", en: "brown", ja: "ちゃいろ", hex: "#8d6e63" },
  { id: "black", en: "black", ja: "くろ", hex: "#263238" }
];

export function crayonOf(hex: string): Crayon {
  return CRAYONS.find((c) => c.hex === hex) ?? INK;
}

export function strokesOf(d: Drawing): Stroke[] {
  return d.strokes.map((s) => s.points);
}

/** The crayon with the most ink (null if only magic ink was used). */
export function dominantCrayon(d: Drawing): Crayon | null {
  const ink = new Map<string, number>();
  for (const s of d.strokes) {
    let len = 0;
    for (let i = 1; i < s.points.length; i++) len += Math.hypot(s.points[i][0] - s.points[i - 1][0], s.points[i][1] - s.points[i - 1][1]);
    ink.set(s.color, (ink.get(s.color) ?? 0) + len + 1);
  }
  let best: string | null = null;
  let bestLen = -1;
  for (const [hex, len] of ink) {
    if (len > bestLen) {
      best = hex;
      bestLen = len;
    }
  }
  if (!best) return null;
  const c = crayonOf(best);
  return c.id === "ink" ? null : c;
}

export function drawingBounds(d: Drawing) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of d.strokes)
    for (const [x, y] of s.points) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  if (minX === Infinity) return { minX: 0, minY: 0, maxX: 1, maxY: 1, w: 1, h: 1 };
  return { minX, minY, maxX, maxY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

export interface RenderOpts {
  size: number;
  pad?: number;
  lineWidth?: number;
  /** Draw every stroke in this colour (e.g. glowing gold). */
  color?: string;
  glow?: string;
}

/** Fit and draw a drawing onto a square canvas (transparent background). */
export function renderDrawing(d: Drawing, opts: RenderOpts, canvas = document.createElement("canvas")): HTMLCanvasElement {
  const S = opts.size;
  canvas.width = canvas.height = S;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  g.clearRect(0, 0, S, S);
  const b = drawingBounds(d);
  const pad = opts.pad ?? S * 0.1;
  const scale = (S - pad * 2) / Math.max(b.w, b.h);
  const ox = (S - b.w * scale) / 2 - b.minX * scale;
  const oy = (S - b.h * scale) / 2 - b.minY * scale;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = opts.lineWidth ?? S * 0.03;
  if (opts.glow) {
    g.shadowColor = opts.glow;
    g.shadowBlur = S * 0.05;
  }
  for (const s of d.strokes) {
    g.strokeStyle = opts.color ?? s.color;
    g.beginPath();
    s.points.forEach(([x, y], i) => (i === 0 ? g.moveTo(x * scale + ox, y * scale + oy) : g.lineTo(x * scale + ox, y * scale + oy)));
    if (s.points.length === 1) g.lineTo(s.points[0][0] * scale + ox + 0.1, s.points[0][1] * scale + oy);
    g.stroke();
  }
  return canvas;
}

/**
 * A sticker of the drawing: its outline filled with paper and a white border,
 * so even an open scribble reads as a cut-out object. Returns the canvas and
 * the drawing's aspect (w / h).
 */
export function renderSticker(d: Drawing, size = 256): { canvas: HTMLCanvasElement; aspect: number } {
  const S = size;
  const pad = S * 0.12;
  const b = drawingBounds(d);
  const scale = (S - pad * 2) / Math.max(b.w, b.h);
  const ox = (S - b.w * scale) / 2 - b.minX * scale;
  const oy = (S - b.h * scale) / 2 - b.minY * scale;
  const mask = document.createElement("canvas");
  mask.width = mask.height = S;
  const mg = mask.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const path = (g: CanvasRenderingContext2D, lw: number, color: string | null) => {
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = lw;
    for (const s of d.strokes) {
      g.strokeStyle = color ?? s.color;
      g.beginPath();
      s.points.forEach(([x, y], i) => (i === 0 ? g.moveTo(x * scale + ox, y * scale + oy) : g.lineTo(x * scale + ox, y * scale + oy)));
      if (s.points.length === 1) g.lineTo(s.points[0][0] * scale + ox + 0.1, s.points[0][1] * scale + oy);
      g.stroke();
    }
  };
  path(mg, S * 0.06, "#000");
  const img = mg.getImageData(0, 0, S, S);
  const outside = new Uint8Array(S * S);
  const queue: number[] = [];
  const push = (i: number) => {
    if (outside[i] || img.data[i * 4 + 3] > 20) return;
    outside[i] = 1;
    queue.push(i);
  };
  for (let x = 0; x < S; x++) {
    push(x);
    push((S - 1) * S + x);
  }
  for (let y = 0; y < S; y++) {
    push(y * S);
    push(y * S + S - 1);
  }
  while (queue.length) {
    const i = queue.pop() as number;
    const x = i % S;
    const y = (i / S) | 0;
    if (x > 0) push(i - 1);
    if (x < S - 1) push(i + 1);
    if (y > 0) push(i - S);
    if (y < S - 1) push(i + S);
  }
  const sil = mg.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    if (!outside[i]) {
      sil.data[i * 4] = 255;
      sil.data[i * 4 + 1] = 255;
      sil.data[i * 4 + 2] = 255;
      sil.data[i * 4 + 3] = 255;
    }
  }
  mg.putImageData(sil, 0, 0);
  const out = document.createElement("canvas");
  out.width = out.height = S;
  const og = out.getContext("2d") as CanvasRenderingContext2D;
  og.save();
  og.shadowColor = "rgba(40,30,70,0.35)";
  og.shadowBlur = S * 0.03;
  const r = S * 0.025;
  for (let a = 0; a < 12; a++) og.drawImage(mask, Math.cos((a / 12) * Math.PI * 2) * r, Math.sin((a / 12) * Math.PI * 2) * r);
  og.restore();
  og.globalCompositeOperation = "source-atop";
  og.fillStyle = "#fffdf6";
  og.fillRect(0, 0, S, S);
  og.globalCompositeOperation = "source-over";
  path(og, S * 0.035, null);
  return { canvas: out, aspect: b.w / b.h };
}
