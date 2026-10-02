import type { ReactNode } from "react";
import { faceParams, type FaceShape, type HairColor, type HairStyle, type SkinTone } from "@/src/engine/face";
import type { ClubColors } from "@/src/lib/color";

// A flat illustration on a 64 × 64 grid: no gradient, few shapes, all large enough to read at 28 px.

const SKIN: Record<SkinTone, { base: string; shade: string }> = {
  fair: { base: "#F2D3BE", shade: "#D9AE93" },
  light: { base: "#E4B994", shade: "#C49270" },
  medium: { base: "#C99368", shade: "#A6724A" },
  tan: { base: "#A97250", shade: "#875536" },
  brown: { base: "#7E5034", shade: "#5F3A23" },
  dark: { base: "#4E3122", shade: "#382218" },
};

const HAIR: Record<HairColor, string> = {
  black: "#1C1816",
  darkBrown: "#3A281D",
  brown: "#6A472C",
  auburn: "#8B3D1F",
  blond: "#D0A75C",
  gray: "#A3A3A3",
};

/** Shirt of a free agent: no club colors. */
const FREE_AGENT_SHIRT: ClubColors = { primary: "#6B7280", secondary: "#9CA3AF" };

const PUPIL = "#16171A";
const SCLERA = "#F4F1EC";

/** Outline of the hair, a little lighter than black: dark hair stays apart from dark skin at small sizes. */
const HAIR_OUTLINE = "#4A4038";
const MOUTH = "#5B2E24";

/** Where each face shape ends: the chin, and the cheeks where a beard starts. */
const CHIN: Record<FaceShape, number> = { oval: 41.5, round: 40.5, square: 41 };

function Head({ shape, fill }: { shape: FaceShape; fill: string }) {
  switch (shape) {
    case "oval":
      return <ellipse cx={32} cy={26.5} rx={12.5} ry={15} fill={fill} />;
    case "round":
      return <ellipse cx={32} cy={26.5} rx={13.5} ry={14} fill={fill} />;
    case "square":
      return <rect x={19} y={12} width={26} height={29} rx={7} fill={fill} />;
  }
}

/** Hair drawn behind the head (afro, long hair falling to the shoulders). */
function HairBack({ style, fill }: { style: HairStyle; fill: string }) {
  switch (style) {
    case "afro":
      return <circle cx={32} cy={21} r={17} fill={fill} />;
    case "long":
      return (
        <path d="M16.5 27C16 13 23 7 32 7s16 6 15.5 20V44c-2.5 2-5.5 2-7.5 0V27H24v17c-2 2-5 2-7.5 0Z" fill={fill} />
      );
    default:
      return null;
  }
}

const SHORT_CAP = "M19 25C18 12 25 8.5 32 8.5S46 12 45 25c-2-8-6-10-13-9.5-7-.5-11 1.5-13 9.5Z";

/** Hair drawn over the head. */
function HairFront({ style, fill }: { style: HairStyle; fill: string }) {
  switch (style) {
    case "bald":
      return null;
    case "buzz":
      return <path d="M19.5 24c0-11 5.5-13.5 12.5-13.5S44.5 13 44.5 24c-2.5-6-6.5-7.5-12.5-7.5S22 18 19.5 24Z" fill={fill} />;
    case "short":
    case "afro":
      return <path d={SHORT_CAP} fill={fill} />;
    case "quiff":
      return <path d="M19 25c-1-12 5-16 11-17 4-3.5 12-2.5 14 2 2 4 1.5 10 1 15-2-8-7-10-13-9-7-.5-11 1-13 9Z" fill={fill} />;
    case "curly":
      return (
        <g fill={fill}>
          <path d={SHORT_CAP} />
          <circle cx={21} cy={18} r={4} />
          <circle cx={25.5} cy={12.5} r={4.5} />
          <circle cx={32} cy={10.5} r={4.5} />
          <circle cx={38.5} cy={12.5} r={4.5} />
          <circle cx={43} cy={18} r={4} />
        </g>
      );
    case "long":
      return <path d="M19 26c-1-13 6-17 13-17s14 4 13 17c-3-7-8-9.5-15-9-5 .5-8.5 3.5-11 9Z" fill={fill} />;
    case "mohawk":
      return (
        <g fill={fill}>
          <path d="M19.5 24c0-11 5.5-13.5 12.5-13.5S44.5 13 44.5 24c-2.5-6-6.5-7.5-12.5-7.5S22 18 19.5 24Z" opacity={0.35} />
          <path d="M28.5 18c0-8 1.5-14 3.5-14s3.5 6 3.5 14Z" />
        </g>
      );
  }
}

