import * as THREE from "three";
import { audio } from "../../audio/audio.ts";
import type { Living } from "../../objects/living.ts";
import type { Made } from "../../objects/made.ts";
import {
  ANCHORS, CLIMB_NODES, ELEPHANT, HABITATS, MONKEY, PANDA, PENGUIN, ropePoint,
  type P2, type PenId, type ZooSlotId
} from "../../world/areas/zooLayout.ts";
import { animate, arc, ease, lerp } from "../../world/tween.ts";
import type { Game } from "../game.ts";
import {
  choose, distance, eatNodes, elephantActivity, elephantGap, freeRests, landRoute, monkeyFeedingPaths, monkeyPath,
  monkeyTravelTime, pandaDestination, penguinPlan, segmentClear, type MonkeyMove
} from "./zooLifePlans.ts";

const species: PenId[] = ["elephants", "monkeys", "pandas", "penguins"];
const sounds = { elephants: "elephant", monkeys: "monkey", pandas: "panda", penguins: "penguin" } as const;
const positionEpsilon = 0.00001;
const random = Math.random;
const range = (min: number, max: number) => lerp(min, max, random());
const vector = (point: P2, height: number) => new THREE.Vector3(point.x, height, point.z);
type Tween = ReturnType<typeof animate>;

interface Animal {
  item: Made;
  pen: PenId;
  index: number;
  homeWidth: number;
  facing: number;
  direction?: P2;
  node?: string;
  nextNode?: string;
  reservation?: P2;
  greeting?: Promise<boolean>;
  clump?: string;
  stopped: boolean;
  job?: Tween;
  interrupt?: Tween;
  activity: Promise<unknown>;
}

interface Life {
  g: Game;
  animals: Map<Made, Animal>;
  paused: Set<PenId>;
  bananas: Set<Made>;
  ticker: Tween;
  closed: boolean;
}

const sessions = new WeakMap<Game, Life>();
const soundTimes = new WeakMap<Game, number>();
const present = (life: Life, item: Made) => !life.closed && life.g.area === "zoo" && item.root.parent === life.g.zoo.scene;
const active = (life: Life, animal: Animal) => !animal.stopped && present(life, animal.item);
const peers = (life: Life, pen: PenId) => [...life.animals.values()].filter((animal) => animal.pen === pen && active(life, animal));
const fx = (item: Made) => (item as Partial<Living>).fx;

function sound(life: Life, animal: Animal) {
  const now = performance.now();
  if (active(life, animal) && now - (soundTimes.get(life.g) ?? -Infinity) >= 4000
    && animal.item.root.position.distanceToSquared(life.g.engine.camLook) <= 81) {
    soundTimes.set(life.g, now);
    audio.animal(sounds[animal.pen]);
  }
}

function resetPose(animal: Animal) {
  const { item } = animal;
  item.inner.position.y = 0;
  item.inner.rotation.z = 0;
  item.inner.scale.y = 1;
  item.root.visible = true;
  const uniforms = fx(item);
  if (uniforms) {
    uniforms.uSway.value = 0.12;
    uniforms.uWave.value = 0;
  }
}

function stop(animal: Animal) {
  animal.stopped = true;
  animal.job?.cancel();
  resetPose(animal);
}

