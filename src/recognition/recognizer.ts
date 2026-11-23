/**
 * Drawing -> ranked guesses. Wraps preprocessing, the CNN and shape features.
 * Knows nothing about levels or targets: the policy decides what a result means,
 * so a future "invent anything" phase can use the same recogniser untouched.
 */
import { logits, parseModel, softmax, type SketchModel } from "./model.ts";
import { RASTER, rasterize } from "./raster.ts";
import { shapeFeatures, type ShapeFeatures } from "./shapeRules.ts";
import { bounds, inkLength, simplifyLikeQuickDraw, type Stroke } from "./strokes.ts";

export interface Ranked {
  label: string;
  p: number;
}

export interface Recognition {
  /** Calibrated probability per model label (same order as `labels`). */
  probs: Float32Array;
  labels: readonly string[];
  /** Best guesses first (top 8). */
  ranked: Ranked[];
  /** Ink length and larger box side, in the caller's units (canvas pixels). */
  ink: number;
  size: number;
  /** Shape of the simplified drawing (for the geometric rules). */
  features: ShapeFeatures;
  /** The drawing as the model saw it (0-255 space). */
  simplified: Stroke[];
  /** Inference time. */
  ms: number;
}

export class Recognizer {
  readonly model: SketchModel;
  private readonly input = new Float32Array(RASTER * RASTER);
  private readonly index = new Map<string, number>();

  constructor(model: SketchModel) {
    this.model = model;
    model.labels.forEach((l, i) => this.index.set(l, i));
  }

  static async load(url: string): Promise<Recognizer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`model ${res.status}`);
    return new Recognizer(parseModel(await res.arrayBuffer()));
  }

  get labels(): readonly string[] {
    return this.model.labels;
  }

  has(label: string): boolean {
    return this.index.has(label);
  }

  prob(r: Recognition, label: string): number {
    const i = this.index.get(label);
    return i === undefined ? 0 : r.probs[i];
  }

  recognize(strokes: readonly Stroke[]): Recognition {
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    const usable = strokes.filter((s) => s.length > 0);
    const b = bounds(usable);
    const size = b ? Math.max(b.maxX - b.minX, b.maxY - b.minY) : 0;
    const simplified = simplifyLikeQuickDraw(usable);
    rasterize(simplified, this.input);
    const probs = softmax(logits(this.model, this.input), this.model.header.temperature || 1);
    const order = Array.from(probs.keys()).sort((a, b2) => probs[b2] - probs[a]).slice(0, 8);
    const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
      probs,
      labels: this.model.labels,
      ranked: order.map((i) => ({ label: this.model.labels[i], p: probs[i] })),
      ink: inkLength(usable),
      size,
      features: shapeFeatures(simplified),
      simplified,
      ms: t1 - t0
    };
  }
}
