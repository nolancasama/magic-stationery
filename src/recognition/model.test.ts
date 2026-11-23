/**
 * The TypeScript forward pass must match PyTorch's (train.py exports reference
 * logits for a few test drawings computed with the same int8 weights).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { logits, parseModel, softmax, type SketchModel } from "./model.ts";

const file = path.resolve(__dirname, "../../public/models/sketch-model.bin");
const parityFile = path.resolve(__dirname, "__fixtures__/parity.json");
const present = fs.existsSync(file) && fs.existsSync(parityFile);

describe.skipIf(!present)("sketch model", () => {
  let model: SketchModel;
  let parity: { label: string; input: string; logits: number[] }[] = [];
  if (present) {
    const buf = fs.readFileSync(file);
    model = parseModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    parity = JSON.parse(fs.readFileSync(parityFile, "utf8"));
  }

  it("has the trained labels and a calibration temperature", () => {
    expect(model.labels.length).toBe(138);
    expect(model.labels).toContain("pencil");
    expect(model.labels).toContain("backpack");
    expect(model.header.temperature).toBeGreaterThan(0.3);
  });

  it("matches the PyTorch reference logits", () => {
    for (const ref of parity) {
      const bytes = Buffer.from(ref.input, "base64");
      const x = new Float32Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) x[i] = bytes[i] / 255;
      const z = logits(model, x);
      expect(z.length).toBe(ref.logits.length);
      let maxErr = 0;
      for (let i = 0; i < z.length; i++) maxErr = Math.max(maxErr, Math.abs(z[i] - ref.logits[i]));
      expect(maxErr).toBeLessThan(2e-3);
    }
  });

});

describe("softmax", () => {
  it("is a distribution", () => {
    const p = softmax(new Float32Array([1, 2, 3]), 1.5);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(p[2]).toBeGreaterThan(p[1]);
  });
});
