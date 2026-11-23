/**
 * The glyph model (digits and letters, Level 2): parity with PyTorch, the
 * constrained policy on real held-out handwriting (tests/fixtures/glyphs.json,
 * UJI Pen Characters v2, CC BY 4.0), and splitting "12" into two digits.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GLYPH_TARGETS, glyphAccepts, glyphExample, judgeGlyph, splitGlyphs } from "./glyphs.ts";
import { logits, parseModel } from "./model.ts";
import { Recognizer } from "./recognizer.ts";
import type { Stroke } from "./strokes.ts";

const file = path.resolve(__dirname, "../../public/models/glyph-model.bin");
const parityFile = path.resolve(__dirname, "__fixtures__/glyph-parity.json");
const fixturesFile = path.resolve(__dirname, "../../tests/fixtures/glyphs.json");
const present = fs.existsSync(file) && fs.existsSync(parityFile) && fs.existsSync(fixturesFile);

describe.skipIf(!present)("glyph model", () => {
  const buf = present ? fs.readFileSync(file) : Buffer.alloc(0);
  const model = present ? parseModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)) : null;
  const r = model ? new Recognizer(model) : null;
  const fixtures: Record<string, Stroke[]> = present ? JSON.parse(fs.readFileSync(fixturesFile, "utf8")) : {};

  it("has digits, both cases and a scribble class", () => {
    expect(model?.labels.length).toBe(63);
    for (const l of ["0", "9", "a", "z", "A", "Z", "scribble"]) expect(model?.labels).toContain(l);
  });

  it("matches the PyTorch reference logits", () => {
    const parity: { input: string; logits: number[] }[] = JSON.parse(fs.readFileSync(parityFile, "utf8"));
    for (const ref of parity) {
      const bytes = Buffer.from(ref.input, "base64");
      const x = new Float32Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) x[i] = bytes[i] / 255;
      const z = logits(model as NonNullable<typeof model>, x);
      let maxErr = 0;
      for (let i = 0; i < z.length; i++) maxErr = Math.max(maxErr, Math.abs(z[i] - ref.logits[i]));
      expect(maxErr).toBeLessThan(2e-3);
    }
  });

  it("accepts real handwriting of every target on the first try", () => {
    for (const t of GLYPH_TARGETS) {
      const v = judgeGlyph((r as Recognizer).recognize(fixtures[t]), t, 0);
      expect(v.kind, t).toBe("accept");
    }
  });

  it("accepts the hand-made hint examples", () => {
    for (const t of GLYPH_TARGETS) {
      const ex = glyphExample(t);
      expect(ex, t).not.toBeNull();
      const v = judgeGlyph((r as Recognizer).recognize((ex as NonNullable<typeof ex>).strokes.map((s) => s.points)), t, 0);
      expect(v.kind, t).toBe("accept");
    }
  });

  it("names a different letter, and never accepts a scribble at first", () => {
    const wrong = judgeGlyph((r as Recognizer).recognize(fixtures.b), "d", 0);
    expect(wrong.kind).not.toBe("accept");
    const scr = judgeGlyph((r as Recognizer).recognize(fixtures.scribble), "m", 0);
    expect(scr.kind).not.toBe("accept");
  });

  it("the third attempt is always accepted (the pen helps)", () => {
    const v = judgeGlyph((r as Recognizer).recognize(fixtures.scribble), "d", 2);
    expect(v).toMatchObject({ kind: "accept", how: "help" });
  });
});

describe("glyph helpers", () => {
  it("counts the other case and look-alikes", () => {
    expect(glyphAccepts("d").D).toBe(1);
    expect(glyphAccepts("1").l).toBe(1);
    expect(glyphAccepts("9").g).toBeGreaterThan(0.5);
  });

  it("splits two digits written side by side", () => {
    const one: Stroke = [[10, 10], [10, 100]];
    const twoA: Stroke = [[40, 20], [70, 10], [80, 40], [40, 100]];
    const twoB: Stroke = [[40, 100], [85, 100]];
    const parts = splitGlyphs([twoB, one, twoA], 2);
    expect(parts?.length).toBe(2);
    expect(parts?.[0]).toEqual([one]);
    expect(parts?.[1]).toHaveLength(2);
  });

  it("merges extra pieces into the closest neighbour and fails when there are too few", () => {
    const a: Stroke = [[0, 0], [5, 50]];
    const b: Stroke = [[8, 0], [12, 50]];
    const c: Stroke = [[60, 0], [70, 50]];
    expect(splitGlyphs([a, b, c], 2)?.map((g) => g.length)).toEqual([2, 1]);
    expect(splitGlyphs([[[0, 0], [100, 100]]], 2)).toBeNull();
  });

  it("the example for 12 has both digits", () => {
    const ex = glyphExample("12");
    expect(ex?.strokes.length).toBe(2);
  });
});
