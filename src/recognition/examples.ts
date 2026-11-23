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

// Bamboo: a tall stalk with nodes and two small leaves (long and thin, like the ruler rule wants).
HAND.bamboo = [
  [[112, 0], [112, 255]],
  [[142, 0], [142, 255]],
  [[112, 60], [142, 60]],
  [[112, 125], [142, 125]],
  [[112, 190], [142, 190]],
  [[142, 70], [154, 58], [160, 50], [154, 64], [142, 74]],
  [[112, 140], [100, 128], [94, 120], [100, 134], [112, 144]]
];

/** A closed loop (circle or ellipse); `squeezeTop` narrows the top half (an egg). Canvas y grows down. */
function loop(cx: number, cy: number, rx: number, ry: number, n = 24, squeezeTop = 0): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const up = Math.max(0, -Math.sin(a));
    pts.push([Math.round(cx + Math.cos(a) * rx * (1 - squeezeTop * up)), Math.round(cy + Math.sin(a) * ry)]);
  }
  return pts;
}

// Level 4, the Supermarket: simple shapes a grade-4 child can copy. Apple and carrot are drawn the way
// Quick, Draw! players draw them; orange and tomato are round (the crayon tells them apart); the egg is
// an oval; milk is a gable-top carton.
HAND.apple = [
  [[128, 62], [110, 50], [85, 46], [60, 55], [42, 75], [32, 105], [32, 140], [42, 175], [60, 205], [85, 225], [108, 230], [128, 222], [148, 230], [171, 225], [196, 205], [214, 175], [224, 140], [224, 105], [214, 75], [196, 55], [171, 46], [146, 50], [128, 62]],
  [[128, 62], [131, 38], [138, 18]],
  [[134, 36], [152, 18], [178, 12], [166, 32], [136, 40]]
];
HAND.orange = [loop(128, 142, 100, 100), [[128, 42], [130, 26]], [[131, 30], [150, 14], [174, 16], [158, 32], [132, 32]]];
HAND.tomato = [loop(128, 148, 110, 90), [[96, 60], [128, 64], [160, 60]], [[106, 84], [128, 64], [150, 84]], [[128, 64], [128, 38]]];
HAND.carrot = [
  [[84, 72], [172, 72], [160, 120], [146, 180], [132, 240], [124, 240], [112, 180], [98, 120], [84, 72]],
  [[110, 72], [92, 22]],
  [[128, 72], [128, 6]],
  [[146, 72], [166, 22]],
  [[100, 110], [120, 114]],
  [[138, 150], [154, 146]],
  [[116, 196], [130, 198]]
];
HAND.egg = [loop(128, 136, 80, 108, 24, 0.18)];
HAND.milk = [
  [[66, 100], [190, 100], [190, 246], [66, 246], [66, 100]],
  [[66, 100], [128, 48], [190, 100]],
  [[118, 48], [118, 28], [138, 28], [138, 48]],
  [[92, 150], [164, 150], [164, 206], [92, 206], [92, 150]],
  [[128, 160], [118, 180], [128, 192], [138, 180], [128, 160]]
];

const SOURCES: Partial<Record<WordId, Strokes>> = { ...(picked as Partial<Record<WordId, Strokes>>), ...HAND };

export function exampleFor(word: WordId): Drawing | null {
  const s = SOURCES[word];
  if (!s) return null;
  return { strokes: s.map((pts) => ({ color: INK.hex, points: pts.map(([x, y]) => [x, y] as [number, number]) })) };
}

export function hasExample(word: WordId): boolean {
  return !!SOURCES[word];
}
