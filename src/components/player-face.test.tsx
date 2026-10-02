import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerFace } from "./player-face";

const LYON = { primary: "#1B3E8F", secondary: "#E2001A" };

const render = (playerKey: string, age: number, clubColors: typeof LYON | null = LYON, size = 28): string =>
  renderToStaticMarkup(<PlayerFace playerKey={playerKey} age={age} clubColors={clubColors} size={size} />);

/** Problems with the markup as XML: unbalanced or unclosed tags, unquoted attributes. Empty when well formed. */
function xmlProblems(markup: string): string[] {
  const problems: string[] = [];
  const open: string[] = [];
  const tag = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let consumed = 0;
  for (const match of markup.matchAll(tag)) {
    if (markup.slice(consumed, match.index).trim() !== "") {
      problems.push(`text or broken tag at ${consumed}`);
    }
    consumed = match.index + match[0].length;
    const [, closing, name, , selfClosing] = match;
    if (closing === "/") {
      const last = open.pop();
      if (last !== name) {
        problems.push(`</${name}> closes <${last ?? "nothing"}>`);
      }
    } else if (selfClosing !== "/") {
      open.push(name);
    }
  }
  if (consumed !== markup.length) {
    problems.push(`unparsed markup after ${consumed}`);
  }
  return [...problems, ...open.map((name) => `<${name}> never closed`)];
}

describe("PlayerFace", () => {
  it("renders one well-formed SVG of the requested size", () => {
    for (const [key, age] of [
      ["olympique-lyonnais#1", 29],
      ["youth:2025:olympique-lyonnais:1", 17],
      ["free-agents#7", 34],
    ] as const) {
      const markup = render(key, age);
      expect(markup.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="28" height="28"')).toBe(true);
      expect(markup.endsWith("</svg>")).toBe(true);
      expect(xmlProblems(markup)).toEqual([]);
    }
  });

  it("draws no gradient, no image and no text", () => {
    const markup = Array.from({ length: 200 }, (_, index) => render(`club#${index}`, 17 + (index % 22))).join("");

    expect(markup).not.toMatch(/Gradient|<image|<text|<foreignObject/);
  });

  it("dresses a free agent in gray and a club player in the club's colors", () => {
    expect(render("free-agents#7", 30, null)).toContain('fill="#6B7280"');
    expect(render("free-agents#7", 30)).toContain(`fill="${LYON.primary}"`);
    expect(render("free-agents#7", 30)).toContain(`stroke="${LYON.secondary}"`);
  });

  it.each([
    ["olympique-lyonnais#1", 29],
    ["arsenal-fc#14", 36],
    ["youth:2025:fc-barcelona:2", 17],
  ] as const)("draws %s aged %i the same way", (key, age) => {
    expect(render(key, age, LYON, 96)).toMatchSnapshot();
  });
});
