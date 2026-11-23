import { describe, expect, it } from "vitest";
import { floodRegion, growIntoLines, interior, softTint } from "./fill.ts";
import { artFromDrawing, sanitizeArt, uprightArt } from "./art.ts";

/** A 20x20 mask with a square outline from (4,4) to (15,15). */
function square(gap = false): Uint8Array {
  const w = 20;
  const m = new Uint8Array(w * w);
  for (let i = 4; i <= 15; i++) {
    m[4 * w + i] = 1;
    m[15 * w + i] = 1;
    m[i * w + 4] = 1;
    m[i * w + 15] = 1;
  }
  if (gap) m[4 * w + 9] = 0;
  return m;
}

describe("fills", () => {
  it("fills inside a closed shape only", () => {
    const r = floodRegion(square(), 20, 20, 9, 9);
    expect(r).not.toBeNull();
    let n = 0;
    for (const v of r!) n += v;
    expect(n).toBe(10 * 10);
    expect(r![0]).toBe(0);
  });

  it("refuses to fill outside the drawing (never paints the background)", () => {
    expect(floodRegion(square(), 20, 20, 1, 1)).toBeNull();
    expect(floodRegion(square(true), 20, 20, 9, 9)).toBeNull();
    expect(floodRegion(square(), 20, 20, 4, 4)).toBeNull();
  });

  it("finds the inside for the automatic fill", () => {
    const inside = interior(square(), 20, 20);
    expect(inside[9 * 20 + 9]).toBe(1);
    expect(inside[0]).toBe(0);
    expect(inside[4 * 20 + 4]).toBe(0);
  });

  it("tucks the fill under the lines but not past them", () => {
    const line = square();
    const r = floodRegion(line, 20, 20, 9, 9)!;
    const g = growIntoLines(r, line, 20, 20, 3);
    expect(g[4 * 20 + 9]).toBe(1);
    expect(g[3 * 20 + 9]).toBe(0);
  });

  it("soft tint is lighter than the line colour", () => {
    expect(softTint("#000000")).toBe("#999999");
    expect(softTint("#e53935", 1)).toBe("#ffffff");
  });

  it("the child's fills travel with crop, rotation and saving", () => {
    const a = artFromDrawing({
      strokes: [{ color: "#2f3a75", points: [[100, 100], [400, 100], [400, 140], [100, 140], [100, 100]] }],
      fills: [{ x: 250, y: 120, color: "#fdd835" }, { x: 5, y: 5, color: "#e53935" }]
    });
    // Cropped by the ink box minus half a pen width (+1): 250 - 94.5 = 155.5 -> 156.
    expect(a.fills).toEqual([{ x: 156, y: 26, c: "#fdd835" }]);
    const up = uprightArt(a);
    expect(up.fills?.length).toBe(1);
    expect(up.fills![0].x).toBeGreaterThan(0);
    expect(up.fills![0].y).toBeGreaterThan(0);
    expect(sanitizeArt(JSON.parse(JSON.stringify(up)))).toEqual(up);
  });
});