function tick(life: Life, dt: number) {
  const { g } = life;
  if (g.area !== "zoo") {
    life.closed = true;
    life.ticker.cancel();
    for (const animal of life.animals.values()) {
      stop(animal);
      const anchor = ANCHORS[animal.pen][animal.index];
      if (anchor && animal.item.root.parent === g.zoo.scene) animal.item.root.position.set(...anchor.p);
    }
    sessions.delete(g);
    return;
  }
  const billboard = (item: Made) => {
    item.root.rotation.y = Math.atan2(g.engine.camPos.x - item.root.position.x, g.engine.camPos.z - item.root.position.z);
  };
  for (const [item, animal] of life.animals) {
    if (!present(life, item) || g.zoo.slots[animal.pen].items[animal.index] !== item) {
      stop(animal);
      life.animals.delete(item);
      continue;
    }
    billboard(item);
    if (animal.direction) {
      const yaw = item.root.rotation.y;
      const across = animal.direction.x * Math.cos(yaw) - animal.direction.z * Math.sin(yaw);
      if (Math.abs(across) > 0.04) animal.facing = Math.sign(across);
      item.inner.scale.x = lerp(item.inner.scale.x, animal.homeWidth * animal.facing, 1 - Math.exp(-11 * dt));
    }
  }
  for (const id of ["bananas", "bamboo"] as const) {
    for (const item of g.zoo.slots[id].items) if (item && present(life, item)) billboard(item);
  }
}

export function startZooLife(g: Game): void {
  if (g.area !== "zoo") return;
  let life = sessions.get(g);
  if (!life) {
    const fresh: Life = {
      g, animals: new Map(), paused: new Set(), bananas: new Set(), closed: false,
      ticker: animate(Infinity, (_progress, dt) => tick(fresh, dt))
    };
    sessions.set(g, fresh);
    life = fresh;
  }
  for (const pen of species) {
    for (const [index, item] of g.zoo.slots[pen].items.entries()) {
      if (!item || !present(life, item) || life.animals.has(item)) continue;
      const animal: Animal = {
        item, pen, index, homeWidth: Math.abs(item.inner.scale.x), facing: Math.sign(item.inner.scale.x) || 1,
        node: pen === "monkeys" ? ANCHORS.monkeys[index]?.node : undefined, stopped: false, activity: Promise.resolve(),
        // A penguin starts out holding the resting place it stands on.
        reservation: pen === "penguins" ? { x: item.root.position.x, z: item.root.position.z } : undefined
      };
      life.animals.set(item, animal);
      void loop(life, animal);
    }
  }
  tick(life, 0);
}

async function motion(life: Life, animal: Animal, seconds: number, frame: (progress: number) => void = () => {}, interruptible = false) {
  if (!active(life, animal)) return false;
  let complete = false;
  const job = animate(seconds, (progress) => {
    if (!active(life, animal)) job.cancel();
    else {
      frame(progress);
      complete = progress === 1;
    }
  });
  animal.job = job;
  if (interruptible) animal.interrupt = job;
  await job;
  if (animal.job === job) animal.job = undefined;
  if (animal.interrupt === job) animal.interrupt = undefined;
  return complete && active(life, animal);
}

async function loop(life: Life, animal: Animal) {
  await motion(life, animal, range(0.35, 2.8), undefined, true);
  while (active(life, animal)) {
    if (animal.greeting) {
      await animal.greeting;
      continue;
    }
    if (life.paused.has(animal.pen)) {
      await animate(0.16, () => {});
      continue;
    }
    const run = { elephants: elephantLife, monkeys: monkeyLife, pandas: pandaLife, penguins: penguinLife }[animal.pen];
    animal.activity = run(life, animal);
    await animal.activity;
    if (active(life, animal) && !life.paused.has(animal.pen)) await motion(life, animal, range(0.25, 1.2), undefined, true);
  }
}

function faceToward(animal: Animal, point: P2) {
  const root = animal.item.root.position;
  const length = distance(root, point);
  if (length > positionEpsilon) animal.direction = { x: (point.x - root.x) / length, z: (point.z - root.z) / length };
}

