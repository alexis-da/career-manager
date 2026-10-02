import { describe, expect, it } from "vitest";
import { BROW_SCAR_CHANCE, GLASSES_CHANCE, HEADBAND_CHANCE } from "./balance";
import {
  BROW_SHAPES,
  BROW_THICKNESSES,
  EYE_COLORS,
  EYE_SHAPES,
  FACE_SHAPES,
  FACIAL_HAIRS,
  faceParams,
  HAIR_COLORS,
  HAIR_STYLES,
  HAIRLINES,
  JAW_SHAPES,
  MOUTH_SHAPES,
  NOSE_SHAPES,
  SKIN_TONES,
  type FaceParams,
} from "./face";

const KEYS = Array.from({ length: 2_000 }, (_, index) => `club-${index % 96}#${index}`);

/** Every age of the world, 17 to 38, over the keys. */
const faces = KEYS.map((key, index) => faceParams(key, 17 + (index % 22)));

describe("faceParams", () => {
  it("gives the same face for the same key and age", () => {
    for (const key of KEYS.slice(0, 50)) {
      expect(faceParams(key, 27)).toEqual(faceParams(key, 27));
    }
    expect(faceParams("olympique-lyonnais#1", 27)).not.toEqual(faceParams("olympique-lyonnais#2", 27));
  });

  it.each<[keyof FaceParams, readonly string[]]>([
    ["skinTone", SKIN_TONES],
    ["hairStyle", HAIR_STYLES],
    ["hairColor", HAIR_COLORS],
    ["facialHair", FACIAL_HAIRS],
    ["eyeShape", EYE_SHAPES],
    ["browShape", BROW_SHAPES],
    ["faceShape", FACE_SHAPES],
    ["hairline", HAIRLINES],
    ["noseShape", NOSE_SHAPES],
    ["mouthShape", MOUTH_SHAPES],
    ["jawShape", JAW_SHAPES],
    ["eyeColor", EYE_COLORS],
    ["browThickness", BROW_THICKNESSES],
  ])("shows every %s over 2 000 keys", (name, variants) => {
    expect(new Set(faces.map((face) => face[name]))).toEqual(new Set(variants));
  });

  // Pinned values: the draws of the first sequence, before later draws were added at its end.
  it("keeps the first sequence of draws, later draws only added after it", () => {
    const firstDraws = (key: string) => {
      const { skinTone, hairColor, facialHair, eyeShape, browShape, faceShape } = faceParams(key, 25);
      return { skinTone, hairColor, facialHair, eyeShape, browShape, faceShape };
    };

    expect(firstDraws("olympique-lyonnais#1")).toEqual({ skinTone: "medium", hairColor: "brown", facialHair: "none", eyeShape: "almond", browShape: "thick", faceShape: "oval" });
    expect(firstDraws("arsenal-fc#14")).toEqual({ skinTone: "medium", hairColor: "black", facialHair: "none", eyeShape: "almond", browShape: "straight", faceShape: "oval" });
    expect(firstDraws("youth:2025:fc-barcelona:2")).toEqual({ skinTone: "light", hairColor: "blond", facialHair: "none", eyeShape: "almond", browShape: "straight", faceShape: "round" });
    expect(firstDraws("free-agents#7")).toEqual({ skinTone: "tan", hairColor: "darkBrown", facialHair: "none", eyeShape: "narrow", browShape: "arched", faceShape: "square" });
    expect(firstDraws("fc-bayern-munchen#20")).toEqual({ skinTone: "brown", hairColor: "darkBrown", facialHair: "none", eyeShape: "almond", browShape: "thick", faceShape: "square" });
  });

  it.each<[keyof FaceParams, number]>([
    ["glasses", GLASSES_CHANCE],
    ["headband", HEADBAND_CHANCE],
    ["browScar", BROW_SCAR_CHANCE],
  ])("gives %s to a few players only, about their documented share", (name, chance) => {
    const share = faces.filter((face) => face[name] === true).length / faces.length;

    expect(share).toBeGreaterThan(chance / 2);
    expect(share).toBeLessThan(chance * 1.6);
  });

  it("brings wrinkles only above 30, to some 36-year-olds", () => {
    expect(KEYS.some((key) => faceParams(key, 30).wrinkles)).toBe(false);
    expect(KEYS.some((key) => faceParams(key, 22).wrinkles)).toBe(false);
    expect(KEYS.some((key) => faceParams(key, 36).wrinkles)).toBe(true);
  });

  it("draws the skin tone uniformly", () => {
    for (const tone of SKIN_TONES) {
      const share = faces.filter((face) => face.skinTone === tone).length / faces.length;
      expect(share).toBeGreaterThan(1 / SKIN_TONES.length - 0.03);
      expect(share).toBeLessThan(1 / SKIN_TONES.length + 0.03);
    }
  });

  it("can turn a 36-year-old's hair gray, never a 20-year-old's", () => {
    expect(KEYS.some((key) => faceParams(key, 36).hairColor === "gray")).toBe(true);
    expect(KEYS.some((key) => faceParams(key, 20).hairColor === "gray")).toBe(false);
    expect(KEYS.some((key) => faceParams(key, 33).hairColor === "gray")).toBe(false);
  });

  it("makes baldness more likely with age", () => {
    const baldShare = (age: number) => KEYS.filter((key) => faceParams(key, age).hairStyle === "bald").length / KEYS.length;

    expect(baldShare(20)).toBeLessThan(baldShare(30));
    expect(baldShare(30)).toBeLessThan(baldShare(37));
  });

  it("keeps a face over a career, but for the hair turning gray or bald and wrinkles coming, never back", () => {
    for (const key of KEYS.slice(0, 300)) {
      const young = faceParams(key, 17);
      let wasGray = false;
      let wasBald = false;
      let wasWrinkled = false;
      for (let age = 17; age <= 40; age++) {
        const face = faceParams(key, age);
        const ageless = { hairStyle: null, hairColor: null, wrinkles: null };
        expect({ ...face, ...ageless }).toEqual({ ...young, ...ageless });
        expect(face.hairStyle === "bald" || face.hairStyle === young.hairStyle || young.hairStyle === "bald").toBe(true);
        expect(face.hairColor === "gray" || face.hairColor === young.hairColor).toBe(true);
        if (wasGray) {
          expect(face.hairColor).toBe("gray");
        }
        if (wasBald) {
          expect(face.hairStyle).toBe("bald");
        }
        if (wasWrinkled) {
          expect(face.wrinkles).toBe(true);
        }
        wasWrinkled = face.wrinkles;
        wasGray = face.hairColor === "gray";
        wasBald = face.hairStyle === "bald";
      }
    }
  });
});
