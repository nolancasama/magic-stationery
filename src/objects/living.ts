/**
 * Living drawings: the child's own artwork as a textured plane in the 3D world,
 * animated by what it was recognised as. Recognition decides *how it moves*;
 * it never replaces *how it looks*.
 *
 * Animation is whole-drawing (position, rotation, scale) plus a small vertex
 * deformation in the shader: a travelling wiggle (swimming), a wing flap (the
 * outer parts move up and down), and an idle sway. No body-part detection.
 */
import * as THREE from "three";
import { audio } from "../audio/audio.ts";
import { renderArt, type Art } from "../draw/art.ts";
import type { Effects } from "../world/effects.ts";
import type { Engine } from "../world/engine.ts";
import { blobShadow, timeUniform } from "../world/materials.ts";
import { animate, arc, ease, wait } from "../world/tween.ts";
import { made, type Made } from "./made.ts";

export interface Fit {
  w: number;
  h: number;
}

export interface LivingFx {
  uWave: { value: number };
  uFlap: { value: number };
  uSway: { value: number };
  uPhase: { value: number };
  uSize: { value: THREE.Vector2 };
  glow: { value: number };
}

export interface Living extends Made {
  art: Art;
  fx: LivingFx;
  w: number;
  h: number;
}

const texCache = new WeakMap<Art, THREE.CanvasTexture>();

