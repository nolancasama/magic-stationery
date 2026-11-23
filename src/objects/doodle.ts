/**
 * The living doodle: the child's own drawing as a paper sticker that hops and
 * wobbles. Used for anything recognised that has no hand-built model, so every
 * recognisable drawing does something.
 */
import * as THREE from "three";
import { audio } from "../audio/audio.ts";
import { renderSticker, type Drawing } from "../draw/drawing.ts";
import { blobShadow } from "../world/materials.ts";
import { animate, arc } from "../world/tween.ts";
import { made, type Made } from "./made.ts";
import type { PlayContext } from "./surprises.ts";

export function buildDoodle(d: Drawing, label: string, height = 0.62): Made {
  const { canvas, aspect } = renderSticker(d, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide });
  // The sticker canvas is square; the drawing fills it along its longer side.
  const size = aspect >= 1 ? height * Math.min(1.6, aspect) : height;
  const geo = new THREE.PlaneGeometry(size, size);
  geo.translate(0, size / 2 - size * 0.1, 0);
  const m = made(label, height, null);
  const plane = new THREE.Mesh(geo, mat);
  m.inner.add(plane);
  m.parts.sticker = plane;
  m.root.add(blobShadow(size * 0.3));
  return m;
}

export async function playDoodle(m: Made, ctx: PlayContext) {
  const o = m.root;
  const face = () => (o.rotation.y = Math.atan2(ctx.camera.x - o.position.x, ctx.camera.z - o.position.z));
  face();
  for (let i = 0; i < 5; i++) {
    const from = o.position.clone();
    const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.4, 0, (Math.random() - 0.5) * 0.9));
    to.x = Math.min(ctx.roam.maxX - 0.4, Math.max(ctx.roam.minX + 0.4, to.x));
    to.z = Math.min(ctx.roam.maxZ - 0.4, Math.max(ctx.roam.minZ + 0.4, to.z));
    audio.bounce(1.5 + Math.random() * 0.4);
    await animate(0.45, (k) => {
      o.position.lerpVectors(from, to, k);
      m.inner.position.y = arc(k) * 0.3;
      m.inner.rotation.z = Math.sin(k * Math.PI * 2) * 0.18;
      m.inner.scale.set(1 - Math.sin(k * Math.PI) * 0.08, 1 + Math.sin(k * Math.PI) * 0.12, 1);
      face();
    });
    await animate(0.14, (k) => m.inner.scale.set(1 + 0.12 * Math.sin(k * Math.PI), 1 - 0.15 * Math.sin(k * Math.PI), 1));
  }
}
