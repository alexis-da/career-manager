import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MatchEventView, TeamView } from "@/src/db/calendar";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { halfTimeTeam } from "../_lib/test-team";
import { BreakCard } from "./break-card";

// The sheet draws into a portal, which a static render never mounts: here its parts are plain elements showing what the
// card asks of them.
vi.mock("@/src/components/ui/sheet", () => ({
  Sheet: ({
    open,
    modal,
    disablePointerDismissal,
    children,
  }: {
    open: boolean;
    modal?: boolean;
    disablePointerDismissal?: boolean;
    children?: ReactNode;
  }) =>
    open ? (
      <div data-modal={modal === true ? "true" : "false"} data-pointer-dismissal={disablePointerDismissal === true ? "off" : "on"}>
        {children}
      </div>
    ) : null,
  SheetContent: ({
    children,
    side,
    showCloseButton = true,
    initialFocus,
    "data-testid": testId,
    "data-break": phase,
  }: {
    children?: ReactNode;
    side?: string;
    showCloseButton?: boolean;
    initialFocus?: unknown;
    "data-testid"?: string;
    "data-break"?: string;
  }) => (
    <div
      role="dialog"
      data-testid={testId}
      data-break={phase}
      data-side={side}
      data-close-button={showCloseButton ? "shown" : "none"}
      data-initial-focus={initialFocus === undefined ? "none" : "set"}
    >
      {children}
    </div>
  ),
  SheetTitle: ({ children, ...props }: { children?: ReactNode; "data-testid"?: string }) => <h2 data-testid={props["data-testid"]}>{children}</h2>,
  SheetDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
}));

const club = (clubSaveId: string, name: string, isManaged: boolean): TeamView => ({
  clubSaveId,
  name,
  isManaged,
  colors: { primary: "#000000", secondary: "#ffffff" },
});

const LYON = club("club-1", "Olympique Lyonnais", true);
const RENNES = club("club-2", "Stade Rennais", false);

function event(id: string, minute: number, overrides: Partial<MatchEventView> = {}): MatchEventView {
  return {
    id,
    minute,
    type: "GOAL",
    period: "REGULAR",
    side: "home",
    playerName: "Hugo Guérin",
    playerKey: "p-9",
    playerAge: 24,
    relatedPlayerName: null,
    relatedPlayerKey: null,
    ...overrides,
  };
}

const EVENTS = [
  event("1", 12),
  event("2", 30, { type: "RED_CARD", side: "away", playerName: "Noé Petit", playerKey: "p-31" }),
  event("3", 44),
];

type CardProps = ComponentProps<typeof BreakCard>;

/** The card open at half-time, Lyon at home, 2-0 up, unless told otherwise. */
const render = (props: Partial<CardProps> = {}, locale: Locale = "fr"): string =>
  renderToStaticMarkup(
    inLanguage(
      <BreakCard
        phase="HALF_TIME"
        team={halfTimeTeam()}
        open
        onOpenChange={vi.fn()}
        home={LYON}
        away={RENNES}
        homeGoals={2}
        awayGoals={0}
        events={EVENTS}
        pending={false}
        onResume={vi.fn()}
        onCoaching={vi.fn()}
        returnFocusTo={{ current: null }}
        {...props}
      />,
      locale,
    ),
  );

/** What the player reads: the markup's text, its tags gone, its characters unescaped and its no-break spaces plain. */
const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/ /g, " ");

const buttonOf = (markup: string, testId: string): string => markup.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? "";

/** The assistant's word, as the player reads it. */
const adviceOf = (markup: string): string => textOf(markup.match(/<p[^>]*data-testid="break-advice"[^>]*>.*?<\/p>/)?.[0] ?? "");

