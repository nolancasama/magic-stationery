/**
 * Magic Stationery: Restore the World — entry point.
 * Title -> town -> a place (Level 1 the Stationery Store, Level 2 the School) -> town, with saved progress.
 */
import "./ui/styles.css";
import { audio } from "./audio/audio.ts";
import { music } from "./audio/music.ts";
import { Game } from "./game/game.ts";
import { LEVELS } from "./game/levels/index.ts";
import { defaults, placeProgress } from "./game/save.ts";
import { exampleFor } from "./recognition/examples.ts";
import { glyphExample } from "./recognition/glyphs.ts";
import { Recognizer } from "./recognition/recognizer.ts";
import type { WordId } from "./recognition/vocab.ts";
import { tts } from "./speech/tts.ts";
import { titleScreen } from "./ui/screens.ts";
import type { PlaceId } from "./world/areas/town.ts";
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
  game.enterTown(null);
  game.hud.setVisible(false);
  game.objective(null);

  const modelUrl = `${import.meta.env.BASE_URL}models/sketch-model.bin`;
  const sketchReady = Recognizer.load(modelUrl)
    .then((r) => {
      game.recognizer = r;
      game.log("model:ok");
    })
    .catch((err) => {
      // Without the model every drawing is accepted with the pen's help: the game still completes.
      console.warn("sketch model unavailable", err);
      game.log("model:missing");
    });
  const glyphReady = Recognizer.load(`${import.meta.env.BASE_URL}models/glyph-model.bin`)
    .then((r) => {
      game.glyphs = r;
      game.log("glyphs:ok");
    })
    .catch((err) => {
      console.warn("glyph model unavailable", err);
      game.log("glyphs:missing");
    });
  const modelReady = Promise.all([sketchReady, glyphReady]);

  if (E2E) exposeHooks(game);

  // Debug views for screenshot passes: ?scene=store|school[&fill=1][&view=counter]
  const scene = params.get("scene");
  if (scene === "store" || scene === "school" || scene === "zoo") {
    await modelReady;
    game.enterRoom(scene);
    game.hud.setVisible(true);
    if (params.has("fill")) await game.debugFill();
    const view = params.get("view");
    if (view) game.focus(game.room.views[view] ?? game.room.views.overview, true);
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
  const announced = new Set<string>();
  game.hud.townBtn.addEventListener("click", () => {
    if (game.area !== "store" && game.area !== "school" && game.area !== "zoo") return;
    if (game.scripting) {
      const who: Record<string, [string, string]> = { store: ["Ms. Penny", "ペニーさん"], school: ["Ms. Mori", "もり先生"], zoo: ["Mr. Oka", "おかさん"] };
      const [en, ja] = who[game.area];
      game.hud.say(`Let's help ${en} first!`, `まず ${ja}を たすけよう！`);
      return;
    }
    leaving?.();
  });

  for (;;) {
    const next = game.nextPlace();
    if (next) game.objective(next.en, next.ja, game.town.places[next.place].label.clone().setY(5.4));
    else game.objective(null);
    const picked = await game.waitPlace();
    if (picked !== "store" && picked !== "school" && picked !== "zoo") continue;
    game.setMarker(null);
    const door = game.town.places[picked].door;
    await game.player.go(door.x, door.z);
    await game.fadeTo(() => game.enterRoom(picked));
    game.objective(null);
    await LEVELS[picked].run?.(game);
    await new Promise<void>((resolve) => (leaving = resolve));
    leaving = null;
    await game.fadeTo(() => game.enterTown(picked));
    if (placeProgress(game.save, picked) >= 1 && !announced.has(picked)) {
      announced.add(picked);
      game.scripting = true;
      if (picked === "store") {
        await game.say("narrator", "Look! The **Stationery Store** is back in colour!", "みて！ ぶんぼうぐやに いろが もどった！");
        await game.say("narrator", "Next: the **School**! Let's go!", "つぎは がっこう！ いってみよう！");
      } else if (picked === "school") {
        await game.say("narrator", "Look! The **School** is back in colour!", "みて！ がっこうに いろが もどった！");
        await game.say("narrator", "Next: the **Zoo**! Let's go!", "つぎは どうぶつえん！ いってみよう！");
      } else {
        await game.say("narrator", "Look! The **Zoo** is back in colour!", "みて！ どうぶつえんに いろが もどった！");
        await game.say("narrator", "Next: the **Supermarket**. Coming soon!", "つぎは スーパー。もうすぐ あそべるよ！");
      }
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
      school: { steps: game.save.school.steps.slice(), slots: Object.keys(game.save.school.slots), glyphs: Object.keys(game.save.school.glyphs) },
      model: game.recognizer ? game.recognizer.labels.length : 0,
      glyphModel: game.glyphs ? game.glyphs.labels.length : 0,
      events: game.events.slice(-30),
      dialogue: !game.dialogue.el.classList.contains("hidden") ? game.dialogue.el.querySelector(".en")?.textContent : null,
      stats: game.stats()
    }),
    /** Feed a transcript to the open speaking prompt. */
    say: (text: string) => game.asker.simulate(text),
    clickSlot: (id: string) => game.clickSlot(id),
    clickPlace: (id: PlaceId = "store") => game.clickPlace(id),
    /** Put the target's example drawing on the canvas (scaled to it) and press Finish. */
    drawExample: (word: WordId, color?: string) => {
      const ex = exampleFor(word);
      if (!ex) return false;
      api.drawStrokes(ex, color);
      return true;
    },
    /** Write the hand-made example of a character ("d", "12") and press Finish. */
    writeExample: (target: string) => {
      const ex = glyphExample(target);
      if (!ex) return false;
      api.drawStrokes(ex);
      return true;
    },
    drawStrokes: (d: Drawing, color?: string) => {
      const r = game.draw.canvasRect;
      let w = 255;
      let hgt = 255;
      for (const s of d.strokes) for (const [x, y] of s.points) {
        w = Math.max(w, x);
        hgt = Math.max(hgt, y);
      }
      const scale = (Math.min(r.width, r.height) * 0.7) / Math.max(w, hgt);
      const ox = (r.width - w * scale) / 2;
      const oy = (r.height - hgt * scale) / 2;
      game.draw.inject({ strokes: d.strokes.map((s) => ({ color: color ?? s.color, points: s.points.map(([x, y]) => [ox + x * scale, oy + y * scale] as [number, number]) })) });
      game.draw.pressFinish();
    },
    recognize: (d: Drawing) => game.recognizer?.recognize(d.strokes.map((s) => s.points)).ranked.slice(0, 5),
    /** Bring any drawing (0-255 space, scaled like the canvas) to life on the floor. */
    spawn: (d: Drawing, x: number, z: number, seconds = 6) => {
      const scale = 1.6;
      return game.debugSpawn({ strokes: d.strokes.map((s) => ({ color: s.color, points: s.points.map(([px, py]) => [px * scale, py * scale] as [number, number]) })) }, { x, z }, seconds);
    },
    wait
  };
  (window as unknown as { __ms: typeof api }).__ms = api;
}

void boot();
