import type { ReactNode } from "react";
import {
  faceParams,
  type BrowShape,
  type EyeColor,
  type EyeShape,
  type FaceParams,
  type FaceShape,
  type HairColor,
  type Hairline,
  type HairStyle,
  type JawShape,
  type MouthShape,
  type NoseShape,
  type SkinTone,
} from "@/src/engine/face";
import type { ClubColors } from "@/src/lib/color";

// A flat illustration on a 64 × 64 grid: no gradient, few shapes, all large enough to read at 28 px. Relief comes
// from a second, darker flat tone per skin tone and per hair color.

const SKIN: Record<SkinTone, { base: string; shade: string }> = {
  fair: { base: "#F2D3BE", shade: "#D9AE93" },
  light: { base: "#E4B994", shade: "#C49270" },
  medium: { base: "#C99368", shade: "#A6724A" },
  tan: { base: "#A97250", shade: "#875536" },
  brown: { base: "#7E5034", shade: "#5F3A23" },
  dark: { base: "#4E3122", shade: "#382218" },
};

const HAIR: Record<HairColor, { base: string; shade: string }> = {
  black: { base: "#1C1816", shade: "#070605" },
  darkBrown: { base: "#3A281D", shade: "#22170F" },
  brown: { base: "#6A472C", shade: "#4A301C" },
  auburn: { base: "#8B3D1F", shade: "#62290F" },
  blond: { base: "#D0A75C", shade: "#A9843F" },
  gray: { base: "#A3A3A3", shade: "#7E7E7E" },
};

const EYE_COLOR: Record<EyeColor, string> = { brown: "#6B4226", blue: "#3D7AB8", green: "#4F8A4B" };

/** Shirt of a free agent: no club colors. */
const FREE_AGENT_SHIRT: ClubColors = { primary: "#6B7280", secondary: "#9CA3AF" };

const PUPIL = "#16171A";
const SCLERA = "#F4F1EC";
const MOUTH = "#5B2E24";
const GLASSES = "#1E1F22";

/** Outline of the hair, a little lighter than black: dark hair stays apart from dark skin at small sizes. */
const HAIR_OUTLINE = "#4A4038";

/** Where the chin ends, by jaw. */
const CHIN: Record<JawShape, number> = { narrow: 43, square: 41.5, round: 42 };

/** Hair long enough to hide the ears. */
const EARS_HIDDEN: ReadonlySet<HairStyle> = new Set<HairStyle>(["long", "afro", "wavy"]);

/** Vertical stretch of the hair over the forehead, from the top of the head: a low hairline comes further down. */
const HAIRLINE_STRETCH: Record<Hairline, number> = { low: 1.08, medium: 1, high: 0.9 };
const HAIR_TOP = 6;

/** The round background on a page: the theme's --muted. */
const DEFAULT_BACKGROUND = "var(--muted, #1B1F24)";

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

/** The lower face, over the head: a pointed, square or round jaw. */
function Jaw({ shape, fill }: { shape: JawShape; fill: string }) {
  switch (shape) {
    case "narrow":
      return <path d="M21 29Q22.5 41 32 43Q41.5 41 43 29Z" fill={fill} />;
    case "square":
      return <rect x={20.5} y={28} width={23} height={13.5} rx={3.5} fill={fill} />;
    case "round":
      return <ellipse cx={32} cy={34} rx={12} ry={8} fill={fill} />;
  }
}

/** Hair drawn behind the head. */
function HairBack({ style, fill }: { style: HairStyle; fill: string }) {
  switch (style) {
    case "afro":
      return <circle cx={32} cy={21} r={17} fill={fill} />;
    case "long":
      return (
        <path d="M16.5 27C16 13 23 7 32 7s16 6 15.5 20V44c-2.5 2-5.5 2-7.5 0V27H24v17c-2 2-5 2-7.5 0Z" fill={fill} />
      );
    case "wavy":
      return (
        <path
          d="M17.5 27C17 13 24 8 32 8s15 5 14.5 19c.5 4 1 7 0 9.5-2 1-4 1-5 0V27h-17v9.5c-1 1-3 1-5 0-1-2.5-.5-5.5-1-9.5Z"
          fill={fill}
        />
      );
    case "tiedBack":
      return <circle cx={32} cy={7.5} r={4.8} fill={fill} />;
    default:
      return null;
  }
}

