import { expect, it } from "vitest";
import { doorInsideX } from "./areas/room.ts";
import { DOOR, ROOM, WEST_PATH, visitorOvals, visitorRects } from "./areas/zooLayout.ts";
import { NavMap } from "./nav.ts";

it("routes from the zoo gate to the north-west overlook in under 5 ms", () => {
  const nav = new NavMap(ROOM, visitorRects(), 0.28, visitorOvals());
  const start: [number, number] = [doorInsideX(DOOR), DOOR.z];
  const end: [number, number] = [(WEST_PATH.minX + WEST_PATH.maxX) / 2, WEST_PATH.minZ + 0.5];
  const route = () => nav.route(...start, ...end);
  const waypoints = route();
  expect(waypoints.length).toBeGreaterThan(1);
  expect(waypoints.at(-1)).toEqual(end);
  const points = [start, ...waypoints];
  for (let index = 1; index < points.length; index++) {
    expect(nav.clearLine(...points[index - 1], ...points[index], nav.agentRadius)).toBe(true);
  }
  for (let run = 0; run < 5; run++) route();
  const runs = 16;
  const before = performance.now();
  for (let run = 0; run < runs; run++) route();
  expect((performance.now() - before) / runs).toBeLessThan(5);
});
