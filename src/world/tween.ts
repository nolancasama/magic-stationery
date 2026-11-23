/** Easing and promise-based animation driven by the engine's frame loop. */

export const ease = {
  linear: (t: number) => t,
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  back: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  elastic: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  bounce: (t: number) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
};

type Job = { t: number; dur: number; fn: (k: number, dt: number) => void; resolve: () => void; cancelled: boolean };

const jobs = new Set<Job>();
let speed = 1;

/** Global animation speed (e2e runs set it high). */
export function setAnimSpeed(s: number) {
  speed = s;
}
export function animSpeed(): number {
  return speed;
}

/** Calls fn(progress 0..1) every frame for `dur` seconds. */
export function animate(dur: number, fn: (k: number, dt: number) => void): Promise<void> & { cancel(): void } {
  let job!: Job;
  const p = new Promise<void>((resolve) => {
    job = { t: 0, dur: Math.max(0.0001, dur), fn, resolve, cancelled: false };
    jobs.add(job);
  }) as Promise<void> & { cancel(): void };
  p.cancel = () => {
    if (!jobs.has(job)) return;
    job.cancelled = true;
    jobs.delete(job);
    job.resolve();
  };
  return p;
}

export function wait(seconds: number): Promise<void> {
  return animate(seconds, () => {});
}

export function stepTweens(dt: number) {
  const d = dt * speed;
  for (const job of Array.from(jobs)) {
    job.t += d;
    const k = Math.min(1, job.t / job.dur);
    job.fn(k, d);
    if (k >= 1 && !job.cancelled) {
      jobs.delete(job);
      job.resolve();
    }
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Parabolic arc height for t in 0..1. */
export const arc = (t: number) => 4 * t * (1 - t);
