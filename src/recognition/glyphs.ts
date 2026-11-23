/**
 * Written characters (Level 2): digits on the clock, lowercase letters on the
 * alphabet strip. A second small CNN (public/models/glyph-model.bin, trained by
 * tools/sketch-model/build-glyphs.ts + train.py on real handwriting) runs through
 * the same Recognizer class as the sketch model. Recognition is constrained:
 * the game always knows which character it asked for, so look-alikes count
 * (a capital "D" for "d", "l" for "1") and only a confident *other* character
 * gets "That looks like a b!".
 */
import { INK, type Drawing } from "../draw/drawing.ts";
import type { Recognition } from "./recognizer.ts";
import { bounds, type Point, type Stroke } from "./strokes.ts";

export const SCRIBBLE = "scribble";

export const GLYPH_POLICY = {
  /** Below this much ink (canvas px) or this size, nothing has been written yet: no miss. */
  minInk: 30,
  minSize: 18,
  acceptScore: 0.25,
  top3Score: 0.08,
  /** A different character this confident is named ("That looks like a b!"). */
  otherP: 0.45,
  helpAfter: 3
};

/** Model labels that count as the target, with weights. */
export function glyphAccepts(target: string): Record<string, number> {
  const a: Record<string, number> = { [target]: 1 };
  const other = target === target.toLowerCase() ? target.toUpperCase() : target.toLowerCase();
  if (other !== target) a[other] = 1;
  const alike: Record<string, Record<string, number>> = {
    "0": { o: 1, O: 1 },
    "1": { l: 1, I: 1, i: 0.6, "7": 0.3 },
    "2": { z: 0.9, Z: 0.9 },
    "5": { s: 0.6, S: 0.6 },
    "6": { b: 0.5 },
    "9": { g: 0.8, q: 0.8 },
    g: { "9": 0.8, q: 0.5 },
    t: { f: 0.3 },
    m: { n: 0.2 },
    d: { a: 0.3 }
  };
  return { ...a, ...(alike[target] ?? {}) };
}

export function glyphScore(rec: Recognition, target: string): number {
  const acc = glyphAccepts(target);
  let s = 0;
  rec.labels.forEach((label, i) => {
    const w = acc[label];
    if (w) s += w * rec.probs[i];
  });
  return Math.min(1, s);
}

export type GlyphVerdict =
  | { kind: "accept"; how: "model" | "help"; score: number }
  | { kind: "other"; label: string; p: number }
  | { kind: "unclear"; reason: "tooLittle" | "scribble" | "unsure"; countsAsMiss: boolean };

export function judgeGlyph(rec: Recognition, target: string, misses: number): GlyphVerdict {
  if (rec.ink < GLYPH_POLICY.minInk || rec.size < GLYPH_POLICY.minSize) return { kind: "unclear", reason: "tooLittle", countsAsMiss: false };
  const acc = glyphAccepts(target);
  const score = glyphScore(rec, target);
  const best = rec.ranked[0];
  const topIsTarget = !!best && (acc[best.label] ?? 0) >= 0.7;
  const inTop3 = rec.ranked.slice(0, 3).some((r) => (acc[r.label] ?? 0) >= 0.7);
  if (topIsTarget || score >= GLYPH_POLICY.acceptScore || (inTop3 && score >= GLYPH_POLICY.top3Score)) return { kind: "accept", how: "model", score };
  if (misses + 1 >= GLYPH_POLICY.helpAfter) return { kind: "accept", how: "help", score };
  if (best && best.label !== SCRIBBLE && best.p >= GLYPH_POLICY.otherP) return { kind: "other", label: best.label, p: best.p };
  if (best && best.label === SCRIBBLE) return { kind: "unclear", reason: "scribble", countsAsMiss: true };
  return { kind: "unclear", reason: "unsure", countsAsMiss: true };
}

/** "the number 3", "the letter d". */
export function glyphName(target: string): string {
  return /^[0-9]+$/.test(target) ? `the number ${target}` : `the letter ${target}`;
}

export function glyphNameJa(target: string): string {
  return /^[0-9]+$/.test(target) ? `すうじの「${target}」` : `こもじの「${target}」`;
}

