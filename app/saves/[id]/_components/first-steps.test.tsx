import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import type { SeenItem } from "../_lib/first-steps";
import { FirstActionsPanel } from "./first-steps";

const render = (seen: SeenItem[] = [], locale: Locale = "fr"): string =>
  renderToStaticMarkup(
    inLanguage(<FirstActionsPanel saveId="save-1" seen={new Set(seen)} button={locale === "fr" ? "Jouer le match" : "Play the match"} />, locale),
  );

/** An action of the list: whether it is done, where it leads, and its hint as a finger and as a mouse read it. */
function actionOf(markup: string, id: "squad" | "lineup" | "match") {
  const row = new RegExp(`<li data-testid="first-action-${id}" data-done="(true|false)">(.*?)</li>`).exec(markup);
  const body = row?.[2] ?? "";
  return {
    done: row?.[1] === "true",
    href: /href="([^"]+)"/.exec(body)?.[1] ?? null,
    touch: /<span class="hidden pointer-coarse:inline">([^<]*)<\/span>/.exec(body)?.[1] ?? null,
    click: /<span class="pointer-coarse:hidden">([^<]*)<\/span>/.exec(body)?.[1] ?? null,
  };
}

describe("a new save's first actions", () => {
  it("stand in their own panel, titled, the list itself as before", () => {
    const markup = render();

    expect(markup).toMatch(/^<section class="[^"]*" data-testid="dashboard-first-steps"><h2 class="eyebrow">Tes trois premières actions<\/h2><ol/);
    expect(markup).toContain('aria-label="Tes trois premières actions" data-testid="first-actions"');
    expect(markup.match(/data-testid="first-action-/g)).toHaveLength(3);
  });

  it("lead to the squad and the line-up, ticked once seen, and name the hero's button for the match", () => {
    const markup = render(["squad"]);

    expect(actionOf(markup, "squad")).toMatchObject({ done: true, href: "/saves/save-1/squad" });
    expect(actionOf(markup, "lineup")).toMatchObject({ done: false, href: "/saves/save-1/lineup" });
    expect(actionOf(markup, "match")).toEqual({
      done: false,
      href: null,
      touch: "Touche « Jouer le match » : il se joue en direct.",
      click: "Clique sur « Jouer le match » : il se joue en direct.",
    });
  });

  it("speak British English, a tap under a finger and a click under a mouse", () => {
    const markup = render([], "en");

    expect(markup).toContain(">Your first three moves</h2>");
    expect(actionOf(markup, "match")).toMatchObject({
      touch: "Tap “Play the match”: it plays live.",
      click: "Click “Play the match”: it plays live.",
    });
  });
});
