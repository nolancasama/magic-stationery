/**
 * What a drawing means for the task at hand. Forgiving by design:
 * - ambiguous drawings that could be the target are accepted;
 * - a confident drawing of some other fun thing is a "surprise" (it appears
 *   and plays, but does not complete the task);
 * - scribbles, plain shapes and near-empty canvases are "unclear";
 * - the third non-accepted attempt is accepted with the pen's help, so every
 *   child can always finish.
 */
import type { Recognition } from "./recognizer.ts";
import { longThinScore } from "./shapeRules.ts";
import { SHAPE_LABELS, WORDS, type WordId } from "./vocab.ts";

export type Verdict =
  | { kind: "accept"; how: "model" | "rule" | "help"; score: number }
  | { kind: "surprise"; label: string; p: number }
  | { kind: "unclear"; reason: "tooLittle" | "shape" | "unsure"; best: string | null; countsAsMiss: boolean };

export const POLICY = {
  /** Below this much ink (canvas px) or this size, the drawing has not started: no miss. */
  minInk: 60,
  minSize: 26,
  /** Weighted target probability that accepts outright. */
  acceptScore: 0.2,
  /** A strong alias in the top three accepts from this lower score. */
  top3Score: 0.05,
  /** A confident other thing becomes a surprise from this probability. */
  surpriseP: 0.38,
  /** Shape rule score that accepts. */
  ruleAccept: 0.55,
  /** Non-accepted attempts before the pen helps (the next one is accepted). */
  helpAfter: 3
};

export interface JudgeOptions {
  /** Non-accepted attempts so far on this task. */
  misses: number;
  /** Labels that can appear as a surprise (default: every non-shape label). */
  canSurprise?: (label: string) => boolean;
}

/** Sum of the model's probabilities for labels that count as the word. */
export function targetScore(rec: Recognition, target: WordId): number {
  const accepts = WORDS[target].accepts;
  let s = 0;
  rec.labels.forEach((label, i) => {
    const w = accepts[label];
    if (w) s += w * rec.probs[i];
  });
  return s;
}

export function ruleScore(rec: Recognition, target: WordId): number {
  return WORDS[target].rule === "longThin" ? longThinScore(rec.features) : 0;
}

export function judge(rec: Recognition, target: WordId, opts: JudgeOptions): Verdict {
  const best = rec.ranked[0] ?? null;
  if (rec.ink < POLICY.minInk || rec.size < POLICY.minSize) {
    return { kind: "unclear", reason: "tooLittle", best: null, countsAsMiss: false };
  }
  const accepts = WORDS[target].accepts;
  const score = targetScore(rec, target);
  const rule = ruleScore(rec, target);
  if (rule >= POLICY.ruleAccept) return { kind: "accept", how: "rule", score: Math.max(rule, score) };
  const strongInTop3 = rec.ranked.slice(0, 3).some((r) => (accepts[r.label] ?? 0) >= 0.7);
  const topIsTarget = best !== null && (accepts[best.label] ?? 0) >= 0.7;
  if (topIsTarget || score >= POLICY.acceptScore || (strongInTop3 && score >= POLICY.top3Score)) {
    return { kind: "accept", how: "model", score };
  }
  if (opts.misses + 1 >= POLICY.helpAfter) return { kind: "accept", how: "help", score };
  const canSurprise = opts.canSurprise ?? (() => true);
  if (best && !SHAPE_LABELS.has(best.label) && best.p >= POLICY.surpriseP && canSurprise(best.label)) {
    return { kind: "surprise", label: best.label, p: best.p };
  }
  if (best && SHAPE_LABELS.has(best.label) && best.p >= 0.3) {
    return { kind: "unclear", reason: "shape", best: best.label, countsAsMiss: true };
  }
  return { kind: "unclear", reason: "unsure", best: best && best.p >= 0.2 ? best.label : null, countsAsMiss: true };
}

/** A live guess worth showing while the child draws (null = say nothing yet). */
export function liveGuess(rec: Recognition, target: WordId | null): { label: string; isTarget: boolean } | null {
  if (rec.ink < POLICY.minInk * 0.8) return null;
  if (target) {
    const score = targetScore(rec, target);
    if (score >= 0.35 || ruleScore(rec, target) >= POLICY.ruleAccept) return { label: target, isTarget: true };
  }
  const best = rec.ranked[0];
  if (!best || best.p < 0.3 || SHAPE_LABELS.has(best.label)) return null;
  return { label: best.label, isTarget: false };
}
