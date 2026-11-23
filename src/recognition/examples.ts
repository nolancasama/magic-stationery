/**
 * Example drawings for the Hint card and the trace stencil. Most are real
 * Quick, Draw! drawings (CC BY 4.0) that the model recognises confidently,
 * chosen by tools/sketch-model/pick-examples.ts into examples.json. Words the
 * dataset lacks (ruler, notebook) are drawn by hand here.
 */
import type { Drawing } from "../draw/drawing.ts";
import { INK } from "../draw/drawing.ts";
import picked from "./examples.json";
import type { WordId } from "./vocab.ts";

type Strokes = number[][][];

const HAND: Partial<Record<WordId, Strokes>> = {
  ruler: [
    [[10, 90], [245, 90], [245, 160], [10, 160], [10, 90]],
    [[35, 90], [35, 115]],
    [[60, 90], [60, 125]],
    [[85, 90], [85, 115]],
    [[110, 90], [110, 125]],
    [[135, 90], [135, 115]],
    [[160, 90], [160, 125]],
    [[185, 90], [185, 115]],
    [[210, 90], [210, 125]]
  ],
  notebook: [
    [[50, 10], [220, 10], [220, 245], [50, 245], [50, 10]],
    [[40, 40], [62, 40]],
    [[40, 80], [62, 80]],
    [[40, 120], [62, 120]],
    [[40, 160], [62, 160]],
    [[40, 200], [62, 200]],
    [[90, 60], [190, 60]],
    [[90, 100], [190, 100]],
    [[90, 140], [190, 140]]
  ]
};

const SOURCES: Partial<Record<WordId, Strokes>> = { ...(picked as Partial<Record<WordId, Strokes>>), ...HAND };

export function exampleFor(word: WordId): Drawing | null {
  const s = SOURCES[word];
  if (!s) return null;
  return { strokes: s.map((pts) => ({ color: INK.hex, points: pts.map(([x, y]) => [x, y] as [number, number]) })) };
}

export function hasExample(word: WordId): boolean {
  return !!SOURCES[word];
}
