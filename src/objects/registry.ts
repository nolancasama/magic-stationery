/**
 * Kind -> model + introduction. Word kinds (pencil, schoolbag ...) get a
 * hand-built model and their own entrance; any other recognised label gets a
 * surprise model if there is one, else the living doodle of the drawing.
 * Never one generic animation for everything (plan §4).
 */
import * as THREE from "three";
import { audio } from "../audio/audio.ts";
import type { Drawing } from "../draw/drawing.ts";
import type { WordId } from "../recognition/vocab.ts";
import type { Effects } from "../world/effects.ts";
import { animate, arc, ease, wait } from "../world/tween.ts";
import { buildDoodle, playDoodle } from "./doodle.ts";
import type { Made } from "./made.ts";
import { buildBook, buildCrayon, buildEraser, buildNotebook, buildPencil, buildRuler, buildSchoolbag, buildScissors } from "./stationery.ts";
import { SURPRISES, type PlayContext } from "./surprises.ts";

export interface IntroContext {
  effects: Effects;
}

export interface WordKind {
  build(tint: THREE.Color | null, seed: number): Made;
  /** Entrance at the slot (root already placed at its anchor). */
  intro(m: Made, ctx: IntroContext): Promise<void>;
  /** Tintable: the drawn crayon colour becomes the object's colour. */
  tintable: boolean;
}

async function squash(m: Made, amount = 0.14, dur = 0.16) {
  await animate(dur, (k) => {
    const s = Math.sin(k * Math.PI) * amount;
    m.inner.scale.set(1 + s, 1 - s, 1 + s);
  });
}

async function dropIn(m: Made, height: number, dur: number, spin = 0) {
  await animate(dur, (k) => {
    m.inner.position.y = height * (1 - ease.bounce(k));
    m.inner.rotation.y = spin * (1 - ease.out(k));
  });
}

export const WORD_KINDS: Record<WordId, WordKind> = {
  pencil: {
    build: (tint) => buildPencil(tint),
    tintable: true,
    async intro(m) {
      await animate(0.85, (k) => {
        m.inner.position.y = arc(k) * 0.55;
        m.inner.rotation.y = ease.inOut(k) * Math.PI * 4;
        m.inner.rotation.z = Math.sin(k * Math.PI) * 0.4;
      });
      audio.bounce(1.6);
      await squash(m, 0.1);
    }
  },
  pen: {
    build: (tint) => buildPencil(tint ?? new THREE.Color("#3f51b5")),
    tintable: true,
    async intro(m) {
      await dropIn(m, 0.4, 0.7, Math.PI * 2);
    }
  },
  eraser: {
    build: (tint) => buildEraser(tint),
    tintable: true,
    async intro(m) {
      for (const h of [0.45, 0.2, 0.08]) {
        await animate(0.18 + h * 0.6, (k) => (m.inner.position.y = arc(k) * h));
        audio.bounce(1.3 + h);
        await squash(m, 0.25 * (h + 0.3), 0.12);
      }
    }
  },
  scissors: {
    build: (tint) => buildScissors(tint),
    tintable: true,
    async intro(m) {
      const a = m.parts.halfA;
      const b = m.parts.halfB;
      for (let i = 0; i < 3; i++) {
        audio.snip();
        await animate(0.26, (k) => {
          const open = Math.sin(k * Math.PI) * 0.45;
          a.rotation.z = open;
          b.rotation.z = -open;
          m.inner.rotation.z = Math.sin(k * Math.PI * 2) * 0.06;
        });
      }
      await animate(0.6, (k) => (m.inner.rotation.z = Math.sin(k * Math.PI * 3) * 0.12 * (1 - k)));
    }
  },
  crayon: {
    build: (tint) => buildCrayon(tint),
    tintable: true,
    async intro(m) {
      await animate(0.5, (k) => {
        m.inner.position.y = 0.5 * (1 - k * k);
        m.inner.rotation.y = k * Math.PI * 3;
      });
      audio.bounce(2);
      await squash(m, 0.12);
    }
  },
  book: {
    build: (tint, seed) => buildBook(tint, seed),
    tintable: true,
    async intro(m) {
      audio.flap();
      // The book flaps like a bird, then lands on its display.
      await animate(1.1, (k) => {
        const flap = Math.sin(k * Math.PI * 7) * 0.9 * Math.sin(k * Math.PI);
        m.parts.front.rotation.y = -Math.abs(flap) * 0.9 - 0.05;
        m.parts.back.rotation.y = Math.abs(flap) * 0.9 + 0.05;
        m.inner.position.y = arc(k) * 0.45;
        m.inner.position.x = Math.sin(k * Math.PI * 2) * 0.08;
      });
      await animate(0.2, (k) => {
        m.parts.front.rotation.y *= 1 - k;
        m.parts.back.rotation.y *= 1 - k;
        m.inner.position.x *= 1 - k;
      });
      audio.bounce(1.4);
    }
  },
  notebook: {
    build: (tint, seed) => buildNotebook(tint, seed),
    tintable: true,
    async intro(m) {
      audio.flap();
      await animate(0.9, (k) => {
        m.inner.position.y = 0.6 * (1 - ease.out(k));
        m.inner.rotation.z = Math.sin(k * Math.PI * 4) * 0.25 * (1 - k);
        m.inner.rotation.x = Math.cos(k * Math.PI * 3) * 0.2 * (1 - k);
      });
      audio.bounce(1.8);
    }
  },
  ruler: {
    build: (tint) => buildRuler(tint),
    tintable: true,
    async intro(m) {
      await animate(0.9, (k) => {
        m.inner.position.y = arc(k) * 0.4;
        m.inner.rotation.y = ease.inOut(k) * Math.PI * 2;
        m.inner.rotation.z = Math.sin(k * Math.PI) * 1.2;
      });
      audio.bounce(1.7);
      await squash(m, 0.06);
    }
  },
  schoolbag: {
    build: (tint) => buildSchoolbag(tint),
    tintable: true,
    async intro(m) {
      for (let i = 0; i < 2; i++) {
        await animate(0.32, (k) => (m.inner.position.y = arc(k) * 0.25));
        audio.bounce(1.1);
        await squash(m, 0.15, 0.13);
      }
      audio.flap();
      await animate(0.35, (k) => (m.parts.flap.rotation.x = -ease.out(k) * 1.6));
      await wait(0.25);
      await animate(0.3, (k) => (m.parts.flap.rotation.x = -1.6 * (1 - ease.in(k))));
      audio.bounce(2.2);
    }
  }
};

export interface SurpriseThing {
  made: Made;
  play(ctx: PlayContext): Promise<void>;
  /** True if it is the child's own sticker (no model). */
  doodle: boolean;
}

/** A recognised label that is not the target: its model if we have one, else the doodle. */
export function buildSurprise(label: string, tint: THREE.Color | null, drawing: Drawing): SurpriseThing {
  const kind = SURPRISES[label];
  if (kind) {
    const m = kind.build(tint);
    return { made: m, play: (ctx) => kind.play(m, ctx), doodle: false };
  }
  const m = buildDoodle(drawing, label);
  return { made: m, play: (ctx) => playDoodle(m, ctx), doodle: true };
}