async function walk(life: Life, animal: Animal, route: P2[], speed: number, interruptible = false) {
  const { item, pen } = animal;
  const height = pen === "penguins" ? PENGUIN.landY : 0;
  let walked = 0;
  try {
    for (const target of route) {
      const from = item.root.position.clone();
      const to = vector(target, height);
      const length = distance(from, to);
      if (length < positionEpsilon) continue;
      const sample = new THREE.Vector3();
      faceToward(animal, to);
      if (!await motion(life, animal, length / speed, (progress) => {
        sample.lerpVectors(from, to, progress);
        if (pen === "elephants" && peers(life, pen).some((other) => other !== animal
          && !segmentClear(item.root.position, sample, other.item.root.position, elephantGap))) {
          animal.job?.cancel();
          return;
        }
        item.root.position.copy(sample);
        const stride = (walked + length * progress) * Math.PI * (pen === "elephants" ? 2.5 : pen === "pandas" ? 4 : 8);
        item.inner.position.y = Math.abs(Math.sin(stride)) * (pen === "elephants" ? 0.055 : 0.025);
        item.inner.rotation.z = Math.sin(stride) * (pen === "penguins" ? 0.19 : pen === "pandas" ? 0.075 : 0.045);
      }, interruptible)) return false;
      walked += length;
    }
    return true;
  } finally {
    resetPose(animal);
  }
}

function pace(from: P2, route: P2[], minimum: number, budget: number) {
  const length = route.reduce((total, point, index) => total + distance(route[index - 1] ?? from, point), 0);
  return Math.max(minimum, length / budget);
}

async function spray(life: Life, animal: Animal) {
  const { item } = animal;
  const width = (item as Partial<Living>).w ?? item.height;
  const height = item.height * item.root.scale.y;
  const yaw = item.root.rotation.y;
  const side = { x: Math.cos(yaw) * animal.facing, z: -Math.sin(yaw) * animal.facing };
  const top = item.root.position.clone();
  top.x += side.x * width * item.root.scale.x * 0.36 + Math.sin(yaw) * 0.1;
  top.z += side.z * width * item.root.scale.x * 0.36 + Math.cos(yaw) * 0.1;
  top.y += height * 0.8;
  let drops = 0;
  sound(life, animal);
  await motion(life, animal, 1.25, (progress) => {
    item.inner.rotation.z = -animal.facing * arc(progress) * 0.13;
    while (drops < Math.floor(progress * 28)) {
      drops++;
      const reach = range(0.7, 1.5);
      life.g.effects.emit(top, {
        vel: { x: side.x * reach + range(-0.18, 0.18), y: range(2.3, 3.4), z: side.z * reach + range(-0.18, 0.18) },
        color: "#7fd3f7", size: range(0.035, 0.065), life: 0.95, gravity: -6
      });
    }
  });
}

async function elephantLife(life: Life, animal: Animal, intro = false) {
  const { item } = animal;
  const other = peers(life, "elephants").find((peer) => peer !== animal);
  const near = other && distance(item.root.position, other.item.root.position);
  if (!intro && other && near !== undefined && near >= elephantGap && near < 2.45 && !other.reservation && !other.greeting && random() < 0.27) {
    animal.reservation = item.root.position.clone();
    faceToward(animal, other.item.root.position);
    faceToward(other, item.root.position);
    sound(life, animal);
    other.greeting = motion(life, animal, 1.1, (progress) => {
      item.inner.rotation.z = -animal.facing * 0.08 * arc(progress);
      if (active(life, other)) other.item.inner.rotation.z = -other.facing * 0.08 * arc(progress);
    });
    try {
      await other.greeting;
    } finally {
      other.greeting = undefined;
      animal.reservation = undefined;
      resetPose(animal);
      if (active(life, other)) resetPose(other);
    }
    return;
  }
  const reserved = other?.reservation ? [other.reservation] : [];
  const plan = elephantActivity(item.root.position, random, reserved, other?.item.root.position, intro ? "shoreS" : undefined);
  if (!plan) return;
  animal.reservation = plan.target;
  const uniforms = fx(item);
  try {
    if (!await walk(life, animal, plan.route, intro ? pace(item.root.position, plan.route, 0.55, 5.4) : range(0.49, 0.61))) return;
    if (uniforms) uniforms.uSway.value = 0.8;
    if (ELEPHANT.shores.includes(plan.name)) {
      await motion(life, animal, intro ? 0.55 : range(1.5, 3), (progress) => { item.inner.rotation.z = animal.facing * 0.09 * arc(progress); });
      if (active(life, animal)) await spray(life, animal);
    } else if (plan.name === "mud") {
      let splashes = 0;
      await motion(life, animal, range(3, 5), (progress) => {
        item.inner.position.y = -0.06 * arc(progress);
        item.inner.rotation.z = Math.sin(progress * Math.PI * 6) * 0.12 * arc(progress);
        if (splashes < Math.floor(progress * 4)) {
          splashes++;
          life.g.effects.burst(item.root.position, 5, { colors: ["#947054", "#71523d"], speed: 0.6, size: 0.06 });
        }
      });
    } else {
      if (plan.name === "front") faceToward(animal, HABITATS.elephants.stand);
      const chewing = plan.name === "hay";
      await motion(life, animal, plan.name.startsWith("shade") ? range(5, 10) : range(2, 4), (progress) => {
        item.inner.rotation.z = Math.sin(progress * Math.PI * (chewing ? 12 : 4)) * (chewing ? 0.065 : 0.035);
        if (chewing) item.inner.scale.y = 1 - Math.abs(Math.sin(progress * Math.PI * 12)) * 0.03;
      }, true);
    }
  } finally {
    animal.reservation = undefined;
    resetPose(animal);
  }
}

