/** Spoken times: parsing every form a recogniser produces, and never cutting off "eight... thirty". */
import { describe, expect, it } from "vitest";
import { couldGrow, judgeSpeech, parseTime } from "./match.ts";
import { PHRASES, type Phrase } from "./phrases.ts";

const T = (h: number, m: number | null) => ({ h, m });

describe("parseTime", () => {
  const cases: [string, { h: number; m: number | null }][] = [
    ["eight thirty", T(8, 30)],
    ["it's eight thirty", T(8, 30)],
    ["It's 8:30.", T(8, 30)],
    ["8 30", T(8, 30)],
    ["830", T(8, 30)],
    ["eight-thirty", T(8, 30)],
    ["it's eight dirty", T(8, 30)],
    ["eight", T(8, null)],
    ["it's eight", T(8, null)],
    ["it's eight o'clock", T(8, 0)],
    ["8 o'clock", T(8, 0)],
    ["eight o clock", T(8, 0)],
    ["seven fifteen", T(7, 15)],
    ["7:15", T(7, 15)],
    ["ten forty five", T(10, 45)],
    ["ten forty-five", T(10, 45)],
    ["1045", T(10, 45)],
    ["twelve o'clock", T(12, 0)],
    ["12:00", T(12, 0)],
    ["it's twelve", T(12, null)],
    ["ate thirty", T(8, 30)]
  ];
  for (const [text, want] of cases) it(`"${text}"`, () => expect(parseTime(text)).toEqual(want));

  it("is not fooled by non-times", () => {
    expect(parseTime("good morning")).toBeNull();
    expect(parseTime("hello")).toBeNull();
  });
});

const ofTime = (h: number, m: number): Phrase => ({ id: "itsEight", en: `${h}:${m}`, keys: [["x"]], time: [h, m] });

describe("time answers", () => {
  const half = [PHRASES.itsEight, PHRASES.itsEightThirty];

  it("accepts 8:30 at normal speed, with or without It's, in every written form", () => {
    for (const t of ["eight thirty", "it's eight thirty", "8:30", "8 30", "eight-thirty", "It's 8:30"]) {
      expect(judgeSpeech([t], half), t).toMatchObject({ kind: "match", id: "itsEightThirty" });
      expect(judgeSpeech([t], half).kind === "match" && (judgeSpeech([t], half) as { pending?: boolean }).pending, t).toBeFalsy();
    }
  });

  it("does not take 'eight' alone as eight o'clock while 'thirty' may still come (the slow-speech bug)", () => {
    for (const t of ["eight", "it's eight", "it's… eight"]) expect(judgeSpeech([t], half), t).toMatchObject({ kind: "match", id: "itsEight", pending: true });
  });

  it("joins a slow answer: 'it's ... eight ... thirty'", () => {
    // Segments are joined by the recogniser wrapper; the joined text is judged as a whole.
    expect(judgeSpeech(["it's eight thirty"], half)).toMatchObject({ id: "itsEightThirty" });
  });

  it("'eight o'clock' is complete even when 8:30 is on offer", () => {
    expect(judgeSpeech(["it's eight o'clock"], half)).toMatchObject({ kind: "match", id: "itsEight" });
    expect((judgeSpeech(["it's eight o'clock"], half) as { pending?: boolean }).pending).toBeFalsy();
  });

  it("8:00 among 7:00 and 8:00 is accepted at once (no longer option to wait for)", () => {
    const j = judgeSpeech(["eight"], [PHRASES.itsSeven, PHRASES.itsEight]);
    expect(j).toMatchObject({ kind: "match", id: "itsEight" });
    expect((j as { pending?: boolean }).pending).toBeFalsy();
  });

  it("other times work the same way: 7:15, 10:45, 12:00", () => {
    expect(judgeSpeech(["seven fifteen"], [ofTime(7, 0), ofTime(7, 15)])).toMatchObject({ kind: "match" });
    expect(couldGrow("seven", ofTime(7, 0), [ofTime(7, 0), ofTime(7, 15)])).toBe(true);
    expect(judgeSpeech(["it's ten forty five"], [ofTime(10, 45)])).toMatchObject({ kind: "match" });
    expect(judgeSpeech(["twelve o'clock"], [ofTime(12, 0)])).toMatchObject({ kind: "match" });
    expect(judgeSpeech(["it's 12:00"], [ofTime(12, 0)])).toMatchObject({ kind: "match" });
  });

  it("a complete answer in a later alternative beats a pending one on top", () => {
    expect(judgeSpeech(["eight", "eight thirty"], half)).toMatchObject({ id: "itsEightThirty" });
  });
});
