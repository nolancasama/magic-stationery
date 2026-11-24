import { describe, expect, it } from "vitest";
import { startCounting, updateCounting } from "./counting.ts";

describe("market counting", () => {
  it("ignores a handoff attempted with an empty or partly filled basket", () => {
    const empty = startCounting(3);
    // The previous flow accepted this answer while the basket was empty.
    expect(updateCounting(empty, "answer")).toBe(empty);
    expect(updateCounting(empty, "ready")).toBe(empty);
    const partial = updateCounting(empty, "pick");
    expect(updateCounting(partial, "answer")).toBe(partial);
    expect(updateCounting(partial, "ready")).toBe(partial);
    expect(partial).toMatchObject({ count: 1, idleHints: 0, phase: "counting" });
  });

  it("advances on the first valid answer for ten consecutive baskets", () => {
    for (let order = 0; order < 10; order++) {
      const want = order % 5 + 1;
      let state = startCounting(want);
      for (let n = 0; n < want; n++) state = updateCounting(state, "pick");
      expect(updateCounting(state, "answer")).toBe(state);
      expect(updateCounting(state, "pick")).toBe(state);
      state = updateCounting(state, "ready");
      expect(state).toMatchObject({ count: want, phase: "speaking" });
      expect(updateCounting(state, "pick")).toBe(state);
      state = updateCounting(state, "answer");
      expect(state).toMatchObject({ count: want, phase: "done" });
      expect(updateCounting(state, "answer")).toBe(state);
    }
  });

  it("resets the idle streak after a click and never counts an idle as a pick", () => {
    const hinted = updateCounting(startCounting(3), "idle");
    expect(hinted).toMatchObject({ count: 0, idleHints: 1 });
    expect(updateCounting(hinted, "idle")).toMatchObject({ count: 0, idleHints: 2 });
    expect(updateCounting(hinted, "pick")).toMatchObject({ count: 1, idleHints: 0 });
  });
});
