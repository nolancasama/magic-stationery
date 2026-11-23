/** Minimal DOM helpers (no UI framework). */

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "html") el.innerHTML = String(v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Resolve on the next click of an element (or a key in `keys`). */
export function nextPress(el: HTMLElement, keys: string[] = []): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      el.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
      resolve();
    };
    const onClick = (e: Event) => {
      e.stopPropagation();
      done();
    };
    const onKey = (e: KeyboardEvent) => {
      if (keys.includes(e.key)) {
        e.preventDefault();
        done();
      }
    };
    el.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
  });
}

export const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
