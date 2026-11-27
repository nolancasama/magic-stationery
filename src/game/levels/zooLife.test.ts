import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { Made } from "../../objects/made.ts";
import {
  ANCHORS, CLIMB_EDGES, CLIMB_NODES, ELEPHANT, PANDA, PENGUIN, habitatNav,
  type P2, type ZooSlotId
} from "../../world/areas/zooLayout.ts";
import { setAnimSpeed, stepTweens } from "../../world/tween.ts";
import type { Game } from "../game.ts";
import { feedMonkeys, feedPandas, startZooLife, zooIntro } from "./zooLife.ts";
import {
  choose, distance, elephantActivity, elephantGap, freeRests, landRoute, monkeyFeedingPaths, monkeyPath, pandaDestination,
  penguinPlan, segmentClear, swimWaypoint
} from "./zooLifePlans.ts";

function seeded(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const pens = { elephants: habitatNav("elephants"), pandas: habitatNav("pandas"), penguins: habitatNav("penguins") };
const anchors = (pen: keyof typeof pens) => ANCHORS[pen].map(({ p: [x, , z] }) => ({ x, z }));
function sampleLine(start: P2, end: P2) {
  const steps = Math.max(1, Math.ceil(distance(start, end) / 0.035));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const fraction = index / steps;
    return { x: start.x + (end.x - start.x) * fraction, z: start.z + (end.z - start.z) * fraction };
  });
}

function checkLand(pen: keyof typeof pens, start: P2, route: P2[]) {
  const nav = pens[pen];
  expect(route.length).toBeGreaterThan(0);
  for (const [index, end] of route.entries()) {
    const from = route[index - 1] ?? start;
    expect(nav.clearLine(from.x, from.z, end.x, end.z, nav.agentRadius)).toBe(true);
    expect(sampleLine(from, end).every(({ x, z }) => !nav.collides(x, z, nav.agentRadius))).toBe(true);
  }
}

function checkSwim(points: P2[]) {
  const { pool, swimInset } = PENGUIN;
  for (const [index, end] of points.entries()) {
    for (const { x, z } of sampleLine(points[index - 1] ?? end, end)) {
      expect(((x - pool.x) / (pool.rx - swimInset)) ** 2 + ((z - pool.z) / (pool.rz - swimInset)) ** 2).toBeLessThanOrEqual(1);
    }
  }
}

