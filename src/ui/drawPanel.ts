/**
 * The magic pen's sketchbook. Freehand drawing with mouse, touchpad or touch;
 * Undo / Clear / Hint / Finish; crayon colours; live guesses from the pen;
 * the help ladder (example picture, then a dotted stencil to trace).
 *
 * Touchpad pen mode (optional): click to put the pen down, move to draw,
 * click again to lift it - for children who cannot hold the button and move.
 */
import { audio } from "../audio/audio.ts";
import { CRAYONS, INK, renderDrawing, type Crayon, type Drawing, type DrawnStroke } from "../draw/drawing.ts";
import type { Point } from "../recognition/strokes.ts";
import { tts } from "../speech/tts.ts";
import { PEN_VOICE } from "../game/cast.ts";
import { h } from "./dom.ts";

export interface DrawSpec {
  /** "pencil" — shown big. */
  word: string;
  /** "a pencil" for speech. */
  wordWithArticle: string;
  ja: string;
  /** Help level to start at: 0 none, 1 example, 2 stencil. */
  help: number;
  example: Drawing | null;
  /** Star the crayon the customer asked for (after a wrong colour). */
  starColor?: string | null;
  /** Start with this crayon selected. */
  color?: string;
  /** A colour the drawing should have ("red" crayon): shown in the title. */
  colorWord?: { en: string; ja: string; hex: string } | null;
  touchpadPen: boolean;
  firstTime?: boolean;
}

export interface Guess {
  text: string;
  isTarget: boolean;
}

export type DrawEvent = { kind: "finish"; drawing: Drawing; rect: DOMRect } | { kind: "cancel" };

export interface DrawDeps {
  guess(d: Drawing): Guess | null;
  japanese(): boolean;
  onTouchpadToggle(on: boolean): void;
}

const LINE = 9;

function crayonSvg(hex: string): string {
  return `<svg viewBox="0 0 40 70" xmlns="http://www.w3.org/2000/svg"><path d="M8 22 L20 2 L32 22Z" fill="${hex}"/><rect x="8" y="20" width="24" height="48" rx="4" fill="${hex}"/><rect x="8" y="30" width="24" height="26" fill="#fff" opacity=".45"/><rect x="8" y="33" width="24" height="3" fill="#000" opacity=".2"/><rect x="8" y="50" width="24" height="3" fill="#000" opacity=".2"/></svg>`;
}

export class DrawPanel {
  readonly veil: HTMLDivElement;
  private panel: HTMLDivElement;
  private title: HTMLDivElement;
  private titleJa: HTMLDivElement;
  private wrap: HTMLDivElement;
  private ink: HTMLCanvasElement;
  private stencil: HTMLCanvasElement;
  private bubble: HTMLDivElement;
  private padHint: HTMLDivElement;
  private example: HTMLDivElement;
  private exampleCanvas: HTMLCanvasElement;
  private finishBtn: HTMLButtonElement;
  private padBtn: HTMLButtonElement;
  private palette: HTMLDivElement;
  private colorName: HTMLDivElement;
  private pop: HTMLDivElement;
  private strokes: DrawnStroke[] = [];
  private current: DrawnStroke | null = null;
  private color: Crayon = INK;
  private spec: DrawSpec | null = null;
  private help = 0;
  private resolve: ((e: DrawEvent) => void) | null = null;
  private dpr = 1;
  private guessTimer = 0;
  private lastGuessText = "";
  private lastSpoken = 0;
  private penDown = false;
  private pointerId = -1;
  private lastMove = { x: 0, y: 0, t: 0 };

