/** Text signs drawn on canvases with system fonts (no webfonts: school networks block them). */
import * as THREE from "three";

export function signTexture(text: string, opts: { w?: number; h?: number; bg?: string; fg?: string; font?: string; border?: string } = {}): THREE.CanvasTexture {
  const w = opts.w ?? 512;
  const h = opts.h ?? 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = opts.bg ?? "#fff3d6";
  const r = h * 0.22;
  g.beginPath();
  g.roundRect(4, 4, w - 8, h - 8, r);
  g.fill();
  if (opts.border) {
    g.lineWidth = h * 0.06;
    g.strokeStyle = opts.border;
    g.stroke();
  }
  g.fillStyle = opts.fg ?? "#5b3a29";
  g.font = opts.font ?? `bold ${Math.round(h * 0.5)}px "Arial Rounded MT Bold", "Hiragino Maru Gothic ProN", "Segoe UI", Arial, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + h * 0.03, w - h * 0.4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A flat sign mesh (unlit basic material, but restore-aware via the caller's choice). */
export function signMesh(text: string, width: number, height: number, opts: Parameters<typeof signTexture>[1] = {}, material?: THREE.Material): THREE.Mesh {
  const tex = signTexture(text, { w: 512, h: Math.round((512 * height) / width), ...opts });
  const mat = material ?? new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  if (material && "map" in material) (material as THREE.MeshBasicMaterial).map = tex;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}
