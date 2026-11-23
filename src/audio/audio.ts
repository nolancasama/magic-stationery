/**
 * All sound is synthesised with Web Audio: no files, nothing to download
 * (school networks block asset hosts). Music lives in music.ts.
 *
 * Buses: sfx and music feed the master. Music ducks under speech and goes
 * silent while the microphone listens (speaker bleed, sibling-game lesson).
 */

type Wave = OscillatorType;

class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfx!: GainNode;
  music!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private musicOn = true;
  private sfxOn = true;
  private ducked = false;
  private silenced = false;
  private scratch: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

  /** Create or resume the context; call from a user gesture. */
  unlock(): void {
    if (typeof window === "undefined") return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfx = this.ctx.createGain();
      this.sfx.gain.value = this.sfxOn ? 0.8 : 0;
      this.sfx.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.gain.value = 0;
      this.music.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyMusicGain();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setMusicOn(on: boolean) {
    this.musicOn = on;
    this.applyMusicGain();
  }

  setSfxOn(on: boolean) {
    this.sfxOn = on;
    if (this.ctx) this.sfx.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  /** Lower the music under speech. */
  duck(on: boolean) {
    this.ducked = on;
    this.applyMusicGain();
  }

  /** Silence music while the microphone is open. */
  silence(on: boolean) {
    this.silenced = on;
    this.applyMusicGain();
    if (this.ctx) this.sfx.gain.setTargetAtTime(on || !this.sfxOn ? 0 : 0.8, this.ctx.currentTime, 0.04);
  }

  private applyMusicGain() {
    if (!this.ctx) return;
    const v = !this.musicOn || this.silenced ? 0 : this.ducked ? 0.22 : 0.55;
    this.music.gain.setTargetAtTime(v, this.ctx.currentTime, 0.12);
  }

  // ---- primitives -------------------------------------------------------

  tone(freq: number, dur: number, opts: { type?: Wave; gain?: number; at?: number; glide?: number; attack?: number; bus?: AudioNode; detune?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = (opts.at ?? ctx.currentTime) + 0.005;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = opts.type ?? "sine";
    o.frequency.setValueAtTime(freq, t);
    if (opts.detune) o.detune.value = opts.detune;
    if (opts.glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.glide), t + dur);
    const peak = opts.gain ?? 0.2;
    const a = opts.attack ?? 0.008;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(opts.bus ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur: number, opts: { freq?: number; q?: number; gain?: number; at?: number; type?: BiquadFilterType; sweep?: number; attack?: number; bus?: AudioNode } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    const t = (opts.at ?? ctx.currentTime) + 0.005;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? "bandpass";
    f.frequency.setValueAtTime(opts.freq ?? 2000, t);
    if (opts.sweep) f.frequency.exponentialRampToValueAtTime(opts.sweep, t + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(opts.bus ?? this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---- effects -------------------------------------------------------------

  click() {
    this.tone(1200, 0.05, { type: "triangle", gain: 0.08 });
  }

  /** A rising glittery arpeggio. */
  sparkle(n = 5, base = 1046) {
    const ctx = this.ctx;
    if (!ctx) return;
    const steps = [0, 4, 7, 12, 16, 19, 24];
    for (let i = 0; i < n; i++) {
      const f = base * Math.pow(2, steps[i % steps.length] / 12);
      this.tone(f, 0.35, { type: "sine", gain: 0.07, at: ctx.currentTime + i * 0.05 });
      this.tone(f * 2, 0.2, { type: "triangle", gain: 0.025, at: ctx.currentTime + i * 0.05 + 0.01 });
    }
  }

  whoosh(dur = 0.6) {
    this.noise(dur, { freq: 400, sweep: 3500, q: 1.2, gain: 0.18, attack: dur * 0.5 });
  }

  pop(pitch = 1) {
    this.tone(520 * pitch, 0.14, { type: "sine", gain: 0.22, glide: 180 * pitch });
    this.noise(0.05, { freq: 3000, q: 0.8, gain: 0.06 });
  }

  /** The transformation: shimmer + rising glide + chord bloom. */
  magic() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(330, 0.9, { type: "triangle", gain: 0.08, glide: 990, attack: 0.3 });
    this.noise(1.0, { freq: 6000, q: 0.7, gain: 0.05, attack: 0.4, type: "highpass" });
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 1.1, { type: "sine", gain: 0.06, at: t + 0.65 + i * 0.03 }));
  }

  bounce(pitch = 1) {
    this.tone(180 * pitch, 0.18, { type: "sine", gain: 0.3, glide: 70 * pitch });
  }

  snip() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.noise(0.04, { freq: 5000, q: 3, gain: 0.25 });
    this.noise(0.05, { freq: 3500, q: 3, gain: 0.2, at: ctx.currentTime + 0.09 });
  }

  flap() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (let i = 0; i < 3; i++) this.noise(0.08, { freq: 900, q: 0.7, gain: 0.12, at: ctx.currentTime + i * 0.12 });
  }

  bell() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [[1318, 0], [1046, 0.18]].forEach(([f, d]) => {
      this.tone(f, 1.0, { type: "sine", gain: 0.12, at: t + d });
      this.tone(f * 2.76, 0.5, { type: "sine", gain: 0.03, at: t + d });
    });
  }

  coin() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(1568, 0.09, { type: "square", gain: 0.05, at: t });
    this.tone(2093, 0.35, { type: "square", gain: 0.05, at: t + 0.08 });
  }

  /** Happy fanfare for a finished task. */
  fanfare() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.28, { type: "triangle", gain: 0.1, at: t + i * 0.09 }));
    this.tone(1318, 0.8, { type: "sine", gain: 0.08, at: t + 0.55 });
  }

  /** Gentle "hmm" for unclear drawings. */
  hmm() {
    this.tone(392, 0.25, { type: "triangle", gain: 0.08, glide: 349 });
  }

  step() {
    this.noise(0.05, { freq: 700, q: 1.5, gain: 0.05 });
  }

  door() {
    this.bell();
    this.noise(0.25, { freq: 300, q: 0.8, gain: 0.08 });
  }

  animal(kind: string) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    switch (kind) {
      case "cat":
        this.tone(700, 0.5, { type: "sawtooth", gain: 0.05, glide: 500, attack: 0.1 });
        this.tone(1400, 0.5, { type: "sine", gain: 0.03, glide: 900, attack: 0.1 });
        break;
      case "dog":
        for (let i = 0; i < 2; i++) {
          this.tone(260, 0.12, { type: "sawtooth", gain: 0.08, glide: 150, at: t + i * 0.22 });
          this.noise(0.1, { freq: 600, q: 1, gain: 0.08, at: t + i * 0.22 });
        }
        break;
      case "bird":
        for (let i = 0; i < 4; i++) this.tone(2400 + i * 200, 0.08, { type: "sine", gain: 0.06, glide: 3200, at: t + i * 0.1 });
        break;
      case "rabbit":
        this.tone(1600, 0.08, { type: "sine", gain: 0.05, glide: 2200 });
        break;
      case "car":
        this.tone(440, 0.15, { type: "square", gain: 0.05, at: t });
        this.tone(440, 0.2, { type: "square", gain: 0.05, at: t + 0.22 });
        break;
      case "fish":
        for (let i = 0; i < 3; i++) this.tone(300 + i * 90, 0.07, { type: "sine", gain: 0.1, glide: 600, at: t + i * 0.15 });
        break;
      default:
        this.sparkle(3, 880);
    }
  }

  /** Continuous pen-on-paper sound; level follows the pointer speed (0..1). */
  scratchLevel(level: number) {
    const ctx = this.ctx;
    if (!ctx || !this.noiseBuf) return;
    if (!this.scratch) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2600;
      filter.Q.value = 0.9;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfx);
      src.start();
      this.scratch = { src, gain, filter };
    }
    const v = Math.min(1, Math.max(0, level));
    this.scratch.gain.gain.setTargetAtTime(v * 0.07, ctx.currentTime, 0.03);
    this.scratch.filter.frequency.setTargetAtTime(1800 + v * 2200, ctx.currentTime, 0.05);
  }

  scratchStop() {
    if (!this.scratch || !this.ctx) return;
    const s = this.scratch;
    this.scratch = null;
    s.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    s.src.stop(this.ctx.currentTime + 0.2);
  }
}

export const audio = new AudioEngine();