const SHORT_CAP = "M19 25C18 12 25 8.5 32 8.5S46 12 45 25c-2-8-6-10-13-9.5-7-.5-11 1.5-13 9.5Z";
const BUZZ_CAP = "M19.5 24c0-11 5.5-13.5 12.5-13.5S44.5 13 44.5 24c-2.5-6-6.5-7.5-12.5-7.5S22 18 19.5 24Z";
/** A darker lock across the top, for the short cuts. */
const TOP_LOCK = "M23 16.5C26 12 30 11 34 11 30 12.5 27 14.5 25 18Z";

/** Hair drawn over the head, then a darker lock giving it relief. */
function HairFront({ style, fill, shade }: { style: HairStyle; fill: string; shade: string }) {
  switch (style) {
    case "bald":
      return null;
    case "buzz":
      return <path d={BUZZ_CAP} fill={fill} />;
    case "short":
    case "afro":
      return (
        <>
          <path d={SHORT_CAP} fill={fill} />
          <path d={TOP_LOCK} fill={shade} stroke="none" />
        </>
      );
    case "quiff":
      return (
        <>
          <path d="M19 25c-1-12 5-16 11-17 4-3.5 12-2.5 14 2 2 4 1.5 10 1 15-2-8-7-10-13-9-7-.5-11 1-13 9Z" fill={fill} />
          <path d="M30.5 8.5c3-2.5 9-2 11.5 1.5-3-1.2-7-1.4-11.5-1.5Z" fill={shade} stroke="none" />
        </>
      );
    case "curly":
      return (
        <g fill={fill}>
          <path d={SHORT_CAP} />
          <circle cx={21} cy={18} r={4} />
          <circle cx={25.5} cy={12.5} r={4.5} />
          <circle cx={32} cy={10.5} r={4.5} />
          <circle cx={38.5} cy={12.5} r={4.5} />
          <circle cx={43} cy={18} r={4} />
          <circle cx={32} cy={10.5} r={2} fill={shade} stroke="none" />
        </g>
      );
    case "long":
      return (
        <>
          <path d="M19 26c-1-13 6-17 13-17s14 4 13 17c-3-7-8-9.5-15-9-5 .5-8.5 3.5-11 9Z" fill={fill} />
          <path d="M22 24c0-5 3-9 7.5-11-3 3-5 6.5-5.5 11Z" fill={shade} stroke="none" />
        </>
      );
    case "mohawk":
      return (
        <g fill={fill}>
          <path d={BUZZ_CAP} opacity={0.35} />
          <path d="M28.5 18c0-8 1.5-14 3.5-14s3.5 6 3.5 14Z" />
          <path d="M32 5.5V17" stroke={shade} strokeWidth={1.2} fill="none" />
        </g>
      );
    case "wavy":
      return (
        <>
          <path
            d="M19 26c-1-13 6-17.5 13-17.5S46 13 45 26c-1.5-3-3-5-5-5.5-1.5 2-3.5 2-5 .5-1.5 1.5-3.5 1.5-5 0-1.5 1.5-3.5 1.5-5-.5-2 .5-4 2.5-6 5Z"
            fill={fill}
          />
          <path d="M24 19c2-4 5-6 9-7-3 2-5.5 4-7 7.5Z" fill={shade} stroke="none" />
        </>
      );
    case "shortAfro":
      return (
        <>
          <path d="M19 23v-9c0-4 6-8 13-8s13 4 13 8v9c-2-5-6-7-13-7s-11 2-13 7Z" fill={fill} />
          <path d="M22 13.5c2-3 5.5-4.5 10-4.5-3.5 1-6.5 2.5-8.5 5Z" fill={shade} stroke="none" />
        </>
      );
    case "tiedBack":
      return (
        <>
          <path d="M19.5 24c0-11 5.5-14 12.5-14s12.5 3 12.5 14c-2-6-6-8.5-12.5-8.5S21.5 18 19.5 24Z" fill={fill} />
          <path d="M32 10.5 28.5 16" stroke={shade} strokeWidth={1.1} fill="none" />
        </>
      );
    case "fade":
      return (
        <>
          <path d={BUZZ_CAP} fill={fill} opacity={0.3} />
          <path d="M21 17c0-6 5-9 11-9s11 3 11 9c-3-1.5-6.5-2-11-2s-8 .5-11 2Z" fill={fill} />
          <path d="M24 13c2.5-2.5 5-3.5 8.5-3.5-3 1-5.5 2.5-7 4.5Z" fill={shade} stroke="none" />
        </>
      );
  }
}

