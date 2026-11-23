/** Title screen, teacher settings, the completion card and place labels. */
import { audio } from "../audio/audio.ts";
import { renderDrawing, type Drawing } from "../draw/drawing.ts";
import type { Settings } from "../game/save.ts";
import { h } from "./dom.ts";

export function titleScreen(parent: HTMLElement, hasSave: boolean): Promise<"start" | "continue"> {
  return new Promise((resolve) => {
    const go = (what: "start" | "continue") => {
      audio.unlock();
      audio.click();
      el.remove();
      resolve(what);
    };
    const start = h("button", { class: "big-btn", "data-test": "start" }, hasSave ? "New game" : "Start!", h("span", { class: "ja" }, hasSave ? "はじめから" : "スタート"));
    start.addEventListener("click", () => go("start"));
    const cont = hasSave ? h("button", { class: "big-btn", "data-test": "continue" }, "Continue", h("span", { class: "ja" }, "つづきから")) : null;
    cont?.addEventListener("click", () => go("continue"));
    if (cont) start.classList.add("alt");
    const el = h(
      "div",
      { class: "title-screen" },
      h(
        "div",
        { class: "title-card" },
        h("div", { class: "logo" }, "Magic Stationery"),
        h("div", { class: "sub" }, "Restore the World"),
        h("div", { class: "ja" }, "まほうのペンで かいた ものが ほんものに なる！ きえた せかいを とりもどそう！"),
        h("div", { class: "row" }, cont, start)
      ),
      h("div", { class: "credits" }, "Drawing recognition trained on The Quick, Draw! Dataset by Google (CC BY 4.0)")
    );
    parent.appendChild(el);
  });
}

export function settingsDialog(parent: HTMLElement, s: Settings, onChange: (s: Settings) => void, onReset: () => void) {
  const veil = h("div", { class: "modal-veil" });
  const row = (t: string, ja: string, control: HTMLElement) => h("div", { class: "setting" }, h("div", { class: "t" }, t, h("span", { class: "ja" }, ja)), control);
  const seg = <T extends string | boolean>(value: T, opts: [T, string][], set: (v: T) => void) => {
    const box = h("div", { class: "seg" });
    const render = (cur: T) => {
      box.innerHTML = "";
      for (const [v, label] of opts) {
        const b = h("button", { class: v === cur ? "on" : "" }, label);
        b.addEventListener("click", () => {
          audio.click();
          set(v);
          render(v);
          onChange(s);
        });
        box.appendChild(b);
      }
    };
    render(value);
    return box;
  };
  const resetBtn = h("button", { class: "big-btn alt", style: { minWidth: "160px", height: "52px", fontSize: "18px" } }, "Reset progress", h("span", { class: "ja" }, "さいしょから"));
  let armed = false;
  resetBtn.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      resetBtn.firstChild!.textContent = "Tap again to reset";
      return;
    }
    onReset();
    veil.remove();
  });
  const close = h("button", { class: "big-btn", "data-test": "settings-close" }, "OK");
  close.addEventListener("click", () => {
    audio.click();
    veil.remove();
  });
  const card = h(
    "div",
    { class: "card", style: { textAlign: "left" } },
    h("h2", {}, "Teacher settings ", h("span", { class: "ja", style: { fontSize: "16px" } }, "せんせい よう")),
    h(
      "div",
      { class: "settings-list" },
      row("Microphone", "マイク (OFF = タップで すすめる)", seg(s.mic, [[true, "On"], [false, "Off"]], (v) => (s.mic = v))),
      row("Drawing help", "おえかき ヘルプ (Extra = なぞりがき から)", seg(s.help, [["normal", "Normal"], ["extra", "Extra"]], (v) => (s.help = v))),
      row("Touchpad pen", "クリックで ペンを おろす／あげる", seg(s.touchpadPen, [[false, "Off"], [true, "On"]], (v) => (s.touchpadPen = v))),
      row("Japanese help", "にほんごの ヒント", seg(s.japanese, [[true, "On"], [false, "Off"]], (v) => (s.japanese = v))),
      row("Voice speed", "こえの はやさ", seg(s.slowVoice, [[false, "Normal"], [true, "Slow"]], (v) => (s.slowVoice = v))),
      row("Music", "おんがく", seg(s.music, [[true, "On"], [false, "Off"]], (v) => (s.music = v))),
      row("Sound effects", "こうかおん", seg(s.sfx, [[true, "On"], [false, "Off"]], (v) => (s.sfx = v)))
    ),
    h("p", { class: "note" }, "Speaking is the main way to answer; tap choices appear after a few tries, when the mic is blocked, or when the microphone is off here."),
    h("div", { class: "row" }, resetBtn, close)
  );
  veil.appendChild(card);
  parent.appendChild(veil);
}

export interface AlbumItem {
  word: string;
  drawing: Drawing | null;
}

/** "The shop is back!" with the child's own drawings. */
export function completionCard(parent: HTMLElement, title: string, ja: string, items: AlbumItem[], next: string, nextJa: string): Promise<void> {
  return new Promise((resolve) => {
    const album = h("div", { class: "album" });
    for (const it of items) {
      const c = h("canvas", { width: "200", height: "200" });
      if (it.drawing) renderDrawing(it.drawing, { size: 200, lineWidth: 7, pad: 18 }, c);
      album.appendChild(h("figure", {}, c, h("figcaption", {}, it.word)));
    }
    const btn = h("button", { class: "big-btn", "data-test": "complete-next" }, next, h("span", { class: "ja" }, nextJa));
    const veil = h(
      "div",
      { class: "modal-veil" },
      h("div", { class: "card" }, h("h1", {}, title), h("div", { class: "ja", style: { fontSize: "18px", marginTop: "6px" } }, ja), h("p", { style: { fontSize: "20px", fontWeight: "800", margin: "14px 0 0" } }, "You drew all of these!"), album, h("div", { class: "row" }, btn))
    );
    btn.addEventListener("click", () => {
      audio.click();
      veil.remove();
      resolve();
    });
    parent.appendChild(veil);
  });
}

export function placeLabel(parent: HTMLElement): HTMLDivElement {
  const el = h("div", { class: "place-label" });
  parent.appendChild(el);
  return el;
}
