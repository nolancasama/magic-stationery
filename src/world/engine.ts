/**
 * Renderer, camera rig and frame loop, tuned for school Chromebooks:
 * pixel ratio starts at up to 1.5 and drops to 1 for good if frames stay slow
 * (haunted-hotel / monster-island rule); no shadows, no post-processing.
 */
import * as THREE from "three";
import { timeUniform } from "./materials.ts";
import { animSpeed, stepTweens } from "./tween.ts";

type Updater = (dt: number, t: number) => void;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  scene: THREE.Scene = new THREE.Scene();
  readonly canvas: HTMLCanvasElement;
  private updaters = new Set<Updater>();
  private last = 0;
  private time = 0;
  private dpr: number;
  private slowFor = 0;
  private dprLocked = false;
  /** Render every Nth frame (the drawing panel lowers the 3D rate). */
  renderEvery = 1;
  private frame = 0;
  fps = 60;
  private fpsAcc = 0;
  private fpsFrames = 0;

  // Camera rig: current and goal, eased every frame.
  readonly camPos = new THREE.Vector3(0, 7, 10);
  readonly camLook = new THREE.Vector3(0, 0.8, 0);
  readonly goalPos = new THREE.Vector3(0, 7, 10);
  readonly goalLook = new THREE.Vector3(0, 0.8, 0);
  camEase = 3.2;
  /** Vertical lens shift (0..1 of the view) so the bottom UI does not cover the action. */
  private lensShift = 0;
  private lensGoal = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: false });
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "scene-canvas";
    container.appendChild(this.canvas);
    this.camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyLens();
  }

  onUpdate(fn: Updater): () => void {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  setScene(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Move the camera; `snap` jumps there at once. */
  focus(pos: THREE.Vector3Like, look: THREE.Vector3Like, snap = false) {
    this.goalPos.set(pos.x, pos.y, pos.z);
    this.goalLook.set(look.x, look.y, look.z);
    if (snap) {
      this.camPos.copy(this.goalPos);
      this.camLook.copy(this.goalLook);
    }
  }

  /** Shift the picture up by `amount` of the view height (e.g. above a bottom panel). */
  setLensShift(amount: number) {
    this.lensGoal = amount;
  }

  private applyLens() {
    const h = window.innerHeight;
    const w = window.innerWidth;
    if (Math.abs(this.lensShift) < 1e-4) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, 0, this.lensShift * h, w, h);
  }

  start() {
    const tick = (now: number) => {
      requestAnimationFrame(tick);
      const raw = this.last ? (now - this.last) / 1000 : 1 / 60;
      this.last = now;
      const dt = Math.min(raw, 0.05);
      this.time += dt * animSpeed();
      timeUniform.value = this.time;
      this.measure(raw);
      stepTweens(dt);
      for (const u of this.updaters) u(dt * animSpeed(), this.time);
      const k = 1 - Math.exp(-this.camEase * dt * Math.max(1, animSpeed() * 0.5));
      this.camPos.lerp(this.goalPos, k);
      this.camLook.lerp(this.goalLook, k);
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      if (Math.abs(this.lensShift - this.lensGoal) > 1e-4) {
        this.lensShift += (this.lensGoal - this.lensShift) * k;
        this.applyLens();
      }
      this.frame++;
      if (this.frame % this.renderEvery === 0) this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(tick);
  }

  private measure(raw: number) {
    this.fpsAcc += raw;
    this.fpsFrames++;
    if (this.fpsAcc >= 1) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      if (!this.dprLocked && this.renderEvery === 1 && this.dpr > 1) {
        this.slowFor = this.fps < 28 ? this.slowFor + 1 : 0;
        if (this.slowFor >= 4) {
          this.dpr = 1;
          this.dprLocked = true;
          this.renderer.setPixelRatio(1);
          this.resize();
        }
      }
    }
  }

  get elapsed(): number {
    return this.time;
  }

  /** Screen position (CSS px) of a world point; null when behind the camera. */
  toScreen(p: THREE.Vector3): { x: number; y: number } | null {
    const v = p.clone().project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }

  /** World point at a screen position on a plane at distance `dist` in front of the camera. */
  fromScreen(x: number, y: number, dist: number): THREE.Vector3 {
    const ndc = new THREE.Vector3((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1, 0.5);
    ndc.unproject(this.camera);
    const dir = ndc.sub(this.camera.position).normalize();
    return this.camera.position.clone().add(dir.multiplyScalar(dist));
  }

  readonly raycaster = new THREE.Raycaster();

  pick(clientX: number, clientY: number, objects: THREE.Object3D[]): THREE.Intersection | null {
    const ndc = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(objects, true);
    return hits[0] ?? null;
  }

  stats() {
    const info = this.renderer.info;
    return { calls: info.render.calls, triangles: info.render.triangles, fps: Math.round(this.fps), dpr: this.renderer.getPixelRatio() };
  }
}
