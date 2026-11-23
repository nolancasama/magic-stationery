/**
 * Adaptive music. An erased place plays a lonely music box; as it is restored,
 * bass, melody and percussion join, so the world audibly comes back to life.
 * Everything is scheduled with a small look-ahead on the Web Audio clock.
 */
import { audio } from "./audio.ts";

const BPM = 96;
const BEAT = 60 / BPM;
// C - Am - F - G, two bars each (semitones from C4).
const CHORDS = [
  [0, 4, 7],
  [-3, 0, 4],
  [-7, -3, 0],
  [-5, -1, 2]
];
const ROOTS = [-12, -15, -19, -17];
// A cheerful 8-bar phrase (beats are eighths: [semitone, length in eighths]); null = rest.
const MELODY: [number | null, number][] = [
  [7, 2], [9, 1], [7, 1], [4, 2], [0, 2],
  [2, 2], [4, 1], [2, 1], [0, 4],
  [9, 2], [12, 1], [9, 1], [7, 2], [4, 2],
  [5, 2], [4, 1], [2, 1], [4, 4],
  [7, 2], [9, 1], [7, 1], [4, 2], [12, 2],
  [11, 2], [9, 1], [7, 1], [9, 4],
  [7, 2], [4, 1], [2, 1], [0, 2], [2, 2],
  [4, 2], [2, 2], [0, 4]
];
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

const freq = (semi: number) => 261.63 * Math.pow(2, semi / 12);

class Music {
  private level = 0;
  private timer = 0;
  private nextTime = 0;
  private eighth = 0;
  private melodyIndex = 0;
  private melodyWait = 0;
  private playing = false;

  /** 0 = erased, 1 = fully restored. */
  setLevel(v: number) {
    this.level = Math.max(0, Math.min(1, v));
  }

  start() {
    if (this.playing || !audio.ctx) return;
    this.playing = true;
    this.nextTime = audio.now + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 90);
  }

  stop() {
    this.playing = false;
    window.clearInterval(this.timer);
  }

  private schedule() {
    const ctx = audio.ctx;
    if (!ctx) return;
    while (this.nextTime < ctx.currentTime + 0.3) {
      this.play(this.eighth, this.nextTime);
      this.nextTime += BEAT / 2;
      this.eighth = (this.eighth + 1) % 64;
    }
  }

  private play(e: number, t: number) {
    const bus = audio.music;
    const bar = Math.floor(e / 8);
    const chord = CHORDS[Math.floor(bar / 2) % 4];
    const lv = this.level;
    // Pad: a soft chord at the start of every two bars.
    if (e % 16 === 0) {
      chord.forEach((s) => {
        audio.tone(freq(s), BEAT * 8, { type: "triangle", gain: 0.035, at: t, attack: 0.6, bus });
        audio.tone(freq(s), BEAT * 8, { type: "sine", gain: 0.02, at: t, attack: 0.6, bus, detune: 7 });
      });
    }
    // Music box: sparse when erased, busier when restored.
    const density = 0.18 + lv * 0.25;
    if (e % 2 === 0 && Math.random() < density) {
      const s = PENTA[Math.floor(Math.random() * PENTA.length)] + 12;
      audio.tone(freq(s), 0.9, { type: "sine", gain: 0.035, at: t, bus });
      audio.tone(freq(s) * 3, 0.3, { type: "sine", gain: 0.008, at: t, bus });
    }
    if (lv >= 0.25 && e % 4 === 0) {
      const root = ROOTS[Math.floor(bar / 2) % 4];
      audio.tone(freq(root), 0.35, { type: "sine", gain: 0.09, at: t, bus });
    }
    if (lv >= 0.5) {
      if (this.melodyWait <= 0) {
        const [s, len] = MELODY[this.melodyIndex];
        if (s !== null) {
          audio.tone(freq(s + 12), (BEAT / 2) * len * 0.9, { type: "triangle", gain: 0.05, at: t, bus });
          audio.tone(freq(s + 24), 0.15, { type: "sine", gain: 0.012, at: t, bus });
        }
        this.melodyWait = len;
        this.melodyIndex = (this.melodyIndex + 1) % MELODY.length;
      }
      this.melodyWait--;
    }
    if (lv >= 0.75) {
      audio.noise(0.04, { freq: 8000, q: 0.7, gain: e % 2 === 0 ? 0.03 : 0.015, at: t, type: "highpass", bus });
      if (e % 8 === 4) audio.tone(900, 0.06, { type: "square", gain: 0.02, at: t, bus });
    }
    if (lv >= 1 && e % 32 === 28) {
      [0, 4, 7, 12].forEach((s, i) => audio.tone(freq(s + 24), 0.3, { type: "sine", gain: 0.02, at: t + i * 0.06, bus }));
    }
  }
}

export const music = new Music();
