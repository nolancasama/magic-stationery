import { Box3, Mesh, Raycaster, Vector3 } from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NavMap } from "../nav.ts";
import { ZooArea } from "./zoo.ts";
import { AMBIENT, ANCHORS, CLIMB_NODES, HABITATS, PLAZA, ROOM, SLOT_PEN, visitorOvals, visitorRects, type ZooSlotId } from "./zooLayout.ts";

let zoo: ZooArea;
beforeAll(() => {
  const noop = () => {};
  const context = new Proxy({ createRadialGradient: () => ({ addColorStop: noop }) }, {
    get: (target, key) => Reflect.get(target, key) ?? noop
  });
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => context }) });
  zoo = new ZooArea();
  zoo.scene.updateMatrixWorld(true);
});
afterAll(() => vi.unstubAllGlobals());

const slotIds = Object.keys(ANCHORS) as ZooSlotId[];
const visitors = [PLAZA.oka, ...AMBIENT.map(([x, z]) => ({ x, z })), ...Object.values(HABITATS).flatMap(({ stand, oka }) => [stand, oka])];

function componentBounds(mesh: Mesh) {
  const parent: number[] = [];
  const find = (index: number): number => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const positions = mesh.geometry.getAttribute("position");
  const points = new Map<string, number>();
  const pointAt = (index: number) => new Vector3().fromBufferAttribute(positions, index);
  for (let index = 0; index < positions.count; index++) {
    parent.push(index);
    const point = pointAt(index);
    const key = point.toArray().map((value) => Math.round(value * 1e5)).join(",");
    const previous = points.get(key);
    if (previous === undefined) points.set(key, index);
    else parent[index] = find(previous);
    if (index % 3) parent[find(index)] = find(index - 1);
  }
  const boxes = new Map<number, Box3>();
  for (let index = 0; index < positions.count; index++) {
    const root = find(index);
    const box = boxes.get(root) ?? new Box3();
    box.expandByPoint(pointAt(index).applyMatrix4(mesh.matrixWorld));
    boxes.set(root, box);
  }
  return [...boxes.values()];
}

describe("zoo scene", () => {
  it.each(slotIds)("places a ghost and a click target on every %s anchor", (id) => {
    const slot = zoo.slots[id];
    expect(slot.anchors).toHaveLength(ANCHORS[id].length);
    expect(slot.ghosts).toHaveLength(slot.anchors.length);
    expect(slot.hotspot.userData.slot).toBe(id);
    const box = new Box3().setFromObject(slot.hotspot).expandByScalar(1e-6);
    slot.anchors.forEach((anchor, index) => {
      expect(anchor.p.toArray()).toEqual(ANCHORS[id][index].p);
      expect(box.containsPoint(anchor.p)).toBe(true);
      expect(slot.ghosts[index].position.equals(anchor.p)).toBe(true);
      expect(slot.ghosts[index].scale.x).toBe(ANCHORS[id][index].s ?? 1);
    });
  });

  it("keeps stands, keeper spots, and ambient spots clear on visitor nav", () => {
    const nav = new NavMap(ROOM, visitorRects(), 0.28, visitorOvals());
    for (const { x, z } of visitors) {
      expect(zoo.nav.collides(x, z, nav.agentRadius)).toBe(nav.collides(x, z, nav.agentRadius));
      expect(zoo.nav.collides(x, z, nav.agentRadius)).toBe(false);
    }
  });

  it("keeps anchor roots and visitor spots out of solid pieces", () => {
    const points = [...slotIds.flatMap((id) => zoo.slots[id].anchors.map(({ p }) => p)), ...visitors.map(({ x, z }) => new Vector3(x, 0, z))];
    for (const solid of zoo.solids) {
      if (!(solid instanceof Mesh)) continue;
      for (const box of componentBounds(solid)) {
        box.expandByScalar(-1e-5);
        for (const point of points) expect(box.containsPoint(point), `${solid.name} at ${point.toArray()}`).toBe(false);
      }
    }
  });

  it.each(slotIds)("frames %s without trees in front of the anchors", (id) => {
    const from = zoo.views[SLOT_PEN[id]].pos;
    const trees = zoo.solids.filter((solid) => /trees|canopies|trunks|foliage/i.test(solid.name));
    for (const anchor of zoo.slots[id].anchors) {
      const direction = anchor.p.clone().add(new Vector3(0, 0.4, 0)).sub(from);
      const ray = new Raycaster(from, direction.clone().normalize(), 0, direction.length());
      const hits = ray.intersectObjects(trees, false);
      expect(hits.map((hit) => hit.object.name), `${anchor.p.toArray()}`).toEqual([]);
    }
  });

  it("keeps monkey foliage out of standing and hanging poses", () => {
    const canopy = zoo.solids.find((solid) => solid.name === "Monkey canopies") as Mesh;
    for (const node of Object.values(CLIMB_NODES)) {
      const [x, y, z] = node.p;
      const pose = new Box3(new Vector3(x - 0.3, y, z - 0.08), new Vector3(x + 0.3, y + 0.66, z + 0.08));
      expect(componentBounds(canopy).some((box) => box.intersectsBox(pose)), `${node.pose} at ${node.p}`).toBe(false);
    }
  });
});
