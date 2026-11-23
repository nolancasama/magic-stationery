/**
 * The sketch model: a small CNN trained on the Quick, Draw! dataset by
 * tools/sketch-model/train.py, run here in plain TypeScript (no ML library,
 * no GPU: the GPU stays free for the 3D scene).
 *
 * File format "MSK1": 4-byte magic, u32 header length, JSON header, then int8
 * weights with float32 per-output-channel scales and float32 biases.
 * Batch norm is already folded into the convolutions.
 */

export interface ModelLayerInfo {
  type: "conv" | "fc";
  in: number;
  out: number;
  k?: number;
  pool?: number;
  /** Byte offsets into the data block. */
  w: number;
  s: number;
  b: number;
}

export interface ModelHeader {
  format: "msk1";
  raster: number;
  labels: string[];
  temperature: number;
  layers: ModelLayerInfo[];
  trained?: string;
  testTop1?: number;
  testTop3?: number;
  source?: string;
}

interface Layer {
  type: "conv" | "fc";
  in: number;
  out: number;
  weights: Float32Array;
  bias: Float32Array;
}

export interface SketchModel {
  header: ModelHeader;
  labels: string[];
  layers: Layer[];
}

export function parseModel(buf: ArrayBuffer): SketchModel {
  const bytes = new Uint8Array(buf);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== "MSK1") throw new Error("not a sketch model");
  const view = new DataView(buf);
  const headerLen = view.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + headerLen))) as ModelHeader;
  const base = 8 + headerLen;
  const layers: Layer[] = header.layers.map((info) => {
    const per = info.type === "conv" ? info.in * (info.k ?? 3) * (info.k ?? 3) : info.in;
    const q = new Int8Array(buf, base + info.w, info.out * per);
    const scales = new Float32Array(buf.slice(base + info.s, base + info.s + info.out * 4));
    const bias = new Float32Array(buf.slice(base + info.b, base + info.b + info.out * 4));
    const weights = new Float32Array(info.out * per);
    for (let o = 0; o < info.out; o++) {
      const sc = scales[o];
      const off = o * per;
      for (let i = 0; i < per; i++) weights[off + i] = q[off + i] * sc;
    }
    return { type: info.type, in: info.in, out: info.out, weights, bias };
  });
  return { header, labels: header.labels, layers };
}

/** 3x3 convolution (padding 1) + ReLU + 2x2 max pool. Input/output are CHW. */
function convReluPool(input: Float32Array, channels: number, size: number, layer: Layer): Float32Array {
  const P = size + 2;
  const pad = new Float32Array(channels * P * P);
  for (let c = 0; c < channels; c++) {
    for (let y = 0; y < size; y++) {
      pad.set(input.subarray(c * size * size + y * size, c * size * size + (y + 1) * size), c * P * P + (y + 1) * P + 1);
    }
  }
  const half = size >> 1;
  const out = new Float32Array(layer.out * half * half);
  const acc = new Float32Array(size * size);
  const W = layer.weights;
  for (let o = 0; o < layer.out; o++) {
    acc.fill(layer.bias[o]);
    for (let c = 0; c < channels; c++) {
      const wb = (o * channels + c) * 9;
      const cb = c * P * P;
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          const w = W[wb + ky * 3 + kx];
          if (w === 0) continue;
          const src = cb + ky * P + kx;
          for (let y = 0; y < size; y++) {
            const row = src + y * P;
            const dst = y * size;
            for (let x = 0; x < size; x++) acc[dst + x] += w * pad[row + x];
          }
        }
      }
    }
    const ob = o * half * half;
    for (let y = 0; y < half; y++) {
      const r0 = 2 * y * size;
      const r1 = r0 + size;
      for (let x = 0; x < half; x++) {
        const a = acc[r0 + 2 * x];
        const b = acc[r0 + 2 * x + 1];
        const c = acc[r1 + 2 * x];
        const d = acc[r1 + 2 * x + 1];
        let m = a > b ? a : b;
        if (c > m) m = c;
        if (d > m) m = d;
        out[ob + y * half + x] = m > 0 ? m : 0;
      }
    }
  }
  return out;
}

function dense(input: Float32Array, layer: Layer, relu: boolean): Float32Array {
  const out = new Float32Array(layer.out);
  const W = layer.weights;
  const n = layer.in;
  for (let o = 0; o < layer.out; o++) {
    let s = layer.bias[o];
    const off = o * n;
    for (let i = 0; i < n; i++) s += W[off + i] * input[i];
    out[o] = relu && s < 0 ? 0 : s;
  }
  return out;
}

/** Raw logits for one RASTER x RASTER input (0 = paper, 1 = ink). */
export function logits(model: SketchModel, input: Float32Array): Float32Array {
  let h = input;
  let channels = 1;
  let size = model.header.raster;
  const last = model.layers.length - 1;
  model.layers.forEach((layer, i) => {
    if (layer.type === "conv") {
      h = convReluPool(h, channels, size, layer);
      channels = layer.out;
      size >>= 1;
    } else {
      h = dense(h, layer, i !== last);
    }
  });
  return h;
}

/** Calibrated class probabilities. */
export function softmax(z: Float32Array, temperature = 1): Float32Array {
  let max = -Infinity;
  for (let i = 0; i < z.length; i++) if (z[i] > max) max = z[i];
  const out = new Float32Array(z.length);
  let sum = 0;
  for (let i = 0; i < z.length; i++) {
    out[i] = Math.exp((z[i] - max) / temperature);
    sum += out[i];
  }
  for (let i = 0; i < z.length; i++) out[i] /= sum;
  return out;
}
