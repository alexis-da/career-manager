import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerFace } from "../components/player-face";
import { svgMarkup } from "./svg-markup";

const LYON = { primary: "#1B3E8F", secondary: "#E2001A" };

/** The markup without self-closing tags, so the two renderings compare. */
const expandSelfClosing = (markup: string): string => markup.replace(/<([a-z]+)([^<>]*)\/>/g, "<$1$2></$1>");

describe("svgMarkup", () => {
  it("renders a face exactly as React does", () => {
    for (const [playerKey, age] of [["olympique-lyonnais#1", 22], ["olympique-lyonnais#9", 35], ["youth:2027:fc-nantes:2", 17]] as const) {
      const face = <PlayerFace playerKey={playerKey} age={age} clubColors={LYON} size={200} background="#1A2560" />;
      expect(expandSelfClosing(svgMarkup(face))).toBe(expandSelfClosing(renderToStaticMarkup(face)));
    }
  });

  it("escapes text and attribute values", () => {
    expect(svgMarkup(<text x={1} fontSize={2}>{"a < b & \"c\""}</text>)).toBe('<text x="1" font-size="2">a &lt; b &amp; &quot;c&quot;</text>');
  });
});
