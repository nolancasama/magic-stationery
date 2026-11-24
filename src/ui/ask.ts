/**
 * The speaking prompt. Everything the student says goes through ask():
 *  - command: one target sentence ("Do you have a pen?"); in tap mode it is
 *    shown among plausible wrong sentences;
 *  - choice: several valid sentences ("Yes, I do." / "No, I don't."); the
 *    game decides afterwards whether the answer was true.
 *
 * Speech first, taps are a rescue (sibling-game lessons): one press = one
 * bounded session; a matching interim result is accepted at once; only heard
 * wrong/unclear speech is a miss. Miss 1 try again, miss 2 the sentence is read
 * aloud, miss 3 the cards become tappable. Permission/hardware errors, no
 * recogniser, or the teacher's "mic off" switch go to taps at once. Silence
 * never counts; after two silent sessions the sentence is modelled once.
 */
import { audio } from "../audio/audio.ts";
import { PHRASES, type PhraseId } from "../speech/phrases.ts";
import { isSpeechPrefix, judgeSpeech } from "../speech/match.ts";
import { HARD_ERRORS, recognition, type ListenHandle, type RecognitionTiming } from "../speech/recognition.ts";
import { tts } from "../speech/tts.ts";
import { portraitOf, voiceOf, type Speaker } from "./dialogue.ts";
import { h } from "./dom.ts";

export interface AskSpec {
  kind: "command" | "choice";
  options: PhraseId[];
  question?: { who: Speaker; en: string };
  /** Japanese help line. */
  help?: string;
  /** Read the target aloud when the prompt opens (first time a phrase is met). */
  model?: boolean;
  /**
   * A gentle tip with a listen button ("Try saying 'eight thirty' together."),
   * shown after a miss, or at once when `hintNow` (a retry after a wrong answer).
   */
  hint?: { en: string; ja: string; say: string };
  hintNow?: boolean;
}

/** Quiet time after "eight..." before the shorter answer is taken (the child may still say "thirty"). */
const SETTLE_MS = 3000;
/** Quiet time after a finished sentence that matched nothing before it counts as said. */
const ENDPOINT_MS = 1000;
/** Time to continue a recognisable prefix, including after an early browser endpoint. */
const CONTINUE_MS = 3000;
const SUCCESS_MS = 200;

export interface AskEnv {
  micAllowed(): boolean;
  japanese(): boolean;
}

type Mode = "speech" | "tap";

type SpeechTiming = RecognitionTiming | "press" | "firstInterim" | "firstMatchingInterim" | "final" | "judgeDone" | "accepted" | "promptResolved" | "npcLineStart";
export type SpeechTimings = Partial<Record<SpeechTiming, number>>;

declare global {
  interface Window {
    __speechDebug?: boolean;
    __speechTimings?: SpeechTimings;
  }
}

/** Debug timestamps in milliseconds on the performance.now() clock, for the last mic attempt. */
export function markSpeechTiming(timings: SpeechTimings | undefined, mark: SpeechTiming) {
  if (!timings || (mark !== "judgeDone" && timings[mark] !== undefined)) return;
  const now = performance.now();
  timings[mark] = now;
  if (window.__speechDebug) console.debug("[speech]", mark, now - (timings.press ?? now));
}

export class AskPrompt {
  readonly el: HTMLDivElement;
  private q: HTMLDivElement;
  private cards: HTMLDivElement;
  private mic: HTMLButtonElement;
  private meter: HTMLElement;
  private status: HTMLDivElement;
  private heard: HTMLDivElement;
  private label: HTMLDivElement;
  private resolve: ((id: PhraseId) => void) | null = null;
  private spec: AskSpec | null = null;
  private mode: Mode = "speech";
  private misses = 0;
  private silent = 0;
  private modelled = false;
  private handle: ListenHandle | null = null;
  private blocked = false;
  private lastPress = 0;
  private sessionId: symbol | null = null;
  private pending: { id: PhraseId; heard: string } | null = null;
  private partial = "";
  private lastHeard = "";
  /** Our own end-of-answer timer (continuous listening has no browser endpoint). */
  private quietTimer = 0;
  private acceptTimer = 0;
  private stoppedByUs = false;
  private hintEl: HTMLDivElement;
  private timings?: SpeechTimings;
  /** Test hook. */
  onSession: ((state: string) => void) | null = null;

