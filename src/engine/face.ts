import { makeRng, pick, weightedIndex } from "../lib/rng";
import {
  BALD_CHANCE_BY_AGE,
  FACIAL_HAIR_WEIGHTS,
  GRAY_HAIR_CHANCE_BY_AGE,
  GRAY_HAIR_MIN_AGE,
  HAIR_COLOR_WEIGHTS,
} from "./balance";
import { interpolate } from "./curves";

export const SKIN_TONES = ["fair", "light", "medium", "tan", "brown", "dark"] as const;
export const HAIR_STYLES = ["bald", "buzz", "short", "quiff", "curly", "afro", "long", "mohawk"] as const;
export const HAIR_COLORS = ["black", "darkBrown", "brown", "auburn", "blond", "gray"] as const;
export const FACIAL_HAIRS = ["none", "stubble", "moustache", "beard"] as const;
export const EYE_SHAPES = ["round", "almond", "narrow"] as const;
export const BROW_SHAPES = ["straight", "arched", "thick"] as const;
export const FACE_SHAPES = ["oval", "round", "square"] as const;

export type SkinTone = (typeof SKIN_TONES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type HairColor = (typeof HAIR_COLORS)[number];
export type FacialHair = (typeof FACIAL_HAIRS)[number];
export type EyeShape = (typeof EYE_SHAPES)[number];
export type BrowShape = (typeof BROW_SHAPES)[number];
export type FaceShape = (typeof FACE_SHAPES)[number];

export type FaceParams = {
  skinTone: SkinTone;
  hairStyle: HairStyle;
  hairColor: HairColor;
  facialHair: FacialHair;
  eyeShape: EyeShape;
  browShape: BrowShape;
  faceShape: FaceShape;
};

/** Hair styles a player has while not bald: every style but "bald". */
const GROWN_HAIR_STYLES = HAIR_STYLES.filter((style) => style !== "bald");

/** Hair colors a player is born with: every color but "gray", in the order of HAIR_COLOR_WEIGHTS. */
const NATURAL_HAIR_COLORS = HAIR_COLORS.filter((color) => color !== "gray");

/** Seed of a player's face: his key alone, so he has the same face in every save and every season. */
export function faceRngSeed(playerKey: string): string {
  return `face:${playerKey}`;
}

/**
 * A player's face, drawn from his key. The skin tone is drawn uniformly, whatever the nationality. Age only
 * changes the hair: gray possible above GRAY_HAIR_MIN_AGE, baldness more and more likely. Each player draws
 * once where he stands on those two curves, so an aging player can turn gray or bald, never the other way.
 * Draw order matters for every existing face: never reorder these draws.
 */
export function faceParams(playerKey: string, age: number): FaceParams {
  const rng = makeRng(faceRngSeed(playerKey));
  const skinTone = pick(rng, SKIN_TONES);
  const faceShape = pick(rng, FACE_SHAPES);
  const eyeShape = pick(rng, EYE_SHAPES);
  const browShape = pick(rng, BROW_SHAPES);
  const grownStyle = pick(rng, GROWN_HAIR_STYLES);
  const naturalColor = NATURAL_HAIR_COLORS[weightedIndex(rng, HAIR_COLOR_WEIGHTS)];
  const facialHair = FACIAL_HAIRS[weightedIndex(rng, FACIAL_HAIR_WEIGHTS)];
  const grayDraw = rng();
  const baldDraw = rng();

  const gray = age > GRAY_HAIR_MIN_AGE && grayDraw < interpolate(GRAY_HAIR_CHANCE_BY_AGE, age);
  const bald = baldDraw < interpolate(BALD_CHANCE_BY_AGE, age);

  return {
    skinTone,
    hairStyle: bald ? "bald" : grownStyle,
    hairColor: gray ? "gray" : naturalColor,
    facialHair,
    eyeShape,
    browShape,
    faceShape,
  };
}
