/** Debug presets produce saves at exactly the intended stage. */
import { afterEach, describe, expect, it } from "vitest";
import { isOpen } from "./levels/index.ts";
import { completePlace, presetSave, resetPlace } from "./debug.ts";
import { debugUnlock, defaults, festivalOpen, middleOpen, placeProgress, sanitize } from "./save.ts";

const settings = defaults().settings;
const places = ["store", "school", "zoo", "market", "gym"] as const;

describe("debug presets", () => {
  afterEach(() => (debugUnlock.all = false));

  it("each stage has the right places done and open", () => {
    expect(middleOpen(presetSave("pen", settings))).toBe(false);
    const shop = presetSave("shop", settings);
    expect(middleOpen(shop) && !festivalOpen(shop)).toBe(true);
    const festival = presetSave("festival", settings);
    expect(festivalOpen(festival)).toBe(true);
    expect(placeProgress(festival, "gym")).toBeLessThan(1);
    const done = presetSave("done", settings);
    for (const p of places) expect(placeProgress(done, p), p).toBe(1);
  });

  it("presets survive the save sanitizer (what a reload reads)", () => {
    const done = sanitize(JSON.parse(JSON.stringify(presetSave("done", settings))));
    for (const p of places) expect(placeProgress(done, p), p).toBe(1);
  });

  it("finish and reset one place", () => {
    const s = presetSave("shop", settings);
    completePlace(s, "zoo");
    expect(placeProgress(s, "zoo")).toBe(1);
    resetPlace(s, "zoo");
    expect(placeProgress(s, "zoo")).toBe(0);
    expect(placeProgress(s, "store")).toBe(1);
  });

  it("unlock everything opens every place and the festival on a new game", () => {
    const s = defaults();
    debugUnlock.all = true;
    for (const p of places) expect(isOpen(p, s), p).toBe(true);
    expect(festivalOpen(s)).toBe(true);
  });
});
