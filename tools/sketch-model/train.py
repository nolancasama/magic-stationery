"""Trains the Magic Stationery sketch model and exports it for the browser.

    python tools/sketch-model/train.py <datasetDir> <outDir> [epochs] [samplesPerEpoch]

Input: the uint8 rasters written by build-dataset.ts (32x32, 0 = paper).
Output (outDir):
  sketch-model.bin      int8 weights + JSON header, read by src/recognition/model.ts
  parity.json           a few inputs with reference logits (vitest parity check)
  report.json           accuracy, calibration temperature, per-class recall

The network is deliberately small (about 12 M multiply-adds) so plain
TypeScript runs it in tens of milliseconds on a school Chromebook.
"""
import json
import math
import os
import struct
import sys
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

R = 32
data_dir, out_dir = sys.argv[1], sys.argv[2]
epochs = int(sys.argv[3]) if len(sys.argv) > 3 else 8
samples_arg = int(sys.argv[4]) if len(sys.argv) > 4 else 0
os.makedirs(out_dir, exist_ok=True)
torch.manual_seed(7)
np.random.seed(7)
torch.set_num_threads(8)


def load(prefix):
    x = np.fromfile(f"{data_dir}/{prefix}_x.u8", dtype=np.uint8).reshape(-1, 1, R, R)
    y = np.fromfile(f"{data_dir}/{prefix}_y.u16", dtype=np.uint16).astype(np.int64)
    return torch.from_numpy(x), torch.from_numpy(y)


meta = json.load(open(f"{data_dir}/labels.json", encoding="utf8"))
labels = meta["labels"]
N = len(labels)
xtr, ytr = load("train")
xva, yva = load("val")
xte, yte = load("test")
print(f"train {len(ytr)}  val {len(yva)}  test {len(yte)}  classes {N}", flush=True)


def block(i, o):
    return nn.Sequential(nn.Conv2d(i, o, 3, padding=1, bias=False), nn.BatchNorm2d(o), nn.ReLU(inplace=True), nn.MaxPool2d(2))


class Net(nn.Module):
    def __init__(self, n):
        super().__init__()
        self.features = nn.Sequential(block(1, 32), block(32, 64), block(64, 128), block(128, 128))
        self.drop1 = nn.Dropout(0.25)
        self.fc1 = nn.Linear(128 * 2 * 2, 256)
        self.drop2 = nn.Dropout(0.3)
        self.fc2 = nn.Linear(256, n)

    def forward(self, x):
        x = self.features(x).flatten(1)
        x = F.relu(self.fc1(self.drop1(x)))
        return self.fc2(self.drop2(x))


def augment(x):
    """Random small rotation / scale / shift, applied to a float batch."""
    b = x.shape[0]
    ang = (torch.rand(b) * 2 - 1) * math.radians(9)
    sc = 0.9 + torch.rand(b) * 0.18
    tx = (torch.rand(b) * 2 - 1) * 0.09
    ty = (torch.rand(b) * 2 - 1) * 0.09
    cos, sin = torch.cos(ang) / sc, torch.sin(ang) / sc
    theta = torch.stack([torch.stack([cos, -sin, tx], 1), torch.stack([sin, cos, ty], 1)], 1)
    grid = F.affine_grid(theta, x.shape, align_corners=False)
    return F.grid_sample(x, grid, mode="bilinear", padding_mode="zeros", align_corners=False)


def evaluate(model, x, y, batch=2048):
    model.eval()
    logits = []
    with torch.no_grad():
        for i in range(0, len(y), batch):
            logits.append(model(x[i : i + batch].float() / 255))
    logits = torch.cat(logits)
    top3 = logits.topk(3, 1).indices
    top1 = (top3[:, 0] == y).float().mean().item()
    t3 = (top3 == y[:, None]).any(1).float().mean().item()
    return top1, t3, logits


