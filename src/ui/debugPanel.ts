/**
 * Debug panel (`?debug=1`, toggle with the ` key): jump to any stage of the
 * game, finish or reset any place, unlock everything, go straight into a
 * place, change the game speed, and read live stats. Changes to progress are
 * saved and the page reloads into the town (the title is skipped).
 */
import { completePlace, presetSave, PRESETS, resetPlace, type PresetId } from "../game/debug.ts";
import type { Game, RoomPlace } from "../game/game.ts";
import { ROOM_PLACES } from "../game/game.ts";
import { debugUnlock, placeProgress } from "../game/save.ts";
import { animSpeed, setAnimSpeed } from "../world/tween.ts";

const UNLOCK_KEY = "ms.debug.unlock";
const NAMES: Record<RoomPlace, string> = { store: "Shop", school: "Classroom", zoo: "Zoo", market: "Supermarket", gym: "Gym" };

/** Read before the game starts, so the first town already shows everything open. */
export function loadDebugUnlock() {
  try {
    debugUnlock.all = window.localStorage.getItem(UNLOCK_KEY) === "1";
  } catch {
    debugUnlock.all = false;
  }
}

export function installDebugPanel(game: Game) {
  const css = document.createElement("style");
  css.textContent = `
    .dbg { position: fixed; left: 12px; bottom: 12px; z-index: 9999; width: 290px; max-height: 80vh; overflow: auto;
      background: rgba(25, 28, 40, .92); color: #eef; font: 12px/1.35 system-ui, sans-serif; border-radius: 10px; padding: 8px 10px; }
    .dbg.min > :not(.dbg-head) { display: none; }
    .dbg-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; cursor: pointer; }
    .dbg h4 { margin: 8px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9ab; }
    .dbg button { font: inherit; margin: 2px 2px 2px 0; padding: 3px 7px; border: 0; border-radius: 6px; background: #3b4260; color: #fff; cursor: pointer; }
    .dbg button:hover { background: #56608a; }
    .dbg button.on { background: #e0a400; color: #222; }
    .dbg .row { display: flex; align-items: center; gap: 4px; }
    .dbg .row span { flex: 1; }
    .dbg pre { margin: 4px 0 0; white-space: pre-wrap; color: #cde; }
  `;
  document.head.append(css);
  const panel = document.createElement("div");
  panel.className = "dbg";
  panel.dataset.test = "debug";
  document.body.append(panel);

  const apply = () => {
    game.save.started = true;
    game.persist();
    const url = new URL(window.location.href);
    url.searchParams.set("debug", "1");
    url.searchParams.set("go", "1");
    window.location.href = url.toString();
  };
  const button = (label: string, onClick: () => void, cls = "") => {
    const b = document.createElement("button");
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  };
  const section = (title: string) => {
    const h = document.createElement("h4");
    h.textContent = title;
    panel.append(h);
  };

  const head = document.createElement("div");
  head.className = "dbg-head";
  head.innerHTML = "<span>🛠 Debug</span><span>` to hide</span>";
  head.addEventListener("click", () => panel.classList.toggle("min"));
  panel.append(head);

  section("Unlock");
  panel.append(
    button(debugUnlock.all ? "Unlock everything: ON" : "Unlock everything: off", () => {
      try {
        game.storage?.setItem(UNLOCK_KEY, debugUnlock.all ? "0" : "1");
      } catch {
        /* storage blocked: the flag lasts this page only */
      }
      debugUnlock.all = !debugUnlock.all;
      apply();
    }, debugUnlock.all ? "on" : "")
  );

  section("Jump to a stage (replaces the save)");
  for (const [id, label] of Object.entries(PRESETS) as [PresetId, string][]) {
    panel.append(button(label, () => {
      game.save = presetSave(id, game.save.settings);
      apply();
    }));
  }

  section("Places");
  for (const place of ROOM_PLACES) {
    const row = document.createElement("div");
    row.className = "row";
    const name = document.createElement("span");
    name.textContent = `${NAMES[place]} ${Math.round(placeProgress(game.save, place) * 100)}%`;
    row.append(
      name,
      button("Go", () => {
        if (!game.travelTo(place)) game.hud.say("Debug: Go works in the town once a place can be picked (finish the dialogue, or 🏠)", "", 2600);
      }),
      button("Finish", () => {
        completePlace(game.save, place);
        apply();
      }),
      button("Reset", () => {
        resetPlace(game.save, place);
        apply();
      })
    );
    panel.append(row);
  }

  section("Speed");
  const speeds: HTMLButtonElement[] = [];
  for (const s of [1, 2, 4]) {
    const b = button(`${s}×`, () => {
      setAnimSpeed(s);
      speeds.forEach((x) => x.classList.toggle("on", x === b));
    }, animSpeed() === s ? "on" : "");
    speeds.push(b);
    panel.append(b);
  }

  section("Live");
  const info = document.createElement("pre");
  panel.append(info);
  window.setInterval(() => {
    if (panel.classList.contains("min")) return;
    const p = game.player.position;
    info.textContent = [
      `area ${game.area ?? "title"}  waiting ${game.waitingFor || "-"}`,
      `player ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`,
      `fps ${game.engine.fps.toFixed(0)}  draw calls ${game.engine.renderer.info.render.calls}`
    ].join("\n");
  }, 400);

  window.addEventListener("keydown", (e) => {
    if (e.key === "`") panel.classList.toggle("min");
  });
}
