/** Level 3: save, unlock order, sentences, and the bamboo rule. */
import { describe, expect, it } from "vitest";
import { exampleFor } from "../recognition/examples.ts";
import { POLICY } from "../recognition/policy.ts";
import { longThinScore, shapeFeatures } from "../recognition/shapeRules.ts";
import { simplifyLikeQuickDraw } from "../recognition/strokes.ts";
import { wordWithArticle } from "../recognition/vocab.ts";
import { judgeSpeech } from "../speech/match.ts";
import { PHRASES } from "../speech/phrases.ts";
import { isOpen } from "./levels/index.ts";
import { defaults, placeProgress, sanitize, zooUnits } from "./save.ts";

describe("zoo save", () => {
  it("saves made before the zoo load with an empty zoo", () => {
    expect(sanitize({ v: 1, store: { steps: [], slots: {} } }).zoo).toEqual({ steps: [], slots: {} });
  });

  it("keeps valid zoo progress and drops junk", () => {
    const s = sanitize({ v: 1, zoo: { steps: ["welcome", "lions", "elephants"], slots: { elephants: { tints: [null, null] }, lions: { tints: [null] } } } });
    expect(s.zoo.steps).toEqual(["welcome", "elephants"]);
    expect(Object.keys(s.zoo.slots)).toEqual(["elephants"]);
  });

  it("counts seven units: six displays and the favourite-animal talk", () => {
    const s = defaults();
    expect(zooUnits(s)).toEqual({ done: 0, total: 7 });
    s.zoo.slots.elephants = { tints: [null] };
    s.zoo.steps.push("favorite");
    expect(placeProgress(s, "zoo")).toBeCloseTo(2 / 7);
  });

  it("opens with the other places once the shop is finished (free middle)", () => {
    const s = defaults();
    expect(isOpen("zoo", s)).toBe(false);
    for (const k of ["pencilCup", "erasers", "scissors", "rulers", "crayons", "books", "notebooks", "schoolbags"] as const) s.store.slots[k] = { tints: [null] };
    s.store.steps.push("taro");
    expect(isOpen("zoo", s)).toBe(true);
  });
});

describe("zoo sentences", () => {
  const like = [PHRASES.likeYes, PHRASES.likeNo];
  it("'Do you like elephants?' — yes and no are both heard", () => {
    expect(judgeSpeech(["yes I do"], like)).toMatchObject({ id: "likeYes" });
    expect(judgeSpeech(["no I don't"], like)).toMatchObject({ id: "likeNo" });
  });
  it("'What animal do you like?'", () => {
    for (const t of ["what animal do you like", "what animals do you like", "what anymal do you like"]) expect(judgeSpeech([t], [PHRASES.whatAnimal]), t).toMatchObject({ kind: "match" });
  });
  it("'I like ___.' picks the animal said", () => {
    const opts = [PHRASES.iLikeElephants, PHRASES.iLikeMonkeys, PHRASES.iLikePandas, PHRASES.iLikePenguins];
    expect(judgeSpeech(["I like pandas"], opts)).toMatchObject({ id: "iLikePandas" });
    expect(judgeSpeech(["i like elephants"], opts)).toMatchObject({ id: "iLikeElephants" });
    expect(judgeSpeech(["I like penguin"], opts)).toMatchObject({ id: "iLikePenguins" });
    expect(judgeSpeech(["I like monkeys"], opts)).toMatchObject({ id: "iLikeMonkeys" });
  });
});

describe("bamboo", () => {
  it("has no article and its hint drawing passes the long-thin rule", () => {
    expect(wordWithArticle("bamboo")).toBe("bamboo");
    const ex = exampleFor("bamboo");
    expect(ex).not.toBeNull();
    const f = shapeFeatures(simplifyLikeQuickDraw(ex!.strokes.map((s) => s.points)));
    expect(longThinScore(f)).toBeGreaterThanOrEqual(POLICY.ruleAccept);
  });
});
