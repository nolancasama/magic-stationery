/**
 * The game's words and how a drawing counts as each of them.
 *
 * A game word is not always a Quick, Draw! category: "schoolbag" is drawn as
 * the dataset's "backpack", "notebook" as a "book", and "ruler" is not in the
 * dataset at all (a geometric rule recognises it). `accepts` weights say how
 * much each model label counts towards the word (1 = it is that thing).
 */

export type WordId =
  | "pen"
  | "pencil"
  | "eraser"
  | "scissors"
  | "notebook"
  | "book"
  | "crayon"
  | "ruler"
  | "schoolbag"
  | "desk"
  | "chair"
  | "elephant"
  | "monkey"
  | "panda"
  | "penguin"
  | "banana"
  | "bamboo";

export interface Word {
  id: WordId;
  en: string;
  plural: string;
  /** "a" / "an" for "a pencil", "an eraser". */
  article: "a" | "an";
  ja: string;
  /** Model label -> weight towards this word. */
  accepts: Record<string, number>;
  /** A geometric rule that also recognises the word (for words the dataset lacks). */
  rule?: "longThin";
}

export const WORDS: Record<WordId, Word> = {
  pen: { id: "pen", en: "pen", plural: "pens", article: "a", ja: "ペン", accepts: { marker: 1, pencil: 0.9, crayon: 0.7, paintbrush: 0.6 } },
  pencil: { id: "pencil", en: "pencil", plural: "pencils", article: "a", ja: "えんぴつ", accepts: { pencil: 1, crayon: 0.8, marker: 0.8, paintbrush: 0.5 } },
  eraser: { id: "eraser", en: "eraser", plural: "erasers", article: "an", ja: "けしゴム", accepts: { eraser: 1, square: 0.7, calendar: 0.3, book: 0.3 } },
  scissors: { id: "scissors", en: "scissors", plural: "scissors", article: "a", ja: "はさみ", accepts: { scissors: 1, eyeglasses: 0.5 } },
  notebook: { id: "notebook", en: "notebook", plural: "notebooks", article: "a", ja: "ノート", accepts: { book: 1, calendar: 0.7, square: 0.5, laptop: 0.3 } },
  book: { id: "book", en: "book", plural: "books", article: "a", ja: "ほん", accepts: { book: 1, calendar: 0.4, laptop: 0.4, square: 0.4 } },
  crayon: { id: "crayon", en: "crayon", plural: "crayons", article: "a", ja: "クレヨン", accepts: { crayon: 1, pencil: 0.9, marker: 0.9, paintbrush: 0.5 } },
  ruler: { id: "ruler", en: "ruler", plural: "rulers", article: "a", ja: "じょうぎ", accepts: { line: 0.8, pencil: 0.3, marker: 0.3 }, rule: "longThin" },
  schoolbag: { id: "schoolbag", en: "schoolbag", plural: "schoolbags", article: "a", ja: "ランドセル", accepts: { backpack: 1, basket: 0.3, square: 0.3 } },
  // The dataset has no "desk": a table is a desk; a chair drawn from the side often reads as a table too.
  desk: { id: "desk", en: "desk", plural: "desks", article: "a", ja: "つくえ", accepts: { table: 1, laptop: 0.4, computer: 0.3, square: 0.3, chair: 0.2 } },
  chair: { id: "chair", en: "chair", plural: "chairs", article: "a", ja: "いす", accepts: { chair: 1, table: 0.35 } },
  // Level 3, the Zoo. Children's animals are often read as a close relative: count those, partly.
  elephant: { id: "elephant", en: "elephant", plural: "elephants", article: "an", ja: "ぞう", accepts: { elephant: 1, rhinoceros: 0.5, pig: 0.3, mouse: 0.2 } },
  monkey: { id: "monkey", en: "monkey", plural: "monkeys", article: "a", ja: "さる", accepts: { monkey: 1, bear: 0.35, "teddy-bear": 0.35, mouse: 0.25, cat: 0.2 } },
  panda: { id: "panda", en: "panda", plural: "pandas", article: "a", ja: "パンダ", accepts: { panda: 1, bear: 0.6, "teddy-bear": 0.5, mouse: 0.2 } },
  penguin: { id: "penguin", en: "penguin", plural: "penguins", article: "a", ja: "ペンギン", accepts: { penguin: 1, bird: 0.35, duck: 0.35, owl: 0.3 } },
  banana: { id: "banana", en: "banana", plural: "bananas", article: "a", ja: "バナナ", accepts: { banana: 1, moon: 0.4, carrot: 0.2 } },
  // Not a Quick, Draw! category: a long thin shape (like the ruler) or what children draw instead.
  bamboo: { id: "bamboo", en: "bamboo", plural: "bamboo", article: "a", ja: "たけ", accepts: { line: 0.8, "palm tree": 0.4, tree: 0.3, pencil: 0.3, grass: 0.3 }, rule: "longThin" }
};

/** Model labels that mean "not a real thing yet": plain shapes and scribbles. */
export const SHAPE_LABELS = new Set(["circle", "square", "triangle", "line", "squiggle", "zigzag"]);

/** How a model label reads in English ("teddy-bear" -> "teddy bear"). */
const DISPLAY: Record<string, string> = {
  "teddy-bear": "teddy bear",
  "t-shirt": "T-shirt",
  "cell phone": "phone",
  "alarm clock": "clock",
  "baseball bat": "bat",
  "tennis racquet": "tennis racket",
  "eyeglasses": "glasses",
  "light bulb": "light bulb",
  "smiley face": "smiley face",
  "palm tree": "palm tree",
  "sea turtle": "sea turtle",
  "hot dog": "hot dog",
  "ice cream": "ice cream",
  "soccer ball": "soccer ball",
  "paper clip": "paper clip",
  backpack: "schoolbag"
};

const PLURAL_LABELS = new Set(["scissors", "grapes", "peas", "eyeglasses", "grass"]);

export function labelWord(label: string): string {
  return DISPLAY[label] ?? label;
}

/** "a rabbit", "an elephant", "scissors". */
export function withArticle(label: string): string {
  const w = labelWord(label);
  if (PLURAL_LABELS.has(label)) return w;
  return (/^[aeiou]/i.test(w) && !/^uni/i.test(w) ? "an " : "a ") + w;
}

export function wordWithArticle(id: WordId): string {
  const w = WORDS[id];
  return id === "scissors" || id === "bamboo" ? w.en : `${w.article} ${w.en}`;
}