function blockedNodes(life: Life, animal: Animal) {
  return new Set(peers(life, "monkeys").filter((peer) => peer !== animal).flatMap((peer) => [peer.node, peer.nextNode]).filter((node): node is string => !!node));
}

async function monkeyEdge(life: Life, animal: Animal, move: MonkeyMove, timeScale = range(0.85, 1.15)) {
  if (!active(life, animal) || animal.node !== move.from || blockedNodes(life, animal).has(move.to)) return false;
  const { item } = animal;
  const from = new THREE.Vector3(...CLIMB_NODES[move.from].p);
  const to = new THREE.Vector3(...CLIMB_NODES[move.to].p);
  const { edge } = move;
  const forward = move.from === edge.a;
  const stand = (node: string) => CLIMB_NODES[node].pose === "stand";
  const treeIndex = ["t1top", "t2top", "t3top"].indexOf(edge.move === "climb" ? edge.b : edge.a);
  const tree = MONKEY.trees[treeIndex];
  const branch = MONKEY.branches[treeIndex];
  const rope = edge.rope === undefined ? undefined : MONKEY.ropes[edge.rope];
  const sample = new THREE.Vector3();
  const climbBase = forward ? from : to;
  const climbTop = forward ? to : from;
  const support = tree ?? MONKEY.platform.pole;
  const climbLine = new THREE.Vector2(climbBase.x - support.x, climbBase.z - support.z).normalize().multiplyScalar(tree?.trunk ?? 0.06);
  const swingLead = stand(edge.a) ? 0.17 : 0;
  const swingEnd = stand(edge.b) ? 0.83 : 1;
  const grip = (progress: number) => {
    const point = ropePoint(rope!, progress);
    return sample.set(point[0], point[1] - MONKEY.hangDrop, point[2]);
  };
  animal.nextNode = move.to;
  faceToward(animal, to);
  try {
    const reached = await motion(life, animal, monkeyTravelTime(move) * timeScale, (progress) => {
      const along = forward ? progress : 1 - progress;
      const sway = Math.sin(progress * Math.PI * 6) * arc(progress);
      sample.lerpVectors(from, to, progress);
      if (rope) {
        if (along < swingLead) grip(0).lerp(forward ? from : to, 1 - along / swingLead);
        else if (along > swingEnd) grip(1).lerp(forward ? to : from, (along - swingEnd) / (1 - swingEnd));
        else {
          const across = (along - swingLead) / (swingEnd - swingLead);
          grip(edge.move === "swing" ? (1 - Math.cos(Math.PI * across)) / 2 : across);
        }
        item.inner.rotation.z = edge.move === "swing" ? Math.sin(progress * 2 * Math.PI) * 0.24 : sway * 0.15;
      } else if (edge.move === "climb") {
        const ground = Math.min(1, along / 0.12);
        const rising = Math.max(0, Math.min(1, (along - 0.12) / 0.76));
        const step = Math.max(0, (along - 0.88) / 0.12);
        sample.set(
          lerp(lerp(climbBase.x, support.x + climbLine.x, ground), climbTop.x, step),
          lerp(MONKEY.groundY, climbTop.y, rising),
          lerp(lerp(climbBase.z, support.z + climbLine.y, ground), climbTop.z, step)
        );
        item.inner.rotation.z = sway * 0.13;
      } else if (edge.move === "branch" && branch) {
        const alongBranch = (sample.x - branch.from[0]) / (branch.to[0] - branch.from[0]);
        sample.z = lerp(branch.from[2], branch.to[2], alongBranch);
        const standing = 1 - ease.inOut(Math.max(0, (along - 0.36) / 0.64));
        sample.y = lerp(branch.from[1], branch.to[1], alongBranch) + lerp(-MONKEY.hangDrop, branch.r, standing);
        sample.lerp(from, Math.max(0, 1 - progress * 10)).lerp(to, Math.max(0, progress * 10 - 9));
        item.inner.rotation.z = sway * 0.1;
      } else if (edge.move === "jump") {
        sample.y += arc(progress) * 0.64;
        item.inner.rotation.z = Math.sin(progress * Math.PI * 2) * 0.22;
        item.inner.scale.y = 1 - 0.2 * Math.max(0, (progress - 0.88) / 0.12);
      } else {
        sample.y = MONKEY.groundY;
        item.inner.position.y = Math.abs(Math.sin(progress * Math.PI * Math.ceil(from.distanceTo(to) * 4))) * 0.09;
        item.inner.rotation.z = sway * 0.12;
      }
      item.root.position.copy(sample);
    });
    if (reached) {
      item.root.position.copy(to);
      animal.node = move.to;
      if (edge.move === "jump") await motion(life, animal, 0.18 * timeScale, (progress) => { item.inner.scale.y = lerp(0.8, 1, ease.out(progress)); });
    }
    return reached;
  } finally {
    animal.nextNode = undefined;
    resetPose(animal);
  }
}

