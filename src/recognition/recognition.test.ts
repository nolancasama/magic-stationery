import { describe, expect, it } from "vitest";
import { RASTER, rasterize } from "./raster.ts";
import { bounds, rdp, resample, simplifyLikeQuickDraw, type Stroke } from "./strokes.ts";
import { judge, liveGuess, POLICY, targetScore } from "./policy.ts";
import type { Recognition } from "./recognizer.ts";
import { longThinScore, shapeFeatures } from "./shapeRules.ts";
import { WORDS, withArticle } from "./vocab.ts";

const LABELS = ["pencil", "marker", "crayon", "rabbit", "squiggle", "eraser", "square", "backpack", "book", "line", "cat"];

/** A fake recognition result with the given probabilities. */
function rec(probs: Record<string, number>, over: Partial<Recognition> = {}): Recognition {
  const p = new Float32Array(LABELS.map((l) => probs[l] ?? 0));
  const ranked = LABELS.map((label, i) => ({ label, p: p[i] })).sort((a, b) => b.p - a.p);
  return { probs: p, labels: LABELS, ranked, ink: 600, size: 300, features: { aspect: 1.5, major: 200, minor: 130 }, simplified: [], ms: 1, ...over };
}

describe("strokes", () => {
  it("normalises like Quick, Draw! simplified data (0-255, top-left aligned)", () => {
    const s: Stroke[] = [[[100, 100], [300, 100], [300, 200]]];
    const out = simplifyLikeQuickDraw(s);
    const b = bounds(out)!;
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(Math.max(b.maxX, b.maxY)).toBe(255);
  });

  it("RDP keeps corners and drops collinear points", () => {
    const line: Stroke = Array.from({ length: 50 }, (_, i) => [i, 0] as [number, number]);
    expect(rdp(line, 2)).toEqual([[0, 0], [49, 0]]);
    const corner: Stroke = [[0, 0], [10, 0], [20, 0], [20, 10], [20, 20]];
    expect(rdp(corner, 2)).toEqual([[0, 0], [20, 0], [20, 20]]);
  });

  it("resample spacing is even", () => {
    const r = resample([[0, 0], [10, 0]], 2);
    expect(r.length).toBe(6);
    expect(r[1][0]).toBeCloseTo(2);
  });
});

describe("raster", () => {
  it("is deterministic and scale invariant", () => {
    const a = rasterize(simplifyLikeQuickDraw([[[0, 0], [100, 100]], [[0, 100], [100, 0]]]));
    const b = rasterize(simplifyLikeQuickDraw([[[0, 0], [400, 400]], [[0, 400], [400, 0]]]));
    expect(a.length).toBe(RASTER * RASTER);
    for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 5);
  });

  it("centres the drawing and leaves a margin", () => {
    const r = rasterize(simplifyLikeQuickDraw([[[0, 0], [255, 0], [255, 255], [0, 255], [0, 0]]]));
    expect(r[0]).toBe(0);
    let ink = 0;
    for (const v of r) ink += v;
    expect(ink).toBeGreaterThan(60);
  });

  it("handles a single dot", () => {
    const r = rasterize([[[5, 5]]]);
    expect(Math.max(...r)).toBeGreaterThan(0.5);
  });
});

describe("shape rules", () => {
  it("a long thin rectangle is a ruler shape; a square is not", () => {
    const ruler: Stroke[] = [[[0, 0], [250, 0], [250, 40], [0, 40], [0, 0]]];
    const square: Stroke[] = [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]];
    expect(longThinScore(shapeFeatures(ruler))).toBeGreaterThan(0.9);
    expect(longThinScore(shapeFeatures(square))).toBe(0);
  });

  it("works at any angle", () => {
    const diag: Stroke[] = [[[0, 0], [200, 200], [215, 185], [15, -15], [0, 0]]];
    expect(longThinScore(shapeFeatures(diag))).toBeGreaterThan(0.9);
  });
});

describe("policy", () => {
  it("accepts the target when it is the top guess", () => {
    expect(judge(rec({ pencil: 0.6, rabbit: 0.2 }), "pencil", { misses: 0 }).kind).toBe("accept");
  });

  it("accepts aliases: a crayon-looking pencil, a backpack for a schoolbag", () => {
    expect(judge(rec({ crayon: 0.7, rabbit: 0.1 }), "pencil", { misses: 0 }).kind).toBe("accept");
    expect(judge(rec({ backpack: 0.5, book: 0.2 }), "schoolbag", { misses: 0 }).kind).toBe("accept");
    expect(judge(rec({ book: 0.6 }), "notebook", { misses: 0 }).kind).toBe("accept");
  });

  it("accepts an ambiguous drawing that could be the target", () => {
    const r = rec({ cat: 0.3, eraser: 0.12, square: 0.1, rabbit: 0.25 });
    expect(targetScore(r, "eraser")).toBeGreaterThan(POLICY.top3Score);
    expect(judge(r, "eraser", { misses: 0 }).kind).toBe("accept");
  });

  it("a confident other thing is a surprise, not a rejection", () => {
    const v = judge(rec({ rabbit: 0.8, cat: 0.1 }), "pencil", { misses: 0 });
    expect(v).toMatchObject({ kind: "surprise", label: "rabbit" });
  });

  it("scribbles are unclear and count as a miss; tiny drawings do not", () => {
    expect(judge(rec({ squiggle: 0.7 }), "pencil", { misses: 0 })).toMatchObject({ kind: "unclear", reason: "shape", countsAsMiss: true });
    expect(judge(rec({ pencil: 0.9 }, { ink: 10, size: 5 }), "pencil", { misses: 0 })).toMatchObject({ kind: "unclear", reason: "tooLittle", countsAsMiss: false });
  });

  it("the third miss is always accepted with help", () => {
    expect(judge(rec({ rabbit: 0.9 }), "pencil", { misses: POLICY.helpAfter - 1 })).toMatchObject({ kind: "accept", how: "help" });
    expect(judge(rec({ squiggle: 0.9 }), "pencil", { misses: POLICY.helpAfter - 1 })).toMatchObject({ kind: "accept", how: "help" });
  });

  it("the ruler is recognised by shape even though the dataset has no rulers", () => {
    const v = judge(rec({ cat: 0.5 }, { features: { aspect: 5, major: 250, minor: 50 } }), "ruler", { misses: 0 });
    expect(v).toMatchObject({ kind: "accept", how: "rule" });
  });

  it("live guess names the target once it is likely", () => {
    expect(liveGuess(rec({ pencil: 0.5 }), "pencil")).toEqual({ label: "pencil", isTarget: true });
    expect(liveGuess(rec({ rabbit: 0.6 }), "pencil")).toEqual({ label: "rabbit", isTarget: false });
    expect(liveGuess(rec({ squiggle: 0.9 }), "pencil")).toBeNull();
  });
});

describe("vocab", () => {
  it("every word has an English and Japanese form and something that recognises it", () => {
    for (const w of Object.values(WORDS)) {
      expect(w.en && w.ja).toBeTruthy();
      expect(Object.keys(w.accepts).length > 0 || !!w.rule).toBe(true);
    }
  });

  it("articles read naturally", () => {
    expect(withArticle("rabbit")).toBe("a rabbit");
    expect(withArticle("elephant")).toBe("an elephant");
    expect(withArticle("scissors")).toBe("scissors");
    expect(withArticle("backpack")).toBe("a schoolbag");
  });
});
