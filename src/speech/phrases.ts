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
  /**
   * A time sentence: judged by the time heard (hour, minutes), in any spoken or
   * written form, instead of by key words (speech/match.ts parseTime).
   */
  time?: [number, number];
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
  | "itsEightThirty"
  | "likeYes"
  | "likeNo"
  | "whatAnimal"
  | "iLikeElephants"
  | "iLikeMonkeys"
  | "iLikePandas"
  | "iLikePenguins"
  | "whatDoYouWant"
  | "howMany"
  | "hereYouAre"
  | "wantApples"
  | "wantOranges"
  | "wantTomatoes"
  | "wantCarrots"
  | "wantEggs"
  | "onePlease"
  | "twoPlease"
  | "threePlease"
  | "fourPlease"
  | "fivePlease";

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
// The Zoo (Level 3).
const LIKE = ["like", "likes", "lie", "light", "lake", "bike", "liked", "ilike", "lik"];
const ANIMAL = ["animal", "animals", "anymal", "animo", "animals", "enemy", "anima", "an animal"];
const ELEPHANT = ["elephant", "elephants", "elefant", "elephan", "elegant", "element", "relevant"];
const MONKEY = ["monkey", "monkeys", "monkee", "mankey", "manky", "funky", "monk"];
const PANDA = ["panda", "pandas", "banda", "fonda", "honda", "pander"];
const PENGUIN = ["penguin", "penguins", "pinguin", "pengwin", "penguine", "pen win", "pingu"];
const YOU = ["you", "u", "yu", "your", "you're", "youre", "ya", "yo", "yoo", "ewe", "yew", "foryou", "4you", "ewe", "hue", "q"];
// The Supermarket (Level 4). Answers are judged by the item or number word alone:
// "Apples, please." and "Three, please." are correct answers too.
const WHAT = ["what", "what's", "whats", "wat", "wot", "whatcha", "watch", "what'd", "but"];
const WANT = ["want", "wants", "wanna", "won't", "wont", "wan", "went", "wand", "wanted", "one", "won"];
const HOW = ["how", "hau", "hao", "who", "hows", "how's", "wow"];
const MANY = ["many", "money", "mini", "menu", "meny", "mani", "manny", "mommy", "mainly", "men", "manyu"];
const HERE = ["here", "hear", "hair", "hare", "heer", "here's", "heres", "hiya", "ear", "year", "hero", "near"];
const APPLE = ["apple", "apples", "appel", "aple", "apo", "happle", "abble", "app", "apps", "apples'"];
const ORANGE = ["orange", "oranges", "orenji", "orange's", "orangey", "arranged", "arrange", "range", "oran"];
const TOMATO = ["tomato", "tomatoes", "tomatos", "tomate", "tomahto", "tamato", "tomeito", "potato", "tomatoe"];
const CARROT = ["carrot", "carrots", "carat", "karat", "parrot", "carrot's", "kerrot", "karrot", "carry"];
const EGG = ["egg", "eggs", "ag", "aggs", "ex", "eck", "ek", "edge", "hegg", "egs", "eg"];
const ONE = ["one", "1", "won", "wan", "juan", "wun", "own"];
const TWO = ["two", "2", "to", "too", "tu", "toe", "tow", "tooth"];
const THREE = ["three", "3", "tree", "free", "sree", "trees", "thee", "sri", "threw", "through"];
const FOUR = ["four", "4", "for", "fore", "foe", "fo", "pour", "far", "floor"];
const FIVE = ["five", "5", "fife", "fight", "fine", "hive", "vibe", "fives", "faiv"];

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
  // Times are judged by value (match.ts parseTime); keys document the words only.
  itsSeven: { id: "itsSeven", en: "It's seven o'clock.", ja: "7じです。", keys: [SEVEN], time: [7, 0] },
  itsEight: { id: "itsEight", en: "It's eight o'clock.", ja: "8じです。", keys: [EIGHT], time: [8, 0] },
  itsEightThirty: { id: "itsEightThirty", en: "It's eight thirty.", ja: "8じ30ぷんです。", keys: [EIGHT, THIRTY], time: [8, 30] },
  // "Do you like elephants?" — the child's own preference: both answers are right.
  likeYes: { id: "likeYes", en: "Yes, I do.", ja: "はい、すきです。", keys: [YES], forbid: NO },
  likeNo: { id: "likeNo", en: "No, I don't.", ja: "いいえ、すきでは ありません。", keys: [NO], forbid: ["yes", "yeah", "yep", "yup"] },
  whatAnimal: { id: "whatAnimal", en: "What animal do you like?", ja: "どんな どうぶつが すきですか？", keys: [ANIMAL, LIKE], distractors: ["doYouLikePens", "whatTimeIsIt"] },
  iLikeElephants: { id: "iLikeElephants", en: "I like elephants.", ja: "ぞうが すきです。", keys: [LIKE, ELEPHANT] },
  iLikeMonkeys: { id: "iLikeMonkeys", en: "I like monkeys.", ja: "さるが すきです。", keys: [LIKE, MONKEY] },
  iLikePandas: { id: "iLikePandas", en: "I like pandas.", ja: "パンダが すきです。", keys: [LIKE, PANDA] },
  iLikePenguins: { id: "iLikePenguins", en: "I like penguins.", ja: "ペンギンが すきです。", keys: [LIKE, PENGUIN] },
  // The Supermarket: the child serves customers, then shops.
  whatDoYouWant: { id: "whatDoYouWant", en: "What do you want?", ja: "なにが ほしいですか？", keys: [WHAT, WANT], distractors: ["howMany", "whatAnimal"] },
  howMany: { id: "howMany", en: "How many?", ja: "いくつ？", keys: [HOW, MANY], distractors: ["whatDoYouWant", "hereYouAre"] },
  hereYouAre: { id: "hereYouAre", en: "Here you are.", ja: "はい、どうぞ。", keys: [HERE], distractors: ["thankYou", "howMany"] },
  wantApples: { id: "wantApples", en: "I want apples, please.", ja: "りんごを ください。", keys: [APPLE] },
  wantOranges: { id: "wantOranges", en: "I want oranges, please.", ja: "オレンジを ください。", keys: [ORANGE] },
  wantTomatoes: { id: "wantTomatoes", en: "I want tomatoes, please.", ja: "トマトを ください。", keys: [TOMATO] },
  wantCarrots: { id: "wantCarrots", en: "I want carrots, please.", ja: "にんじんを ください。", keys: [CARROT] },
  wantEggs: { id: "wantEggs", en: "I want eggs, please.", ja: "たまごを ください。", keys: [EGG] },
  onePlease: { id: "onePlease", en: "One, please.", ja: "ひとつ ください。", keys: [ONE] },
  twoPlease: { id: "twoPlease", en: "Two, please.", ja: "ふたつ ください。", keys: [TWO] },
  threePlease: { id: "threePlease", en: "Three, please.", ja: "みっつ ください。", keys: [THREE] },
  fourPlease: { id: "fourPlease", en: "Four, please.", ja: "よっつ ください。", keys: [FOUR] },
  fivePlease: { id: "fivePlease", en: "Five, please.", ja: "いつつ ください。", keys: [FIVE] }
};
