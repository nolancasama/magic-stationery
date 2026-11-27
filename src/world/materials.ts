/**
 * Shared materials.
 *
 * - `worldMaterial`: everything that belongs to an erased place. A fragment
 *   patch fades it towards pale grey by the area's restoration level, and a
 *   colour wave can spread from a restored object.
 * - `vividMaterial`: things the child drew. Always in full colour.
 * - `magicMaterial`: a vivid material whose colour is painted in from bottom
 *   to top behind a golden line (the transformation).
 * - `ghostMaterial`: faint glowing outline of a missing object.
 */
import * as THREE from "three";

export interface RestoreUniforms {
  uRestore: { value: number };
  uWave: { value: THREE.Vector4 };
  uWaveBoost: { value: number };
}

export function makeRestoreUniforms(level = 0): RestoreUniforms {
  return {
    uRestore: { value: level },
    uWave: { value: new THREE.Vector4(0, 0, 0, -1) },
    uWaveBoost: { value: 0 }
  };
}

/** Uniforms shared by every world material of the place being shown. */
export const worldUniforms: RestoreUniforms = makeRestoreUniforms(0.1);
export const timeUniform = { value: 0 };

function patchRestore(mat: THREE.Material, uniforms: RestoreUniforms) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRestore = uniforms.uRestore;
    shader.uniforms.uWave = uniforms.uWave;
    shader.uniforms.uWaveBoost = uniforms.uWaveBoost;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vMsWorld;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvMsWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uRestore;\nuniform vec4 uWave;\nuniform float uWaveBoost;\nvarying vec3 vMsWorld;")
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float msLevel = uRestore;
        if (uWave.w > 0.0) {
          float msD = distance(vMsWorld, uWave.xyz);
          msLevel += uWaveBoost * (1.0 - smoothstep(uWave.w - 0.8, uWave.w, msD));
        }
        msLevel = clamp(msLevel, 0.0, 1.0);
        float msLum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
        vec3 msErased = mix(vec3(msLum * 0.9 + 0.12), vec3(0.88, 0.9, 0.95), 0.3);
        gl_FragColor.rgb = mix(msErased, gl_FragColor.rgb, msLevel);`
      );
  };
  mat.customProgramCacheKey = () => "ms-restore";
}

export function worldMaterial(opts: THREE.MeshLambertMaterialParameters = {}, uniforms: RestoreUniforms = worldUniforms): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  patchRestore(m, uniforms);
  return m;
}

/** Unlit world material (signs, posters) that also fades with the place. */
export function worldBasicMaterial(opts: THREE.MeshBasicMaterialParameters = {}, uniforms: RestoreUniforms = worldUniforms): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial(opts);
  patchRestore(m, uniforms);
  return m;
}

export function worldFoliageMaterial(strength: { value: number }): THREE.MeshLambertMaterial {
  const material = worldMaterial();
  const restore = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    restore(shader, renderer);
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uSway = strength;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uSway;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        float breeze = uTime * 1.5 + position.x * 0.7 + position.z * 0.5;
        transformed.xz += vec2(sin(breeze), cos(breeze * 0.8)) * uSway * smoothstep(0.12, 2.4, position.y);`);
  };
  material.customProgramCacheKey = () => "ms-restore-foliage";
  return material;
}

export function worldWaterMaterial(strength: { value: number }): THREE.MeshBasicMaterial {
  const material = worldBasicMaterial({ vertexColors: true });
  const restore = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    restore(shader, renderer);
    shader.uniforms.uTime = timeUniform;
    shader.uniforms.uShimmer = strength;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uShimmer;")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>
        float ripple = sin(vMsWorld.x * 8.0 + vMsWorld.z * 4.0 - uTime * 1.4)
          * sin(vMsWorld.z * 7.0 - vMsWorld.x * 2.0 + uTime * 1.8);
        gl_FragColor.rgb *= 1.0 + uShimmer * (ripple + 0.5 * sin(uTime * 1.3));`);
  };
  material.customProgramCacheKey = () => "ms-restore-water";
  return material;
}

/** Default world material (vertex colours, restore patch). */
export const worldMat = worldMaterial();
/** Glowing world parts (lamps) — emissive driven by the area script. */
export const lampMat = worldMaterial({ emissive: new THREE.Color("#fff2c0"), emissiveIntensity: 0 });

export const vividMat = new THREE.MeshLambertMaterial({ vertexColors: true });

export interface MagicMaterial {
  material: THREE.MeshLambertMaterial;
  reveal: { value: number };
}

/** Colour painted in from minY to maxY (world space) as `reveal` goes 0 -> 1. */
export function magicMaterial(minY: number, maxY: number): MagicMaterial {
  const reveal = { value: 0 };
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = reveal;
    shader.uniforms.uMinY = { value: minY };
    shader.uniforms.uMaxY = { value: maxY };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vMsObjY;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvMsObjY = (modelMatrix * vec4(transformed, 1.0)).y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uReveal;\nuniform float uMinY;\nuniform float uMaxY;\nvarying float vMsObjY;")
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        float msSpan = max(uMaxY - uMinY, 0.001);
        float msLine = mix(uMinY - 0.08 * msSpan, uMaxY + 0.08 * msSpan, uReveal);
        float msD = vMsObjY - msLine;
        vec3 msGold = vec3(1.0, 0.86, 0.38);
        vec3 msSketch = vec3(1.0, 0.97, 0.88);
        vec3 msCol = msD > 0.0 ? mix(msSketch, gl_FragColor.rgb, 0.12) : gl_FragColor.rgb;
        float msBand = 1.0 - smoothstep(0.0, 0.07 * msSpan, abs(msD));
        gl_FragColor.rgb = mix(msCol, msGold * 1.35, msBand);`
      );
  };
  m.customProgramCacheKey = () => "ms-magic";
  return { material: m, reveal };
}

export const ghostMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  uniforms: { uTime: timeUniform, uColor: { value: new THREE.Color("#8fd0ff") } },
  vertexShader: `
    varying vec3 vN; varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform float uTime; uniform vec3 uColor;
    varying vec3 vN; varying vec3 vV;
    void main() {
      float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
      float pulse = 0.75 + 0.25 * sin(uTime * 2.6);
      float a = (0.1 + rim * 0.6) * pulse;
      gl_FragColor = vec4(mix(uColor, vec3(1.0), rim * 0.6), a);
    }`
});

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let blobTex: THREE.CanvasTexture | null = null;
export function blobTexture(): THREE.CanvasTexture {
  if (!blobTex) {
    blobTex = canvasTexture(64, (g, s) => {
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, "rgba(40,30,60,0.55)");
      grad.addColorStop(0.6, "rgba(40,30,60,0.25)");
      grad.addColorStop(1, "rgba(40,30,60,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    });
  }
  return blobTex;
}

const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
let blobMat: THREE.MeshBasicMaterial | null = null;
/** A soft round shadow under a character or object (no real-time shadows). */
export function blobShadow(radius: number): THREE.Mesh {
  if (!blobMat) blobMat = new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.scale.set(radius * 2, 1, radius * 2);
  m.position.y = 0.012;
  m.renderOrder = 1;
  return m;
}

let sparkTex: THREE.CanvasTexture | null = null;
export function sparkleTexture(): THREE.CanvasTexture {
  if (!sparkTex) {
    sparkTex = canvasTexture(64, (g, s) => {
      const c = s / 2;
      const grad = g.createRadialGradient(c, c, 0, c, c, c);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      g.fillStyle = "rgba(255,255,255,0.95)";
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? c * 0.95 : c * 0.12;
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
    });
  }
  return sparkTex;
}