  constructor(parent: HTMLElement, private env: AskEnv) {
    this.q = h("div", { class: "q" });
    this.label = h("div", { class: "label" }, "Say it!");
    this.cards = h("div", { class: "cards" });
    this.mic = h("button", { class: "mic", "aria-label": "Microphone", "data-test": "mic" }, "🎤");
    this.meter = h("i");
    this.status = h("div", { class: "status", role: "status" });
    this.heard = h("div", { class: "heard" });
    this.hintEl = h("div", { class: "ask-hint hidden", "data-test": "ask-hint" });
    this.el = h(
      "div",
      { class: "ask hidden" },
      this.q,
      h("div", {}, this.label, this.cards),
      h("div", { class: "mic-col" }, this.mic, h("div", { class: "meter" }, this.meter)),
      this.status,
      this.heard,
      this.hintEl
    );
    this.mic.addEventListener("click", () => this.press());
    window.addEventListener("keydown", (e) => {
      if (e.key === " " && this.resolve && this.mode === "speech") {
        e.preventDefault();
        if (!e.repeat) this.press();
      }
    });
    parent.appendChild(this.el);
  }

  get open(): boolean {
    return this.resolve !== null;
  }

  private promptCount = 0;

  ask(spec: AskSpec): Promise<PhraseId> {
    this.finish();
    this.promptCount++;
    this.spec = spec;
    this.misses = 0;
    this.silent = 0;
    this.modelled = false;
    this.heard.textContent = "";
    this.mode = this.speechUsable() ? "speech" : "tap";
    if (spec.question) {
      this.q.innerHTML = `<span class="mini">${portraitOf(spec.question.who)}</span><span>${spec.question.en.replace(/\*\*/g, "")}</span>`;
      this.q.style.display = "";
    } else this.q.style.display = "none";
    this.el.classList.remove("hidden");
    this.render();
    this.showHint(!!spec.hintNow);
    if (this.mode === "speech") {
      this.setStatus("Tap the mic and speak!", "マイクを おして、えいごで いってね！");
      if (spec.model) void this.modelSentence();
    } else this.setTapStatus();
    return new Promise((resolve) => (this.resolve = resolve));
  }

  private speechUsable(): boolean {
    return this.env.micAllowed() && recognition.supported && !this.blocked;
  }

  /** Cards shown: in tap mode a command gets its distractors. */
  private shown(): PhraseId[] {
    const spec = this.spec as AskSpec;
    if (spec.kind === "choice" || this.mode === "speech") return spec.options;
    const target = spec.options[0];
    const list = [target, ...(PHRASES[target].distractors ?? [])].slice(0, 3);
    // Rotate by a per-prompt counter so the right sentence is not always first.
    const k = this.promptCount % list.length;
    return [...list.slice(k), ...list.slice(0, k)];
  }

  private render() {
    this.cards.innerHTML = "";
    const tap = this.mode === "tap";
    this.label.textContent = tap ? "Tap and say it!" : "Say it!";
    for (const id of this.shown()) {
      const p = PHRASES[id];
      const listen = h("button", { class: "listen", "aria-label": "Listen" }, "🔊");
      listen.addEventListener("click", (e) => {
        e.stopPropagation();
        audio.click();
        void this.speakModel(p.en);
      });
      const card = h("div", { class: "say-card" + (tap ? " tappable" : ""), "data-phrase": id }, p.en, listen);
      if (tap) card.addEventListener("click", () => this.tap(id, card));
      this.cards.appendChild(card);
    }
    this.mic.style.display = tap ? "none" : "";
    this.meter.parentElement!.style.display = tap ? "none" : "";
  }

  private setStatus(en: string, ja?: string) {
    const html = `${en}${ja && this.env.japanese() ? ` <span class="ja">${ja}</span>` : ""}`;
    if (this.status.innerHTML !== html) this.status.innerHTML = html;
  }

  /** The spec's tip, with a button that plays the sentence clearly. */
  private showHint(on: boolean) {
    const hint = this.spec?.hint;
    this.hintEl.classList.toggle("hidden", !on || !hint);
    if (!on || !hint) return;
    this.hintEl.innerHTML = "";
    const listen = h("button", { class: "listen", "aria-label": "Listen", "data-test": "ask-hint-listen" }, "🔊");
    listen.addEventListener("click", (e) => {
      e.stopPropagation();
      audio.click();
      void this.speakModel(hint.say);
    });
    this.hintEl.append(h("span", {}, "💡 ", hint.en), this.env.japanese() ? h("span", { class: "ja" }, hint.ja) : "", listen);
  }

  private setTapStatus() {
    const why = !this.env.micAllowed() ? "" : !recognition.supported ? "マイクが つかえないので、" : this.blocked ? "マイクが つかえないので、" : "";
    this.setStatus("Tap the sentence. Say it, too!", `${why}ただしい ぶんを タップしてね。こえにも だしてみよう！`);
  }

  private async speakModel(text: string) {
    if (this.acceptTimer) return;
    if (this.sessionId) {
      this.clearSession();
      this.setStatus("Tap the mic and speak!", "マイクを おして、えいごで いってね！");
    }
    audio.duck(true);
    await tts.speak(text, voiceOf("narrator"));
    audio.duck(false);
  }