model = Net(N)
params = sum(p.numel() for p in model.parameters())
print(f"parameters {params}", flush=True)
batch = 512
# On a CPU a full pass over ~1.2 M images takes ~16 min; each "epoch" can sample a subset.
samples = samples_arg if 0 < samples_arg < len(ytr) else len(ytr)
steps_per_epoch = math.ceil(samples / batch)
opt = torch.optim.AdamW(model.parameters(), lr=3e-3, weight_decay=2e-4)
sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=epochs * steps_per_epoch, pct_start=0.15)
loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)
best = (0.0, None)
if epochs == 0:
    # Export only: reuse the checkpoint of an earlier run.
    best = (0.0, torch.load(f"{out_dir}/best.pt"))
    print("loaded checkpoint", flush=True)
for epoch in range(epochs):
    model.train()
    perm = torch.randperm(len(ytr))[:samples]
    t0 = time.time()
    running = 0.0
    for step in range(steps_per_epoch):
        idx = perm[step * batch : (step + 1) * batch]
        xb = augment(xtr[idx].float() / 255)
        loss = loss_fn(model(xb), ytr[idx])
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        sched.step()
        running += loss.item()
        if step % 400 == 0:
            print(f"  epoch {epoch + 1} step {step}/{steps_per_epoch} loss {running / (step + 1):.3f} {time.time() - t0:.0f}s", flush=True)
    top1, top3, _ = evaluate(model, xva, yva)
    print(f"epoch {epoch + 1}: val top1 {top1:.4f} top3 {top3:.4f} ({time.time() - t0:.0f}s)", flush=True)
    if top1 > best[0]:
        best = (top1, {k: v.clone() for k, v in model.state_dict().items()})
        # Checkpoint: an export failure must never lose a long training run.
        os.makedirs(out_dir, exist_ok=True)
        torch.save(best[1], f"{out_dir}/best.pt")

model.load_state_dict(best[1])
model.eval()

# ---- Fold batch norm into the convolutions, quantise to int8 per output channel.
layers = []
for blk in model.features:
    conv, bn = blk[0], blk[1]
    g = bn.weight / torch.sqrt(bn.running_var + bn.eps)
    w = conv.weight * g[:, None, None, None]
    b = bn.bias - bn.running_mean * g
    layers.append(("conv", w.detach(), b.detach()))
layers.append(("fc", model.fc1.weight.detach(), model.fc1.bias.detach()))
layers.append(("fc", model.fc2.weight.detach(), model.fc2.bias.detach()))


def quantise(w):
    flat = w.reshape(w.shape[0], -1)
    scale = flat.abs().max(1).values.clamp(min=1e-8) / 127.0
    q = torch.round(flat / scale[:, None]).clamp(-127, 127).to(torch.int8)
    return q, scale


qlayers = [(kind, *quantise(w), b) for kind, w, b in layers]


def forward_q(x):
    """Reference forward pass with dequantised weights (what the browser computes)."""
    h = x
    last = len(qlayers) - 1
    for i, (kind, q, s, b) in enumerate(qlayers):
        w = q.float() * s[:, None]
        if kind == "conv":
            out_c = w.shape[0]
            in_c = h.shape[1]
            h = F.conv2d(h, w.reshape(out_c, in_c, 3, 3), b, padding=1)
            h = F.max_pool2d(F.relu(h), 2)
        else:
            h = h.flatten(1)
            h = F.linear(h, w, b)
            if i != last:
                h = F.relu(h)
    return h


def eval_q(x, y, batch=2048):
    logits = []
    with torch.no_grad():
        for i in range(0, len(y), batch):
            logits.append(forward_q(x[i : i + batch].float() / 255))
    return torch.cat(logits)


val_logits = eval_q(xva, yva)
best_t, best_nll = 1.0, 1e9
for t in np.arange(0.5, 3.01, 0.05):
    nll = F.cross_entropy(val_logits / float(t), yva).item()
    if nll < best_nll:
        best_t, best_nll = float(t), nll