  constructor(parent: HTMLElement, private deps: DrawDeps) {
    this.title = h("div", { class: "title" });
    this.titleJa = h("div", { class: "ja" });
    const listen = h("button", { class: "round-btn", "aria-label": "Listen" }, "🔊");
    listen.addEventListener("click", () => {
      audio.click();
      this.speakPrompt();
    });
    const close = h("button", { class: "round-btn close", "aria-label": "Close", "data-test": "draw-close" }, "✕");
    close.addEventListener("click", () => {
      audio.click();
      this.emit({ kind: "cancel" });
    });
    this.stencil = h("canvas", { class: "stencil" });
    this.ink = h("canvas", { class: "ink", "data-test": "draw-canvas" });
    this.bubble = h("div", { class: "pen-bubble" });
    this.padHint = h("div", { class: "pad-hint" });
    this.wrap = h("div", { class: "paper-wrap pen-cursor" }, h("div", { class: "paper-lines" }), this.stencil, this.ink, this.bubble, this.padHint);
    const tool = (ico: string, en: string, ja: string, test: string, on: () => void, extra = "") => {
      const b = h("button", { class: `tool ${extra}`, "data-test": test }, h("span", { class: "ico" }, ico), h("span", {}, en, h("span", { class: "ja" }, ja)));
      b.addEventListener("click", () => {
        audio.click();
        on();
      });
      return b;
    };
    this.exampleCanvas = h("canvas", { width: "300", height: "300" });
    this.example = h("div", { class: "example hidden" }, this.exampleCanvas, h("div", { class: "cap" }, "Like this! ", h("span", { class: "ja" }, "こんなふうに")));
    this.finishBtn = tool("✨", "Finish", "できた！", "draw-finish", () => this.finish(), "finish");
    this.padBtn = tool("🖱️", "Click pen", "クリックで かく", "draw-pad", () => this.setTouchpad(!this.padMode, true), "toggle");
    const side = h(
      "div",
      { class: "draw-side" },
      h("div", { class: "tool-row" }, tool("↶", "Undo", "もどす", "draw-undo", () => this.undo()), tool("🗑️", "Clear", "けす", "draw-clear", () => this.clear())),
      tool("💡", "Hint", "ヒント", "draw-hint", () => this.hint()),
      this.padBtn,
      this.example,
      this.finishBtn
    );
    this.palette = h("div", { class: "palette" });
    this.colorName = h("div", { class: "color-name" });
    for (const c of CRAYONS) {
      const b = h("button", { class: "crayon-btn", "data-color": c.id, title: c.en, "aria-label": c.en, html: crayonSvg(c.hex) });
      b.addEventListener("click", () => this.pick(c, true));
      this.palette.appendChild(b);
    }
    this.palette.appendChild(this.colorName);
    this.pop = h("div", { class: "word-pop" });
    this.panel = h(
      "div",
      { class: "draw-panel" },
      h("div", { class: "draw-head" }, h("div", {}, this.title, this.titleJa), listen, close),
      this.wrap,
      side,
      this.palette,
      this.pop
    );
    this.veil = h("div", { class: "draw-veil hidden" }, this.panel);
    parent.appendChild(this.veil);
    this.bindPointer();
    window.addEventListener("resize", () => this.fit());
  }

  private padMode = false;

  get isOpen(): boolean {
    return !this.veil.classList.contains("hidden");
  }

  open(spec: DrawSpec) {
    this.spec = spec;
    this.strokes = [];
    this.current = null;
    this.penDown = false;
    this.lastGuessText = "";
    this.panel.classList.remove("celebrate", "leaving");
    this.pop.classList.remove("show");
    const cw = spec.colorWord;
    this.title.innerHTML = cw
      ? `Draw a <span style="color:${cw.hex}">${cw.en}</span> <span class="word">${spec.word}</span>!`
      : `Draw ${spec.wordWithArticle.replace(spec.word, `<span class="word">${spec.word}</span>`)}!`;
    this.titleJa.textContent = this.deps.japanese() ? (cw ? `${cw.ja}の ${spec.ja}を かこう！` : `「${spec.ja}」を かこう！`) : "";
    this.veil.classList.remove("hidden");
    this.fit();
    this.pick(CRAYONS.find((c) => c.hex === spec.color) ?? this.color, false);
    this.palette.querySelectorAll(".crayon-btn").forEach((b) => b.classList.toggle("want", !!spec.starColor && (b as HTMLElement).dataset.color === CRAYONS.find((c) => c.hex === spec.starColor)?.id));
    this.help = 0;
    this.setHelp(spec.help);
    this.setTouchpad(spec.touchpadPen, false);
    this.setBubble(spec.firstTime ? "Draw with your mouse or finger!" : `Draw ${spec.wordWithArticle}!`, spec.firstTime ? "マウスや ゆびで かいてね。できたら ✨ をおしてね！" : "");
    this.finishBtn.classList.remove("ready");
    this.redraw();
    this.speakPrompt();
  }

