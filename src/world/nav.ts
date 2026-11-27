/**
 * Walkable floor: axis-aligned and oval obstacles on a rectangle, a coarse
 * grid A* and line-of-sight smoothing.
 */

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A round obstacle (pools, rocks, tree trunks): centre and radii on the floor. */
export interface Oval {
  x: number;
  z: number;
  rx: number;
  rz: number;
}

export class NavMap {
  readonly cell = 0.2;
  private cols: number;
  private rows: number;
  private blocked: Uint8Array;

  constructor(readonly bounds: Rect, readonly obstacles: Rect[], readonly agentRadius = 0.28, readonly ovals: Oval[] = []) {
    this.cols = Math.ceil((bounds.maxX - bounds.minX) / this.cell);
    this.rows = Math.ceil((bounds.maxZ - bounds.minZ) / this.cell);
    this.blocked = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = bounds.minX + (c + 0.5) * this.cell;
        const z = bounds.minZ + (r + 0.5) * this.cell;
        this.blocked[r * this.cols + c] = this.collides(x, z, agentRadius) ? 1 : 0;
      }
    }
  }

  /** True if a circle at (x, z) overlaps a wall or an obstacle. */
  collides(x: number, z: number, radius: number): boolean {
    const b = this.bounds;
    if (x - radius < b.minX || x + radius > b.maxX || z - radius < b.minZ || z + radius > b.maxZ) return true;
    for (const o of this.obstacles) {
      const cx = Math.max(o.minX, Math.min(x, o.maxX));
      const cz = Math.max(o.minZ, Math.min(z, o.maxZ));
      if ((x - cx) * (x - cx) + (z - cz) * (z - cz) < radius * radius) return true;
    }
    // Ovals grown by the radius (exact for circles, close enough for gentle ovals).
    for (const o of this.ovals) {
      const dx = (x - o.x) / (o.rx + radius);
      const dz = (z - o.z) / (o.rz + radius);
      if (dx * dx + dz * dz < 1) return true;
    }
    return false;
  }

  private cellOf(x: number, z: number): [number, number] {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.bounds.minX) / this.cell)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.bounds.minZ) / this.cell)));
    return [c, r];
  }

  private center(c: number, r: number): [number, number] {
    return [this.bounds.minX + (c + 0.5) * this.cell, this.bounds.minZ + (r + 0.5) * this.cell];
  }

  /** Nearest free cell centre to a point (for targets inside furniture). */
  nearestFree(x: number, z: number): [number, number] {
    const [c0, r0] = this.cellOf(x, z);
    if (!this.blocked[r0 * this.cols + c0]) return [x, z];
    for (let rad = 1; rad < 30; rad++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let r = r0 - rad; r <= r0 + rad; r++) {
        for (let c = c0 - rad; c <= c0 + rad; c++) {
          if (r < 0 || c < 0 || r >= this.rows || c >= this.cols || this.blocked[r * this.cols + c]) continue;
          const [px, pz] = this.center(c, r);
          const d = (px - x) ** 2 + (pz - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = [px, pz];
          }
        }
      }
      if (best) return best;
    }
    return [x, z];
  }

  clearLine(ax: number, az: number, bx: number, bz: number, radius = this.agentRadius * 0.9): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    const steps = Math.max(1, Math.ceil(d / (this.cell * 0.5)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.collides(ax + (bx - ax) * t, az + (bz - az) * t, radius)) return false;
    }
    return true;
  }

  /** Waypoints from a to b (excluding a). */
  route(ax: number, az: number, bx: number, bz: number): [number, number][] {
    [bx, bz] = this.nearestFree(bx, bz);
    const radius = this.collides(ax, az, this.agentRadius) || this.collides(bx, bz, this.agentRadius) ? this.agentRadius * 0.9 : this.agentRadius;
    if (this.clearLine(ax, az, bx, bz, radius)) return [[bx, bz]];
    const [sc, sr] = this.cellOf(ax, az);
    const [gc, gr] = this.cellOf(bx, bz);
    const count = this.cols * this.rows;
    const g = new Float64Array(count).fill(Infinity);
    const came = new Int32Array(count).fill(-1);
    const open: number[] = [];
    const heapIndex = new Int32Array(count).fill(-1);
    const scores = new Float64Array(count);
    const closed = new Uint8Array(count);
    const start = sr * this.cols + sc;
    const goal = gr * this.cols + gc;
    const diagonal = Math.SQRT2;
    const h = (col: number, row: number) => {
      const dx = Math.abs(col - gc);
      const dz = Math.abs(row - gr);
      return Math.max(dx, dz) + (diagonal - 1) * Math.min(dx, dz);
    };
    const swap = (first: number, second: number) => {
      const node = open[first];
      open[first] = open[second];
      open[second] = node;
      heapIndex[open[first]] = first;
      heapIndex[node] = second;
    };
    const offer = (node: number, score: number) => {
      scores[node] = score;
      let index = heapIndex[node];
      if (index < 0) {
        index = open.length;
        open.push(node);
        heapIndex[node] = index;
      }
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (scores[open[parent]] <= score) break;
        swap(parent, index);
        index = parent;
      }
    };
    const take = () => {
      const node = open[0];
      const last = open.pop()!;
      heapIndex[node] = -1;
      if (!open.length) return node;
      open[0] = last;
      heapIndex[last] = 0;
      let index = 0;
      while (index * 2 + 1 < open.length) {
        let child = index * 2 + 1;
        if (child + 1 < open.length && scores[open[child + 1]] < scores[open[child]]) child++;
        if (scores[last] <= scores[open[child]]) break;
        swap(index, child);
        index = child;
      }
      return node;
    };
    g[start] = 0;
    offer(start, h(sc, sr));
    while (open.length) {
      const cur = take();
      if (cur === goal) break;
      closed[cur] = 1;
      const cc = cur % this.cols;
      const cr = Math.floor(cur / this.cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
          const ni = nr * this.cols + nc;
          if (closed[ni] || (this.blocked[ni] && ni !== goal)) continue;
          if (dr && dc && (this.blocked[cr * this.cols + nc] || this.blocked[nr * this.cols + cc])) continue;
          const cost = g[cur] + (dr && dc ? diagonal : 1);
          if (cost < g[ni]) {
            g[ni] = cost;
            came[ni] = cur;
            offer(ni, cost + h(nc, nr));
          }
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return [[bx, bz]];
    const cells: [number, number][] = [];
    for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.push(this.center(i % this.cols, Math.floor(i / this.cols)));
    cells.reverse();
    if (cells.length) cells[cells.length - 1] = [bx, bz];
    const out: [number, number][] = [];
    let fx = ax;
    let fz = az;
    const visible = (index: number) => this.clearLine(fx, fz, ...cells[index], radius);
    for (let first = 0; first < cells.length;) {
      let last = first;
      let step = 1;
      let probe = Math.min(last + step, cells.length - 1);
      while (probe > last && visible(probe)) {
        last = probe;
        step *= 2;
        probe = Math.min(last + step, cells.length - 1);
      }
      while (probe - last > 1) {
        const middle = (last + probe) >> 1;
        if (visible(middle)) last = middle;
        else probe = middle;
      }
      out.push(cells[last]);
      [fx, fz] = cells[last];
      first = last + 1;
    }
    return out;
  }
}
