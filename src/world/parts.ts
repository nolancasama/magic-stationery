/**
 * Procedural modelling: primitives with vertex colours merged into one
 * geometry (one draw call per part). No model files are downloaded.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type Col = THREE.ColorRepresentation;
export type V3 = [number, number, number];

export interface At {
  p?: V3;
  r?: V3;
  s?: number | V3;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export function matrixOf(at: At): THREE.Matrix4 {
  const s = at.s === undefined ? [1, 1, 1] : typeof at.s === "number" ? [at.s, at.s, at.s] : at.s;
  tmpE.set(...(at.r ?? [0, 0, 0]));
  tmpQ.setFromEuler(tmpE);
  return tmpM.compose(new THREE.Vector3(...(at.p ?? [0, 0, 0])), tmpQ, new THREE.Vector3(s[0], s[1], s[2]));
}

export class Parts {
  private list: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: Col, at?: At): this {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (g === geo) g = geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    const c = new THREE.Color(color);
    const n = g.getAttribute("position").count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
    if (at) g.applyMatrix4(matrixOf(at));
    this.list.push(g);
    geo.dispose();
    return this;
  }

  box(w: number, h: number, d: number, color: Col, at?: At): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, at);
  }

  rbox(w: number, h: number, d: number, radius: number, color: Col, at?: At, seg = 2): this {
    return this.add(new RoundedBoxGeometry(w, h, d, seg, Math.min(radius, w / 2, h / 2, d / 2) * 0.999), color, at);
  }

  cyl(rTop: number, rBottom: number, h: number, color: Col, at?: At, seg = 12, open = false): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, open), color, at);
  }

  cone(r: number, h: number, color: Col, at?: At, seg = 12): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, at);
  }

  sphere(r: number, color: Col, at?: At, w = 12, h = 8): this {
    return this.add(new THREE.SphereGeometry(r, w, h), color, at);
  }

  /** Partial sphere (e.g. a hair cap): phi/theta as in SphereGeometry. */
  dome(r: number, color: Col, at?: At, thetaLength = Math.PI / 2, w = 14, h = 6): this {
    return this.add(new THREE.SphereGeometry(r, w, h, 0, Math.PI * 2, 0, thetaLength), color, at);
  }

  torus(R: number, r: number, color: Col, at?: At, arc = Math.PI * 2, radial = 6, tubular = 16): this {
    return this.add(new THREE.TorusGeometry(R, r, radial, tubular, arc), color, at);
  }

  capsule(r: number, len: number, color: Col, at?: At): this {
    return this.add(new THREE.CapsuleGeometry(r, len, 3, 8), color, at);
  }

  lathe(points: [number, number][], color: Col, at?: At, seg = 16): this {
    return this.add(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg), color, at);
  }

  extrude(shape: THREE.Shape, depth: number, color: Col, at?: At, bevel = 0): this {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 1,
      curveSegments: 10
    });
    g.translate(0, 0, -depth / 2);
    return this.add(g, color, at);
  }

  /** A flat disc lying on XZ (decals, rugs, shadows). */
  disc(r: number, color: Col, at?: At, seg = 20): this {
    const g = new THREE.CircleGeometry(r, seg);
    g.rotateX(-Math.PI / 2);
    return this.add(g, color, at);
  }

  plane(w: number, h: number, color: Col, at?: At): this {
    return this.add(new THREE.PlaneGeometry(w, h), color, at);
  }

  get empty(): boolean {
    return this.list.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = this.list.length === 1 ? this.list[0] : mergeGeometries(this.list, false);
    if (!g) throw new Error("merge failed");
    g.computeBoundingBox();
    g.computeBoundingSphere();
    this.list = [];
    return g;
  }

  mesh(material: THREE.Material): THREE.Mesh {
    return new THREE.Mesh(this.build(), material);
  }
}

export const shade = (c: Col, k: number): THREE.Color => new THREE.Color(c).multiplyScalar(k);
export const mix = (a: Col, b: Col, t: number): THREE.Color => new THREE.Color(a).lerp(new THREE.Color(b), t);
