import { describe, expect, it } from "vitest";
import type { Art } from "../draw/art.ts";
import { ANCHORS } from "../world/areas/zooLayout.ts";
import { expandSlotSave, sanitize, ZOO_SLOT_KEYS, ZOO_STEPS, type SlotSave } from "./save.ts";

const art = (seed: number): Art => ({ w: 100, h: 100, lw: 9, strokes: [{ c: "#335577", p: [0, seed, 99, 99] }] });

describe("expanding saved displays", () => {
  it("fills a completed old zoo from the child's saved drawings in turn", () => {
    const oldCounts = [2, 3, 3, 2, 3, 3];
    const slots = Object.fromEntries(ZOO_SLOT_KEYS.map((id, slotIndex) => {
      const count = oldCounts[slotIndex];
      const arts = Array.from({ length: count }, (_, index) => art(10 * slotIndex + index));
      return [id, { arts, src: arts.map((_, index) => index).reverse(), tints: arts.map(() => null) }];
    }));
    const save = sanitize({ v: 1, zoo: { steps: ZOO_STEPS, slots } });
    const resolved = ZOO_SLOT_KEYS.map((id) => {
      const entry = save.zoo.slots[id]!;
      const original = structuredClone(entry);
      const expanded = expandSlotSave(entry, ANCHORS[id].length);
      expect(entry).toEqual(original);
      expect(expanded.arts).toBe(entry.arts);
      expect(expanded.src!.slice(0, original.src!.length)).toEqual(original.src);
      expect(expanded.src!.slice(original.src!.length)).toEqual(Array.from({ length: expanded.tints.length - original.tints.length }, (_, index) => index % original.arts!.length));
      expect(expanded.src!.every((source) => expanded.arts![source] !== undefined)).toBe(true);
      return expanded.tints.length;
    });
    expect(resolved).toEqual([2, 4, 4, 2, 6, 5]);
  });

  it("uses the copy palette for new anchors in a legacy slot without artwork", () => {
    const saved: SlotSave = { tints: ["#123456"], drawing: [[[0, 0], [4, 4]]] };
    const expanded = expandSlotSave(saved, 4, ["#abcdef", null]);
    expect(expanded.tints).toEqual(["#123456", "#abcdef", null, "#abcdef"]);
    expect(expanded.src).toEqual([0, 0, 0, 0]);
    expect(expanded.arts).toBeUndefined();
    expect(expanded.drawing).toBe(saved.drawing);
  });

  it("leaves full or longer records untouched", () => {
    const saved = { tints: [null, "#123456"], arts: [art(1)], src: [0, 0] };
    expect(expandSlotSave(saved, 2)).toBe(saved);
    expect(expandSlotSave(saved, 1)).toBe(saved);
  });
});
