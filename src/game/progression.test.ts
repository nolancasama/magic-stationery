/** Mandatory start (the shop), free middle (any order), mandatory ending (the festival at the gym). */
import { describe, expect, it } from "vitest";
import { isOpen } from "./levels/index.ts";
import { defaults, festivalOpen, middleOpen, placeProgress, type SaveData } from "./save.ts";

const art = { w: 1, h: 1, lw: 9, strokes: [{ c: "#000000", p: [0, 0, 1, 1] }] };
const slot = { tints: [null] };

function finishStore(s: SaveData) {
  for (const k of ["pencilCup", "erasers", "scissors", "rulers", "crayons", "books", "notebooks", "schoolbags"] as const) s.store.slots[k] = slot;
  s.store.steps.push("taro");
}
function finishSchool(s: SaveData) {
  s.school.slots = { desks: slot, chairs: slot };
  s.school.glyphs = { n12: art, n3: art, n6: art, n9: art, ld: art, lg: art, lm: art, lt: art };
  s.school.steps.push("bell");
}
function finishZoo(s: SaveData) {
  s.zoo.slots = { elephants: slot, monkeys: slot, bananas: slot, pandas: slot, bamboo: slot, penguins: slot };
  s.zoo.steps.push("favorite");
}
function finishMarket(s: SaveData) {
  for (const k of ["apples", "oranges", "tomatoes", "carrots", "eggs", "milk"]) (s.market.slots as Record<string, typeof slot>)[k] = slot;
  s.market.steps.push("shopping");
}

describe("progression", () => {
  it("only the shop is open on a new game", () => {
    const s = defaults();
    expect(isOpen("store", s)).toBe(true);
    for (const id of ["school", "zoo", "market", "gym"] as const) expect(isOpen(id, s), id).toBe(false);
  });

  it("after the shop every place is open, in any order", () => {
    const s = defaults();
    finishStore(s);
    expect(middleOpen(s)).toBe(true);
    for (const id of ["school", "zoo", "market", "gym"] as const) expect(isOpen(id, s), id).toBe(true);
  });

  it("the festival waits until the classroom, zoo and supermarket are restored", () => {
    const s = defaults();
    finishStore(s);
    expect(festivalOpen(s)).toBe(false);
    finishZoo(s);
    finishSchool(s);
    expect(festivalOpen(s)).toBe(false);
    finishMarket(s);
    expect(placeProgress(s, "market")).toBe(1);
    expect(festivalOpen(s)).toBe(true);
  });

  it("saves from the old fixed order keep everything they had open", () => {
    const s = defaults();
    finishStore(s);
    finishSchool(s);
    for (const id of ["store", "school", "zoo"] as const) expect(isOpen(id, s), id).toBe(true);
  });
});
