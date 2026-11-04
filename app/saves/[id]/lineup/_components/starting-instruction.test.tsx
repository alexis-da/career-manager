import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_INSTRUCTION, INSTRUCTIONS, type Instruction } from "@/src/engine/instructions";
import { LOCALES, type Locale } from "@/src/i18n/locale";
import { MESSAGES } from "@/src/i18n/messages";
import { inLanguage } from "@/src/i18n/test-intl";
import { StartingInstruction } from "./starting-instruction";

const render = (value: Instruction = DEFAULT_INSTRUCTION, locale: Locale = "fr"): string =>
  renderToStaticMarkup(inLanguage(<StartingInstruction value={value} onChange={() => undefined} />, locale));

/** The radios' opening tags, in the order of the page. */
const radiosOf = (markup: string): string[] => [...markup.matchAll(/<input [^>]*>/g)].map((match) => match[0]);

const instructionOf = (radio: string): string | undefined => /data-instruction="([A-Z]+)"/.exec(radio)?.[1];

describe("the starting instruction of the lineup", () => {
  it("offers the three instructions in the order of the screens, under one name, Équilibré checked by default", () => {
    const radios = radiosOf(render());

    expect(radios.map(instructionOf)).toEqual([...INSTRUCTIONS]);
    expect(radios.every((radio) => radio.includes('type="radio"') && radio.includes('name="starting-instruction"'))).toBe(true);
    expect(radios.filter((radio) => radio.includes("checked")).map(instructionOf)).toEqual(["BALANCED"]);
  });

  it("checks the instruction it is given", () => {
    for (const instruction of INSTRUCTIONS) {
      expect(radiosOf(render(instruction)).filter((radio) => radio.includes("checked")).map(instructionOf)).toEqual([instruction]);
    }
  });

  it("names them as the Coaching panel does, in both languages", () => {
    for (const locale of LOCALES) {
      const markup = render(DEFAULT_INSTRUCTION, locale);
      for (const instruction of INSTRUCTIONS) {
        expect(markup).toContain(`>${MESSAGES[locale].halfTime.instruction[instruction]}</label>`);
      }
    }
    expect(render()).toContain("Consigne de départ");
    expect(render(DEFAULT_INSTRUCTION, "en")).toContain("Starting instruction");
  });

  it("says under the switch what the chosen one does to a match, in goals", () => {
    const about = (markup: string): string => /<p data-testid="starting-instruction-about"[^>]*>([^<]*)<\/p>/.exec(markup)?.[1] ?? "";

    for (const locale of LOCALES) {
      for (const instruction of INSTRUCTIONS) {
        expect(about(render(instruction, locale))).toBe(MESSAGES[locale].startingInstruction.about[instruction].replaceAll("'", "&#x27;"));
      }
    }
    expect(about(render("ATTACK"))).toContain("plus de buts");
  });

  it("gives the principle in one sentence, then the assistant's rule", () => {
    const principle = (markup: string): string =>
      /<p data-testid="starting-instruction-principle"[^>]*>([^<]*)<\/p>/.exec(markup)?.[1] ?? "";

    // React writes the apostrophe as an entity.
    expect(principle(render())).toBe("Plus fort que l&#x27;adversaire : ouvre le jeu ; plus faible : ferme-le.");
    expect(principle(render(DEFAULT_INSTRUCTION, "en"))).toBe("Stronger than your opponent: open the game up; weaker: shut it down.");
    expect(render()).toContain("attaquer s&#x27;il faut revenir après la 60e, fermer avec un but d&#x27;avance après la 75e.");
    expect(render(DEFAULT_INSTRUCTION, "en")).toContain("attack when behind from the 60th minute, sit back one goal up from the 75th.");
  });
});
