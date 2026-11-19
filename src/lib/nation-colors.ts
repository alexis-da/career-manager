import type { NationCode } from "../engine/nations";
import type { ClubColors } from "./color";

/**
 * The colours of each nation's shirt and shorts, for its players' faces in the live match of the national coach
 * (docs/design/selections.md, N4b): plain colours of the game's own, never a federation's crest.
 */
export const NATION_COLORS: Readonly<Record<NationCode, ClubColors>> = {
  GER: { primary: "#FFFFFF", secondary: "#1A1A1A" },
  ENG: { primary: "#FFFFFF", secondary: "#1B2A5C" },
  ESP: { primary: "#C8102E", secondary: "#F1BF00" },
  FRA: { primary: "#1F3A93", secondary: "#FFFFFF" },
  ITA: { primary: "#1E5BC6", secondary: "#FFFFFF" },
  POR: { primary: "#B5121B", secondary: "#00663D" },
  NED: { primary: "#F36C21", secondary: "#1B2A5C" },
  BEL: { primary: "#D52B1E", secondary: "#1A1A1A" },
  CRO: { primary: "#D7141A", secondary: "#FFFFFF" },
  BRA: { primary: "#FEDD00", secondary: "#009739" },
  ARG: { primary: "#75AADB", secondary: "#FFFFFF" },
  MAR: { primary: "#C1272D", secondary: "#006233" },
  SEN: { primary: "#FFFFFF", secondary: "#00853F" },
  CIV: { primary: "#F77F00", secondary: "#009E60" },
};