test_logits = eval_q(xte, yte)
top3 = test_logits.topk(5, 1).indices
q_top1 = (top3[:, 0] == yte).float().mean().item()
q_top3 = (top3[:, :3] == yte[:, None]).any(1).float().mean().item()
q_top5 = (top3 == yte[:, None]).any(1).float().mean().item()
f_top1, f_top3, _ = evaluate(model, xte, yte)
print(f"test float top1 {f_top1:.4f} top3 {f_top3:.4f} | int8 top1 {q_top1:.4f} top3 {q_top3:.4f} top5 {q_top5:.4f} | T {best_t:.2f}", flush=True)

per_class = {}
pred = test_logits.argmax(1)
for c, name in enumerate(labels):
    m = yte == c
    conf = torch.bincount(pred[m], minlength=N)
    conf[c] = 0
    worst = conf.argmax().item()
    per_class[name] = {
        "recall": round((pred[m] == c).float().mean().item(), 4),
        "top3": round((top3[m][:, :3] == c).any(1).float().mean().item(), 4),
        "confusedWith": labels[worst],
    }

# ---- Write the browser model: "MSK1", u32 header length, JSON header, data.
blobs = bytearray()
header_layers = []


def align4():
    while len(blobs) % 4:
        blobs.append(0)


in_c, size = 1, R
for kind, q, s, b in qlayers:
    entry = {"type": kind, "out": int(q.shape[0])}
    if kind == "conv":
        entry.update({"in": in_c, "k": 3, "pool": 2})
        in_c = int(q.shape[0])
        size //= 2
    else:
        entry["in"] = int(q.shape[1])
    entry["w"] = len(blobs)
    blobs.extend(q.numpy().astype(np.int8).tobytes())
    align4()
    entry["s"] = len(blobs)
    blobs.extend(s.numpy().astype("<f4").tobytes())
    entry["b"] = len(blobs)
    blobs.extend(b.numpy().astype("<f4").tobytes())
    header_layers.append(entry)

header = {
    "format": "msk1",
    "raster": R,
    "labels": labels,
    "temperature": round(best_t, 3),
    "layers": header_layers,
    "trained": time.strftime("%Y-%m-%d"),
    "testTop1": round(q_top1, 4),
    "testTop3": round(q_top3, 4),
    "source": os.environ.get("MS_SOURCE", "Quick, Draw! dataset (Google, CC BY 4.0) - recognised drawings, simplified format"),
}
hb = json.dumps(header, separators=(",", ":")).encode("utf8")
hb += b" " * ((4 - len(hb) % 4) % 4)
with open(f"{out_dir}/sketch-model.bin", "wb") as f:
    f.write(b"MSK1")
    f.write(struct.pack("<I", len(hb)))
    f.write(hb)
    f.write(bytes(blobs))

# ---- Parity fixture: inputs (uint8, base64) and reference logits.
import base64

pick = list(range(0, len(yte), max(1, len(yte) // 12)))[:12]
fixture = []
with torch.no_grad():
    ref = forward_q(xte[pick].float() / 255)
for k, i in enumerate(pick):
    fixture.append({
        "label": labels[int(yte[i])],
        "input": base64.b64encode(xte[i].numpy().tobytes()).decode(),
        "logits": [round(float(v), 5) for v in ref[k]],
    })
json.dump(fixture, open(f"{out_dir}/parity.json", "w"))
json.dump({
    "params": params, "epochs": epochs, "valTop1": float(best[0]), "testFloatTop1": f_top1, "testFloatTop3": f_top3,
    "testInt8Top1": q_top1, "testInt8Top3": q_top3, "testInt8Top5": q_top5, "temperature": best_t,
    "perClass": per_class,
}, open(f"{out_dir}/report.json", "w"), indent=1)
print("exported", len(hb) + len(blobs) + 8, "bytes", flush=True)
