import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskPrompt, markSpeechTiming, type SpeechTimings } from "../ui/ask.ts";
import { Dialogue } from "../ui/dialogue.ts";
import type { PhraseId } from "./phrases.ts";

// The prompt needs only basic elements here. CSS and browser interaction are covered in fixes.spec.ts.
class Element extends EventTarget {
  parentElement?: Element;
  classList = { add() {}, remove() {}, toggle() {} };
  style = {};
  append(...children: unknown[]) {
    for (const child of children) if (child instanceof Element) child.parentElement = this;
  }
  appendChild(child: Element) { this.append(child); }
  setAttribute() {}
  querySelector() { return null; }
}

type Step = { at: number; text?: string; final?: boolean; end?: boolean; speechEnd?: boolean };
let scripts: Step[][];
let sessions: FakeRecognition[];

/** Replay the same result and stop timing as the scripted Playwright recogniser. */
class FakeRecognition {
  onresult?: (event: unknown) => void;
  onend?: () => void;
  onaudiostart?: () => void;
  onsoundstart?: () => void;
  onspeechstart?: () => void;
  onspeechend?: () => void;
  private timers: number[] = [];

  start() {
    sessions.push(this);
    const results: ({ transcript: string }[] & { isFinal: boolean })[] = [];
    this.onaudiostart?.();
    let speaking = false;
    for (const step of scripts.shift() ?? []) {
      this.timers.push(window.setTimeout(() => {
        if (step.end) return this.abort();
        if (step.speechEnd) return this.onspeechend?.();
        if (step.text && !speaking) {
          speaking = true;
          this.onsoundstart?.();
          this.onspeechstart?.();
        }
        if (results.at(-1)?.isFinal === false) results.pop();
        results.push(Object.assign([{ transcript: step.text ?? "" }], { isFinal: !!step.final }));
        this.onresult?.({ resultIndex: results.length - 1, results });
      }, step.at));
    }
  }

  stop() {
    this.timers.push(window.setTimeout(() => this.abort(), 30));
  }

  abort() {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.onend?.();
  }

  lateResult(text: string) {
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
    this.onend?.();
  }
}

let pressMic: () => void;
let parent: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  vi.spyOn(console, "debug").mockImplementation(() => {});
  const events = new EventTarget();
  vi.stubGlobal("window", Object.assign(events, {
    setTimeout, clearTimeout, __speechDebug: true, SpeechRecognition: FakeRecognition
  }));
  vi.stubGlobal("document", { createElement: () => new Element() });
  pressMic = () => events.dispatchEvent(Object.assign(new Event("keydown"), { key: " " }));
  parent = new Element() as unknown as HTMLElement;
  scripts = [];
  sessions = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function relativeTimings() {
  const timing = window.__speechTimings as SpeechTimings;
  return Object.fromEntries(Object.entries(timing).map(([mark, at]) => [mark, at - timing.press!]));
}

function openPrompt(options: PhraseId[] = ["itsEight", "itsEightThirty"]) {
  const prompt = new AskPrompt(parent, { micAllowed: () => true, japanese: () => true });
  const states: string[] = [];
  prompt.onSession = (state) => states.push(state);
  const answer = prompt.ask({ kind: "choice", options });
  return { prompt, states, answer };
}

