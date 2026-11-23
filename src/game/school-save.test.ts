/** Level 2 progress in the save, and the time sentences the child says. */
import { describe, expect, it } from "vitest";
import { judgeSpeech } from "../speech/match.ts";
import { PHRASES } from "../speech/phrases.ts";
import { LEVELS, isOpen } from "./levels/index.ts";
import { defaults, sanitize, schoolProgress, schoolUnits } from "./save.ts";

const art = { w: 100, h: 100, lw: 9, strokes: [{ c: "#2f3a75", p: [0, 0, 50, 50] }] };

describe("school save", () => {
  it("old saves (no school section) load with an empty classroom", () => {
    const old = { v: 1, started: true, store: { steps: ["pen"], slots: {} }, settings: {} };
    const s = sanitize(old);
    expect(s.school).toEqual({ steps: [], slots: {}, glyphs: {} });
    expect(s.store.steps).toEqual(["pen"]);
  });

  it("keeps valid school progress and drops junk", () => {
    const raw = {
      v: 1,
      school: {
        steps: ["arrive", "nonsense", "desks"],
        slots: { desks: { tints: [null, "#aabbcc"] }, sofa: { tints: [null] } },
        glyphs: { n3: art, n7: art, ld: { junk: true } }
      }
    };
    const s = sanitize(raw);
    expect(s.school.steps).toEqual(["arrive", "desks"]);
    expect(Object.keys(s.school.slots)).toEqual(["desks"]);
    expect(Object.keys(s.school.glyphs)).toEqual(["n3"]);
  });

  it("counts five restoration units", () => {
    const s = defaults();
    expect(schoolUnits(s)).toEqual({ done: 0, total: 5 });
    s.school.slots.desks = { tints: [null] };
    s.school.glyphs = { n12: art, n3: art, n6: art };
    expect(schoolProgress(s)).toBeCloseTo(0.2);
    s.school.glyphs.n9 = art;
    expect(schoolProgress(s)).toBeCloseTo(0.4);
  });

  it("the School opens once the shop is finished", () => {
    const s = defaults();
    expect(isOpen("school", s)).toBe(false);
    for (const k of ["pencilCup", "erasers", "scissors", "rulers", "crayons", "books", "notebooks", "schoolbags"] as const) s.store.slots[k] = { tints: [null] };
    s.store.steps.push("taro");
    expect(isOpen("school", s)).toBe(true);
    expect(LEVELS.market.run).toBeUndefined();
  });
});

describe("time sentences", () => {
  const eight = [PHRASES.itsSeven, PHRASES.itsEight];
  const half = [PHRASES.itsEight, PHRASES.itsEightThirty];
  const heard = (text: string, opts = eight) => {
    const j = judgeSpeech([text], opts);
    return j.kind === "match" ? j.id : j.kind;
  };

  it("hears the hour, in words or digits", () => {
    expect(heard("it's eight o'clock")).toBe("itsEight");
    expect(heard("8 o'clock")).toBe("itsEight");
    expect(heard("it's seven o'clock")).toBe("itsSeven");
  });

  it("tells eight from eight thirty", () => {
    expect(heard("it's eight thirty", half)).toBe("itsEightThirty");
    expect(heard("8:30", half)).toBe("itsEightThirty");
    expect(heard("it's eight", half)).toBe("itsEight");
  });

  it("hears good morning", () => {
    expect(judgeSpeech(["good morning"], [PHRASES.goodMorning]).kind).toBe("match");
  });
});
