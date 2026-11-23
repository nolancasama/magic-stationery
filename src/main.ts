/**
 * Magic Stationery: Restore the World — entry point.
 * Title -> town -> the Stationery Store (Level 1) -> town, with saved progress.
 */
import "./ui/styles.css";
import { audio } from "./audio/audio.ts";
import { music } from "./audio/music.ts";
import { Game } from "./game/game.ts";
import { LEVELS } from "./game/levels/index.ts";
import { defaults, storeProgress } from "./game/save.ts";
import { exampleFor } from "./recognition/examples.ts";
import { Recognizer } from "./recognition/recognizer.ts";
import type { WordId } from "./recognition/vocab.ts";
import { tts } from "./speech/tts.ts";
import { titleScreen } from "./ui/screens.ts";
import { VIEWS, type SlotId } from "./world/areas/store.ts";
import { setAnimSpeed, wait } from "./world/tween.ts";
import type { Drawing } from "./draw/drawing.ts";

const params = new URLSearchParams(window.location.search);
const E2E = params.has("e2e");

async function boot() {
  const app = document.getElementById("app") as HTMLElement;
  const game = new Game(app);
  if (E2E) {
    tts.setMuted(true);
    setAnimSpeed(Number(params.get("speed") ?? 3));
  }
  game.engine.start();
  game.enterTown(false);
  game.hud.setVisible(false);
  game.objective(null);

  const modelUrl = `${import.meta.env.BASE_URL}models/sketch-model.bin`;
  const modelReady = Recognizer.load(modelUrl)
    .then((r) => {
      game.recognizer = r;
      game.log("model:ok");
    })
    .catch((err) => {
      // Without the model every drawing is accepted with the pen's help: the game still completes.
      console.warn("sketch model unavailable", err);
      game.log("model:missing");
    });

  if (E2E) exposeHooks(game);

  // Debug views for screenshot passes: ?scene=store[&fill=1][&view=counter]
  const scene = params.get("scene");
  if (scene === "store") {
    await modelReady;
    game.enterStore();
    game.hud.setVisible(true);
    if (params.has("fill")) await game.debugFill();
    const view = params.get("view");
    if (view) game.focus(VIEWS[view] ?? VIEWS.overview, true);
    return;
  }

  const choice = await titleScreen(game.ui, game.save.started && game.save.store.steps.length > 0);
  audio.unlock();
  if (choice === "start") {
    const settings = game.save.settings;
    game.save = defaults();
    game.save.settings = settings;
  }
  game.save.started = true;
  game.persist();
  music.start();
  await modelReady;

  game.hud.setVisible(true);
  if (!game.stepDone("pen")) {
    game.scripting = true;
    await game.say("narrator", "Oh no! The town has been **erased**!", "たいへん！ まちが きえてしまった！");
    await game.say("narrator", "Let's go to the **Stationery Store**!", "ぶんぼうぐやに いってみよう！");
    game.dialogue.hide();
    game.scripting = false;
  }

  let leaving: (() => void) | null = null;
  let announced = false;
  game.hud.townBtn.addEventListener("click", () => {
    if (game.area !== "store") return;
    if (game.scripting) {
      game.hud.say("Let's help Ms. Penny first!", "まず ペニーさんを たすけよう！");
      return;
    }
    leaving?.();
  });

  for (;;) {
    if (storeProgress(game.save) < 1) game.objective("Go to the Stationery Store!", "ぶんぼうぐやに いこう！", game.town.places.store.label.clone().setY(5.4));
    else game.objective(null);
    await game.waitPlace();
    game.setMarker(null);
    const door = game.town.places.store.door;
    await game.player.go(door.x, door.z);
    await game.fadeTo(() => game.enterStore());
    game.objective(null);
    await LEVELS.store.run?.(game);
    await new Promise<void>((resolve) => (leaving = resolve));
    leaving = null;
    await game.fadeTo(() => game.enterTown(true));
    if (storeProgress(game.save) >= 1 && !announced) {
      announced = true;
      game.scripting = true;
      await game.say("narrator", "Look! The **Stationery Store** is back in colour!", "みて！ ぶんぼうぐやに いろが もどった！");
      await game.say("narrator", "Next: the **Classroom**. Coming soon!", "つぎは きょうしつ。もうすぐ あそべるよ！");
      game.dialogue.hide();
      game.engine.setLensShift(0);
      game.scripting = false;
    }
  }
}

/** Test hooks (only with ?e2e=1): drive the real UI quickly and read state. */
function exposeHooks(game: Game) {
  const api = {
    game,
    state: () => ({
      area: game.area,
      waiting: game.waitingFor,
      steps: game.save.store.steps.slice(),
      slots: Object.keys(game.save.store.slots),
      model: game.recognizer ? game.recognizer.labels.length : 0,
      events: game.events.slice(-30),
      dialogue: !game.dialogue.el.classList.contains("hidden") ? game.dialogue.el.querySelector(".en")?.textContent : null,
      stats: game.stats()
    }),
    /** Feed a transcript to the open speaking prompt. */
    say: (text: string) => game.asker.simulate(text),
    clickSlot: (id: SlotId) => game.clickSlot(id),
    clickPlace: () => game.clickPlace("store"),
    /** Put the target's example drawing on the canvas (scaled to it) and press Finish. */
    drawExample: (word: WordId, color?: string) => {
      const ex = exampleFor(word);
      if (!ex) return false;
      api.drawStrokes(ex, color);
      return true;
    },
    drawStrokes: (d: Drawing, color?: string) => {
      const r = game.draw.canvasRect;
      const scale = (Math.min(r.width, r.height) * 0.7) / 255;
      const ox = (r.width - 255 * scale) / 2;
      const oy = (r.height - 255 * scale) / 2;
      game.draw.inject({ strokes: d.strokes.map((s) => ({ color: color ?? s.color, points: s.points.map(([x, y]) => [ox + x * scale, oy + y * scale] as [number, number]) })) });
      game.draw.pressFinish();
    },
    recognize: (d: Drawing) => game.recognizer?.recognize(d.strokes.map((s) => s.points)).ranked.slice(0, 5),
    wait
  };
  (window as unknown as { __ms: typeof api }).__ms = api;
}

void boot();
