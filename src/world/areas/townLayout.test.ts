/** The town layout is consistent: every door is reachable from everywhere, paths are wide, buildings have room. */
import { describe, expect, it } from "vitest";
import * as L from "./townLayout.ts";

const nav = L.townNav();
const ids = Object.keys(L.PLACES) as L.PlaceId[];

function reaches(a: L.P2, b: L.P2): boolean {
  const r = nav.route(a.x, a.z, b.x, b.z);
  const end = r[r.length - 1];
  return r.length > 0 && Math.hypot(end[0] - b.x, end[1] - b.z) < 0.15 && r.every(([x, z]) => !nav.collides(x, z, nav.agentRadius * 0.9));
}

function length(a: L.P2, b: L.P2): number {
  let d = 0;
  let p = a;
  for (const [x, z] of nav.route(a.x, a.z, b.x, b.z)) {
    d += Math.hypot(x - p.x, z - p.z);
    p = { x, z };
  }
  return d;
}

describe("town layout", () => {
  it("the spawn, every door and every stroll spot are free", () => {
    expect(nav.collides(L.SPAWN.x, L.SPAWN.z, nav.agentRadius)).toBe(false);
    for (const id of ids) expect(nav.collides(L.PLACES[id].door.x, L.PLACES[id].door.z, nav.agentRadius), id).toBe(false);
    for (const [k, spots] of Object.entries(L.STROLL)) for (const s of spots) expect(nav.collides(s.x, s.z, nav.agentRadius), `${k} ${s.x},${s.z}`).toBe(false);
  });

  it("every door is reachable from the spawn and from every other door", () => {
    const starts = [{ x: L.SPAWN.x, z: L.SPAWN.z }, ...ids.map((id) => L.PLACES[id].door)];
    for (const a of starts) for (const id of ids) expect(reaches(a, L.PLACES[id].door), `${a.x},${a.z} -> ${id}`).toBe(true);
  });

  it("stroll loops are walkable", () => {
    for (const spots of Object.values(L.STROLL)) for (const s of spots) expect(reaches(spots[0], s)).toBe(true);
  });

  it("the farthest walk between two places stays short enough for a lesson (< 34 m)", () => {
    let worst = 0;
    for (const a of ids) for (const b of ids) if (a < b) worst = Math.max(worst, length(L.PLACES[a].door, L.PLACES[b].door));
    expect(worst).toBeLessThan(34);
    expect(worst).toBeGreaterThan(18);
  });

  it("buildings are not crowded: at least 0.8 m between footprints, a clear apron before each door", () => {
    const boxes = (["store", "market", "school", "gym"] as L.PlaceId[]).map((id) => L.PLACES[id]);
    for (const [x, z, w, d] of L.HOUSES) boxes.push({ at: { x, z }, w, d, door: { x, z } });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        const gx = Math.abs(a.at.x - b.at.x) - (a.w + b.w) / 2;
        const gz = Math.abs(a.at.z - b.at.z) - (a.d + b.d) / 2;
        expect(Math.max(gx, gz), `${i}/${j}`).toBeGreaterThan(0.8);
      }
    }
    // A 1.6 m wide apron in front of each door: room to arrive and to stand.
    for (const id of ids) {
      const { x, z } = L.PLACES[id].door;
      for (const dx of [-0.8, 0, 0.8]) expect(nav.collides(x + dx, z + 0.4, 0.2), `${id} apron`).toBe(false);
    }
  });

  it("the main paths are at least 2 m wide", () => {
    const clear = (x: number, z: number, axis: "x" | "z") => [-1, 0, 1].every((k) => !nav.collides(axis === "x" ? x + k * 0.9 : x, axis === "z" ? z + k * 0.9 : z, 0.1));
    for (let z = -10.8; z < 5.5; z += 0.5) expect(clear(L.LANE.x, z, "x"), `lane z ${z}`).toBe(true);
    for (let x = -16; x < 16.4; x += 0.5) expect(clear(x, L.STREET.z, "z"), `street x ${x}`).toBe(true);
    for (let z = L.SCHOOL_GATE.minZ + 0.5; z < L.SCHOOL_GATE.maxZ - 0.4; z += 0.5) expect(nav.collides(-0.6, z, 0.3), `gate z ${z}`).toBe(false);
  });

  it("the schoolyard has room for the festival (an open 10 x 4 m area)", () => {
    for (let x = 2.4; x <= 12.4; x += 0.5) for (let z = -6.8; z <= -2.8; z += 0.5) expect(nav.collides(x, z, 0.3), `${x},${z}`).toBe(false);
  });
});
