import { describe, expect, it } from "vitest";
import {
  BROW_SHAPES,
  EYE_SHAPES,
  FACE_SHAPES,
  FACIAL_HAIRS,
  faceParams,
  HAIR_COLORS,
  HAIR_STYLES,
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
  ])("shows every %s over 2 000 keys", (name, variants) => {
    expect(new Set(faces.map((face) => face[name]))).toEqual(new Set(variants));
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

  it("keeps a face over a career, but for the hair turning gray or bald, never back", () => {
    for (const key of KEYS.slice(0, 300)) {
      const young = faceParams(key, 17);
      let wasGray = false;
      let wasBald = false;
      for (let age = 17; age <= 40; age++) {
        const face = faceParams(key, age);
        expect({ ...face, hairStyle: null, hairColor: null }).toEqual({ ...young, hairStyle: null, hairColor: null });
        expect(face.hairStyle === "bald" || face.hairStyle === young.hairStyle || young.hairStyle === "bald").toBe(true);
        expect(face.hairColor === "gray" || face.hairColor === young.hairColor).toBe(true);
        if (wasGray) {
          expect(face.hairColor).toBe("gray");
        }
        if (wasBald) {
          expect(face.hairStyle).toBe("bald");
        }
        wasGray = face.hairColor === "gray";
        wasBald = face.hairStyle === "bald";
      }
    }
  });
});
