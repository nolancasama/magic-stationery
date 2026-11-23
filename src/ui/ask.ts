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
import { judgeSpeech } from "../speech/match.ts";
import { HARD_ERRORS, recognition, type ListenHandle } from "../speech/recognition.ts";
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
}

export interface AskEnv {
  micAllowed(): boolean;
  japanese(): boolean;
}

type Mode = "speech" | "tap";

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
  private best: { id: PhraseId; heard: string } | null = null;
  private sawSpeech = false;
  private wrongHeard = "";
  /** Test hook. */
  onSession: ((state: string) => void) | null = null;

  constructor(parent: HTMLElement, private env: AskEnv) {
    this.q = h("div", { class: "q" });
    this.label = h("div", { class: "label" }, "Say it!");
    this.cards = h("div", { class: "cards" });
    this.mic = h("button", { class: "mic", "aria-label": "Microphone", "data-test": "mic" }, "🎤");
    this.meter = h("i");
    this.status = h("div", { class: "status" });
    this.heard = h("div", { class: "heard" });
    this.el = h(
      "div",
      { class: "ask hidden" },
      this.q,
      h("div", {}, this.label, this.cards),
      h("div", { class: "mic-col" }, this.mic, h("div", { class: "meter" }, this.meter)),
      this.status,
      this.heard
    );
    this.mic.addEventListener("click", () => this.press());
    window.addEventListener("keydown", (e) => {
      if (e.key === " " && this.resolve && this.mode === "speech") {
        e.preventDefault();
        this.press();
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
    this.mode = this.speechUsable() ? "speech" : "tap";
    if (spec.question) {
      this.q.innerHTML = `<span class="mini">${portraitOf(spec.question.who)}</span><span>${spec.question.en.replace(/\*\*/g, "")}</span>`;
      this.q.style.display = "";
    } else this.q.style.display = "none";
    this.el.classList.remove("hidden");
    this.render();
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
    this.status.innerHTML = `${en}${ja && this.env.japanese() ? ` <span class="ja">${ja}</span>` : ""}`;
  }

  private setTapStatus() {
    const why = !this.env.micAllowed() ? "" : !recognition.supported ? "マイクが つかえないので、" : this.blocked ? "マイクが つかえないので、" : "";
    this.setStatus("Tap the sentence. Say it, too!", `${why}ただしい ぶんを タップしてね。こえにも だしてみよう！`);
  }

  private async speakModel(text: string) {
    this.handle?.abort();
    this.handle = null;
    this.mic.className = "mic";
    audio.duck(true);
    await tts.speak(text, voiceOf("narrator"));
    audio.duck(false);
  }

  private async modelSentence() {
    if (this.modelled || !this.spec) return;
    this.modelled = true;
    const texts = this.spec.options.map((id) => PHRASES[id].en);
    this.mic.disabled = true;
    for (const t of texts) await this.speakModel(t);
    this.mic.disabled = false;
  }

  private tap(id: PhraseId, card: HTMLElement) {
    const spec = this.spec;
    if (!spec || this.mode !== "tap") return;
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
    if (!this.spec || this.mode !== "speech" || this.mic.disabled) return;
    const now = performance.now();
    if (now - this.lastPress < 350) return;
    this.lastPress = now;
    if (this.handle) {
      // Pressing again while listening means "I'm done".
      this.handle.stop();
      this.mic.className = "mic processing";
      this.setStatus("Checking…", "チェックちゅう…");
      return;
    }
    this.startSession();
  }

  private startSession() {
    const spec = this.spec as AskSpec;
    tts.cancel();
    audio.silence(true);
    this.best = null;
    this.sawSpeech = false;
    this.wrongHeard = "";
    this.heard.textContent = "";
    this.mic.className = "mic listening";
    this.setStatus("Listening… Just speak!", "きいているよ… はなしてね！");
    this.onSession?.("listening");
    const options = spec.options.map((id) => PHRASES[id]);
    let hardError = "";
    this.handle = recognition.listen({
      onResult: (alts, isFinal) => {
        if (alts.some((a) => a.trim())) this.sawSpeech = true;
        const j = judgeSpeech(alts, options);
        if (j.kind === "match") {
          this.best = { id: j.id, heard: j.heard };
          // A matching interim result is accepted at once.
          this.handle?.abort();
          this.endSession("");
          return;
        }
        if (isFinal || alts[0]) this.wrongHeard = alts[0] ?? "";
      },
      onError: (err) => {
        if (HARD_ERRORS.has(err)) hardError = err;
      },
      onEnd: () => this.endSession(hardError),
      onActivity: (a) => {
        this.meter.style.width = a.speech ? "100%" : a.sound ? "55%" : a.audio ? "12%" : "0";
      }
    });
  }

  private endSession(hardError: string) {
    if (!this.handle && !this.best) return;
    this.handle = null;
    audio.silence(false);
    this.meter.style.width = "0";
    this.mic.className = "mic";
    const spec = this.spec;
    if (!spec || !this.resolve) return;
    if (this.best) {
      this.onSession?.("match");
      this.heard.textContent = `“${this.best.heard}”`;
      const id = this.best.id;
      audio.sparkle(5);
      const card = this.cards.querySelector(`[data-phrase="${id}"]`);
      card?.classList.add("good");
      window.setTimeout(() => this.finish(id), 450);
      return;
    }
    if (hardError) {
      this.blocked = true;
      this.mode = "tap";
      this.onSession?.("blocked");
      this.render();
      this.setTapStatus();
      return;
    }
    if (!this.sawSpeech) {
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
    this.heard.textContent = this.wrongHeard ? `I heard: “${this.wrongHeard}”` : "";
    audio.hmm();
    if (this.misses === 1) this.setStatus("Almost! Try again!", "おしい！ もういちど！");
    else if (this.misses === 2) {
      this.setStatus("Listen, then try again!", "よく きいて、もういちど！");
      this.modelled = false;
      void this.modelSentence();
    } else {
      this.mode = "tap";
      this.render();
      this.setStatus("Good try! Tap the sentence and say it.", "がんばったね！ ぶんを タップして、いってみよう。");
    }
  }

  /** Test hook: feed a transcript as if the recogniser heard it. */
  simulate(transcript: string): boolean {
    const spec = this.spec;
    if (!spec || !this.resolve) return false;
    const j = judgeSpeech([transcript], spec.options.map((id) => PHRASES[id]));
    if (j.kind === "match") {
      this.finish(j.id);
      return true;
    }
    return false;
  }

  /** Test hook: tap mode always reachable. */
  forceTap() {
    this.mode = "tap";
    this.render();
  }

  private finish(id?: PhraseId) {
    this.handle?.abort();
    this.handle = null;
    audio.silence(false);
    const r = this.resolve;
    this.resolve = null;
    this.el.classList.add("hidden");
    if (r && id) r(id);
  }
}
