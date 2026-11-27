import {
  CLIMB_EDGES, CLIMB_NODES, ELEPHANT, PANDA, PENGUIN, habitatNav,
  type ClimbEdge, type P2
} from "../../world/areas/zooLayout.ts";
import { NavMap } from "../../world/nav.ts";

type Random = () => number;
export const elephantGap = 2.1;
export const distance = (from: P2, to: P2) => Math.hypot(to.x - from.x, to.z - from.z);
export const choose = <T>(items: readonly T[], random: Random): T => items[Math.floor(random() * items.length)];

const land = { elephants: habitatNav("elephants"), pandas: habitatNav("pandas"), penguins: habitatNav("penguins") };
type LandPen = keyof typeof land;

export function segmentClear(from: P2, to: P2, point: P2, gap: number): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared)) : 0;
  return Math.hypot(from.x + dx * ratio - point.x, from.z + dz * ratio - point.z) >= gap;
}

export function landRoute(pen: LandPen, from: P2, to: P2, avoid?: P2): P2[] | null {
  const nav = land[pen];
  const clear = (start: P2, end: P2) => nav.clearLine(start.x, start.z, end.x, end.z, nav.agentRadius)
    && (!avoid || segmentClear(start, end, avoid, elephantGap));
  if (clear(from, to)) return [to];
  if (!clear(from, from) || !clear(to, to)) return null;
  const validate = (router: NavMap) => {
    const route = router.route(from.x, from.z, to.x, to.z).map(([x, z]) => ({ x, z }));
    const last = route.at(-1);
    if (last && distance(last, to) < 0.0001) route[route.length - 1] = to;
    else route.push(to);
    return route.every((point, index) => clear(route[index - 1] ?? from, point)) ? route : null;
  };
  if (!avoid) {
    const route = validate(nav);
    if (route) return route;
  }
  const radius = nav.agentRadius / 0.9;
  const ovals = avoid ? [...nav.ovals, { ...avoid, rx: elephantGap - radius, rz: elephantGap - radius }] : nav.ovals;
  return validate(new NavMap(nav.bounds, nav.obstacles, radius, ovals));
}

export interface MonkeyMove { from: string; to: string; edge: ClimbEdge }

export function monkeyTravelTime(move: MonkeyMove) {
  const [fromX, , fromZ] = CLIMB_NODES[move.from].p;
  const [toX, , toZ] = CLIMB_NODES[move.to].p;
  return { walk: Math.max(0.35, Math.hypot(toX - fromX, toZ - fromZ) / 1.65), climb: 1.5, branch: 0.95, swing: 1.35, brachiate: 1.7, jump: 0.8 }[move.edge.move];
}

const neighbors: Record<string, MonkeyMove[]> = Object.fromEntries(Object.keys(CLIMB_NODES).map((node) => [node, []]));
for (const edge of CLIMB_EDGES) {
  neighbors[edge.a].push({ from: edge.a, to: edge.b, edge });
  neighbors[edge.b].push({ from: edge.b, to: edge.a, edge });
}

export function monkeyPath(from: string, to: string, occupied: ReadonlySet<string> = new Set()): MonkeyMove[] | null {
  if (!neighbors[from] || !neighbors[to]) return null;
  const reached = new Set([from]);
  const queue = [{ at: from, path: [] as MonkeyMove[] }];
  for (const { at, path } of queue) {
    if (at === to) return path;
    for (const move of neighbors[at]) {
      if (reached.has(move.to) || occupied.has(move.to)) continue;
      reached.add(move.to);
      queue.push({ at: move.to, path: [...path, move] });
    }
  }
  return null;
}

export const eatNodes = Object.keys(CLIMB_NODES).filter((node) => CLIMB_NODES[node].eat);

export function monkeyFeedingPaths(starts: string[]): MonkeyMove[][] {
  const keys = new Set([starts.slice().sort().join()]);
  const queue = [{ nodes: starts, moves: [] as MonkeyMove[] }];
  for (const { nodes, moves } of queue) {
    if (nodes.every((node) => CLIMB_NODES[node].eat)) {
      const waves: MonkeyMove[][] = [];
      const available = new Map<string, number>();
      for (const move of moves) {
        const wave = Math.max(available.get(move.from) ?? 0, available.get(move.to) ?? 0);
        (waves[wave] ??= []).push(move);
        available.set(move.from, wave + 1);
        available.set(move.to, wave + 1);
      }
      return waves;
    }
    for (const [index, node] of nodes.entries()) {
      for (const move of neighbors[node]) {
        if (nodes.includes(move.to)) continue;
        const next = nodes.slice();
        next[index] = move.to;
        const key = next.slice().sort().join();
        if (keys.has(key)) continue;
        keys.add(key);
        queue.push({ nodes: next, moves: [...moves, move] });
      }
    }
  }
  return [];
}