describe("zoo life planners", () => {
  it("follows climbing edges in either direction, respecting occupied nodes", () => {
    const random = seeded(23);
    const nodes = Object.keys(CLIMB_NODES);
    for (let iteration = 0; iteration < 300; iteration++) {
      const start = choose(nodes, random);
      const target = choose(nodes, random);
      const occupied = new Set(iteration % 2 ? [choose(nodes.filter((node) => node !== start), random)] : []);
      const path = monkeyPath(start, target, occupied);
      if (!path) {
        expect(occupied.size).toBeGreaterThan(0);
        continue;
      }
      let at = start;
      for (const move of path) {
        expect(move.from).toBe(at);
        expect(occupied.has(move.to)).toBe(false);
        expect(CLIMB_EDGES.some(({ a, b }) => (a === at && b === move.to) || (b === at && a === move.to))).toBe(true);
        at = move.to;
      }
      expect(at).toBe(target);
    }
  });

  it("routes all four monkeys to distinct feeding nodes without booking an occupied node", () => {
    const random = seeded(24);
    for (let iteration = 0; iteration < 150; iteration++) {
      const available = Object.keys(CLIMB_NODES);
      const starts = ANCHORS.monkeys.map(() => available.splice(Math.floor(random() * available.length), 1)[0]);
      const occupied = new Set(starts);
      for (const wave of monkeyFeedingPaths(starts)) {
        for (const { from, to, edge } of wave) {
          expect(CLIMB_EDGES).toContain(edge);
          expect(occupied.has(from)).toBe(true);
          expect(occupied.has(to)).toBe(false);
        }
        for (const { from, to } of wave) {
          occupied.delete(from);
          occupied.add(to);
        }
        expect(occupied.size).toBe(starts.length);
      }
      expect([...occupied].every((node) => CLIMB_NODES[node].eat)).toBe(true);
    }
  });

  it("reserves separated elephant destinations and yields safe routes around the other elephant", () => {
    const random = seeded(25);
    const elephants = anchors("elephants");
    const visited = new Set<string>();
    let simultaneous = 0;
    for (let iteration = 0; iteration < 300; iteration++) {
      const lead = iteration % 2;
      const follow = 1 - lead;
      const first = elephantActivity(elephants[lead], random, [], elephants[follow]);
      if (!first) continue;
      checkLand("elephants", elephants[lead], first.route);
      expect(first.route.at(-1)).toEqual(ELEPHANT.poi[first.name]);
      expect(first.route.every((point, index) => segmentClear(first.route[index - 1] ?? elephants[lead], point, elephants[follow], elephantGap))).toBe(true);
      const second = elephantActivity(elephants[follow], random, [first.target], elephants[lead]);
      if (second) {
        simultaneous++;
        expect(second.name).not.toBe(first.name);
        expect(distance(second.target, first.target)).toBeGreaterThanOrEqual(elephantGap);
        checkLand("elephants", elephants[follow], second.route);
      }
      visited.add(first.name);
      elephants[lead] = first.target;
    }
    expect(simultaneous).toBeGreaterThan(100);
    expect(visited).toEqual(new Set(Object.keys(ELEPHANT.poi)));
  });

  it("chooses reachable panda rest and bamboo places without crossing props", () => {
    const random = seeded(26);
    const pandas = anchors("pandas");
    const visited = new Set<string>();
    for (let iteration = 0; iteration < 300; iteration++) {
      const index = iteration % pandas.length;
      const eating = iteration % 3 === 0;
      const destination = pandaDestination(pandas[index], random, eating, new Set(["eatC"]));
      expect(destination).not.toBeNull();
      if (!destination) continue;
      expect(destination.name in PANDA.eats).toBe(eating);
      expect(destination.name).not.toBe("eatC");
      checkLand("pandas", pandas[index], destination.route);
      expect(destination.route.at(-1)).toEqual(PANDA.poi[destination.name]);
      visited.add(destination.name);
      pandas[index] = PANDA.poi[destination.name];
    }
    expect(visited).toEqual(new Set(["rock", "log", "shade", "lawn1", "lawn2", "lawn3", "eatA", "eatB"]));
  });

  it("keeps each penguin trip on checked ice routes, through the designated entry and exit, and inside the swim oval", () => {
    const random = seeded(27);
    const penguins = anchors("penguins");
    for (let iteration = 0; iteration < 240; iteration++) {
      const start = choose(penguins, random);
      const dive = iteration % 3 === 0;
      const plan = penguinPlan(start, random, dive);
      expect(plan).not.toBeNull();
      if (!plan) continue;
      expect(plan.approach.at(-1)).toEqual(plan.entry.land);
      expect(plan.dive).toBe(dive);
      if (dive) expect(plan.entry.water).toBe(PENGUIN.diveInto);
      else expect(PENGUIN.ramps).toContain(plan.entry);
      expect(PENGUIN.ramps).toContain(plan.exit);
      expect(PENGUIN.rests).toContain(plan.retreat.at(-1));
      checkLand("penguins", start, plan.approach);
      checkLand("penguins", plan.exit.land, plan.retreat);
      checkSwim([plan.entry.water, ...plan.swim, plan.exit.water]);
      checkSwim([swimWaypoint(random), swimWaypoint(random)]);
      const rest = choose(PENGUIN.rests, random);
      const route = landRoute("penguins", start, rest);
      expect(route).not.toBeNull();
      if (route) checkLand("penguins", start, route);
    }
  });

  it("never sends a penguin to a resting place another penguin holds", () => {
    const random = seeded(28);
    for (let iteration = 0; iteration < 120; iteration++) {
      // Four of the five penguins hold resting places; the fifth plans a trip.
      const taken = PENGUIN.rests.slice().sort(() => random() - 0.5).slice(0, 4);
      const plan = penguinPlan(choose(anchors("penguins"), random), random, iteration % 3 === 0, false, taken);
      expect(plan).not.toBeNull();
      if (plan) for (const spot of taken) expect(distance(plan.retreat.at(-1)!, spot)).toBeGreaterThan(0.4);
      for (const rest of freeRests(taken)) for (const spot of taken) expect(distance(rest, spot)).toBeGreaterThan(0.4);
    }
  });
});