function Brows({ shape, stroke }: { shape: "straight" | "arched" | "thick"; stroke: string }) {
  const width = shape === "thick" ? 2.6 : 1.7;
  const paths =
    shape === "arched" ? ["M24 23.5Q27 20.8 30 22.5", "M34 22.5Q37 20.8 40 23.5"] : ["M24 22.5H30", "M34 22.5H40"];
  return (
    <g fill="none" stroke={stroke} strokeWidth={width} strokeLinecap="round">
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </g>
  );
}

/** Light eyes with a dark pupil: readable on every skin tone. */
function Eyes({ shape }: { shape: "round" | "almond" | "narrow" }) {
  const ry = shape === "round" ? 2.3 : shape === "almond" ? 1.8 : 1.3;
  const pupil = shape === "narrow" ? 1.2 : 1.5;
  return (
    <g>
      {[27, 37].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy={27.5} rx={2.8} ry={ry} fill={SCLERA} />
          <circle cx={cx} cy={27.5} r={pupil} fill={PUPIL} />
        </g>
      ))}
    </g>
  );
}

/** Stubble and beard cover the jaw from the cheeks to the chin. */
function jawPath(chin: number): string {
  return `M20 29.5C20.5 37 25 ${chin} 32 ${chin}S43.5 37 44 29.5c-2 4.5-6 5-12 5s-10-.5-12-5Z`;
}

type PlayerFaceProps = {
  playerKey: string;
  age: number;
  clubColors: ClubColors | null; // null for a free agent: a gray shirt
  size: number; // pixels
  className?: string;
};

/**
 * A player's face, drawn inline from faceParams(playerKey, age): head, neck, hair, brows, eyes, a neutral mouth
 * and facial hair, over a shirt collar in the club's colors, on a round background of the app's surface color.
 * Decorative: the player's name always sits next to it.
 */
export function PlayerFace({ playerKey, age, clubColors, size, className }: PlayerFaceProps) {
  const face = faceParams(playerKey, age);
  const skin = SKIN[face.skinTone];
  const hair = HAIR[face.hairColor];
  const shirt = clubColors ?? FREE_AGENT_SHIRT;
  const chin = CHIN[face.faceShape];

  let facialHair: ReactNode = null;
  if (face.facialHair === "stubble") {
    facialHair = <path d={jawPath(chin)} fill={hair} opacity={0.35} />;
  } else if (face.facialHair === "beard") {
    facialHair = <path d={jawPath(chin + 1.5)} fill={hair} />;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx={32} cy={32} r={32} fill="var(--muted, #1B1F24)" />
      <g stroke={HAIR_OUTLINE} strokeWidth={0.8}>
        <HairBack style={face.hairStyle} fill={hair} />
      </g>
      <path d="M26 33h12v13H26Z" fill={skin.shade} />
      {/* The shirt follows the background circle from one shoulder to the other. */}
      <path
        d="M5.54 50C12 44.5 20 42.5 26 42h12c6 .5 14 2.5 20.46 8A32 32 0 0 1 5.54 50Z"
        fill={shirt.primary}
      />
      <path d="M26 42l6 7.5 6-7.5" fill={skin.shade} stroke={shirt.secondary} strokeWidth={2.4} strokeLinejoin="round" />
      <circle cx={19.5} cy={28} r={3} fill={skin.base} />
      <circle cx={44.5} cy={28} r={3} fill={skin.base} />
      <Head shape={face.faceShape} fill={skin.base} />
      {facialHair}
      <g stroke={HAIR_OUTLINE} strokeWidth={0.8} strokeLinejoin="round">
        <HairFront style={face.hairStyle} fill={hair} />
      </g>
      <Brows shape={face.browShape} stroke={hair} />
      <Eyes shape={face.eyeShape} />
      <path d="M32 28.5l-1.8 4.5h3.3" fill="none" stroke={skin.shade} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
      {face.facialHair === "moustache" && <path d="M27.5 34.6Q32 32.2 36.5 34.6Q32 36 27.5 34.6Z" fill={hair} />}
      <path d="M29 37H35" stroke={face.facialHair === "beard" ? skin.shade : MOUTH} strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}
