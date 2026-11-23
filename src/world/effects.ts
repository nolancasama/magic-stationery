/**
 * One pooled particle system (one draw call) for sparkles, magic trails and
 * confetti. Particles are simulated on the CPU; a few hundred is cheap.
 */
import * as THREE from "three";
import { sparkleTexture } from "./materials.ts";

const MAX = 700;

interface P {
  alive: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
  gravity: number;
  drag: number;
  spin: number;
}

export const MAGIC_COLORS = ["#fff6b0", "#ffd54f", "#ff8ad8", "#8be9ff", "#b69cff", "#ffffff"];
export const CONFETTI_COLORS = ["#ff5a5f", "#ffb400", "#3ecf8e", "#4aa3ff", "#b36bff", "#ff7ac6", "#ffe14d"];

export class Effects {
  readonly points: THREE.Points;
  private ps: P[] = [];
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: sparkleTexture() }, uScale: { value: 420 } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute vec3 color;
        varying vec3 vC; varying float vA;
        uniform float uScale;
        void main() {
          vC = color; vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uMap; varying vec3 vC; varying float vA;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vC * t.rgb, t.a * vA);
        }`
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    for (let i = 0; i < MAX; i++) {
      this.ps.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0.1, color: new THREE.Color(), gravity: 0, drag: 0, spin: 0 });
    }
  }

  /** Scale points for the screen height (call on resize). */
  setViewHeight(h: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.55;
  }

  private spawn(): P | null {
    for (const p of this.ps) if (!p.alive) return p;
    return null;
  }

  emit(at: THREE.Vector3Like, o: { vel?: THREE.Vector3Like; spread?: number; life?: number; size?: number; color?: THREE.ColorRepresentation; gravity?: number; drag?: number } = {}) {
    const p = this.spawn();
    if (!p) return;
    p.alive = true;
    p.pos.set(at.x, at.y, at.z);
    const s = o.spread ?? 1;
    p.vel.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    if (o.vel) p.vel.add(o.vel as THREE.Vector3);
    p.maxLife = p.life = (o.life ?? 0.9) * (0.7 + Math.random() * 0.6);
    p.size = (o.size ?? 0.12) * (0.6 + Math.random() * 0.8);
    p.color.set(o.color ?? MAGIC_COLORS[(Math.random() * MAGIC_COLORS.length) | 0]);
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 1.5;
  }

  burst(at: THREE.Vector3Like, count = 40, o: { speed?: number; life?: number; size?: number; colors?: string[]; gravity?: number; up?: number } = {}) {
    const speed = o.speed ?? 2.2;
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3().randomDirection().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      dir.y += o.up ?? 0.6;
      const colors = o.colors ?? MAGIC_COLORS;
      this.emit(at, { vel: dir, spread: 0.2, life: o.life ?? 0.9, size: o.size ?? 0.13, color: colors[(Math.random() * colors.length) | 0], gravity: o.gravity ?? -1.5, drag: 1.8 });
    }
  }

  confetti(at: THREE.Vector3Like, count = 120) {
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3((Math.random() - 0.5) * 4, 3 + Math.random() * 3, (Math.random() - 0.5) * 3);
      this.emit(at, { vel: dir, spread: 0.6, life: 2.6, size: 0.12, color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0], gravity: -3.2, drag: 1.2 });
    }
  }

  /** A few drifting twinkles around a point (call repeatedly). */
  twinkle(at: THREE.Vector3Like, radius = 0.3, color?: string) {
    const p = new THREE.Vector3(at.x + (Math.random() - 0.5) * radius * 2, at.y + (Math.random() - 0.5) * radius * 2, at.z + (Math.random() - 0.5) * radius * 2);
    this.emit(p, { vel: { x: 0, y: 0.25, z: 0 }, spread: 0.15, life: 0.9, size: 0.09, color, drag: 0.5 });
  }

  update(dt: number) {
    let n = 0;
    for (const p of this.ps) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.vel.multiplyScalar(Math.exp(-p.drag * dt));
      p.vel.y += p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = p.life / p.maxLife;
      this.pos[n * 3] = p.pos.x;
      this.pos[n * 3 + 1] = p.pos.y;
      this.pos[n * 3 + 2] = p.pos.z;
      this.col[n * 3] = p.color.r;
      this.col[n * 3 + 1] = p.color.g;
      this.col[n * 3 + 2] = p.color.b;
      this.size[n] = p.size * (0.5 + 0.5 * Math.min(1, k * 2.5));
      this.alpha[n] = Math.min(1, k * 2);
      n++;
    }
    this.geo.setDrawRange(0, n);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }

  get active(): number {
    return this.ps.reduce((n, p) => n + (p.alive ? 1 : 0), 0);
  }
}