  private async modelSentence() {
    if (this.modelled || !this.spec) return;
    this.modelled = true;
    const texts = this.spec.options.map((id) => PHRASES[id].en);
    const prompt = this.promptCount;
    this.mic.disabled = true;
    for (const t of texts) {
      await this.speakModel(t);
      if (prompt !== this.promptCount || !this.resolve) return;
    }
    this.mic.disabled = false;
  }

  private tap(id: PhraseId, card: HTMLElement) {
    const spec = this.spec;
    if (!spec || !this.resolve || this.mode !== "tap") return;
    const ok = spec.kind === "choice" || id === spec.options[0];
    if (!ok) {
      audio.hmm();
      card.classList.remove("wrong");
      void card.offsetWidth;
      card.classList.add("wrong");
      this.setStatus("Hmm, not that one. Try again!", "ちがうみたい。もういちど！");
      return;
    }
    card.classList.add("good");
    audio.sparkle(4);
    void tts.speak(PHRASES[id].en, voiceOf("player"));
    this.finish(id);
  }

  private press() {
    if (!this.resolve || this.mode !== "speech" || this.mic.disabled) return;
    if (!this.speechUsable()) return this.forceTap();
    const now = performance.now();
    if (this.sessionId) {
      // A deliberate second press means "I'm done". Ignore accidental double-clicks.
      if (now - this.lastPress >= 350) this.handle?.stop();
      return;
    }
    this.lastPress = now;
    this.timings = window.__speechDebug || window.__speechTimings ? (window.__speechTimings = {}) : undefined;
    markSpeechTiming(this.timings, "press");
    this.pending = null;
    this.partial = "";
    this.lastHeard = "";
    this.heard.textContent = "";
    this.startSession();
  }

  private clearQuiet() {
    window.clearTimeout(this.quietTimer);
    this.quietTimer = 0;
  }

  /** End the answer ourselves after a quiet spell (continuous listening). */
  private armQuiet(ms: number) {
    if (this.stoppedByUs) return;
    this.clearQuiet();
    const session = this.sessionId;
    this.quietTimer = window.setTimeout(() => {
      if (session === this.sessionId) this.handle?.stop();
    }, ms);
  }

  /**
   * One listening session. Listening continues through pauses ("eight...
   * thirty"); everything heard so far is judged together. A complete match is
   * taken at once; an answer that could still grow into another option ("eight"
   * when "eight thirty" is on offer) waits for a quiet spell first.
   * `prefix`: what was heard before the browser cut the previous session short.
   */
  private startSession(prefix = "") {
    const spec = this.spec as AskSpec;
    const session = (this.sessionId = Symbol());
    const current = () => session === this.sessionId;
    const timings = this.timings;
    tts.cancel();
    audio.silence(true);
    this.stoppedByUs = false;
    this.mic.className = "mic listening";
    this.setStatus("Listening…", "きいているよ…");
    this.onSession?.(prefix ? "continue" : "listening");
    if (!current()) return;
    const options = spec.options.map((id) => PHRASES[id]);
    let hardError = "";
    let speechEnded = false;
    const handle = recognition.listen(
      {
        onTiming: (mark) => {
          if (!current()) return;
          if (mark === "speechStart") speechEnded = false;
          markSpeechTiming(timings, mark);
        },
        onResult: (raw, isFinal) => {
          if (!current()) return;
          if (!this.env.micAllowed()) return this.forceTap();
          const spoken = raw.map((a) => a.trim()).filter(Boolean);
          if (!spoken.length) return;
          markSpeechTiming(timings, isFinal ? "final" : "firstInterim");
          const alts = prefix ? spoken.map((a) => `${prefix} ${a}`) : spoken;
          this.setStatus("I hear you…", "きこえているよ…");
          const heard = alts[0];
          const changed = this.lastHeard !== heard;
          this.lastHeard = heard;
          this.heard.textContent = `“${heard}…”`;
          const j = judgeSpeech(alts, options);
          markSpeechTiming(timings, "judgeDone");
          if (!isFinal && j.kind === "match") markSpeechTiming(timings, "firstMatchingInterim");
          if (j.kind === "match" && !j.pending) return this.acceptSpeech(j.id, j.heard);

          const wasWaiting = !!(this.pending || this.partial);
          this.pending = null;
          this.partial = "";
          if (j.kind === "match") {
            // "eight..." — maybe "thirty" is coming. Keep listening a little.
            this.pending = j;
            if (changed || !this.quietTimer || !wasWaiting) this.armQuiet(SETTLE_MS);
          } else if (isSpeechPrefix(heard, options)) {
            this.partial = heard;
            if (changed || !this.quietTimer || !wasWaiting) this.armQuiet(CONTINUE_MS);
          } else if (isFinal || speechEnded) {
            if (changed || !this.quietTimer || wasWaiting) this.armQuiet(ENDPOINT_MS);
          } else this.clearQuiet();
        },
        onSpeechEnd: () => {
          if (!current()) return;
          speechEnded = true;
          if (this.lastHeard && !this.pending && !this.partial && !this.quietTimer) this.armQuiet(ENDPOINT_MS);
        },
        onStopping: () => {
          if (!current()) return;
          this.stoppedByUs = true;
          this.clearQuiet();
          this.mic.className = "mic processing";
          this.setStatus("Checking…", "チェックちゅう…");
        },
        onError: (err) => {
          if (current() && HARD_ERRORS.has(err)) hardError = err;
        },
        onEnd: () => {
          if (current()) this.endSession(hardError, !!prefix);
        },
        onActivity: (a) => {
          if (current()) this.meter.style.width = a.speech ? "100%" : a.sound ? "55%" : a.audio ? "12%" : "0";
        }
      },
      prefix ? CONTINUE_MS + 4000 : 9000,
      true
    );
    if (!current()) {
      handle.abort();
      return;
    }
    this.handle = handle;
    if (prefix && !this.quietTimer) this.armQuiet(CONTINUE_MS);
  }

