import { Box3, PerspectiveCamera, Raycaster, Vector3 } from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CAST } from "../../game/cast.ts";
import { Game } from "../../game/game.ts";
import { Character } from "../characters.ts";
import { NavMap } from "../nav.ts";
import { stepTweens } from "../tween.ts";
import { ClassroomArea } from "./classroom.ts";
import { GymArea } from "./gym.ts";
import { MarketArea } from "./market.ts";
import { doorInsideX } from "./room.ts";
import { StoreArea } from "./store.ts";
import { ZooArea } from "./zoo.ts";

beforeAll(() => {
  // Room geometry can be built in Node. Only the decorative canvas textures need a stub.
  const noop = () => {};
  const context = new Proxy({ createRadialGradient: () => ({ addColorStop: noop }) }, {
    get: (target, key) => Reflect.get(target, key) ?? noop
  });
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => context }) });
});

afterAll(() => vi.unstubAllGlobals());

describe("room entrances", () => {
  it.each([
    ["store", StoreArea], ["classroom", ClassroomArea], ["zoo", ZooArea],
    ["market", MarketArea], ["gym", GymArea]
  ] as const)("%s has a clear walk through the open door", (_name, Area) => {
    const room = new Area();
    const { bounds, door, nav } = room;
    const radius = nav.agentRadius;
    const insideX = doorInsideX(door);
    expect(door.outsideX - radius).toBeGreaterThan(bounds.maxX);
    expect(nav.collides(insideX, door.z, radius)).toBe(false);

    // Only the right edge of the nav map is waived during the crossing.
    const thresholdNav = new NavMap({ ...bounds, maxX: door.outsideX + radius }, nav.obstacles, radius);
    expect(thresholdNav.clearLine(door.outsideX, door.z, insideX, door.z, radius)).toBe(true);

    // The walk also crosses the wall's rendered opening and open door leaf.
    room.setDoor(1);
    room.scene.updateMatrixWorld(true);
    for (const y of [0.12, 0.9, 1.8]) {
      for (const z of [door.z - radius, door.z, door.z + radius]) {
        const ray = new Raycaster(new Vector3(door.outsideX, y, z), new Vector3(-1, 0, 0), 0, door.outsideX - insideX);
        expect(ray.intersectObjects(room.scene.children, true)).toHaveLength(0);
      }
    }
  });

  it("frames the gym visitor outside and across the open doorway", () => {
    const gym = new GymArea();
    gym.setDoor(1);
    gym.scene.updateMatrixWorld(true);
    const view = gym.views.door;
    const camera = new PerspectiveCamera(38, 1366 / 768, 0.1, 200);
    camera.position.copy(view.pos);
    camera.lookAt(view.look);
    camera.updateMatrixWorld();
    for (const x of [gym.door.outsideX, 4.6, doorInsideX(gym.door)]) {
      for (const y of [0.06, 0.9, 1.06]) {
        const point = new Vector3(x, y, gym.door.z);
        const line = point.clone().sub(view.pos);
        const ray = new Raycaster(view.pos, line.clone().normalize(), 0, line.length());
        expect(ray.intersectObjects(gym.scene.children, true)).toHaveLength(0);
        point.project(camera);
        expect(Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z))).toBeLessThan(1);
      }
    }
  });

  it("cancels Taro's unfinished market route before walking him into the gym", async () => {
    const market = new MarketArea();
    const gym = new GymArea();
    const taro = new Character(CAST.taro.look);
    const game = Object.assign(Object.create(Game.prototype), {
      room: market, cast: { taro }, ambient: new Set(["taro"])
    }) as Game;
    game.inRoom(taro);
    taro.place(2.1, 1.45);
    expect(market.nav.route(2.1, 1.45, -0.8, -0.65).length).toBeGreaterThan(1);
    const oldWalk = taro.go(-0.8, -0.65);
    taro.root.removeFromParent();
    game.room = gym;

    const entrance = game.npcEnter("taro", -1.6, 0.4, { frame: false, keepDoor: true });
    expect(taro.position.toArray()).toEqual([gym.door.outsideX, 0, gym.door.z]);
    expect(taro.heading).toBe(-Math.PI / 2);
    for (let frame = 0; frame < 360; frame++) {
      stepTweens(1 / 60);
      taro.update(1 / 60);
      await Promise.resolve();
    }
    await entrance;
    expect(await oldWalk).toBe(false);
    expect(taro.root.parent).toBe(gym.scene);
    expect(taro.position.x).toBeCloseTo(-1.6, 1);
    expect(taro.position.z).toBeCloseTo(0.4, 1);
    expect(taro.collide?.(taro.position.x, taro.position.z, taro.radius)).toBe(false);
    expect(taro.router).not.toBeNull();
  });

  it("fits all five soccer ball models inside the cart", () => {
    const gym = new GymArea();
    for (const ball of gym.slots.soccerBalls.ghosts) {
      const box = new Box3().setFromObject(ball, true);
      expect(box.min.x).toBeGreaterThan(-3.385);
      expect(box.max.x).toBeLessThan(-2.415);
      expect(box.min.z).toBeGreaterThan(2.01);
      expect(box.max.z).toBeLessThan(2.59);
      expect(box.min.y).toBeGreaterThanOrEqual(0.32);
      expect(box.max.y).toBeLessThan(0.84);
    }
  });
});
