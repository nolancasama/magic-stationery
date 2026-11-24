import { describe, expect, it } from "vitest";
import { isSpeechPrefix, judgeSpeech, matchesPhrase } from "./match.ts";
import { PHRASES, type PhraseId } from "./phrases.ts";

const P = PHRASES;

describe("Do you have a pen?", () => {
  const ok = ["do you have a pen", "Do you have a pen?", "you have a pen", "do you happen", "do you have a pan", "do you have a ben", "have pen", "do you half a pen", "do you have pens"];
  for (const t of ok) it(`accepts "${t}"`, () => expect(matchesPhrase(t, P.doYouHavePen)).toBe(true));
  const bad = ["do you like pens", "hello", "pen", "do you have a pencil case"];
  it("rejects other sentences", () => {
    expect(matchesPhrase(bad[0], P.doYouHavePen)).toBe(false);
    expect(matchesPhrase(bad[1], P.doYouHavePen)).toBe(false);
    expect(matchesPhrase(bad[2], P.doYouHavePen)).toBe(false);
  });
});

describe("yes / no", () => {
  const opts = [P.yesIDo, P.noIDont];
  it("hears yes", () => {
    for (const t of ["yes I do", "yes", "yeah I do", "I do", "yes I did"]) expect(judgeSpeech([t], opts)).toMatchObject({ kind: "match", id: "yesIDo" });
  });
  it("hears no", () => {
    for (const t of ["no I don't", "no", "know I don't", "I don't", "no I do not", "nope"]) expect(judgeSpeech([t], opts)).toMatchObject({ kind: "match", id: "noIDont" });
  });
  it("yes and no together is not a yes", () => {
    expect(judgeSpeech(["yes no"], opts).kind).not.toBe("match");
  });
});

describe("This is for you.", () => {
  it("accepts natural and misheard forms", () => {
    for (const t of ["this is for you", "this is four you", "these for you", "this is 4 you", "for you"]) expect(matchesPhrase(t, P.thisIsForYou)).toBe(true);
  });
  it("rejects thank you", () => {
    expect(matchesPhrase("thank you", P.thisIsForYou)).toBe(false);
  });
});

describe("alternatives", () => {
  it("only rescue a top hypothesis that matched nothing", () => {
    expect(judgeSpeech(["do you have a bed", "do you have a pen"], [P.doYouHavePen])).toMatchObject({ kind: "match" });
    expect(judgeSpeech(["no I don't", "yes I do"], [P.yesIDo, P.noIDont])).toMatchObject({ id: "noIDont" });
  });
});

describe("accept or keep listening", () => {
  const cases: [string, string, PhraseId, PhraseId[]][] = [
    ["Here you are.", "Here you", "hereYouAre", ["hereYouAre"]],
    ["Do you have a pencil?", "Do you have", "doYouHavePencil", ["doYouHavePencil"]],
    ["Eight thirty.", "Eight", "itsEightThirty", ["itsEightThirty"]],
    ["I like apples.", "I like", "iLikeApples", ["iLikeApples"]]
  ];
  it.each(cases)("accepts a complete %s and recognises its prefix", (full, prefix, id, ids) => {
    const options = ids.map((option) => P[option]);
    expect(judgeSpeech([full], options)).toEqual({ kind: "match", id, heard: full });
    expect(judgeSpeech([prefix], options).kind).toBe("none");
    expect(isSpeechPrefix(prefix, options)).toBe(true);
  });

  it("only settles eight when a longer valid choice is on offer", () => {
    expect(judgeSpeech(["eight"], [P.itsEight, P.itsEightThirty])).toMatchObject({ id: "itsEight", pending: true });
    expect(judgeSpeech(["eight"], [P.itsEight, P.itsSeven])).toEqual({ kind: "match", id: "itsEight", heard: "eight" });
  });
});
