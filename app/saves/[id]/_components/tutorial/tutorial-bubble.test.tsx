import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { TutorialBubble } from "./tutorial-bubble";
import { TutorialLine } from "./tutorial-line";

// The buttons alone are rendered here: a Server Action needs a request.
vi.mock("@/app/saves/[id]/tutorial/actions", () => ({ resumeTutorialAction: vi.fn(), skipTutorialAction: vi.fn(), tutorialStepAction: vi.fn() }));

const bubble = (props: { gotIt?: boolean; place?: { index: number; total: number } | null; live?: boolean }, locale: Locale = "fr") =>
  renderToStaticMarkup(
    inLanguage(
      <TutorialBubble saveId="save-1" step="welcome" text="Bienvenue, Coach." place={props.place ?? null} gotIt={props.gotIt} live={props.live} />,
      locale,
    ),
  );

/** The data-testids of a markup, in order. */
const testIds = (markup: string): string[] => [...markup.matchAll(/data-testid="([^"]+)"/g)].map(([, id]) => id);

describe("TutorialBubble", () => {
  it("says who speaks, the line, and its two quiet ways out", () => {
    const markup = bubble({});
    expect(testIds(markup)).toEqual(["tutorial-bubble", "tutorial-text", "tutorial-pass", "tutorial-skip"]);
    expect(markup).toContain("Ton adjoint");
    expect(markup).toContain("Passer l&#x27;étape");
    expect(markup).toContain("Passer le tutoriel");
    expect(markup).toContain('data-step="welcome"');
    expect(markup).toContain('aria-live="polite"');
  });

  it("places the step in the first day, and has « Compris » for a step without a move of its own", () => {
    const markup = bubble({ gotIt: true, place: { index: 2, total: 5 } });
    expect(markup).toContain("Premier jour · 2 sur 5");
    expect(testIds(markup)).toContain("tutorial-got-it");
    expect(bubble({ place: { index: 2, total: 5 } }, "en")).toContain("First day · 2 of 5");
  });

  it("is never orange: the screen keeps its own action", () => {
    expect(bubble({ gotIt: true })).not.toMatch(/--club|bg-\(--club\)/);
  });

  it("sits above the save's navigation under lg, or above the controls of the match live", () => {
    expect(bubble({})).toContain("max-lg:bottom-[calc(var(--save-nav-height)+0.5rem)]");
    expect(bubble({ live: true })).toContain("max-lg:bottom-[calc(var(--live-controls-height)+0.5rem)]");
  });
});

describe("TutorialLine", () => {
  it("is the assistant's line in a card, with « Passer le tutoriel » only where it is offered", () => {
    const plain = renderToStaticMarkup(inLanguage(<TutorialLine text="À toi de décider." place={{ index: 3, total: 5 }} />));
    expect(testIds(plain)).toEqual(["tutorial-line", "tutorial-text"]);
    expect(plain).toContain("Premier jour · 3 sur 5");
    const skippable = renderToStaticMarkup(
      inLanguage(<TutorialLine text="Your call." skip={{ saveId: "save-1", step: "choice", onSkipped: () => undefined }} />, "en"),
    );
    expect(testIds(skippable)).toEqual(["tutorial-line", "tutorial-text", "tutorial-skip"]);
    expect(skippable).toContain("Skip the tutorial");
  });
});