function textureOf(art: Art): THREE.CanvasTexture {
  let t = texCache.get(art);
  if (!t) {
    t = new THREE.CanvasTexture(renderArt(art, 256).canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(art, t);
  }
  return t;
}

/** Size that keeps the drawing's own proportions inside a box. */
export function fitSize(art: Art, fit: Fit): { w: number; h: number } {
  const aspect = art.w / art.h;
  let h = fit.h;
  let w = h * aspect;
  if (w > fit.w) {
    w = fit.w;
    h = w / aspect;
  }
  return { w, h };
}

/** The artwork as a living object. Root sits at the drawing's bottom centre. */
export function buildLiving(art: Art, fit: Fit, opts: { shadow?: boolean; glow?: boolean; label?: string; hinge?: boolean } = {}): Living {
  const { w, h } = fitSize(art, fit);
  const fx: LivingFx = {
    uWave: { value: 0 },
    uFlap: { value: 0 },
    uSway: { value: 0.12 },
    uPhase: { value: Math.random() * 10 },
    uSize: { value: new THREE.Vector2(w, h) },
    glow: { value: 0 }
  };
  const geo = new THREE.PlaneGeometry(w, h, 12, 8);
  geo.translate(0, h / 2, 0);
  const mat = new THREE.MeshBasicMaterial({ map: textureOf(art), transparent: true, alphaTest: 0.06, side: THREE.DoubleSide, toneMapped: false });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uWave = fx.uWave;
    shader.uniforms.uFlap = fx.uFlap;
    shader.uniforms.uSway = fx.uSway;
    shader.uniforms.uPhase = fx.uPhase;
    shader.uniforms.uSize = fx.uSize;
    shader.uniforms.uGlow = fx.glow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime, uWave, uFlap, uSway, uPhase;\nuniform vec2 uSize;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        float lt = uTime + uPhase;
        float nx = transformed.x / (uSize.x * 0.5);
        float ny = transformed.y / uSize.y;
        transformed.y += uWave * uSize.y * 0.09 * sin(nx * 3.2 - lt * 8.0) * abs(nx);
        transformed.y += uFlap * uSize.y * 0.28 * sin(lt * 12.0) * nx * nx;
        transformed.x += uSway * uSize.x * 0.06 * ny * ny * sin(lt * 1.7);`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uGlow;")
      .replace("#include <dithering_fragment>", "#include <dithering_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.0, 0.93, 0.6), uGlow * 0.55);");
  };
  mat.customProgramCacheKey = () => "ms-living";
  const m = made(opts.label ?? "drawing", h, null) as Living;
  if (opts.hinge) {
    // Two halves of the same picture, hinged at the middle: the child's own
    // scissors can open and snip, their own book can open and close.
    geo.dispose();
    for (const side of [-1, 1]) {
      const half = new THREE.PlaneGeometry(w / 2, h, 6, 8);
      half.translate((side * w) / 4, h / 2, 0);
      const uv = half.getAttribute("uv") as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, side < 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5);
      const pivot = new THREE.Group();
      pivot.add(new THREE.Mesh(half, mat));
      m.inner.add(pivot);
      m.parts[side < 0 ? "left" : "right"] = pivot;
    }
    m.parts.sprite = m.parts.left;
  } else {
    const sprite = new THREE.Mesh(geo, mat);
    m.inner.add(sprite);
    m.parts.sprite = sprite;
  }
  if (opts.glow) {
    const g = renderArt(art, 256, { glowOnly: "#ffd54f" });
    const gt = new THREE.CanvasTexture(g.canvas);
    gt.colorSpace = THREE.SRGBColorSpace;
    const gw = w * (g.canvas.width / (g.canvas.width - Math.ceil(256 * 0.16)));
    const gh = gw / g.aspect;
    const glowGeo = new THREE.PlaneGeometry(gw, gh);
    glowGeo.translate(0, h / 2, -0.004);
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false }));
    m.inner.add(glow);
    m.parts.glow = glow;
  }
  if (opts.shadow) m.root.add(blobShadow(Math.max(0.12, w * 0.35)));
  m.art = art;
  m.fx = fx;
  m.w = w;
  m.h = h;
  return m;
}

function setGlow(m: Living, v: number) {
  m.fx.glow.value = v;
  const g = m.parts.glow as THREE.Mesh | undefined;
  if (g) (g.material as THREE.MeshBasicMaterial).opacity = v;
}

function setDepthTest(m: Living, on: boolean) {
  m.root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      (mesh.material as THREE.Material).depthTest = on;
      mesh.renderOrder = on ? 0 : 30;
    }
  });
}

export interface FromScreen {
  /** The drawing's own box on screen (CSS px). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The transformation, continuous from page to world: the drawing glows, lifts
 * off the page, gains movement, flies (sparkling) to its place and lands.
 * The object that flies is the object that stays.
 */
export async function bringToLife(engine: Engine, scene: THREE.Scene, effects: Effects, m: Living, from: FromScreen, at: THREE.Vector3, rot: THREE.Euler): Promise<void> {
  const dist = 3;
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const worldH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(engine.camera.fov / 2));
  const startScale = Math.max(0.2, ((from.h / window.innerHeight) * worldH) / m.h);
  // The root is at the bottom centre: start with the drawing's centre where it was on the page.
  const startCenter = engine.fromScreen(cx, cy, dist);
  const camQ = engine.camera.quaternion.clone();
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camQ);
  const start = startCenter.clone().addScaledVector(up, (-m.h * startScale) / 2);
  const endQ = new THREE.Quaternion().setFromEuler(rot);
  m.root.position.copy(start);
  m.root.quaternion.copy(camQ);
  m.root.scale.setScalar(startScale);
  setDepthTest(m, false);
  setGlow(m, 1);
  scene.add(m.root);
  effects.burst(startCenter, 30, { speed: 1.6, size: 0.08 });
  audio.sparkle(5);
  // Lift off the page.
  await animate(0.35, (k) => {
    m.root.scale.setScalar(startScale * (1 + 0.1 * ease.out(k)));
    m.root.position.copy(start).addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(camQ), 0.25 * ease.out(k));
    m.fx.uWave.value = 0.6 * k;
  });
  // Fly into the world, alive.
  audio.whoosh(0.9);
  const p0 = m.root.position.clone();
  const ctrl = p0.clone().lerp(at, 0.5);
  ctrl.y = Math.max(p0.y, at.y) + 1.2;
  const s0 = m.root.scale.x;
  const pos = new THREE.Vector3();
  await animate(1.0, (k) => {
    const e = ease.inOut(k);
    const a = (1 - e) * (1 - e);
    const b = 2 * (1 - e) * e;
    const c = e * e;
    pos.set(a * p0.x + b * ctrl.x + c * at.x, a * p0.y + b * ctrl.y + c * at.y, a * p0.z + b * ctrl.z + c * at.z);
    m.root.position.copy(pos);
    m.root.scale.setScalar(s0 + (1 - s0) * e);
    m.root.quaternion.slerpQuaternions(camQ, endQ, e);
    m.inner.rotation.z = Math.sin(k * Math.PI * 2) * 0.25 * (1 - k);
    m.fx.uWave.value = 0.6 * (1 - k);
    for (let i = 0; i < 3; i++) effects.emit(pos.clone().add(new THREE.Vector3(0, m.h * 0.5, 0)), { spread: 0.25, life: 0.7, size: 0.09, gravity: -0.4 });
  });
  m.root.position.copy(at);
  m.root.quaternion.copy(endQ);
  m.root.scale.setScalar(1);
  m.inner.rotation.z = 0;
  setDepthTest(m, true);
  audio.magic();
  effects.burst(at.clone().add(new THREE.Vector3(0, m.h * 0.5, 0)), 40, { speed: 2.2, size: 0.11 });
  await animate(0.6, (k) => setGlow(m, 1 - k));
  const g = m.parts.glow as THREE.Mesh | undefined;
  if (g) {
    m.inner.remove(g);
    g.geometry.dispose();
    (g.material as THREE.MeshBasicMaterial).map?.dispose();
    (g.material as THREE.Material).dispose();
    delete m.parts.glow;
  }
}

// ---------------------------------------------------------------- entrances in displays

async function squash(m: Living, amount = 0.14, dur = 0.16) {
  const sx = Math.sign(m.inner.scale.x) || 1;
  await animate(dur, (k) => {
    const s = Math.sin(k * Math.PI) * amount;
    m.inner.scale.set(sx * (1 + s), 1 - s, 1);
  });
}

async function hopIn(m: Living, heights: number[]) {
  for (const h of heights) {
    await animate(0.18 + h * 0.6, (k) => (m.inner.position.y = arc(k) * h));
    audio.bounce(1.3 + h);
    await squash(m, 0.25 * (h + 0.3), 0.12);
  }
}

/** How each display's drawing settles into place. */
export const ENTRANCES: Record<string, (m: Living) => Promise<void>> = {
  // Pencils and rulers spin into place.
  spin: async (m) => {
    await animate(0.85, (k) => {
      m.inner.position.y = arc(k) * 0.5;
      m.inner.rotation.y = ease.inOut(k) * Math.PI * 4;
    });
    audio.bounce(1.6);
    await squash(m, 0.1);
  },
  bounce: (m) => hopIn(m, [0.45, 0.2, 0.08]),
  // Scissors snip: the two halves of the child's drawing open and close around the middle.
  snip: async (m) => {
    const L = m.parts.left;
    const R = m.parts.right;
    if (L && R) {
      const pivotY = m.h * 0.5;
      for (const p of [L, R]) {
        p.position.y = pivotY;
        p.children[0].position.y = -pivotY;
      }
      for (let i = 0; i < 3; i++) {
        audio.snip();
        await animate(0.3, (k) => {
          const open = Math.sin(k * Math.PI) * 0.4;
          L.rotation.z = open;
          R.rotation.z = -open;
        });
      }
      L.rotation.z = R.rotation.z = 0;
      return;
    }
    for (let i = 0; i < 3; i++) {
      audio.snip();
      await animate(0.24, (k) => {
        const s = Math.sin(k * Math.PI) * 0.22;
        m.inner.scale.set(1 - s, 1 + s * 0.3, 1);
        m.inner.rotation.z = Math.sin(k * Math.PI * 2) * 0.08;
      });
    }
  },
  drop: async (m) => {
    await animate(0.5, (k) => {
      m.inner.position.y = 0.5 * (1 - k * k);
      m.inner.rotation.y = k * Math.PI * 3;
    });
    m.inner.rotation.y = 0;
    audio.bounce(2);
    await squash(m, 0.12);
  },
  // A book opens and closes (its width folds and unfolds like covers).
  book: async (m) => {
    audio.flap();
    const L = m.parts.left;
    const R = m.parts.right;
    if (L && R) {
      // The two halves are the covers: they close towards the middle and open again, twice.
      await animate(1.4, (k) => {
        const shut = Math.abs(Math.sin(k * Math.PI * 2)) * 1.35;
        L.rotation.y = shut;
        R.rotation.y = -shut;
        m.inner.position.y = arc(k) * 0.3;
      });
      L.rotation.y = R.rotation.y = 0;
      audio.bounce(1.4);
      return;
    }
    await animate(1.1, (k) => {
      m.inner.scale.x = 0.15 + 0.85 * Math.abs(Math.cos(k * Math.PI * 2));
      m.inner.position.y = arc(k) * 0.35;
    });
    m.inner.scale.x = 1;
    audio.bounce(1.4);
  },
  flutter: async (m) => {
    audio.flap();
    await animate(0.9, (k) => {
      m.inner.position.y = 0.6 * (1 - ease.out(k));
      m.inner.rotation.z = Math.sin(k * Math.PI * 4) * 0.25 * (1 - k);
      m.fx.uFlap.value = 0.3 * (1 - k);
    });
    m.fx.uFlap.value = 0;
    audio.bounce(1.8);
  },
  hop: (m) => hopIn(m, [0.3, 0.12])
};

// ---------------------------------------------------------------- free behaviour by category

export interface Roam {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface PlayContext {
  effects: Effects;
  roam: Roam;
  camera: THREE.Vector3;
  /** Seconds to play. */
  seconds?: number;
}

export type Behaviour = "swim" | "fly" | "hop" | "walk" | "waddle" | "jump" | "bounce" | "drive" | "rise" | "grow" | "wobble";

const CATEGORY: Record<string, Behaviour> = {};
const add = (b: Behaviour, labels: string) => labels.split(",").forEach((l) => (CATEGORY[l.trim()] = b));
add("swim", "fish,whale,shark,dolphin,octopus,sea turtle,crab,mermaid");
add("fly", "bird,duck,owl,parrot,flamingo,swan,butterfly,bee,airplane,helicopter,dragon");
add("hop", "rabbit,frog,kangaroo,mouse");
add("jump", "monkey,squirrel,teddy-bear");
add("waddle", "penguin");
add("walk", "cat,dog,lion,tiger,bear,elephant,giraffe,zebra,panda,camel,crocodile,rhinoceros,horse,cow,pig,sheep,snake,snail,spider,hedgehog");
add("bounce", "basketball,soccer ball,baseball,apple,orange,circle,donut,smiley face,cookie,watermelon,grapes,strawberry,blueberry,pear,onion,potato");
add("drive", "car,bus,train,bicycle,skateboard,sailboat");
add("rise", "sun,moon,star,cloud,rainbow,lightning,snowflake,light bulb,crown,umbrella");
add("grow", "flower,tree,palm tree,cactus,bush,grass,leaf,mushroom,broccoli,carrot,house plant");

export function behaviourOf(label: string): Behaviour {
  return CATEGORY[label] ?? "wobble";
}

/** Size box for a free creature by behaviour (it keeps its own proportions inside). */
export function fitFor(b: Behaviour): Fit {
  switch (b) {
    case "bounce":
      return { w: 0.4, h: 0.4 };
    case "fly":
    case "swim":
      return { w: 0.75, h: 0.5 };
    case "rise":
      return { w: 0.6, h: 0.6 };
    case "grow":
      return { w: 0.5, h: 0.7 };
    default:
      return { w: 0.85, h: 0.65 };
  }
}

function clampToRoam(v: THREE.Vector3, r: Roam, margin = 0.3) {
  v.x = Math.min(r.maxX - margin, Math.max(r.minX + margin, v.x));
  v.z = Math.min(r.maxZ - margin, Math.max(r.minZ + margin, v.z));
}

function randomIn(r: Roam): THREE.Vector3 {
  const v = new THREE.Vector3(r.minX + Math.random() * (r.maxX - r.minX), 0, r.minZ + Math.random() * (r.maxZ - r.minZ));
  clampToRoam(v, r);
  return v;
}

/** Keep facing the camera; mirror the drawing to face the way it moves across the screen. */
function face(m: Living, ctx: PlayContext, across: number) {
  const o = m.root;
  o.rotation.set(0, Math.atan2(ctx.camera.x - o.position.x, ctx.camera.z - o.position.z), 0);
  if (Math.abs(across) > 1e-4) {
    // Turn by mirroring towards full width (never towards the current width, which can be ~0 mid-turn).
    const target = Math.sign(across);
    m.inner.scale.x += (target - m.inner.scale.x) * 0.25;
  }
}

async function travel(m: Living, ctx: PlayContext, to: THREE.Vector3, speed: number, each?: (k: number, dist: number) => void) {
  const from = m.root.position.clone();
  const dist = Math.max(0.01, from.distanceTo(to));
  // Direction across the screen decides which way the drawing faces.
  const camRight = new THREE.Vector3().subVectors(ctx.camera, from).setY(0).normalize();
  const side = new THREE.Vector3(camRight.z, 0, -camRight.x).negate();
  const across = new THREE.Vector3().subVectors(to, from).dot(side);
  await animate(dist / speed, (k) => {
    m.root.position.lerpVectors(from, to, k);
    face(m, ctx, across);
    each?.(k, dist);
  });
}

export async function play(m: Living, b: Behaviour, ctx: PlayContext): Promise<void> {
  const T = ctx.seconds ?? 4.5;
  const t0 = performance.now();
  const timeLeft = () => T - (performance.now() - t0) / 1000;
  const r = ctx.roam;
  m.fx.uSway.value = 0.12;
  switch (b) {
    case "swim": {
      m.fx.uWave.value = 1;
      const base = m.root.position.y;
      const startY = base + 0.7;
      await animate(0.5, (k) => (m.root.position.y = base + 0.7 * ease.out(k)));
      while (timeLeft() > 0) {
        const to = randomIn(r);
        to.y = startY + (Math.random() - 0.5) * 0.5;
        await travel(m, ctx, to, 0.9, (k) => (m.inner.position.y = Math.sin(k * Math.PI * 3) * 0.05));
      }
      m.fx.uWave.value = 0;
      break;
    }
    case "fly": {
      m.fx.uFlap.value = 1;
      audio.animal("bird");
      const base = m.root.position.y;
      while (timeLeft() > 0) {
        const to = randomIn(r);
        to.y = base + 1.0 + Math.random() * 0.7;
        await travel(m, ctx, to, 1.6, (k) => (m.inner.rotation.z = Math.sin(k * Math.PI) * 0.15));
      }
      m.fx.uFlap.value = 0;
      break;
    }
    case "hop":
    case "jump": {
      const hgt = b === "jump" ? 0.6 : 0.32;
      while (timeLeft() > 0) {
        const to = m.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 0.8));
        clampToRoam(to, r);
        await travel(m, ctx, to, 1.6, (k) => {
          m.inner.position.y = arc(k) * hgt;
          m.inner.scale.y = 1 + Math.sin(k * Math.PI) * 0.12;
        });
        audio.bounce(1.7);
        await squash(m, 0.18, 0.12);
      }
      break;
    }
    case "walk":
    case "waddle": {
      audio.animal(m.kind);
      while (timeLeft() > 0) {
        const to = randomIn(r);
        await travel(m, ctx, to, 0.7, (k, dist) => {
          const steps = k * dist * 6;
          m.inner.position.y = Math.abs(Math.sin(steps * Math.PI)) * 0.04;
          m.inner.rotation.z = (b === "waddle" ? 0.18 : 0.05) * Math.sin(steps * Math.PI);
        });
        await wait(0.3);
      }
      break;
    }
    case "bounce": {
      // Simple sphere physics on a collision proxy; the picture rolls as it moves.
      const rad = Math.min(m.w, m.h) / 2;
      // Pivot at the picture's centre so it rolls instead of tipping over its base.
      const sprite = m.parts.sprite;
      sprite.position.y = -m.h / 2;
      m.inner.position.y = m.h / 2;
      const v = new THREE.Vector3((Math.random() - 0.5) * 3, 3.4, (Math.random() - 0.5) * 2);
      const o = m.root;
      await animate(T, (_k, dt) => {
        v.y -= 9.8 * dt;
        o.position.addScaledVector(v, dt);
        if (o.position.y < 0) {
          o.position.y = 0;
          if (v.y < -0.6) {
            audio.bounce(1.2 + Math.random() * 0.2);
            m.inner.scale.set(1.15, 0.85, 1);
          }
          v.y = -v.y * 0.72;
          v.x *= 0.93;
          v.z *= 0.93;
        }
        m.inner.scale.x += (1 - m.inner.scale.x) * 0.2;
        m.inner.scale.y += (1 - m.inner.scale.y) * 0.2;
        if (o.position.x < r.minX + rad || o.position.x > r.maxX - rad) v.x = -v.x;
        if (o.position.z < r.minZ + rad || o.position.z > r.maxZ - rad) v.z = -v.z;
        clampToRoam(o.position, r, rad);
        face(m, ctx, 0);
        m.inner.rotation.z -= (v.x * dt) / rad;
      });
      sprite.position.y = 0;
      m.inner.rotation.z = 0;
      break;
    }
    case "drive": {
      audio.animal("car");
      while (timeLeft() > 0) {
        const to = randomIn(r);
        await travel(m, ctx, to, 1.8, (k) => (m.inner.position.y = Math.abs(Math.sin(k * 40)) * 0.01));
      }
      audio.animal("car");
      break;
    }
    case "rise": {
      const y0 = m.root.position.y;
      audio.sparkle(6, 784);
      await animate(T, (k) => {
        m.root.position.y = y0 + ease.out(Math.min(1, k * 2)) * 1.4 + Math.sin(k * 10) * 0.04;
        m.inner.rotation.z = Math.sin(k * Math.PI * 3) * 0.2;
        face(m, ctx, 0);
        if (Math.random() < 0.3) ctx.effects.twinkle({ x: m.root.position.x, y: m.root.position.y + m.h * 0.5, z: m.root.position.z }, m.w * 0.5, "#fff59d");
      });
      break;
    }
    case "grow": {
      face(m, ctx, 0);
      await animate(0.8, (k) => m.inner.scale.setScalar(0.2 + 0.8 * ease.elastic(k)));
      audio.sparkle(4, 1318);
      m.fx.uSway.value = 1;
      await wait(Math.max(0.5, T - 0.8));
      m.fx.uSway.value = 0.12;
      break;
    }
    default: {
      while (timeLeft() > 0) {
        const to = m.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 0.6));
        clampToRoam(to, r);
        await travel(m, ctx, to, 1.4, (k) => {
          m.inner.position.y = arc(k) * 0.25;
          m.inner.rotation.z = Math.sin(k * Math.PI * 2) * 0.15;
        });
        audio.bounce(1.6);
        await squash(m, 0.14, 0.12);
      }
    }
  }
  m.inner.position.y = 0;
  m.inner.rotation.z = 0;
}
