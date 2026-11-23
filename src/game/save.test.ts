import { describe, expect, it } from "vitest";
import { defaults, KEY, load, sanitize, store, storeProgress } from "./save.ts";
import { NavMap } from "../world/nav.ts";

class Mem {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe("save", () => {
  it("round-trips", () => {
    const m = new Mem();
    const d = defaults();
    d.started = true;
    d.store.steps = ["pen", "pencils"];
    d.store.slots.pencilCup = { tints: ["#ff0000", null, null], drawing: [[[0, 0], [10, 10]]] };
    d.settings.mic = false;
    store(m, d);
    expect(load(m)).toEqual(d);
  });

  it("survives garbage and foreign data", () => {
    const m = new Mem();
    m.setItem(KEY, "{not json");
    expect(load(m)).toEqual(defaults());
    expect(sanitize({ v: 2 })).toEqual(defaults());
    expect(sanitize(null)).toEqual(defaults());
  });

  it("drops invalid fields but keeps valid ones", () => {
    const s = sanitize({
      v: 1,
      started: "yes",
      store: { steps: ["pen", "hack", "ken"], slots: { erasers: { tints: ["#00ff00", "red", 5] }, bogus: { tints: [] }, books: { tints: "x" } } },
      settings: { mic: false, help: "max", japanese: 0 }
    });
    expect(s.started).toBe(false);
    expect(s.store.steps).toEqual(["pen", "ken"]);
    expect(s.store.slots).toEqual({ erasers: { tints: ["#00ff00", null, null] } });
    expect(s.settings.mic).toBe(false);
    expect(s.settings.help).toBe("normal");
    expect(s.settings.japanese).toBe(true);
  });

  it("progress counts restored displays", () => {
    const d = defaults();
    expect(storeProgress(d)).toBe(0);
    d.store.slots.books = { tints: [null] };
    d.store.slots.rulers = { tints: [null] };
    expect(storeProgress(d)).toBe(0.25);
  });
});

describe("nav", () => {
  const nav = new NavMap({ minX: -5, maxX: 5, minZ: -3, maxZ: 3 }, [{ minX: -1, maxX: 1, minZ: -3, maxZ: 1.5 }], 0.3);
  it("goes straight when the line is clear", () => {
    expect(nav.route(-4, 2.5, 4, 2.5)).toEqual([[4, 2.5]]);
  });
  it("routes around furniture", () => {
    const path = nav.route(-3, -2, 3, -2);
    expect(path.length).toBeGreaterThan(1);
    let [x, z] = [-3, -2];
    for (const [px, pz] of path) {
      expect(nav.clearLine(x, z, px, pz, 0.25)).toBe(true);
      [x, z] = [px, pz];
    }
    expect(path[path.length - 1]).toEqual([3, -2]);
  });
  it("moves a target inside furniture to the nearest free spot", () => {
    const [x, z] = nav.nearestFree(0, 0);
    expect(nav.collides(x, z, 0.3)).toBe(false);
  });
});