  private clearSession() {
    this.sessionId = null;
    this.clearQuiet();
    this.handle?.abort();
    this.handle = null;
    audio.silence(false);
    this.meter.style.width = "0";
    this.mic.className = "mic";
  }

  private acceptSpeech(id: PhraseId, heard: string) {
    this.clearSession();
    markSpeechTiming(this.timings, "accepted");
    this.mic.disabled = true;
    this.setStatus("Great!", "いいね！");
    this.heard.textContent = `“${heard}”`;
    audio.sparkle(5);
    this.cards.querySelector(`[data-phrase="${id}"]`)?.classList.add("good");
    this.acceptTimer = window.setTimeout(() => this.finish(id), SUCCESS_MS);
    this.onSession?.("match");
  }

  private endSession(hardError: string, continued: boolean) {
    const micAllowed = this.env.micAllowed();
    if (this.resolve && !hardError && micAllowed) {
      const prefix = this.pending?.heard ?? this.partial;
      if (prefix && !this.stoppedByUs && !continued) {
        this.clearSession();
        this.startSession(prefix);
        return;
      }
      if (this.pending) return this.acceptSpeech(this.pending.id, this.pending.heard);
    }
    this.clearSession();
    if (!this.resolve) return;
    if (hardError) {
      this.blocked = true;
      this.forceTap();
      this.onSession?.("blocked");
      return;
    }
    if (!micAllowed) return this.forceTap();
    if (!this.lastHeard) {
      this.silent++;
      this.onSession?.("silence");
      if (this.silent >= 2 && !this.modelled) {
        this.setStatus("Listen, then say it!", "よく きいて、いってみよう！");
        void this.modelSentence();
      } else this.setStatus("I didn't hear you. Tap the mic and speak!", "きこえなかったよ。もういちど マイクを おしてね。");
      return;
    }
    this.misses++;
    this.onSession?.("miss");
    this.heard.textContent = `I heard: “${this.lastHeard}”`;
    this.showHint(true);
    audio.hmm();
    if (this.misses === 1) this.setStatus("Try again!", "もういちど！");
    else if (this.misses === 2) {
      this.setStatus("Try again! Listen first.", "もういちど！ まず きいてね。");
      this.modelled = false;
      void this.modelSentence();
    } else {
      this.mode = "tap";
      this.render();
      this.setStatus("Try again! Tap the sentence and say it.", "もういちど！ ぶんを タップして、いってみよう。");
    }
  }

  /** Test hook: feed a transcript as if the recogniser heard it. */
  simulate(transcript: string): boolean {
    const spec = this.spec;
    if (!spec || !this.resolve || this.acceptTimer) return false;
    const j = judgeSpeech([transcript], spec.options.map((id) => PHRASES[id]));
    if (j.kind === "match") {
      this.finish(j.id);
      return true;
    }
    return false;
  }

  /** Test hook: tap mode always reachable. */
  forceTap() {
    if (!this.resolve || this.acceptTimer) return;
    if (this.sessionId) this.clearSession();
    this.mode = "tap";
    this.render();
    this.setTapStatus();
  }

  private finish(id?: PhraseId) {
    window.clearTimeout(this.acceptTimer);
    this.acceptTimer = 0;
    this.clearSession();
    this.mic.disabled = false;
    const r = this.resolve;
    this.resolve = null;
    this.el.classList.add("hidden");
    if (r && id) {
      markSpeechTiming(this.timings, "promptResolved");
      r(id);
    }
    this.timings = undefined;
  }
}