function Brows({
  shape,
  thick,
  stroke,
  scar,
  skin,
}: {
  shape: BrowShape;
  thick: boolean;
  stroke: string;
  scar: boolean;
  skin: string;
}) {
  const width = (shape === "thick" ? 2.6 : 1.7) * (thick ? 1.3 : 0.85);
  const paths =
    shape === "arched" ? ["M24 23.5Q27 20.8 30 22.5", "M34 22.5Q37 20.8 40 23.5"] : ["M24 22.5H30", "M34 22.5H40"];
  return (
    <g fill="none" strokeLinecap="round">
      {paths.map((d) => (
        <path key={d} d={d} stroke={stroke} strokeWidth={width} />
      ))}
      {/* A scar: a thin bare line through the left eyebrow. */}
      {scar && <path d="M25.6 20.6 27.6 24.6" stroke={skin} strokeWidth={0.9} />}
    </g>
  );
}

/** Light eyes with a colored iris and a dark pupil: readable on every skin tone. */
function Eyes({ shape, color }: { shape: EyeShape; color: EyeColor }) {
  const ry = shape === "round" ? 2.3 : shape === "almond" ? 1.8 : 1.3;
  const iris = shape === "narrow" ? 1.2 : 1.5;
  return (
    <g>
      {[27, 37].map((cx) => (
        <g key={cx}>
          <ellipse cx={cx} cy={27.5} rx={2.8} ry={ry} fill={SCLERA} />
          <circle cx={cx} cy={27.5} r={iris} fill={EYE_COLOR[color]} />
          <circle cx={cx} cy={27.5} r={iris * 0.5} fill={PUPIL} />
        </g>
      ))}
    </g>
  );
}

