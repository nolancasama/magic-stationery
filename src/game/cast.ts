/** The people of the levels and the player. Voices are browser TTS pitch/rate. */
import type { Look } from "../world/characters.ts";
import type { Voice } from "../speech/tts.ts";

export type CastId = "penny" | "mori" | "ken" | "yui" | "taro" | "player" | "pen";

export interface CastMember {
  id: CastId;
  name: string;
  look: Look;
  voice: Voice;
}

export const CAST: Record<Exclude<CastId, "pen">, CastMember> = {
  penny: {
    id: "penny",
    name: "Ms. Penny",
    voice: { pitch: 1.05, rate: 0.88 },
    look: { skin: "#f6d3b8", hair: "#7a4a2e", hairStyle: "bun", shirt: "#7fb3e6", legs: "#5c6bc0", skirt: true, shoes: "#6d4c41", extras: ["apron", "glasses"], extraColor: "#f28fb0", scale: 1.38 }
  },
  mori: {
    id: "mori",
    name: "Ms. Mori",
    voice: { pitch: 1.12, rate: 0.86 },
    look: { skin: "#f3d0b4", hair: "#2a1d17", hairStyle: "bob", shirt: "#f6a5c0", legs: "#455a64", skirt: true, shoes: "#5d4037", extras: ["glasses"], scale: 1.36 }
  },
  ken: {
    id: "ken",
    name: "Ken",
    voice: { pitch: 1.3, rate: 0.95 },
    look: { skin: "#f1c9a5", hair: "#2b2b2b", hairStyle: "spiky", shirt: "#4caf50", legs: "#3949ab", shoes: "#37474f", extras: ["cap"], extraColor: "#ff7043", scale: 1 }
  },
  yui: {
    id: "yui",
    name: "Yui",
    voice: { pitch: 1.45, rate: 0.95 },
    look: { skin: "#f6d5bd", hair: "#3a2416", hairStyle: "pigtails", shirt: "#ffb74d", legs: "#ec407a", skirt: true, shoes: "#d81b60", extras: ["bows"], extraColor: "#e91e63", scale: 0.98 }
  },
  taro: {
    id: "taro",
    name: "Taro",
    voice: { pitch: 1.55, rate: 0.92 },
    look: { skin: "#f3cfb0", hair: "#1f1f1f", hairStyle: "short", shirt: "#90caf9", legs: "#455a64", shorts: true, shoes: "#1e88e5", extras: ["yellowHat"], scale: 0.88 }
  },
  player: {
    id: "player",
    name: "You",
    voice: { pitch: 1.3, rate: 0.95 },
    look: { skin: "#f4cfae", hair: "#4a2c1d", hairStyle: "short", shirt: "#5c6bc0", legs: "#37474f", shoes: "#ef5350", extras: ["hoodie"], scale: 1 }
  }
};

/** The magic pen talks too (its guesses while you draw). */
export const PEN_VOICE: Voice = { pitch: 1.6, rate: 0.98 };
export const NARRATOR_VOICE: Voice = { pitch: 1.15, rate: 0.9 };