/**
 * Split a drawing into `n` characters written side by side ("12"): strokes are
 * grouped by overlapping horizontal extent, then the closest groups merge until
 * there are `n`. Returns null if there are fewer than `n` separate groups.
 */
export function splitGlyphs(strokes: readonly Stroke[], n: number): Stroke[][] | null {
  const usable = strokes.filter((s) => s.length > 0);
  if (n <= 1) return [usable.slice()];
  const items = usable
    .map((s) => {
      const b = bounds([s]) as NonNullable<ReturnType<typeof bounds>>;
      return { s, minX: b.minX, maxX: b.maxX };
    })
    .sort((a, b) => a.minX - b.minX);
  const groups: { strokes: Stroke[]; minX: number; maxX: number }[] = [];
  const all = bounds(usable);
  // A little slack: a crossbar that just touches the next digit still belongs to its own.
  const slack = all ? (all.maxX - all.minX) * 0.04 : 0;
  for (const it of items) {
    const g = groups[groups.length - 1];
    if (g && it.minX <= g.maxX - slack) {
      g.strokes.push(it.s);
      g.maxX = Math.max(g.maxX, it.maxX);
    } else groups.push({ strokes: [it.s], minX: it.minX, maxX: it.maxX });
  }
  while (groups.length > n) {
    let k = 0;
    let gap = Infinity;
    for (let i = 0; i + 1 < groups.length; i++) {
      const d = groups[i + 1].minX - groups[i].maxX;
      if (d < gap) {
        gap = d;
        k = i;
      }
    }
    const a = groups[k];
    const b = groups[k + 1];
    groups.splice(k, 2, { strokes: [...a.strokes, ...b.strokes], minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX) });
  }
  if (groups.length < n) return null;
  return groups.map((g) => g.strokes);
}

// ---------------------------------------------------------------- example characters
// Hand-made in the print style of Japanese elementary English worksheets
// (single-storey g, t with a crossbar), in the 0-255 space; shown on the Hint
// card and as the dotted trace stencil.
function arc(cx: number, cy: number, r: number, a0: number, a1: number, rx = r): Point[] {
  const pts: Point[] = [];
  const steps = Math.max(6, Math.round(Math.abs(a1 - a0) / 12));
  for (let i = 0; i <= steps; i++) {
    const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
    pts.push([Math.round(cx + rx * Math.cos(a)), Math.round(cy + r * Math.sin(a))]);
  }
  return pts;
}

const GLYPH_EXAMPLES: Record<string, Point[][]> = {
  "1": [[[92, 52], [140, 8], [140, 250]]],
  "2": [[...arc(125, 78, 66, 195, 370), [182, 120], [58, 250], [205, 250]]],
  "3": [[...arc(122, 66, 58, 205, 450)], [...arc(122, 188, 64, 270, 520)]],
  "6": [[[178, 14], [128, 36], [86, 82], [60, 140], ...arc(125, 185, 66, 180, 540)]],
  "9": [[...arc(125, 72, 62, 0, 360)], [[187, 72], [186, 165], [176, 250]]],
  d: [[...arc(102, 180, 70, 0, 360, 66)], [[172, 0], [172, 250]]],
  g: [[...arc(108, 85, 66, 0, 360, 62)], [[172, 20], [172, 190], ...arc(112, 190, 60, 0, 160)]],
  m: [[[32, 66], [32, 250]], [[32, 122], ...arc(82, 122, 50, 180, 360), [132, 250]], [[132, 122], ...arc(182, 122, 50, 180, 360), [232, 250]]],
  t: [[[112, 0], [112, 205], ...arc(150, 205, 38, 180, 110)], [[52, 70], [176, 70]]]
};

export function glyphExample(target: string): Drawing | null {
  const chars = [...target];
  const parts = chars.map((c) => GLYPH_EXAMPLES[c]);
  if (parts.some((p) => !p)) return null;
  // Several characters ("12") sit side by side, each in its own box.
  const strokes: Point[][] = [];
  parts.forEach((p, i) =>
    p.forEach((st) => strokes.push(st.map(([x, y]) => [x * (chars.length > 1 ? 0.8 : 1) + i * 230, y] as Point)))
  );
  return { strokes: strokes.map((pts) => ({ color: INK.hex, points: pts })) };
}

export const GLYPH_TARGETS = Object.keys(GLYPH_EXAMPLES);
