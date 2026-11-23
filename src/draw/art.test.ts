import { describe, expect, it } from "vitest";
import { artFromDrawing, artToDrawing, sanitizeArt, uprightArt } from "./art.ts";
import { sanitize } from "../game/save.ts";
import type { Drawing } from "./drawing.ts";

const wobblyFish: Drawing = {
  strokes: [
    { color: "#e53935", points: [[100, 200], [140, 180], [190, 185], [230, 200], [190, 220], [140, 222], [100, 200]] },
    { color: "#1e88e5", points: [[230, 200], [260, 180], [262, 222], [230, 200]] }
  ]
};

describe("art (the child's own drawing)", () => {
  it("keeps every stroke, its colour and its shape, tightly cropped", () => {
    const a = artFromDrawing(wobblyFish);
    expect(a.strokes.map((s) => s.c)).toEqual(["#e53935", "#1e88e5"]);
    // Cropped to the ink (plus half a pen width), not the canvas.
    expect(a.w).toBeLessThan(180);
    expect(a.h).toBeLessThan(60);
    const back = artToDrawing(a);
    // Same shape after the round trip: relative positions preserved to a pixel.
    const p0 = back.strokes[0].points;
    expect(p0[1][0] - p0[0][0]).toBeCloseTo(40, 0);
    expect(p0[1][1] - p0[0][1]).toBeCloseTo(-20, 0);
  });

  it("two different drawings of the same thing stay different", () => {
    const other: Drawing = { strokes: [{ color: "#43a047", points: [[0, 0], [30, 60], [60, 0], [0, 0]] }] };
    expect(artFromDrawing(other)).not.toEqual(artFromDrawing(wobblyFish));
  });

  it("stands a sideways pencil upright without changing it otherwise", () => {
    const pencil: Drawing = { strokes: [{ color: "#2f3a75", points: [[0, 50], [300, 50], [300, 70], [0, 70], [0, 50]] }] };
    const a = artFromDrawing(pencil);
    expect(a.w).toBeGreaterThan(a.h);
    const up = uprightArt(a);
    expect(up.h).toBeGreaterThan(up.w);
    expect(up.strokes[0].c).toBe("#2f3a75");
    expect(up.strokes[0].p.length).toBe(a.strokes[0].p.length);
    // Already upright: untouched.
    expect(uprightArt(up)).toBe(up);
  });

  it("survives saving and rejects garbage", () => {
    const a = artFromDrawing(wobblyFish);
    expect(sanitizeArt(JSON.parse(JSON.stringify(a)))).toEqual(a);
    expect(sanitizeArt({ w: 10, h: 10, lw: 9, strokes: [{ c: "red", p: [1, 2] }] })).toBeNull();
    expect(sanitizeArt({ w: -1, h: 10, lw: 9, strokes: [] })).toBeNull();
    const save = sanitize({ v: 1, store: { steps: [], slots: { pencilCup: { tints: [null, null, null], arts: [a, { bad: 1 }], src: [0, 7, 0] } } } });
    expect(save.store.slots.pencilCup?.arts).toEqual([a]);
    expect(save.store.slots.pencilCup?.src).toEqual([0, 0, 0]);
  });
});