function foodAt(life: Life, id: ZooSlotId, index: number) {
  const item = life.g.zoo.slots[id].items[index];
  return item && present(life, item) ? item : null;
}

async function eatBanana(life: Life, animal: Animal) {
  const bananas = ANCHORS.bananas.map((_, index) => foodAt(life, "bananas", (index + animal.index) % ANCHORS.bananas.length));
  const fruit = bananas.find((item) => item && !life.bananas.has(item));
  if (!fruit || !active(life, animal)) return;
  life.bananas.add(fruit);
  const { item } = animal;
  const home = fruit.root.position.clone();
  const scale = fruit.root.scale.clone();
  faceToward(animal, home);
  const hand = item.root.position.clone().lerp(vector(MONKEY.table, MONKEY.table.top), 0.2);
  hand.y = MONKEY.groundY + item.height * 0.5;
  try {
    if (!await motion(life, animal, 0.45, (progress) => {
      fruit.root.position.lerpVectors(home, hand, ease.inOut(progress));
      fruit.root.position.y += arc(progress) * 0.27;
    }, true)) return;
    sound(life, animal);
    if (!await motion(life, animal, 0.75, (progress) => {
      fruit.root.scale.copy(scale).multiplyScalar(Math.max(0.01, 1 - progress));
      item.inner.rotation.z = Math.sin(progress * Math.PI * 10) * 0.11;
    }, true)) return;
    fruit.root.position.copy(home);
    life.g.effects.burst(home, 6, { colors: ["#fff59d", "#ffd54f"], speed: 0.45, size: 0.045 });
    await motion(life, animal, 0.55, (progress) => { fruit.root.scale.copy(scale).multiplyScalar(Math.max(0.01, ease.out(progress))); }, true);
  } finally {
    fruit.root.position.copy(home);
    fruit.root.scale.copy(scale);
    life.bananas.delete(fruit);
    resetPose(animal);
  }
}

