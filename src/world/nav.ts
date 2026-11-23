/**
 * Walkable floor: axis-aligned obstacles on a rectangle, a coarse grid A*
 * and line-of-sight smoothing. Rooms are small, so this is instant.
 */

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class NavMap {
  readonly cell = 0.2;
  private cols: number;
  private rows: number;
  private blocked: Uint8Array;

  constructor(readonly bounds: Rect, readonly obstacles: Rect[], readonly agentRadius = 0.28) {
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
    if (this.clearLine(ax, az, bx, bz)) return [[bx, bz]];
    const [sc, sr] = this.cellOf(ax, az);
    const [gc, gr] = this.cellOf(bx, bz);
    const N = this.cols * this.rows;
    const g = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const open: number[] = [];
    const start = sr * this.cols + sc;
    const goal = gr * this.cols + gc;
    g[start] = 0;
    open.push(start);
    const h = (i: number) => Math.hypot((i % this.cols) - gc, Math.floor(i / this.cols) - gr);
    const closed = new Uint8Array(N);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (g[open[i]] + h(open[i]) < g[open[bi]] + h(open[bi])) bi = i;
      const cur = open.splice(bi, 1)[0];
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
          const cost = g[cur] + (dr && dc ? 1.414 : 1);
          if (cost < g[ni]) {
            g[ni] = cost;
            came[ni] = cur;
            if (!open.includes(ni)) open.push(ni);
          }
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return [[bx, bz]];
    const cells: [number, number][] = [];
    for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.push(this.center(i % this.cols, Math.floor(i / this.cols)));
    cells.reverse();
    if (cells.length) cells[cells.length - 1] = [bx, bz];
    // String-pull: keep only the waypoints needed for clear straight lines.
    const out: [number, number][] = [];
    let fx = ax;
    let fz = az;
    let i = 0;
    while (i < cells.length) {
      let j = cells.length - 1;
      while (j > i && !this.clearLine(fx, fz, cells[j][0], cells[j][1])) j--;
      out.push(cells[j]);
      [fx, fz] = cells[j];
      i = j + 1;
    }
    return out;
  }
}
