/**
 * The talking panel: portrait, name, English line (spoken by TTS), Japanese
 * help line. The "next" button appears once the line has been spoken.
 */
import { audio } from "../audio/audio.ts";
import { CAST, NARRATOR_VOICE, PEN_VOICE, type CastId } from "../game/cast.ts";
import { tts, type Voice } from "../speech/tts.ts";
import { portraitSvg } from "../world/characters.ts";
import { h, nextPress } from "./dom.ts";

export type Speaker = CastId | "narrator";

const PEN_PORTRAIT = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="pg" cx="50%" cy="40%"><stop offset="0" stop-color="#fffbe6"/><stop offset="1" stop-color="#ffe08a"/></radialGradient></defs><rect width="100" height="100" fill="url(#pg)"/><g transform="rotate(35 50 50)"><rect x="42" y="22" width="16" height="56" rx="6" fill="#3f51b5"/><rect x="42" y="30" width="16" height="5" fill="#f4c542"/><rect x="42" y="66" width="16" height="5" fill="#f4c542"/><path d="M42 78 L58 78 L50 92Z" fill="#f4c542"/><circle cx="46.5" cy="48" r="3" fill="#fff"/><circle cx="53.5" cy="48" r="3" fill="#fff"/><circle cx="46.5" cy="48.6" r="1.6" fill="#222"/><circle cx="53.5" cy="48.6" r="1.6" fill="#222"/><path d="M46 54 Q50 58 54 54" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></g><path d="M50 6 L54 16 L64 16 L56 22 L59 32 L50 26 L41 32 L44 22 L36 16 L46 16Z" fill="#ffd54f" stroke="#e0a800" stroke-width="1.5"/></svg>`;
const NARRATOR_PORTRAIT = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#efe9ff"/><path d="M50 18 L58 40 L82 40 L62 54 L70 78 L50 63 L30 78 L38 54 L18 40 L42 40Z" fill="#b69cff"/></svg>`;

export function voiceOf(who: Speaker): Voice {
  if (who === "pen") return PEN_VOICE;
  if (who === "narrator") return NARRATOR_VOICE;
  return CAST[who].voice;
}

export function portraitOf(who: Speaker): string {
  if (who === "pen") return PEN_PORTRAIT;
  if (who === "narrator") return NARRATOR_PORTRAIT;
  return portraitSvg(CAST[who].look);
}

export function nameOf(who: Speaker): string {
  if (who === "pen") return "Magic Pen";
  if (who === "narrator") return "";
  return CAST[who].name;
}

/**
 * `{shown|spoken}` shows one text and speaks another: letter names are shown in
 * lowercase but spoken as capitals, so TTS says "dee", not "duh".
 */
const SHOWN_SPOKEN = /\{([^|}]*)\|([^}]*)\}/g;

/** Wrap **words** in a highlight span (target vocabulary). */
export function highlight(text: string): string {
  const esc = text.replace(SHOWN_SPOKEN, "$1").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
  return esc.replace(/\*\*(.+?)\*\*/g, '<span class="hl">$1</span>');
}

export const plain = (text: string) => text.replace(SHOWN_SPOKEN, "$2").replace(/\*\*/g, "");

export class Dialogue {
  readonly el: HTMLDivElement;
  private portrait: HTMLDivElement;
  private who: HTMLDivElement;
  private en: HTMLDivElement;
  private ja: HTMLDivElement;
  private replay: HTMLButtonElement;
  private next: HTMLButtonElement;
  private current: { who: Speaker; en: string } | null = null;
  /** Called while a character speaks (to animate them). */
  onSpeaking: ((who: Speaker, speaking: boolean) => void) | null = null;
  /** Test hook: resolve "next" automatically. */
  autoNext = false;

  constructor(parent: HTMLElement) {
    this.portrait = h("div", { class: "portrait" });
    this.who = h("div", { class: "who" });
    this.en = h("div", { class: "en" });
    this.ja = h("div", { class: "ja" });
    this.replay = h("button", { class: "round-btn", title: "Listen again", "aria-label": "Listen again" }, "🔊");
    this.next = h("button", { class: "round-btn primary", "data-test": "next" }, "Next ▶");
    this.el = h("div", { class: "dialogue hidden" }, this.portrait, this.who, this.en, this.ja, h("div", { class: "controls" }, this.replay, this.next));
    this.replay.addEventListener("click", (e) => {
      e.stopPropagation();
      audio.click();
      if (this.current) void this.speak(this.current.who, this.current.en);
    });
    parent.appendChild(this.el);
  }

  private async speak(who: Speaker, en: string) {
    this.onSpeaking?.(who, true);
    await tts.speak(plain(en), voiceOf(who));
    this.onSpeaking?.(who, false);
  }

  show(who: Speaker, en: string, ja?: string) {
    this.current = { who, en };
    this.portrait.innerHTML = portraitOf(who);
    this.who.textContent = nameOf(who);
    this.en.innerHTML = highlight(en);
    this.ja.textContent = ja ?? "";
    this.ja.style.display = ja ? "" : "none";
    this.el.classList.remove("hidden");
  }

  /** Show a line, speak it, wait for Next (or Space/Enter). */
  async say(who: Speaker, en: string, ja?: string): Promise<void> {
    this.show(who, en, ja);
    this.next.classList.add("ghost");
    const spoken = this.speak(who, en);
    await Promise.race([spoken, new Promise((r) => window.setTimeout(r, 2600))]);
    this.next.classList.remove("ghost");
    if (this.autoNext) {
      await spoken;
      return;
    }
    await nextPress(this.next, [" ", "Enter"]);
    // The line stays as context until the next one, but its Next is spent.
    this.next.classList.add("ghost");
    audio.click();
    tts.cancel();
  }

  /** Show and speak without waiting for Next (the caller moves on). */
  async announce(who: Speaker, en: string, ja?: string): Promise<void> {
    this.show(who, en, ja);
    this.next.classList.add("ghost");
    await this.speak(who, en);
  }

  hide() {
    this.el.classList.add("hidden");
    this.current = null;
  }
}
