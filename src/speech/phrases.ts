/**
 * Every sentence the student says or taps. `keys`: one word from each group
 * must be heard (accent and recogniser variants included). Articles, "do you",
 * punctuation and word order are not judged: a false rejection teaches a child
 * that correct English was wrong (sibling-game lesson, esl-likes).
 * Adjacent words are also tried joined, so "have a pen" heard as "happen" and
 * "for you" heard as "foryou" still count.
 */

export interface Phrase {
  id: PhraseId;
  en: string;
  ja?: string;
  keys: string[][];
  /** Hearing any of these rules the phrase out ("no" in a "yes" answer). */
  forbid?: string[];
  /** Wrong-but-plausible sentences shown with it when taps are the rescue. */
  distractors?: PhraseId[];
}

export type PhraseId =
  | "doYouHavePen"
  | "yesIDo"
  | "noIDont"
  | "thisIsForYou"
  | "doYouLikePens"
  | "whatTimeIsIt"
  | "thankYou"
  | "iLikeRed"
  | "hello"
  | "goodMorning"
  | "itsSeven"
  | "itsEight"
  | "itsEightThirty";

const HAVE = ["have", "has", "had", "half", "haf", "hab", "habu", "hav", "haven", "halve", "heave", "hove", "happen", "happened", "having", "havea", "of", "ever"];
const PEN = ["pen", "pens", "pen's", "penn", "pin", "pins", "pan", "pans", "ben", "pain", "pent", "penny", "happen", "happened", "apen", "upen", "pem", "pend", "pain", "spen"];
const YES = ["yes", "yeah", "yep", "yup", "yea", "yas", "yess", "yesh", "jess", "ies", "guess", "ido", "ya", "yah", "yees", "years", "yet"];
const NO = ["no", "nope", "nah", "know", "noh", "nou", "nor", "not", "don't", "dont", "idont", "doent", "noi", "now", "nobody", "known"];
const FOR = ["for", "four", "4", "fo", "foe", "fore", "fur", "far", "pour", "four", "forth", "foryou", "4you", "fall", "foa", "hoe", "ho"];
// Time answers (Level 2). Recognisers write "8:30" as digits: the colon splits it into "8" "30".
const SEVEN = ["seven", "7", "heaven", "sevens", "seben", "sven", "kevin"];
const EIGHT = ["eight", "8", "ate", "eighth", "eit", "eat", "hate", "eighty", "eights"];
const THIRTY = ["thirty", "30", "dirty", "thirsty", "therty", "thurty", "sirty", "shirty", "sardy", "sati", "turkey"];
const MORNING = ["morning", "mornin", "moaning", "mooning", "mourning", "morningu", "mooring", "warning", "goodmorning"];
const YOU = ["you", "u", "yu", "your", "you're", "youre", "ya", "yo", "yoo", "ewe", "yew", "foryou", "4you", "ewe", "hue", "q"];

export const PHRASES: Record<PhraseId, Phrase> = {
  doYouHavePen: {
    id: "doYouHavePen",
    en: "Do you have a pen?",
    ja: "ペンを もっていますか？",
    keys: [HAVE, PEN],
    distractors: ["doYouLikePens", "whatTimeIsIt"]
  },
  yesIDo: { id: "yesIDo", en: "Yes, I do.", ja: "はい、もっています。", keys: [YES], forbid: NO },
  noIDont: { id: "noIDont", en: "No, I don't.", ja: "いいえ、もっていません。", keys: [NO], forbid: ["yes", "yeah", "yep", "yup"] },
  thisIsForYou: {
    id: "thisIsForYou",
    en: "This is for you.",
    ja: "これを どうぞ。",
    keys: [FOR, YOU],
    distractors: ["thankYou", "doYouHavePen"]
  },
  doYouLikePens: { id: "doYouLikePens", en: "Do you like pens?", keys: [["like", "likes"], PEN] },
  whatTimeIsIt: { id: "whatTimeIsIt", en: "What time is it?", keys: [["time", "times"]] },
  thankYou: { id: "thankYou", en: "Thank you.", keys: [["thank", "thanks", "sank", "tank"]] },
  iLikeRed: { id: "iLikeRed", en: "I like red.", keys: [["like"], ["red"]] },
  hello: { id: "hello", en: "Hello!", keys: [["hello", "hi", "hallo", "hullo"]] },
  goodMorning: { id: "goodMorning", en: "Good morning!", ja: "おはようございます！", keys: [MORNING], distractors: ["hello", "thankYou"] },
  itsSeven: { id: "itsSeven", en: "It's seven o'clock.", ja: "7じです。", keys: [SEVEN], forbid: [...THIRTY, ...EIGHT] },
  itsEight: { id: "itsEight", en: "It's eight o'clock.", ja: "8じです。", keys: [EIGHT], forbid: [...THIRTY, ...SEVEN] },
  itsEightThirty: { id: "itsEightThirty", en: "It's eight thirty.", ja: "8じ30ぷんです。", keys: [EIGHT, THIRTY], forbid: SEVEN }
};
