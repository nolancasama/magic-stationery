/** Pen widths are part of the child's artwork: kept in saves, restored for the living object. */
import { describe, expect, it } from "vitest";
import { artFromDrawing, artToDrawing, sanitizeArt } from "./art.ts";
import { PEN_WIDTHS, type Drawing } from "./drawing.ts";

const d: Drawing = {
  strokes: [
    { color: "#2f3a75", points: [[10, 10], [80, 10]] },
    { color: "#e53935", points: [[10, 40], [80, 40]], width: PEN_WIDTHS.thick },
    { color: "#43a047", points: [[10, 70], [80, 70]], width: PEN_WIDTHS.thin }
  ]
};

describe("pen widths", () => {
  it("are four clearly different sizes", () => {
    const w = Object.values(PEN_WIDTHS);
    expect(w).toEqual([...w].sort((a, b) => a - b));
    for (let i = 1; i < w.length; i++) expect(w[i] / w[i - 1]).toBeGreaterThan(1.5);
  });

  it("survive art conversion, a save round trip and the way back", () => {
    const art = artFromDrawing(d);
    expect(art.strokes.map((s) => s.w)).toEqual([undefined, PEN_WIDTHS.thick, PEN_WIDTHS.thin]);
    const saved = sanitizeArt(JSON.parse(JSON.stringify(art)));
    expect(saved?.strokes.map((s) => s.w)).toEqual([undefined, PEN_WIDTHS.thick, PEN_WIDTHS.thin]);
    const back = artToDrawing(saved!);
    expect(back.strokes.map((s) => s.width)).toEqual([undefined, PEN_WIDTHS.thick, PEN_WIDTHS.thin]);
  });

  it("the widest line still fits inside the artwork's padding", () => {
    const art = artFromDrawing({ strokes: [{ color: "#000000", points: [[0, 0], [50, 0]], width: PEN_WIDTHS.extra }] });
    expect(art.h).toBeGreaterThanOrEqual(PEN_WIDTHS.extra);
  });

  it("junk widths in a save are dropped", () => {
    const a = sanitizeArt({ w: 10, h: 10, lw: 9, strokes: [{ c: "#000000", p: [0, 0, 5, 5], w: 5000 }] });
    expect(a?.strokes[0].w).toBeUndefined();
  });
});
