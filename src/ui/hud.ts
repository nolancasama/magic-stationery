/** Place card with restoration pips, objective line, the ★ marker and buttons. */
import { h } from "./dom.ts";

const PEN_ICON = `<svg viewBox="0 0 40 40"><g transform="rotate(35 20 20)"><rect x="16" y="4" width="8" height="26" rx="3" fill="#fff"/><rect x="16" y="8" width="8" height="3" fill="#ffd54f"/><path d="M16 30 L24 30 L20 37Z" fill="#ffd54f"/></g><path d="M8 6 l2 4 4 1 -4 1 -2 4 -2-4 -4-1 4-1z" fill="#fff59d"/></svg>`;

export class Hud {
  readonly place: HTMLDivElement;
  private placeName: HTMLDivElement;
  private pips: HTMLDivElement;
  readonly objective: HTMLDivElement;
  readonly marker: HTMLDivElement;
  readonly pen: HTMLDivElement;
  readonly buttons: HTMLDivElement;
  readonly townBtn: HTMLButtonElement;
  readonly settingsBtn: HTMLButtonElement;
  readonly soundBtn: HTMLButtonElement;
  readonly toast: HTMLDivElement;
  private readonly doorBubble: HTMLDivElement;
  private toastTimer = 0;

  constructor(parent: HTMLElement, private japanese: () => boolean) {
    this.placeName = h("div", { class: "name" });
    this.pips = h("div", { class: "pips" });
    this.place = h("div", { class: "hud-place" }, this.placeName, this.pips);
    this.objective = h("div", { class: "objective hidden", "data-test": "objective" });
    this.marker = h("div", { class: "marker hidden passthrough" }, "★");
    this.pen = h("div", { class: "pen-badge", html: `${PEN_ICON}<span>Magic Pen</span>` });
    this.pen.style.display = "none";
    this.townBtn = h("button", { class: "icon-btn", title: "Town", "aria-label": "Town", "data-test": "town" }, "🏠");
    this.soundBtn = h("button", { class: "icon-btn", title: "Sound", "aria-label": "Sound" }, "🔊");
    this.settingsBtn = h("button", { class: "icon-btn", title: "Teacher settings", "aria-label": "Settings", "data-test": "settings" }, "⚙️");
    this.buttons = h("div", { class: "hud-buttons" }, this.townBtn, this.soundBtn, this.settingsBtn);
    this.toast = h("div", { class: "toast hidden" });
    this.doorBubble = h("div", { class: "door-bubble", "data-test": "door-exit", hidden: true, role: "group", "aria-labelledby": "door-exit-question" },
      h("div", { id: "door-exit-question", "aria-live": "polite" }, "Do you want to leave?"),
      h("div", { class: "ja" }, "そとに でますか？"),
      h("div", { class: "door-bubble-buttons" },
        h("button", { type: "button", "data-test": "door-exit-yes", onclick: () => this.onDoorExit?.(true) }, "Yes"),
        h("button", { type: "button", "data-test": "door-exit-no", onclick: () => this.onDoorExit?.(false) }, "No")
      )
    );
    parent.append(this.place, this.objective, this.marker, this.pen, this.buttons, this.toast, this.doorBubble);
  }

  onDoorExit: ((yes: boolean) => void) | null = null;

  setDoorBubble(p: { x: number; y: number } | null) {
    this.doorBubble.hidden = !p;
    if (!p) return;
    this.doorBubble.style.setProperty("--door-x", p.x + "px");
    this.doorBubble.style.top = p.y + "px";
  }

  setPlace(en: string, ja: string, done: number, total: number) {
    this.placeName.innerHTML = `${en}${this.japanese() ? `<span class="ja">${ja}</span>` : ""}`;
    this.pips.innerHTML = "";
    for (let i = 0; i < total; i++) this.pips.appendChild(h("div", { class: "pip" + (i < done ? " on" : "") }));
    this.pips.appendChild(h("span", { class: "count" }, `${done} / ${total}`));
    this.pips.style.display = total ? "" : "none";
  }

  setObjective(en: string | null, ja = "") {
    if (!en) {
      this.objective.classList.add("hidden");
      return;
    }
    this.objective.innerHTML = `<span class="star">★</span><span>${en}</span>${ja && this.japanese() ? `<span class="ja">${ja}</span>` : ""}`;
    this.objective.classList.remove("hidden");
  }

  /** Place the ★ over a screen point (null hides it). */
  setMarker(p: { x: number; y: number } | null) {
    if (!p) {
      this.marker.classList.add("hidden");
      return;
    }
    this.marker.classList.remove("hidden");
    this.marker.style.left = p.x + "px";
    this.marker.style.top = p.y + "px";
  }

  showPen(on: boolean) {
    this.pen.style.display = on ? "" : "none";
  }

  say(en: string, ja = "", ms = 2600) {
    this.toast.innerHTML = `${en}${ja && this.japanese() ? `<span class="ja">${ja}</span>` : ""}`;
    this.toast.classList.remove("hidden");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.add("hidden"), ms);
  }

  setVisible(on: boolean) {
    for (const el of [this.place, this.buttons]) el.style.display = on ? "" : "none";
  }
}