function sceneWithDrawings() {
  const scene = new THREE.Scene();
  const draw = (id: ZooSlotId) => ANCHORS[id].map(({ p }): Made => {
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.position.set(...p);
    root.add(inner);
    scene.add(root);
    return { root, inner, height: 0.55, kind: id, parts: {}, tint: null };
  });
  const slots = Object.fromEntries((Object.keys(ANCHORS) as ZooSlotId[]).map((id) => [id, { items: draw(id) }])) as Record<ZooSlotId, { items: Made[] }>;
  const context = {
    area: "zoo", zoo: { scene, slots },
    engine: { camPos: new THREE.Vector3(10, 5, 10), camLook: new THREE.Vector3(0, 0, -2) },
    effects: { emit: vi.fn(), burst: vi.fn() }
  };
  return { context, slots, game: context as unknown as Game };
}

async function frame() {
  stepTweens(1 / 60);
  for (let flush = 0; flush < 12; flush++) await Promise.resolve();
}

async function runBeat(beat: Promise<void>, observe = () => {}) {
  let done = false;
  void beat.then(() => { done = true; });
  for (let frames = 0; frames < 100 && !done; frames++) {
    await frame();
    observe();
  }
  expect(done).toBe(true);
}

describe("zoo life beats", () => {
  it("sprays at the south shore, feeds all monkeys and both pandas, and dives before the beat cap", async () => {
    const { context, slots, game } = sceneWithDrawings();
    const later = ["monkeys", "bananas", "pandas", "bamboo", "penguins"] as const;
    for (const id of later) for (const { root } of slots[id].items) root.removeFromParent();
    const restore = (id: ZooSlotId) => context.zoo.scene.add(...slots[id].items.map(({ root }) => root));
    setAnimSpeed(5);
    try {
      await runBeat(zooIntro(game, "elephants"), () => {
        expect(distance(slots.elephants.items[0].root.position, slots.elephants.items[1].root.position)).toBeGreaterThanOrEqual(elephantGap);
      });
      expect(distance(slots.elephants.items[1].root.position, ELEPHANT.poi.shoreS)).toBeLessThan(0.0001);
      expect(context.effects.emit).toHaveBeenCalledTimes(28);
      restore("monkeys");
      await runBeat(zooIntro(game, "monkeys"));
      restore("bananas");
      const fed = new Set<Made>();
      await runBeat(feedMonkeys(game), () => {
        for (const banana of slots.bananas.items) if (banana.root.scale.x < 0.9) fed.add(banana);
      });
      expect(fed.size).toBe(ANCHORS.monkeys.length);
      restore("pandas");
      await runBeat(zooIntro(game, "pandas"));
      restore("bamboo");
      await runBeat(feedPandas(game));
      expect(slots.pandas.items.every(({ root }) => Object.keys(PANDA.eats).some((name) => distance(root.position, PANDA.poi[name]) < 0.0001))).toBe(true);
      let sawDive = false;
      let sawSwim = false;
      restore("penguins");
      await runBeat(zooIntro(game, "penguins"), () => {
        sawDive ||= slots.penguins.items.some(({ root }) => distance(root.position, PENGUIN.diveRock) < 0.0001 && root.position.y === PENGUIN.diveRock.h);
        sawSwim ||= slots.penguins.items.some(({ root }) => root.position.y <= PENGUIN.swimY + 0.05);
      });
      expect(sawDive && sawSwim).toBe(true);
    } finally {
      context.area = "town";
      await frame();
      setAnimSpeed(1);
    }
  });

  it("billboards joined slots, stops on leave, and restarts without duplicating motion", async () => {
    const { context, game, slots } = sceneWithDrawings();
    const elephant = slots.elephants.items[0];
    const banana = slots.bananas.items[0];
    startZooLife(game);
    startZooLife(game);
    await frame();
    const firstYaw = banana.root.rotation.y;
    context.engine.camPos.x = -10;
    await frame();
    expect(banana.root.rotation.y).not.toBe(firstYaw);
    expect(elephant.root.rotation.y).toBe(Math.atan2(context.engine.camPos.x - elephant.root.position.x, context.engine.camPos.z - elephant.root.position.z));
    context.area = "town";
    await frame();
    context.engine.camPos.x = 10;
    const leftYaw = banana.root.rotation.y;
    await frame();
    expect(banana.root.rotation.y).toBe(leftYaw);
    context.area = "zoo";
    try {
      startZooLife(game);
      await frame();
      expect(banana.root.rotation.y).toBe(firstYaw);
    } finally {
      context.area = "town";
      await frame();
    }
  });
});