const elephantWeights: Record<string, number> = { mud: 3, shadeW: 2, shadeE: 2, hay: 3, front: 3 };

export function elephantActivity(from: P2, random: Random, reserved: readonly P2[], other?: P2, only?: string) {
  const options = Object.keys(ELEPHANT.poi).filter((name) => (!only || name === only)
    && (only || distance(from, ELEPHANT.poi[name]) > 0.2)
    && [...reserved, ...(other ? [other] : [])].every((point) => distance(point, ELEPHANT.poi[name]) >= elephantGap));
  while (options.length) {
    const weight = (name: string) => elephantWeights[name] ?? (ELEPHANT.shores.includes(name) ? 3 : 1);
    let ticket = random() * options.reduce((total, name) => total + weight(name), 0);
    const pick = options.findIndex((name) => (ticket -= weight(name)) < 0);
    const [name] = options.splice(pick, 1);
    const target = ELEPHANT.poi[name];
    const route = landRoute("elephants", from, target, other);
    if (route) return { name, target, route };
  }
  return null;
}

export function pandaDestination(from: P2, random: Random, eating: boolean, reserved: ReadonlySet<string> = new Set(), nearest = false) {
  const names = (eating ? Object.keys(PANDA.eats) : ["rock", "log", "shade", "rock", "log", "shade", "lawn1", "lawn2", "lawn3"])
    .filter((name) => !reserved.has(name));
  if (nearest) names.sort((left, right) => distance(from, PANDA.poi[left]) - distance(from, PANDA.poi[right]));
  while (names.length) {
    const name = nearest ? names[0] : choose(names, random);
    const route = landRoute("pandas", from, PANDA.poi[name]);
    if (route) return { name, route };
    for (let index = names.length - 1; index >= 0; index--) if (names[index] === name) names.splice(index, 1);
  }
  return null;
}

export function swimWaypoint(random: Random): P2 {
  const { pool, swimInset } = PENGUIN;
  const angle = random() * 2 * Math.PI;
  const radius = Math.sqrt(random());
  return { x: pool.x + Math.cos(angle) * radius * (pool.rx - swimInset), z: pool.z + Math.sin(angle) * radius * (pool.rz - swimInset) };
}

/** Resting places nobody else has claimed (penguins must not stand on top of each other). */
export function freeRests(taken: P2[]): P2[] {
  const free = PENGUIN.rests.filter((rest) => taken.every((spot) => distance(spot, rest) > 0.4));
  return free.length ? free : PENGUIN.rests.slice();
}

export function penguinPlan(from: P2, random: Random, dive: boolean, nearest = false, taken: P2[] = []) {
  const { ramps, diveRock, diveInto } = PENGUIN;
  const rests = freeRests(taken);
  const takeoff = rests.reduce((best, spot) => distance(spot, diveRock) < distance(best, diveRock) ? spot : best);
  const entries = (dive ? [{ land: takeoff, water: diveInto }] : ramps.slice());
  if (nearest) entries.sort((left, right) => distance(from, left.land) - distance(from, right.land));
  while (entries.length) {
    const [entry] = entries.splice(nearest ? 0 : Math.floor(random() * entries.length), 1);
    const approach = landRoute("penguins", from, entry.land);
    if (!approach) continue;
    const exits = ramps.slice();
    while (exits.length) {
      const [exit] = exits.splice(Math.floor(random() * exits.length), 1);
      const destinations = rests.slice();
      while (destinations.length) {
        const [rest] = destinations.splice(Math.floor(random() * destinations.length), 1);
        const retreat = landRoute("penguins", exit.land, rest);
        if (retreat) return { approach, entry, dive, swim: [swimWaypoint(random), swimWaypoint(random)], exit, retreat };
      }
    }
  }
  return null;
}
