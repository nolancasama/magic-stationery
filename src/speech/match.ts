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

export function matchesPhrase(text: string, p: Phrase): boolean {
  const words = heardWords(text);
  if (p.forbid?.some((w) => words.has(w))) return false;
  return p.keys.every((group) => group.some((w) => words.has(w.replace(/\s+/g, ""))));
}

export type Judgement =
  | { kind: "match"; id: PhraseId; heard: string }
  | { kind: "unclear"; heard: string }
  | { kind: "none"; heard: string };

function judgeOne(text: string, options: readonly Phrase[]): Judgement | null {
  const hits = options.filter((p) => matchesPhrase(text, p));
  if (hits.length === 1) return { kind: "match", id: hits[0].id, heard: text };
  if (hits.length > 1) return { kind: "unclear", heard: text };
  return null;
}

export function judgeSpeech(alternatives: readonly string[], options: readonly Phrase[]): Judgement {
  const [top = "", ...rest] = alternatives;
  const first = judgeOne(top, options);
  if (first) return first;
  for (const alt of rest) {
    const j = judgeOne(alt, options);
    if (j?.kind === "match") return j;
  }
  return { kind: "none", heard: top };
}