function Nose({ shape, stroke }: { shape: NoseShape; stroke: string }) {
  const common = { fill: "none", stroke, strokeWidth: 1.3, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  switch (shape) {
    case "small":
      return <path d="M32 29.5l-1.2 3h2.2" {...common} />;
    case "straight":
      return <path d="M32 28.5l-1.8 4.5h3.3" {...common} />;
    case "wide":
      return <path d="M32 28.5l-1.6 4h3.2M29.2 33q1 .9 2 .3M34.8 33q-1 .9-2 .3" {...common} />;
  }
}

function Mouth({ shape, stroke, lip }: { shape: MouthShape; stroke: string; lip: string }) {
  switch (shape) {
    case "neutral":
      return <path d="M29 37H35" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />;
    case "pout":
      return (
        <g fill="none" strokeLinecap="round">
          <path d="M29.5 36.8Q32 36 34.5 36.8" stroke={stroke} strokeWidth={1.3} />
          <path d="M30.5 38.3Q32 39.3 33.5 38.3" stroke={lip} strokeWidth={1} />
        </g>
      );
    case "thin":
      return <path d="M30 37H34" stroke={stroke} strokeWidth={0.9} strokeLinecap="round" />;
  }
}

/** Two fine lines at the outer corners of the eyes. */
function Wrinkles({ stroke }: { stroke: string }) {
  return <path d="M23 27.8l-1.9.6M41 27.8l1.9.6" stroke={stroke} strokeWidth={0.6} strokeLinecap="round" />;
}

function Glasses() {
  return (
    <g fill="none" stroke={GLASSES} strokeWidth={1.1}>
      <rect x={23.3} y={25} width={7.4} height={5.2} rx={2} />
      <rect x={33.3} y={25} width={7.4} height={5.2} rx={2} />
      <path d="M30.7 27.2h2.6M23.3 26.8 20 26.2M40.7 26.8l3.3-.6" />
    </g>
  );
}

/** Stubble and beard cover the jaw from the cheeks to the chin. */
function jawPath(chin: number): string {
  return `M20 29.5C20.5 37 25 ${chin} 32 ${chin}S43.5 37 44 29.5c-2 4.5-6 5-12 5s-10-.5-12-5Z`;
}

function FacialHair({ face, chin, fill }: { face: FaceParams; chin: number; fill: string }): ReactNode {
  switch (face.facialHair) {
    case "stubble":
      return <path d={jawPath(chin)} fill={fill} opacity={0.35} />;
    case "beard":
      return <path d={jawPath(chin + 1.5)} fill={fill} />;
    default:
      return null;
  }
}

type PlayerFaceProps = {
  playerKey: string;
  age: number;
  clubColors: ClubColors | null; // null for a free agent: a gray shirt
  size: number; // pixels
  background?: string; // the round background; the app's surface color by default, a hex color outside the page (an image)
  className?: string;
};

/**
 * A player's face, drawn inline from faceParams(playerKey, age): head and jaw, neck, ears, hair, brows, eyes, nose,
 * mouth, facial hair and the rare glasses, headband or scar, over a shirt collar in the club's colors, on a round
 * background of the app's surface color. Decorative: the player's name always sits next to it.
 */
export function PlayerFace({ playerKey, age, clubColors, size, background = DEFAULT_BACKGROUND, className }: PlayerFaceProps) {
  const face = faceParams(playerKey, age);
  const skin = SKIN[face.skinTone];
  const hair = HAIR[face.hairColor];
  const shirt = clubColors ?? FREE_AGENT_SHIRT;
  const chin = CHIN[face.jawShape];
  const stretch = HAIRLINE_STRETCH[face.hairline];

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
      <circle cx={32} cy={32} r={32} fill={background} />
      <g stroke={HAIR_OUTLINE} strokeWidth={0.8}>
        <HairBack style={face.hairStyle} fill={hair.base} />
      </g>
      {/* Neck in the skin tone, shaded under the jaw and along one side. */}
      <path d="M26 33h12v13H26Z" fill={skin.base} />
      <path d={`M26 ${chin - 2}h12v3.5c-2 1.2-4 1.7-6 1.7s-4-.5-6-1.7Z`} fill={skin.shade} />
      <path d={`M36 ${chin}h2v${46 - chin}h-2Z`} fill={skin.shade} />
      {/* The shirt follows the background circle from one shoulder to the other. */}
      <path d="M5.54 50C12 44.5 20 42.5 26 42h12c6 .5 14 2.5 20.46 8A32 32 0 0 1 5.54 50Z" fill={shirt.primary} />
      <path d="M26 42l6 7.5 6-7.5" fill={skin.shade} stroke={shirt.secondary} strokeWidth={2.4} strokeLinejoin="round" />
      {!EARS_HIDDEN.has(face.hairStyle) && (
        <g>
          <circle cx={19.5} cy={28} r={3} fill={skin.base} />
          <circle cx={44.5} cy={28} r={3} fill={skin.base} />
          <circle cx={19.3} cy={28.2} r={1.3} fill={skin.shade} />
          <circle cx={44.7} cy={28.2} r={1.3} fill={skin.shade} />
        </g>
      )}
      <Head shape={face.faceShape} fill={skin.base} />
      <Jaw shape={face.jawShape} fill={skin.base} />
      <FacialHair face={face} chin={chin} fill={hair.base} />
      <g
        stroke={HAIR_OUTLINE}
        strokeWidth={0.8}
        strokeLinejoin="round"
        transform={stretch === 1 ? undefined : `translate(0 ${HAIR_TOP}) scale(1 ${stretch}) translate(0 ${-HAIR_TOP})`}
      >
        <HairFront style={face.hairStyle} fill={hair.base} shade={hair.shade} />
      </g>
      {face.headband && (
        <path
          d="M19.5 18.5C23 15.5 27.5 14.5 32 14.5s9 1 12.5 4v3C41 18.5 36.5 17.5 32 17.5s-9 1-12.5 4Z"
          fill={shirt.secondary}
        />
      )}
      <Brows
        shape={face.browShape}
        thick={face.browThickness === "thick"}
        stroke={hair.base}
        scar={face.browScar}
        skin={skin.base}
      />
      <Eyes shape={face.eyeShape} color={face.eyeColor} />
      {face.wrinkles && <Wrinkles stroke={skin.shade} />}
      {face.glasses && <Glasses />}
      <Nose shape={face.noseShape} stroke={skin.shade} />
      {face.facialHair === "moustache" && <path d="M27.5 34.6Q32 32.2 36.5 34.6Q32 36 27.5 34.6Z" fill={hair.base} />}
      <Mouth shape={face.mouthShape} stroke={face.facialHair === "beard" ? skin.shade : MOUTH} lip={skin.shade} />
    </svg>
  );
}
