/**
 * A built object: `root` is placed by the caller (slot anchor, floor spot);
 * `inner` is free for intro/idle/surprise animation; `parts` are named
 * movable pieces (scissor halves, book covers, the schoolbag flap).
 */
import * as THREE from "three";
import { vividMat } from "../world/materials.ts";
import type { Parts } from "../world/parts.ts";

export interface Made {
  kind: string;
  root: THREE.Group;
  inner: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  /** Approximate height (m) for framing and effects. */
  height: number;
  /** The colour it was given (crayon colour), if any. */
  tint: THREE.Color | null;
}

export function made(kind: string, height: number, tint: THREE.Color | null): Made {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  root.name = kind;
  return { kind, root, inner, parts: {}, height, tint };
}

/** Add a built Parts set as a mesh, optionally inside a pivot group. */
export function addMesh(m: Made, parts: Parts, name?: string, pivot?: THREE.Vector3Like): THREE.Object3D {
  const mesh = parts.mesh(vividMat);
  if (pivot) {
    const g = new THREE.Group();
    g.position.set(pivot.x, pivot.y, pivot.z);
    mesh.position.set(-pivot.x, -pivot.y, -pivot.z);
    g.add(mesh);
    m.inner.add(g);
    if (name) m.parts[name] = g;
    return g;
  }
  m.inner.add(mesh);
  if (name) m.parts[name] = mesh;
  return mesh;
}

export function meshesOf(o: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) out.push(c as THREE.Mesh);
  });
  return out;
}