async function monkeyLife(life: Life, animal: Animal) {
  if (!animal.node) return;
  const hungry = !!foodAt(life, "bananas", 0) && random() < 0.35;
  const nodes = hungry ? eatNodes : Object.keys(CLIMB_NODES).filter((node) => CLIMB_NODES[node].p[1] > MONKEY.groundY);
  const blocked = blockedNodes(life, animal);
  const targets = nodes.filter((node) => node !== animal.node && !blocked.has(node));
  if (targets.length) {
    const path = monkeyPath(animal.node, choose(targets, random), blocked);
    for (const move of path ?? []) {
      if (life.paused.has("monkeys") || !await monkeyEdge(life, animal, move)) break;
    }
  }
  if (life.paused.has("monkeys") || !active(life, animal)) return;
  if (hungry && CLIMB_NODES[animal.node].eat) await eatBanana(life, animal);
  else {
    const hanging = CLIMB_NODES[animal.node].pose === "hang";
    if (random() < 0.38) sound(life, animal);
    await motion(life, animal, range(1.5, 4.5), (progress) => {
      animal.item.inner.rotation.z = Math.sin(progress * Math.PI * (hanging ? 4 : 8)) * (hanging ? 0.12 : 0.045);
    }, true);
    resetPose(animal);
  }
}

async function sitPanda(life: Life, animal: Animal, time: number, clump?: string) {
  const bamboo = (clump ? PANDA.eats[clump] : []).map((index) => foodAt(life, "bamboo", index)).filter((item): item is Made => !!item);
  if (bamboo.length) {
    faceToward(animal, bamboo[0].root.position);
    sound(life, animal);
  }
  try {
    await motion(life, animal, time, (progress) => {
      const sitting = ease.out(Math.min(1, progress * time / 0.45));
      const wobble = Math.sin(progress * time * (bamboo.length ? 22 : 2));
      animal.item.inner.scale.y = 1 - sitting * (0.15 + 0.025 * wobble);
      animal.item.inner.rotation.z = wobble * (bamboo.length ? 0.06 : 0.035);
      for (const [index, item] of bamboo.entries()) {
        item.inner.rotation.z = Math.sin(progress * time * 14 + index) * 0.14;
        const uniforms = fx(item);
        if (uniforms) uniforms.uSway.value = 0.9;
      }
    }, true);
  } finally {
    for (const item of bamboo) {
      item.inner.rotation.z = 0;
      const uniforms = fx(item);
      if (uniforms) uniforms.uSway.value = 0.12;
    }
    resetPose(animal);
  }
}

async function pandaLife(life: Life, animal: Animal, beat = false) {
  const eating = !!foodAt(life, "bamboo", 0) && (beat || random() < 0.48);
  const reserved = new Set(peers(life, "pandas").flatMap((peer) => peer !== animal && peer.clump ? [peer.clump] : []));
  const from = animal.item.root.position;
  const destination = pandaDestination(from, random, eating, reserved, beat);
  if (!destination) return;
  animal.clump = eating ? destination.name : undefined;
  try {
    if (await walk(life, animal, destination.route, beat ? pace(from, destination.route, 0.3, 5.5) : range(0.27, 0.34), true)) {
      if (beat || !life.paused.has("pandas")) await sitPanda(life, animal, beat ? 1.8 : eating ? range(4, 7) : range(6, 14), animal.clump);
    }
  } finally {
    animal.clump = undefined;
  }
}