  private speakPrompt() {
    const spec = this.spec;
    if (!spec) return;
    const text = spec.colorWord ? `Draw a ${spec.colorWord.en} ${spec.word}!` : `Draw ${spec.wordWithArticle}!`;
    void tts.speak(text, PEN_VOICE);
  }

  /** Wait for Finish or Close. */
  next(): Promise<DrawEvent> {
    return new Promise((resolve) => (this.resolve = resolve));
  }

  private emit(e: DrawEvent) {
    const r = this.resolve;
    this.resolve = null;
    audio.scratchStop();
    r?.(e);
  }

  get canvasRect(): DOMRect {
    return this.ink.getBoundingClientRect();
  }

  get drawing(): Drawing {
    return { strokes: this.strokes.map((s) => ({ color: s.color, points: s.points.slice() })) };
  }

  private fit() {
    if (!this.isOpen) return;
    const r = this.wrap.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.ink, this.stencil]) {
      c.width = Math.max(1, Math.round(r.width * this.dpr));
      c.height = Math.max(1, Math.round(r.height * this.dpr));
    }
    this.redraw();
    this.drawStencil();
  }

  // ------------------------------------------------------------ input
  private pos(e: PointerEvent): Point {
    const r = this.ink.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private bindPointer() {
    const start = (p: Point) => {
      this.current = { color: this.color.hex, points: [p] };
      this.strokes.push(this.current);
      this.dot(p);
      this.lastMove = { x: p[0], y: p[1], t: performance.now() };
    };
    const end = () => {
      if (!this.current) return;
      this.current = null;
      audio.scratchStop();
      this.scheduleGuess(250, true);
    };
    this.ink.addEventListener("pointerdown", (e) => {
      if (!this.resolve) return;
      e.preventDefault();
      audio.unlock();
      // A second finger (or a resting palm) never hijacks the line being drawn.
      if (this.current && !this.padMode && e.pointerId !== this.pointerId) return;
      this.pointerId = e.pointerId;
      const p = this.pos(e);
      if (this.padMode) {
        this.penDown = !this.penDown;
        if (this.penDown) start(p);
        else end();
        this.updatePadHint();
        return;
      }
      this.ink.setPointerCapture(e.pointerId);
      start(p);
    });
    this.ink.addEventListener("pointermove", (e) => {
      if (!this.current || e.pointerId !== this.pointerId) return;
      const p = this.pos(e);
      const pts = this.current.points;
      const last = pts[pts.length - 1];
      const d = Math.hypot(p[0] - last[0], p[1] - last[1]);
      if (d < 1.5) return;
      pts.push(p);
      this.segment(last, p, this.current.color);
      const now = performance.now();
      const speed = Math.hypot(p[0] - this.lastMove.x, p[1] - this.lastMove.y) / Math.max(1, now - this.lastMove.t);
      this.lastMove = { x: p[0], y: p[1], t: now };
      audio.scratchLevel(Math.min(1, speed * 0.8));
      this.scheduleGuess(500, false);
    });
    const up = (e: PointerEvent) => {
      if (!this.padMode && e.pointerId === this.pointerId) end();
    };
    this.ink.addEventListener("pointerup", up);
    this.ink.addEventListener("pointercancel", up);
  }

  private setTouchpad(on: boolean, user: boolean) {
    this.padMode = on;
    if (!on && this.penDown) {
      this.penDown = false;
      this.current = null;
    }
    this.padBtn.classList.toggle("on", on);
    this.updatePadHint();
    if (user) this.deps.onTouchpadToggle(on);
  }

  private updatePadHint() {
    const ja = this.deps.japanese();
    if (!this.padMode) this.padHint.innerHTML = "";
    else if (this.penDown) this.padHint.innerHTML = `✏️ Pen down — click to lift${ja ? ' <span class="ja">クリックで ペンを はなす</span>' : ""}`;
    else this.padHint.innerHTML = `Click to start drawing${ja ? ' <span class="ja">クリックで かきはじめる</span>' : ""}`;
  }

  // ------------------------------------------------------------ painting
  private ctx(): CanvasRenderingContext2D {
    const g = this.ink.getContext("2d") as CanvasRenderingContext2D;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = LINE;
    return g;
  }

  private segment(a: Point, b: Point, color: string) {
    const g = this.ctx();
    g.strokeStyle = color;
    g.beginPath();
    g.moveTo(a[0], a[1]);
    g.lineTo(b[0], b[1]);
    g.stroke();
  }

  private dot(p: Point) {
    const g = this.ctx();
    g.fillStyle = this.color.hex;
    g.beginPath();
    g.arc(p[0], p[1], LINE / 2, 0, Math.PI * 2);
    g.fill();
  }

  private redraw() {
    const g = this.ctx();
    g.clearRect(0, 0, this.ink.width, this.ink.height);
    for (const s of this.strokes) {
      g.strokeStyle = s.color;
      g.fillStyle = s.color;
      if (s.points.length === 1) {
        g.beginPath();
        g.arc(s.points[0][0], s.points[0][1], LINE / 2, 0, Math.PI * 2);
        g.fill();
        continue;
      }
      g.beginPath();
      s.points.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.stroke();
    }
  }

  private drawStencil() {
    const g = this.stencil.getContext("2d") as CanvasRenderingContext2D;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.stencil.width, this.stencil.height);
    const ex = this.spec?.example;
    if (this.help < 2 || !ex) return;
    const W = this.stencil.width;
    const H = this.stencil.height;
    const size = Math.min(W, H) * 0.72;
    const img = renderDrawing(ex, { size: Math.round(size), color: "#b9a6e8", lineWidth: Math.max(4, size * 0.018), pad: size * 0.04 });
    g.globalAlpha = 0.55;
    g.setLineDash([]);
    g.drawImage(img, (W - size) / 2, (H - size) / 2);
    g.globalAlpha = 1;
  }

  private undo() {
    this.strokes.pop();
    this.current = null;
    this.penDown = false;
    this.updatePadHint();
    this.redraw();
    this.scheduleGuess(100, false);
  }

  private clear() {
    this.strokes = [];
    this.current = null;
    this.penDown = false;
    this.updatePadHint();
    this.redraw();
    this.finishBtn.classList.remove("ready");
    this.setBubble("Let's draw!", "");
  }

  private pick(c: Crayon, user: boolean) {
    this.color = c;
    this.palette.querySelectorAll(".crayon-btn").forEach((b) => b.classList.toggle("sel", (b as HTMLElement).dataset.color === c.id));
    this.colorName.innerHTML = `${c.en}${this.deps.japanese() ? `<span class="ja">${c.ja}</span>` : ""}`;
    if (user) {
      audio.click();
      if (c.id !== "ink") void tts.speak(c.en, PEN_VOICE);
    }
  }

  // ------------------------------------------------------------ help & feedback
  setHelp(level: number) {
    this.help = Math.max(this.help, Math.min(2, level));
    const ex = this.spec?.example;
    this.example.classList.toggle("hidden", this.help < 1 || !ex);
    if (ex && this.help >= 1) renderDrawing(ex, { size: 300, color: "#5a4fcf", lineWidth: 9, pad: 28 }, this.exampleCanvas);
    this.drawStencil();
  }

  private hint() {
    if (!this.spec) return;
    this.setHelp(this.help + 1);
    void tts.speak(`${this.spec.wordWithArticle}!`, PEN_VOICE);
    if (this.help >= 2) this.setBubble("Trace the dotted lines!", "うすい せんを なぞってね！");
    else this.setBubble(`Like this! ${this.spec.word}!`, `${this.spec.ja}`);
  }

  setBubble(en: string, ja: string, tone: "" | "yes" = "") {
    const show = this.deps.japanese() && ja;
    this.bubble.className = "pen-bubble" + (tone ? " " + tone : "");
    this.bubble.innerHTML = `<svg viewBox="0 0 40 40"><g transform="rotate(35 20 20)"><rect x="16" y="4" width="8" height="26" rx="3" fill="#3f51b5"/><rect x="16" y="8" width="8" height="3" fill="#f4c542"/><path d="M16 30 L24 30 L20 37Z" fill="#f4c542"/></g></svg><span>${en}${show ? `<span class="ja">${ja}</span>` : ""}</span>`;
    this.bubble.classList.remove("pop");
    void this.bubble.offsetWidth;
    this.bubble.classList.add("pop");
  }

  feedback(en: string, ja: string) {
    audio.hmm();
    this.setBubble(en, ja);
    this.panel.animate([{ transform: "translateX(0)" }, { transform: "translateX(-8px)" }, { transform: "translateX(8px)" }, { transform: "translateX(0)" }], { duration: 320 });
  }

  private scheduleGuess(delay: number, pause: boolean) {
    window.clearTimeout(this.guessTimer);
    this.guessTimer = window.setTimeout(() => this.runGuess(pause), delay);
  }

  private runGuess(pause: boolean) {
    if (!this.spec || !this.strokes.length) return;
    const g = this.deps.guess(this.drawing);
    this.finishBtn.classList.toggle("ready", !!g?.isTarget);
    if (!g) return;
    const text = g.isTarget ? `I know! It's ${g.text}!` : `Is it ${g.text}?`;
    if (text === this.lastGuessText) return;
    this.lastGuessText = text;
    this.setBubble(text, g.isTarget ? "わかった！ ✨ を おしてね！" : "", g.isTarget ? "yes" : "");
    const now = performance.now();
    if (pause && now - this.lastSpoken > 2500) {
      this.lastSpoken = now;
      void tts.speak(text, PEN_VOICE);
    }
  }

  private finish() {
    if (!this.resolve) return;
    if (!this.strokes.length) {
      this.feedback("Draw something first!", "まず なにか かいてね！");
      return;
    }
    window.clearTimeout(this.guessTimer);
    this.emit({ kind: "finish", drawing: this.drawing, rect: this.canvasRect });
  }

  /** Accepted: the lines glow and the word pops. */
  async celebrate(word: string): Promise<void> {
    this.panel.classList.add("celebrate");
    this.pop.textContent = `${word}!`;
    this.pop.classList.add("show");
    this.setBubble(`Yes! ${word}!`, "やったね！", "yes");
    audio.sparkle(7);
    await new Promise((r) => window.setTimeout(r, 950));
  }

  async leave(): Promise<void> {
    this.panel.classList.add("leaving");
    await new Promise((r) => window.setTimeout(r, 330));
    this.veil.classList.add("hidden");
    this.panel.classList.remove("leaving", "celebrate");
    this.pop.classList.remove("show");
  }

  hide() {
    this.veil.classList.add("hidden");
    this.resolve = null;
  }

  /** Test hook: replace the drawing with these strokes (canvas pixels). */
  inject(d: Drawing) {
    this.strokes = d.strokes.map((s) => ({ color: s.color, points: s.points.slice() }));
    this.redraw();
    this.scheduleGuess(10, true);
  }

  /** Test hook: press Finish. */
  pressFinish() {
    this.finish();
  }
}
