/**
 * Judges what the recogniser heard against the sentences on offer
 * (same rules as monster-island's classroom-tested matcher):
 * - punctuation, capitals, articles and word order are ignored;
 * - adjacent words are also tried joined ("have a pen" -> "happen" is caught
 *   by listing "happen" as a variant; "for you" -> "foryou");
 * - only the top hypothesis judges; later alternatives may rescue a result in
 *   which nothing matched, never overrule one that did;
 * - matching two different sentences at once is unclear.
 */
import type { Phrase, PhraseId } from "./phrases.ts";

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9' -]+/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/** Words heard, plus every pair (and triple) of neighbours joined. */
export function heardWords(text: string): Set<string> {
  const tokens = tokenize(text);
  const out = new Set(tokens);
  for (let i = 0; i + 1 < tokens.length; i++) {
    out.add(tokens[i] + tokens[i + 1]);
    if (i + 2 < tokens.length) out.add(tokens[i] + tokens[i + 1] + tokens[i + 2]);
  }
  return out;
}

// ---------------------------------------------------------------- times ("It's eight thirty.")
/** Number words, with the recogniser's usual homophones for children's speech. */
const NUM: Record<string, number> = {
  zero: 0, oh: 0, o: 0,
  one: 1, won: 1, two: 2, to: 2, too: 2, three: 3, tree: 3, four: 4, for: 4, fore: 4, five: 5, six: 6, sex: 6, seven: 7, sven: 7, heaven: 7,
  eight: 8, ate: 8, eit: 8, nine: 9, nein: 9, ten: 10, tin: 10, eleven: 11, twelve: 12,
  fifteen: 15, fifty: 50, twenty: 20, thirty: 30, forty: 40, fourty: 40,
  // Common mis-hearings of "thirty" / "fifteen" / "forty".
  dirty: 30, thirsty: 30, therty: 30, thurty: 30, sirty: 30, shirty: 30, sardy: 30, fifteenth: 15, fourteen: 14, thirteen: 13
};
const OCLOCK = new Set(["oclock", "o'clock", "clock", "oklock"]);
const FILLER = new Set(["it's", "its", "it", "is", "i", "think", "um", "uh", "er", "the", "time", "now", "a", "m", "am", "pm", "and"]);

export interface SpokenTime {
  h: number;
  /** null: only the hour was heard so far ("eight..."). */
  m: number | null;
}

/**
 * The time in a transcript, however the recogniser wrote it: "eight thirty",
 * "it's 8:30", "8 30", "830", "eight-thirty", "eight... thirty", "twelve o'clock",
 * "ten forty five". Hours 1-12; minutes 00-59 (or "o'clock" = 0).
 */
export function parseTime(text: string): SpokenTime | null {
  const raw = tokenize(text).filter((t) => !FILLER.has(t));
  // "830" / "1045" written as one number.
  const tokens: string[] = [];
  for (const t of raw) {
    const m = /^(\d{1,2})(\d{2})$/.exec(t);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) tokens.push(m[1], m[2]);
    else tokens.push(t);
  }
  const num = (t: string | undefined): number | null => (t === undefined ? null : /^\d+$/.test(t) ? Number(t) : t in NUM ? NUM[t] : null);
  for (let i = 0; i < tokens.length; i++) {
    const h = num(tokens[i]);
    if (h === null || h < 1 || h > 12) continue;
    const next = tokens[i + 1];
    if (next === undefined) return { h, m: null };
    if (OCLOCK.has(next)) return { h, m: 0 };
    let m = num(next);
    if (m === null) return { h, m: null };
    // "forty five", "thirty five": tens then units.
    const unit = num(tokens[i + 2]);
    if (m >= 20 && m % 10 === 0 && unit !== null && unit >= 1 && unit <= 9) m += unit;
    // "oh five" -> 5
    if (m === 0 && next !== "00" && unit !== null && unit <= 9) m = unit;
    if (m > 59) return { h, m: null };
    // A spoken single digit after the hour ("eight... eight", "seven eight") is not minutes.
    if (!/^\d+$/.test(next) && m >= 1 && m <= 9 && next !== "oh") return { h, m: null };
    return { h, m };
  }
  return null;
}

function timeMatches(text: string, p: Phrase): boolean {
  const t = parseTime(text);
  if (!t || !p.time) return false;
  return t.h === p.time[0] && (t.m ?? 0) === p.time[1];
}

export function matchesPhrase(text: string, p: Phrase): boolean {
  if (p.time) return timeMatches(text, p);
  const words = heardWords(text);
  if (p.forbid?.some((w) => words.has(w))) return false;
  return p.keys.every((group) => group.some((w) => words.has(w.replace(/\s+/g, ""))));
}

/**
 * Could more words still turn this match into another option? "It's eight..."
 * matches "It's eight o'clock." but is also the start of "It's eight thirty.":
 * a child who pauses between the hour and the minutes must not be cut off.
 */
export function couldGrow(text: string, matched: Phrase, options: readonly Phrase[]): boolean {
  if (matched.time) {
    const t = parseTime(text);
    if (!t || t.m !== null) return false;
    return options.some((o) => o !== matched && o.time && o.time[0] === t.h && o.time[1] !== 0);
  }
  // A key phrase whose keys are all part of a longer option.
  return options.some((o) => o !== matched && !o.time && o.keys.length > matched.keys.length && matched.keys.every((g) => o.keys.includes(g)));
}

export type Judgement =
  | { kind: "match"; id: PhraseId; heard: string; pending?: boolean }
  | { kind: "unclear"; heard: string }
  | { kind: "none"; heard: string };

function judgeOne(text: string, options: readonly Phrase[]): Judgement | null {
  const hits = options.filter((p) => matchesPhrase(text, p));
  if (hits.length === 1) return couldGrow(text, hits[0], options) ? { kind: "match", id: hits[0].id, heard: text, pending: true } : { kind: "match", id: hits[0].id, heard: text };
  if (hits.length > 1) return { kind: "unclear", heard: text };
  return null;
}

export function judgeSpeech(alternatives: readonly string[], options: readonly Phrase[]): Judgement {
  const [top = "", ...rest] = alternatives;
  const first = judgeOne(top, options);
  if (first && !(first.kind === "match" && first.pending)) return first;
  // A complete match in a later alternative beats a pending one in the top.
  for (const alt of rest) {
    const j = judgeOne(alt, options);
    if (j?.kind === "match" && !j.pending) return j;
  }
  if (first) return first;
  for (const alt of rest) {
    const j = judgeOne(alt, options);
    if (j?.kind === "match") return j;
  }
  return { kind: "none", heard: top };
}