function splash(life: Life, point: P2) {
  life.g.effects.burst(vector(point, PENGUIN.surfaceY), 13, { colors: ["#b3e5fc", "#ffffff"], speed: 1.1, size: 0.045 });
}

async function penguinLife(life: Life, animal: Animal, intro = false, featuredDive = false) {
  const { item } = animal;
  const from = item.root.position;
  const taken = peers(life, "penguins").flatMap((peer) => peer !== animal && peer.reservation ? [peer.reservation] : []);
  if (!intro && random() < 0.45) {
    const rest = choose(freeRests(taken), random);
    const route = landRoute("penguins", from, rest);
    if (route) {
      animal.reservation = rest;
      await walk(life, animal, route, range(0.62, 0.84));
    }
    await motion(life, animal, range(2, 5), undefined, true);
    return;
  }
  const plan = penguinPlan(from, random, intro ? featuredDive : random() < 0.22, intro, taken);
  if (plan) animal.reservation = plan.retreat[plan.retreat.length - 1];
  if (!plan || !await walk(life, animal, plan.approach, intro ? pace(from, plan.approach, 0.85, 3.6) : range(0.65, 0.92))) return;
  const exposed = Math.max(0, PENGUIN.surfaceY - PENGUIN.swimY - item.height * item.root.scale.y * 0.65) / item.root.scale.y;
  const change = async (point: P2, height: number, seconds: number, lift = 0, tilt = 0, rampIn?: boolean) => {
    const start = item.root.position.clone();
    const end = vector(point, height);
    const innerY = item.inner.position.y;
    faceToward(animal, point);
    return motion(life, animal, seconds, (progress) => {
      const along = ease.inOut(progress);
      item.root.position.lerpVectors(start, end, along);
      if (rampIn !== undefined) {
        const ramp = rampIn ? along : 1 - along;
        item.root.position.y = lerp(PENGUIN.landY, PENGUIN.surfaceY, ramp * ramp)
          + (PENGUIN.swimY - PENGUIN.surfaceY) * Math.max(0, (ramp - 0.62) / 0.38);
      }
      item.root.position.y += lift * arc(progress);
      item.inner.position.y = lerp(innerY, height === PENGUIN.swimY ? exposed : 0, along);
      item.inner.rotation.z = tilt * animal.facing * arc(progress);
    });
  };
  const uniforms = fx(item);
  if (plan.dive && !await change(PENGUIN.diveRock, PENGUIN.diveRock.h, 0.65, 0.34, 0.25)) return;
  if (!await change(plan.entry.water, PENGUIN.swimY, 0.74, plan.dive ? 0.28 : random() < 0.45 ? 0.16 : 0, plan.dive ? 1.25 : 0.44, plan.dive ? undefined : true)) return;
  splash(life, plan.entry.water);
  sound(life, animal);
  if (uniforms) uniforms.uWave.value = 0.55;
  try {
    for (const [index, point] of [...plan.swim, plan.exit.water].entries()) {
      if (!active(life, animal)) return;
      const start = item.root.position.clone();
      const end = vector(point, PENGUIN.swimY);
      faceToward(animal, end);
      const duck = !intro && index === 1 && random() < 0.5;
      const seconds = duck ? range(0.65, 1.12) : Math.max(0.34, distance(start, end) / (intro ? 1.9 : range(0.85, 1.3)));
      if (!await motion(life, animal, seconds, (progress) => {
        item.root.position.lerpVectors(start, end, progress);
        if (duck) {
          item.root.position.y = lerp(PENGUIN.swimY, PENGUIN.underY, Math.min(1, arc(progress) * 1.6));
          item.inner.position.y = exposed * (1 - arc(progress));
          item.root.visible = progress <= 0.17 || progress >= 0.83;
        } else item.root.position.y += (1 + Math.sin(progress * Math.PI * 4)) * 0.025;
        item.inner.rotation.z = Math.sin(progress * Math.PI * 4) * 0.09;
      })) return;
      if (duck) splash(life, end);
    }
    if (!await change(plan.exit.land, PENGUIN.landY, 0.72, 0.12, 0.32, false)) return;
    await motion(life, animal, 0.45, (progress) => {
      item.inner.scale.y = 1 - arc(progress) * 0.14;
      item.inner.rotation.z = Math.sin(progress * Math.PI * 8) * 0.19 * arc(progress);
    });
  } finally {
    resetPose(animal);
  }
  await walk(life, animal, plan.retreat, intro ? pace(item.root.position, plan.retreat, 0.85, 1.6) : range(0.62, 0.84));
  if (!intro) await motion(life, animal, range(2, 5), undefined, true);
}