describe("the card of a break", () => {
  it("has the score between the clubs, each side's scorers and players sent off, and a word of the assistant's", () => {
    const markup = render();
    const text = textOf(markup);
    expect(markup).toContain('data-break="HALF_TIME"');
    expect(markup).toContain('data-side="bottom"');
    expect(markup.match(/<h2[^>]*>(.*?)<\/h2>/)?.[1]).toBe("Mi-temps");
    expect(text).toContain("Match en pause");
    expect(textOf(markup.match(/<p[^>]*data-testid="break-score"[^>]*>.*?<\/p>/)?.[0] ?? "")).toBe("2 – 0");
    expect(text).toContain("Olympique Lyonnais");
    expect(text).toContain("Stade Rennais");
    // Lyon's scorer once, with both his goals; Rennes' player sent off, in their column.
    const marks = markup.match(/<li[^>]*data-break-mark="[A-Z_]+"[^>]*>.*?<\/li>/g) ?? [];
    expect(marks.map(textOf)).toEqual(["But : Hugo Guérin 12', 44'", "Exclu : Noé Petit 30'"]);
    // Nothing on the bench: the assistant says so, between the panel's quotes.
    expect(textOf(markup.match(/<p[^>]*data-testid="break-advice"[^>]*>.*?<\/p>/)?.[0] ?? "")).toBe("Ton adjoint : « Plus aucun remplaçant. »");
  });

  it("names an injured player nobody can replace before anything else, and says when nobody has scored", () => {
    const markup = render({ team: halfTimeTeam({ injured: ["s9"] }), events: [], homeGoals: 0, awayGoals: 0 });
    expect(textOf(markup)).toContain("Pas encore de but.");
    expect(markup).not.toContain("data-break-mark");
    expect(textOf(markup)).toContain("Ton adjoint : « s9 est sorti blessé et ne peut pas être remplacé : on repart à dix. Plus aucun remplaçant. »");
  });

  it("says which young player the assistant brings on in the 61st minute, or that it is the manager's call once the changes are his", () => {
    // « Lancer les jeunes »: a midfielder on the bench for the right midfielder.
    const planned = halfTimeTeam({ bench: ["y"], youthEntries: [{ in: "y", out: "s6" }] });
    expect(adviceOf(render({ team: planned }))).toBe("Ton adjoint : « À la 61e, je fais entrer y à la place de s6 : il a besoin de minutes. »");
    expect(adviceOf(render({ team: { ...planned, manual: true } }))).toBe("Ton adjoint : « Fais entrer y à la place de s6 : il a besoin de minutes. »");
    expect(adviceOf(render({ team: planned }, "en"))).toBe("Your assistant: “In the 61st minute, I'll bring y on for s6: he needs game time.”");
    // An injured player's replacement first.
    expect(adviceOf(render({ team: { ...planned, injured: ["s9"] } }))).toBe(
      "Ton adjoint : « s9 est sorti blessé : sans changement de ta part, le meilleur remplaçant au poste entre. y est le mieux placé pour remplacer s9. »",
    );
  });

  it("holds « Reprendre », its one orange action, under « Coaching », both out of reach as it opens; Escape and its cross close it", () => {
    const markup = render();
    expect(markup).toContain('data-modal="true"');
    expect(markup).toContain('data-pointer-dismissal="off"');
    expect(markup).toContain('data-close-button="shown"');
    expect(markup).toContain('data-initial-focus="set"');
    const resume = buttonOf(markup, "break-resume");
    const coaching = buttonOf(markup, "break-coaching");
    expect(resume).toContain("bg-(--club)");
    expect(coaching).not.toContain("bg-(--club)");
    // The other orange is the drawing of Lyon's goals, not an action.
    expect((markup.match(/<button[^>]*>/g) ?? []).filter((button) => button.includes("bg-(--club)"))).toHaveLength(1);
    expect(resume).toContain('disabled=""');
    expect(coaching).toContain('disabled=""');
    expect(markup.indexOf('data-testid="break-coaching"')).toBeLessThan(markup.indexOf('data-testid="break-resume"'));
    expect(textOf(markup)).toContain("Coaching");
    expect(textOf(markup)).toContain("Reprendre");
  });

  it("before extra time, says what follows and plays it; while the match goes on, says so", () => {
    const markup = render({ phase: "REGULATION_END", team: halfTimeTeam({ phase: "REGULATION_END", minute: 90 }), homeGoals: 1, awayGoals: 1 });
    expect(markup).toContain('data-break="REGULATION_END"');
    expect(markup.match(/<h2[^>]*>(.*?)<\/h2>/)?.[1]).toBe("Fin du temps réglementaire");
    expect(textOf(markup)).toContain("À égalité après 90 minutes : prolongation, puis tirs au but s'il le faut.");
    expect(textOf(buttonOf(markup, "break-resume") + markup.split('data-testid="break-resume"')[1])).toContain("Jouer la prolongation");
    expect(textOf(render({ pending: true }))).toContain("Seconde période…");
    expect(textOf(render({ phase: "REGULATION_END", pending: true }))).toContain("Prolongation…");
  });

  it("speaks British English", () => {
    const text = textOf(render({}, "en"));
    expect(text).toContain("Half-time");
    expect(text).toContain("Goal: Hugo Guérin 12', 44'");
    expect(text).toContain("Sent off: Noé Petit 30'");
    expect(text).toContain("Resume");
    expect(textOf(render({ events: [], homeGoals: 0, awayGoals: 0 }, "en"))).toContain("No goal yet.");
    expect(textOf(render({ phase: "REGULATION_END" }, "en"))).toContain("Play extra time");
  });
});
