/** The zoo layout is consistent: animals can reach their places, visitors every spot, nothing overlaps. */
import { describe, expect, it } from "vitest";
import { NavMap } from "../nav.ts";
import * as L from "./zooLayout.ts";

/** Routes end within a grid cell of the target, through free space. */
function reaches(nav: NavMap, a: L.P2, b: L.P2): boolean {
  const r = nav.route(a.x, a.z, b.x, b.z);
  const end = r[r.length - 1];
  return r.length > 0 && Math.hypot(end[0] - b.x, end[1] - b.z) < 0.15 && r.every(([x, z]) => !nav.collides(x, z, nav.agentRadius * 0.9));
}

const inside = (r: { minX: number; maxX: number; minZ: number; maxZ: number }, x: number, z: number) => x > r.minX && x < r.maxX && z > r.minZ && z < r.maxZ;

describe("zoo layout: animals", () => {
  const places: Record<"elephants" | "pandas" | "penguins", [string, L.P2][]> = {
    elephants: Object.entries(L.ELEPHANT.poi),
    pandas: Object.entries(L.PANDA.poi),
    penguins: [...L.PENGUIN.rests.map((p, i): [string, L.P2] => ["rest" + i, p]), ...L.PENGUIN.ramps.map((r, i): [string, L.P2] => ["ramp" + i, r.land])]
  };
  it.each(["elephants", "pandas", "penguins"] as const)("%s: every place and anchor is free and reachable", (id) => {
    const nav = L.habitatNav(id);
    const pts = [...places[id], ...L.ANCHORS[id].map((a, i): [string, L.P2] => ["anchor" + i, { x: a.p[0], z: a.p[2] }])];
    for (const [k, p] of pts) {
      expect(nav.collides(p.x, p.z, nav.agentRadius), k).toBe(false);
      expect(reaches(nav, pts[0][1], p), k).toBe(true);
    }
  });

  it("elephants start far enough apart not to overlap", () => {
    const [a, b] = L.ANCHORS.elephants;
    expect(Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2])).toBeGreaterThan(2 * L.HABITATS.elephants.radius + 0.4);
  });

  it("penguins enter, swim and dive only inside the pool", () => {
    const P = L.PENGUIN.pool;
    const k = L.PENGUIN.swimInset;
    const swim = (p: L.P2) => ((p.x - P.x) / (P.rx - k)) ** 2 + ((p.z - P.z) / (P.rz - k)) ** 2 < 1;
    for (const r of L.PENGUIN.ramps) expect(swim(r.water)).toBe(true);
    expect(swim(L.PENGUIN.diveInto)).toBe(true);
  });

  it("the monkeys' climbing graph is connected, on the island, and its walks miss trunks and the table", () => {
    const I = L.MONKEY.island;
    const T = L.MONKEY.table;
    const ground = new NavMap(L.HABITATS.monkeys.roam, [{ minX: T.x - T.w / 2, maxX: T.x + T.w / 2, minZ: T.z - T.d / 2, maxZ: T.z + T.d / 2 }], 0.13, L.MONKEY.trees.map((t) => ({ x: t.x, z: t.z, rx: t.trunk, rz: t.trunk })));
    for (const [k, n] of Object.entries(L.CLIMB_NODES)) {
      if (n.p[1] < 0.2) expect(((n.p[0] - I.x) / (I.rx - 0.2)) ** 2 + ((n.p[2] - I.z) / (I.rz - 0.2)) ** 2, k).toBeLessThan(1);
    }
    const adj: Record<string, string[]> = {};
    for (const e of L.CLIMB_EDGES) {
      expect(L.CLIMB_NODES[e.a] && L.CLIMB_NODES[e.b], `${e.a}-${e.b}`).toBeTruthy();
      (adj[e.a] ??= []).push(e.b);
      (adj[e.b] ??= []).push(e.a);
      if (e.move === "walk") {
        const a = L.CLIMB_NODES[e.a].p;
        const b = L.CLIMB_NODES[e.b].p;
        expect(ground.clearLine(a[0], a[2], b[0], b[2], 0.13), `${e.a}-${e.b}`).toBe(true);
      }
      if (e.move === "swing" || e.move === "brachiate") expect(L.MONKEY.ropes[e.rope ?? -1], `${e.a}-${e.b}`).toBeTruthy();
    }
    const seen = new Set(["g3"]);
    const queue = ["g3"];
    while (queue.length) for (const n of adj[queue.shift()!] ?? []) if (!seen.has(n)) (seen.add(n), queue.push(n));
    expect([...seen].sort()).toEqual(Object.keys(L.CLIMB_NODES).sort());
    for (const a of L.ANCHORS.monkeys) expect(L.CLIMB_NODES[a.node ?? ""]?.p).toEqual(a.p);
  });

  it("every anchor is inside its habitat's fence", () => {
    for (const [slot, anchors] of Object.entries(L.ANCHORS) as [L.ZooSlotId, L.ZooAnchor[]][]) {
      const rect = L.HABITATS[L.SLOT_PEN[slot]].rect;
      for (const a of anchors) expect(inside(rect, a.p[0], a.p[2]), slot).toBe(true);
    }
  });
});

describe("zoo layout: visitors", () => {
  const nav = new NavMap(L.ROOM, L.visitorRects(), 0.28, L.visitorOvals());
  const gate = { x: L.DOOR.x - 0.7, z: L.DOOR.z };
  const spots: [string, L.P2][] = [["plaza.oka", L.PLAZA.oka], ["plaza.player", L.PLAZA.player], ["favorite.taro", L.FAVORITE.taro]];
  for (const h of Object.values(L.HABITATS)) {
    spots.push([h.id + ".stand", h.stand], [h.id + ".oka", h.oka]);
    if (h.visitor) spots.push([h.id + ".visitor", h.visitor]);
    if (h.arrive) spots.push([h.id + ".arrive", h.arrive]);
  }
  L.AMBIENT.forEach(([x, z], i) => spots.push(["ambient" + i, { x, z }]));

  it("every spot people use is free and reachable from the gate", () => {
    for (const [k, p] of spots) {
      expect(nav.collides(p.x, p.z, nav.agentRadius), k).toBe(false);
      expect(reaches(nav, gate, p), k).toBe(true);
    }
  });

  it("wandering spots are spread out so visitors do not bunch", () => {
    for (let i = 0; i < L.AMBIENT.length; i++)
      for (let j = i + 1; j < L.AMBIENT.length; j++) expect(Math.hypot(L.AMBIENT[i][0] - L.AMBIENT[j][0], L.AMBIENT[i][1] - L.AMBIENT[j][1])).toBeGreaterThan(1.5);
  });

  it("the zoo is about 24 x 18 m and the elephants have the biggest habitat", () => {
    expect(L.GROUND.maxX - L.GROUND.minX).toBeCloseTo(24);
    expect(L.GROUND.maxZ - L.GROUND.minZ).toBeGreaterThanOrEqual(18);
    const area = (r: { minX: number; maxX: number; minZ: number; maxZ: number }) => (r.maxX - r.minX) * (r.maxZ - r.minZ);
    const e = area(L.HABITATS.elephants.rect);
    for (const id of ["monkeys", "pandas", "penguins"] as const) expect(e).toBeGreaterThan(1.5 * area(L.HABITATS[id].rect));
  });
});