async function beat(g: Game, pen: PenId, play: (life: Life, animals: Animal[]) => Promise<unknown>, cap = 8) {
  startZooLife(g);
  const life = sessions.get(g);
  if (!life || life.paused.has(pen)) return;
  life.paused.add(pen);
  const animals = peers(life, pen);
  for (const animal of animals) animal.interrupt?.cancel();
  const work = (async () => {
    try {
      await Promise.all(animals.map((animal) => animal.activity));
      if (!life.closed) await play(life, animals.filter((animal) => active(life, animal)));
    } finally {
      life.paused.delete(pen);
    }
  })();
  const deadline = animate(cap, () => {});
  try {
    await Promise.race([work, deadline]);
  } finally {
    deadline.cancel();
  }
}

export function zooIntro(g: Game, pen: PenId) {
  return beat(g, pen, async (life, animals) => {
    switch (pen) {
      case "elephants": {
        const lead = animals.slice().sort((left, right) => distance(left.item.root.position, ELEPHANT.poi.shoreS) - distance(right.item.root.position, ELEPHANT.poi.shoreS))[0];
        if (lead) await elephantLife(life, lead, true);
        break;
      }
      case "monkeys": {
        const lead = animals.find((animal) => animal.node === "p1");
        const edge = lead && monkeyPath("p1", "b2end", blockedNodes(life, lead))?.[0];
        if (lead && edge) await monkeyEdge(life, lead, edge);
        const swing = animals.find((animal) => animal.node === "b1end" || animal.node === "b3end");
        const swingEdge = swing && monkeyPath(swing.node!, "p1", blockedNodes(life, swing))?.[0];
        if (swing && swingEdge) {
          sound(life, swing);
          await monkeyEdge(life, swing, swingEdge);
        }
        break;
      }
      case "pandas":
        await Promise.all(animals.map((animal) => sitPanda(life, animal, range(1.25, 1.65))));
        break;
      case "penguins": {
        const lead = animals.slice().sort((left, right) => distance(left.item.root.position, PENGUIN.diveRock) - distance(right.item.root.position, PENGUIN.diveRock))[0];
        if (lead) await penguinLife(life, lead, true, true);
        break;
      }
    }
  });
}

export function feedMonkeys(g: Game) {
  return beat(g, "monkeys", async (life, animals) => {
    const group = animals.filter((animal) => animal.node);
    const waves = monkeyFeedingPaths(group.map((animal) => animal.node!));
    const travelTime = waves.reduce((total, wave) => total + Math.max(...wave.map((move) => monkeyTravelTime(move) + (move.edge.move === "jump" ? 0.18 : 0))), 0);
    const timeScale = Math.min(0.55, 4.1 / travelTime);
    for (const wave of waves) {
      await Promise.all(wave.map((move) => {
        const animal = group.find((monkey) => monkey.node === move.from);
        return animal && monkeyEdge(life, animal, move, timeScale);
      }));
    }
    await Promise.all(group.filter((animal) => CLIMB_NODES[animal.node!].eat).map((animal) => eatBanana(life, animal)));
  });
}

export function feedPandas(g: Game) {
  return beat(g, "pandas", (life, animals) => Promise.all(animals.map((animal) => pandaLife(life, animal, true))));
}
