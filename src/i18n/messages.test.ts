import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import { LOCALES } from "./locale";
import { MESSAGES, ZONES } from "./messages";

const { fr, en } = MESSAGES;

type Tree = { [key: string]: string | Tree };

/** Each message of a tree of messages, by its dotted key: « notFound.title ». */
function flatten(tree: Tree, prefix = ""): Map<string, string> {
  return new Map(
    Object.entries(tree).flatMap(([key, value]) =>
      typeof value === "string" ? [[`${prefix}${key}`, value] as const] : [...flatten(value, `${prefix}${key}.`)],
    ),
  );
}

/** The contents of the top-level braces of a text: « {a} b {c} » has « a » and « c ». */
function braced(text: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let start = 0;
  for (const [index, character] of [...text].entries()) {
    if (character === "{") {
      start = depth === 0 ? index + 1 : start;
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        groups.push(text.slice(start, index));
      }
    }
  }
  return groups;
}

/**
 * The arguments of an ICU message, sorted, those of its plural and select branches included: « {count, plural, one {#
 * club} other {# clubs}} in {country} » has count and country. Enough for the game's messages, which quote nothing.
 */
function argumentsOf(message: string): string[] {
  const names = new Set<string>();
  const visit = (text: string): void => {
    for (const body of braced(text)) {
      const [name, type, ...rest] = body.split(",");
      names.add(name.trim());
      if (["plural", "select", "selectordinal"].includes(type?.trim() ?? "")) {
        braced(rest.join(",")).forEach(visit);
      }
    }
  };
  visit(message);
  return [...names].sort();
}

const french = flatten(fr);
const english = flatten(en);

describe("the game's messages", () => {
  it("gives each namespace to one zone file only, the same in both languages", () => {
    const owners = Object.entries(ZONES).flatMap(([zone, { fr: zoneFr, en: zoneEn }]) => {
      expect(Object.keys(zoneEn).sort(), zone).toEqual(Object.keys(zoneFr).sort());
      return Object.keys(zoneFr);
    });
    expect(owners.length).toBe(new Set(owners).size);
  });

  it("has the same keys in French and in English", () => {
    expect([...english.keys()].sort()).toEqual([...french.keys()].sort());
  });

  it("gives each English message the arguments of its French one", () => {
    for (const [key, message] of french) {
      expect(argumentsOf(english.get(key) ?? ""), key).toEqual(argumentsOf(message));
    }
  });

  it("formats every message of both languages, its arguments given, without a brace left", () => {
    for (const locale of LOCALES) {
      const errors: string[] = [];
      const t = createTranslator({ locale, messages: MESSAGES[locale], onError: (error) => errors.push(error.message) });
      // Every key of the messages, read from them: no static key to type it with.
      const format = t as unknown as (key: string, values: Record<string, number>) => string;
      for (const [key, message] of flatten(MESSAGES[locale])) {
        const text = format(key, Object.fromEntries(argumentsOf(message).map((name) => [name, 1])));
        expect(text, `${locale} ${key}`).not.toMatch(/[{}]/);
      }
      expect(errors, locale).toEqual([]);
    }
  });
});
