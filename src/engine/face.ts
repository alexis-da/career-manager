import { makeRng, pick, weightedIndex } from "../lib/rng";
import {
  BALD_CHANCE_BY_AGE,
  BROW_SCAR_CHANCE,
  EYE_COLOR_WEIGHTS,
  FACIAL_HAIR_WEIGHTS,
  GLASSES_CHANCE,
  GRAY_HAIR_CHANCE_BY_AGE,
  GRAY_HAIR_MIN_AGE,
  HAIR_COLOR_WEIGHTS,
  HEADBAND_CHANCE,
  LATER_HAIR_STYLE_SHARE,
  WRINKLES_CHANCE_BY_AGE,
  WRINKLES_MIN_AGE,
} from "./balance";
import { interpolate } from "./curves";

export const SKIN_TONES = ["fair", "light", "medium", "tan", "brown", "dark"] as const;
/** The first 8 styles, then the 4 added later: never reorder, the draws depend on it. */
export const HAIR_STYLES = [
  "bald",
  "buzz",
  "short",
  "quiff",
  "curly",
  "afro",
  "long",
  "mohawk",
  "wavy",
  "shortAfro",
  "tiedBack",
  "fade",
] as const;
export const HAIR_COLORS = ["black", "darkBrown", "brown", "auburn", "blond", "gray"] as const;
export const FACIAL_HAIRS = ["none", "stubble", "moustache", "beard"] as const;
export const EYE_SHAPES = ["round", "almond", "narrow"] as const;
export const BROW_SHAPES = ["straight", "arched", "thick"] as const;
export const FACE_SHAPES = ["oval", "round", "square"] as const;
export const HAIRLINES = ["low", "medium", "high"] as const;
export const NOSE_SHAPES = ["small", "straight", "wide"] as const;
export const MOUTH_SHAPES = ["neutral", "pout", "thin"] as const;
export const JAW_SHAPES = ["narrow", "square", "round"] as const;
export const EYE_COLORS = ["brown", "blue", "green"] as const;
export const BROW_THICKNESSES = ["thin", "thick"] as const;

export type SkinTone = (typeof SKIN_TONES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type HairColor = (typeof HAIR_COLORS)[number];
export type FacialHair = (typeof FACIAL_HAIRS)[number];
export type EyeShape = (typeof EYE_SHAPES)[number];
export type BrowShape = (typeof BROW_SHAPES)[number];
export type FaceShape = (typeof FACE_SHAPES)[number];
export type Hairline = (typeof HAIRLINES)[number];
export type NoseShape = (typeof NOSE_SHAPES)[number];
export type MouthShape = (typeof MOUTH_SHAPES)[number];
export type JawShape = (typeof JAW_SHAPES)[number];
export type EyeColor = (typeof EYE_COLORS)[number];
export type BrowThickness = (typeof BROW_THICKNESSES)[number];

export type FaceParams = {
  skinTone: SkinTone;
  hairStyle: HairStyle;
  hairColor: HairColor;
  facialHair: FacialHair;
  eyeShape: EyeShape;
  browShape: BrowShape;
  faceShape: FaceShape;
  hairline: Hairline;
  noseShape: NoseShape;
  mouthShape: MouthShape;
  jawShape: JawShape;
  eyeColor: EyeColor;
  browThickness: BrowThickness;
  glasses: boolean;
  headband: boolean;
  browScar: boolean;
  wrinkles: boolean; // at the corners of the eyes, only above WRINKLES_MIN_AGE
};

/** Hair styles of the first draw: the 7 first styles but "bald". */
const FIRST_HAIR_STYLES = HAIR_STYLES.slice(0, 8).filter((style) => style !== "bald");

/** Hair styles added later, drawn at the end of the sequence. */
const LATER_HAIR_STYLES = HAIR_STYLES.slice(8);

/** Hair colors a player is born with: every color but "gray", in the order of HAIR_COLOR_WEIGHTS. */
const NATURAL_HAIR_COLORS = HAIR_COLORS.filter((color) => color !== "gray");

/** Seed of a player's face: his key alone, so he has the same face in every save and every season. */
export function faceRngSeed(playerKey: string): string {
  return `face:${playerKey}`;
}

/**
 * A player's face, drawn from his key. The skin tone is drawn uniformly, whatever the nationality. Age only changes
 * the hair (gray possible above GRAY_HAIR_MIN_AGE, baldness more and more likely) and brings wrinkles at the
 * corners of the eyes above WRINKLES_MIN_AGE. Each player draws once where he stands on those increasing curves,
 * so an aging player can turn gray, bald or wrinkled, never the other way.
 * Draw order matters for every existing face: never reorder these draws, add new ones at the end.
 */
export function faceParams(playerKey: string, age: number): FaceParams {
  const rng = makeRng(faceRngSeed(playerKey));
  // The first sequence: never reorder.
  const skinTone = pick(rng, SKIN_TONES);
  const faceShape = pick(rng, FACE_SHAPES);
  const eyeShape = pick(rng, EYE_SHAPES);
  const browShape = pick(rng, BROW_SHAPES);
  const firstStyle = pick(rng, FIRST_HAIR_STYLES);
  const naturalColor = NATURAL_HAIR_COLORS[weightedIndex(rng, HAIR_COLOR_WEIGHTS)];
  const facialHair = FACIAL_HAIRS[weightedIndex(rng, FACIAL_HAIR_WEIGHTS)];
  const grayDraw = rng();
  const baldDraw = rng();
  // Added later, after the first sequence. Every draw is made whatever its outcome, so the next ones never shift.
  const laterStyleDraw = rng();
  const laterStyle = pick(rng, LATER_HAIR_STYLES);
  const hairline = pick(rng, HAIRLINES);
  const noseShape = pick(rng, NOSE_SHAPES);
  const mouthShape = pick(rng, MOUTH_SHAPES);
  const jawShape = pick(rng, JAW_SHAPES);
  const eyeColor = EYE_COLORS[weightedIndex(rng, EYE_COLOR_WEIGHTS)];
  const browThickness = pick(rng, BROW_THICKNESSES);
  const glasses = rng() < GLASSES_CHANCE;
  const headband = rng() < HEADBAND_CHANCE;
  const browScar = rng() < BROW_SCAR_CHANCE;
  const wrinklesDraw = rng();

  const grownStyle = laterStyleDraw < LATER_HAIR_STYLE_SHARE ? laterStyle : firstStyle;
  const gray = age > GRAY_HAIR_MIN_AGE && grayDraw < interpolate(GRAY_HAIR_CHANCE_BY_AGE, age);
  const bald = baldDraw < interpolate(BALD_CHANCE_BY_AGE, age);
  const wrinkles = age > WRINKLES_MIN_AGE && wrinklesDraw < interpolate(WRINKLES_CHANCE_BY_AGE, age);

  return {
    skinTone,
    hairStyle: bald ? "bald" : grownStyle,
    hairColor: gray ? "gray" : naturalColor,
    facialHair,
    eyeShape,
    browShape,
    faceShape,
    hairline,
    noseShape,
    mouthShape,
    jawShape,
    eyeColor,
    browThickness,
    glasses,
    headband,
    browScar,
    wrinkles,
  };
}
