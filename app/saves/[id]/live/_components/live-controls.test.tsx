import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import type { CoachingTarget } from "../_lib/live-pause";
import { LiveControls } from "./live-controls";

const nothing = () => undefined;

/** The controls while the clock runs, a stop asked for or not at the next boundary. */
const render = (target: CoachingTarget, asked = false, locale: Locale = "fr"): string =>
  renderToStaticMarkup(
    inLanguage(
      <LiveControls
        dashboardHref="/saves/save-1"
        finished={false}
        atStop={false}
        skipTo="halfTime"
        coaching={{ target, asked, busy: false, onToggle: nothing }}
        speed={1}
        onSpeedChange={nothing}
        onSkip={nothing}
        overlaid={false}
        onOpenPanel={nothing}
        resume={null}
        coachingRef={null}
        resumeRef={null}
        continueRef={null}
      />,
      locale,
    ),
  );

/** The button that stops the match at the next boundary: its text, its tooltip, whether it can be pressed. */
function requestOf(markup: string) {
  const [button = "", text = ""] = /(<button[^>]*data-testid="live-coaching-request"[^>]*>)(.*?)<\/button>/.exec(markup)?.slice(1) ?? [];
  return {
    text,
    title: /title="([^"]*)"/.exec(button)?.[1].replaceAll("&#x27;", "'") ?? null,
    disabled: button.includes('disabled=""'),
    pressed: /aria-pressed="([^"]*)"/.exec(button)?.[1] ?? null,
  };
}

describe("the live match's stop", () => {
  it("names a pause, never « Coaching », the panel it opens: at the next boundary, then asked for", () => {
    expect(requestOf(render({ minute: 30 }))).toEqual({ text: "Pause à la 30e", title: null, disabled: false, pressed: "false" });
    expect(requestOf(render({ minute: 30 }, true))).toEqual({
      text: "Pause demandée · 30e",
      title: "Le match s'arrêtera à la 30e pour que tu changes ton équipe. Appuie encore pour annuler.",
      disabled: false,
      pressed: "true",
    });
  });

  it("waits for half-time, where the match stops by itself, and has no pause left in the last segment", () => {
    expect(requestOf(render("halfTime"))).toEqual({ text: "Pause à la mi-temps", title: null, disabled: true, pressed: null });
    expect(requestOf(render(null))).toEqual({ text: "Pause", title: "Plus d'arrêt de jeu avant la fin", disabled: true, pressed: null });
  });

  it("speaks British English", () => {
    expect(requestOf(render({ minute: 60 }, false, "en")).text).toBe("Pause at 60’");
    expect(requestOf(render({ minute: 60 }, true, "en"))).toMatchObject({
      text: "Pausing at 60’",
      title: "The match will stop at 60’ so you can change your team. Press again to cancel.",
    });
    expect(requestOf(render("halfTime", false, "en")).text).toBe("Pause at half-time");
    expect(requestOf(render(null, false, "en")).text).toBe("Pause");
  });
});