describe("speech prompt timing", () => {
  it("measures a matching interim, prompt resolution and the reply start", async () => {
    scripts = [[{ at: 100, text: "it's" }, { at: 300, text: "eight thirty" }, { at: 500, text: "eight thirty", final: true }]];
    const { answer } = openPrompt();
    const dialogue = new Dialogue(parent);
    dialogue.onSpeaking = (_, speaking) => {
      if (speaking) markSpeechTiming(window.__speechTimings, "npcLineStart");
    };
    void answer.then(() => dialogue.announce("pen", "Thank you!"));
    pressMic();
    await vi.advanceTimersByTimeAsync(900);
    expect(await answer).toBe("itsEightThirty");
    expect(relativeTimings()).toEqual({
      press: 0, recognitionStart: 0, audioStart: 0, soundStart: 100, speechStart: 100,
      firstInterim: 100, firstMatchingInterim: 300, judgeDone: 300, accepted: 300,
      promptResolved: 500, npcLineStart: 500
    });
  });

  it("measures a shorter answer settling when a longer option is offered", async () => {
    scripts = [[{ at: 300, text: "eight", final: true }]];
    const { answer } = openPrompt();
    pressMic();
    await vi.advanceTimersByTimeAsync(4000);
    expect(await answer).toBe("itsEight");
    expect(relativeTimings()).toMatchObject({ final: 300, judgeDone: 300, accepted: 3330, promptResolved: 3530 });
  });

  it("measures how long a wrong final takes to count as a miss", async () => {
    scripts = [[{ at: 300, text: "banana", final: true }]];
    const { states } = openPrompt();
    pressMic();
    await vi.advanceTimersByTimeAsync(1329);
    expect(states).toEqual(["listening"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(states).toEqual(["listening", "miss"]);
  });

  it("keeps a pencil prefix through a pause and joins the next session after a browser endpoint", async () => {
    scripts = [[{ at: 300, text: "Do you have", final: true }, { at: 600, end: true }], [{ at: 2100, text: "a pencil" }]];
    const { answer, states } = openPrompt(["doYouHavePencil"]);
    pressMic();
    await vi.advanceTimersByTimeAsync(2699);
    expect(states).toEqual(["listening", "continue"]);
    sessions[0].lateResult("Do you have a pencil?");
    expect(states).toEqual(["listening", "continue"]);
    await vi.advanceTimersByTimeAsync(201);
    expect(await answer).toBe("doYouHavePencil");
    expect(states).toEqual(["listening", "continue", "match"]);
    expect(relativeTimings()).toMatchObject({ final: 300, accepted: 2700, promptResolved: 2900 });
  });

  it("lets an unmatched interim be corrected before the endpoint", async () => {
    scripts = [[{ at: 100, text: "banana" }, { at: 1500, speechEnd: true }, { at: 2300, text: "I like apples" }]];
    const { answer, states } = openPrompt(["iLikeApples"]);
    pressMic();
    await vi.advanceTimersByTimeAsync(2299);
    expect(states).toEqual(["listening"]);
    await vi.advanceTimersByTimeAsync(201);
    expect(await answer).toBe("iLikeApples");
    expect(states).toEqual(["listening", "match"]);
  });

  it("ignores late results and cannot open another session during the success hold", async () => {
    scripts = [[{ at: 100, text: "eight thirty" }], [{ at: 100, text: "here you are" }]];
    const { prompt, answer, states } = openPrompt();
    pressMic();
    pressMic();
    await vi.advanceTimersByTimeAsync(100);
    pressMic();
    sessions[0].lateResult("eight o'clock");
    expect(sessions).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(await answer).toBe("itsEightThirty");
    const next = prompt.ask({ kind: "command", options: ["hereYouAre"] });
    pressMic();
    sessions[0].lateResult("here you are");
    expect(states).toEqual(["listening", "match", "listening"]);
    await vi.advanceTimersByTimeAsync(300);
    expect(await next).toBe("hereYouAre");
    expect(states).toEqual(["listening", "match", "listening", "match"]);
  });

  it("cancels the success hold when a replacement prompt opens", async () => {
    scripts = [[{ at: 100, text: "eight thirty" }], [{ at: 600, text: "here you are" }]];
    const { prompt, states } = openPrompt();
    pressMic();
    await vi.advanceTimersByTimeAsync(110);
    expect(states).toEqual(["listening", "match"]);
    const next = prompt.ask({ kind: "command", options: ["hereYouAre"] });
    pressMic();
    await vi.advanceTimersByTimeAsync(800);
    expect(await next).toBe("hereYouAre");
  });
});
