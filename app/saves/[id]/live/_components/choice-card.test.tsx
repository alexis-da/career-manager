import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { TeamView } from "@/src/db/calendar";
import type { ChoiceEventView } from "@/src/db/live-match";
import type { ChoiceKind, ChoiceOption } from "@/src/engine/choices";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { ChoiceCard } from "./choice-card";

/** A request to close the sheet, as its root hands it to the card: the card may cancel it. */
type CloseRequest = (open: boolean, details: { cancel: () => void }) => void;

// The sheet draws into a portal, which a static render never mounts: here its parts are plain elements showing what the
// card asks of them, and its root keeps the card's answer to a request to close.
const sheet = vi.hoisted(() => ({ onOpenChange: undefined as CloseRequest | undefined }));

vi.mock("@/src/components/ui/sheet", () => ({
  Sheet: ({
    open,
    modal,
    disablePointerDismissal,
    onOpenChange,
    children,
  }: {
    open: boolean;
    modal?: boolean;
    disablePointerDismissal?: boolean;
    onOpenChange?: CloseRequest;
    children?: ReactNode;
  }) => {
    sheet.onOpenChange = onOpenChange;
    return open ? (
      <div data-modal={modal === true ? "true" : "false"} data-pointer-dismissal={disablePointerDismissal === true ? "off" : "on"}>
        {children}
      </div>
    ) : null;
  },
  SheetContent: ({
    children,
    className,
    showCloseButton = true,
    initialFocus,
    "data-testid": testId,
    "data-choice-kind": kind,
  }: {
    children?: ReactNode;
    className?: string;
    showCloseButton?: boolean;
    initialFocus?: unknown;
    "data-testid"?: string;
    "data-choice-kind"?: string;
  }) => (
    <div
      role="dialog"
      data-testid={testId}
      data-choice-kind={kind}
      data-close-button={showCloseButton ? "shown" : "none"}
      data-initial-focus={initialFocus === undefined ? "none" : "set"}
      className={className}
    >
      {children}
    </div>
  ),
  SheetTitle: ({ children, className }: { children?: ReactNode; className?: string }) => <h2 className={className}>{children}</h2>,
  SheetDescription: ({ children, className }: { children?: ReactNode; className?: string }) => <p className={className}>{children}</p>,
}));

const team = (clubSaveId: string, name: string, isManaged: boolean): TeamView => ({
  clubSaveId,
  name,
  isManaged,
  colors: { primary: "#000000", secondary: "#ffffff" },
});

const OPPONENT = team("club-2", "Rhône FC", false);

type OptionView = ChoiceEventView["options"][number];
type Named = { playerKey: string; player: string };

const MARTIN: Named = { playerKey: "p-9", player: "Hugo Martin" };
const BERNARD: Named = { playerKey: "p-10", player: "Léo Bernard" };
const PETIT: Named = { playerKey: "p-7", player: "Noé Petit" };
const SUBSTITUTE = { key: "p-14", name: "Théo Roux" };

/** An option offered, about no player unless told otherwise. */
const offer = (option: ChoiceOption, details: Partial<OptionView> = {}): OptionView => ({
  option,
  playerKey: null,
  player: null,
  chance: null,
  replacement: null,
  instruction: null,
  current: false,
  ...details,
});

const choice = (kind: ChoiceKind, minute: number, options: OptionView[], assistant: number, about: Named | null = null): ChoiceEventView => ({
  minute,
  kind,
  player: about?.player ?? null,
  playerKey: about?.playerKey ?? null,
  options,
  assistant,
});

const PENALTY = choice(
  "PENALTY",
  60,
  [offer("TAKER", { ...MARTIN, chance: 0.783 }), offer("TAKER", { ...BERNARD, chance: 0.74 }), offer("TAKER", { ...PETIT, chance: 0.69 })],
  0,
);
const FREE_KICK = choice("FREE_KICK", 15, [offer("SHOOT", { ...MARTIN, chance: 0.14 }), offer("COMBINE")], 1, MARTIN);
const HOTHEAD = choice("HOTHEAD", 30, [offer("TAKE_OFF", { ...BERNARD, replacement: SUBSTITUTE }), offer("KEEP", BERNARD)], 0, BERNARD);
const SCUFFLE = choice("SCUFFLE", 30, [offer("CALM"), offer("PROTEST", PETIT)], 0, PETIT);
const KNOCK = choice("KNOCK", 60, [offer("TAKE_OFF", { ...MARTIN, replacement: SUBSTITUTE }), offer("PLAY_ON", MARTIN)], 0, MARTIN);
const EXHAUSTED = choice("EXHAUSTED", 75, [offer("REPLACE", { ...BERNARD, replacement: SUBSTITUTE }), offer("KEEP", BERNARD)], 0, BERNARD);
/** The three instructions of a late tactical card, Attaquer, Équilibré, Fermer; the club has been playing balanced. */
const TACTICS = [
  offer("ATTACK", { instruction: "ATTACK" }),
  offer("STEADY", { instruction: "BALANCED", current: true }),
  offer("DEFEND", { instruction: "DEFEND" }),
];
const LEADING = choice("LEADING", 75, TACTICS, 2);
const CHASING = choice("CHASING", 60, TACTICS, 0);

type CardProps = ComponentProps<typeof ChoiceCard>;

/** The card open on an event, 1-1 unless told otherwise. */
const render = (event: ChoiceEventView, props: Partial<CardProps> = {}, locale: Locale = "fr"): string =>
  renderToStaticMarkup(
    inLanguage(
      <ChoiceCard
        event={event}
        open
        opponent={OPPONENT}
        ownGoals={1}
        otherGoals={1}
        playerFitness={null}
        onConfirm={vi.fn()}
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

/** The options of a card, each its row's markup, in their order. */
const optionsOf = (markup: string): string[] => markup.match(/<label[^>]*data-testid="choice-option"[^>]*>.*?<\/label>/g) ?? [];

const attribute = (markup: string, name: string): string | undefined => markup.match(new RegExp(`${name}="([^"]*)"`))?.[1];

describe("the choice card", () => {
  it("opens on the assistant's option, marked, under the event's family and minute, its title and its situation", () => {
    const markup = render(HOTHEAD);
    const text = textOf(markup);
    expect(markup).toContain('data-testid="choice-card"');
    expect(markup).toContain('data-choice-kind="HOTHEAD"');
    expect(text).toContain("Discipline · 30e");
    // The eyebrow is in capitals, not its ordinal.
    expect(markup).toContain('<span class="normal-case">30e</span>');
    expect(text).toContain("Un averti s'énerve");
    expect(text).toContain("30e minute, 1-1 : Léo Bernard, déjà averti, s'en prend à l'arbitre.");

    const options = optionsOf(markup);
    expect(options.map((row) => attribute(row, "data-option"))).toEqual(["TAKE_OFF", "KEEP"]);
    const [takeOff, keep] = options;
    expect(attribute(takeOff, "data-player-key")).toBe("p-10");
    expect(attribute(takeOff, "data-assistant")).toBe("true");
    expect(takeOff).toContain('checked=""');
    expect(textOf(takeOff)).toContain("Le sortir");
    expect(textOf(takeOff)).toContain("Conseil de l'adjoint");
    expect(textOf(takeOff)).toContain("Théo Roux entre à sa place : plus de risque de rouge.");
    expect(attribute(keep, "data-player-key")).toBe("p-10");
    expect(attribute(keep, "data-assistant")).toBeUndefined();
    expect(keep).not.toContain('checked=""');
    expect(textOf(keep)).toContain("Le garder");
    expect(textOf(keep)).toContain("Il reste, mais un second jaune peut tomber dans le quart d'heure.");
    expect(text.match(/Conseil de l'adjoint/g)).toHaveLength(1);
  });

  it("is a choice to make: it takes the focus, has no cross, and neither a press outside nor Escape closes it", () => {
    const markup = render(HOTHEAD);
    expect(markup).toContain('data-modal="true"');
    expect(markup).toContain('data-pointer-dismissal="off"');
    expect(markup).toContain('data-close-button="none"');
    expect(markup).toContain('data-initial-focus="set"');
    expect(markup).toContain('tabindex="-1"');
    const close = sheet.onOpenChange;
    expect(close).toBeDefined();
    const cancel = vi.fn();
    close?.(false, { cancel });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("holds « Valider », its one orange action, out of reach as it opens", () => {
    const markup = render(HOTHEAD);
    const validate = markup.match(/<button[^>]*data-testid="choice-validate"[^>]*>/)?.[0] ?? "";
    expect(validate).toContain("bg-(--club)");
    expect(validate).toContain('disabled=""');
    expect(markup.match(/bg-\(--club\)/g)).toHaveLength(1);
    expect(textOf(markup)).toContain("Valider");
  });

  it("names a penalty's three takers with their chance of scoring, rounded: the only figure a card shows", () => {
    const markup = render(PENALTY);
    const text = textOf(markup);
    expect(text).toContain("Coup de pied arrêté · 60e");
    expect(text).toContain("Penalty pour toi !");
    expect(text).toContain("60e minute, 1-1 : faute dans la surface adverse, l'arbitre te donne un penalty. Qui le tire ?");
    const takers = optionsOf(markup);
    expect(takers.map((row) => attribute(row, "data-option"))).toEqual(["TAKER", "TAKER", "TAKER"]);
    expect(takers.map((row) => attribute(row, "data-player-key"))).toEqual(["p-9", "p-10", "p-7"]);
    expect(textOf(takers[0])).toContain("Hugo Martin");
    expect(textOf(takers[0])).toContain("78 % de réussite");
    expect(textOf(takers[1])).toContain("Léo Bernard");
    expect(textOf(takers[1])).toContain("74 % de réussite");
    expect(textOf(takers[2])).toContain("69 % de réussite");
    expect(attribute(takers[0], "data-assistant")).toBe("true");
    expect(takers[0]).toContain('checked=""');
    // The sign never goes to the next line without its figure.
    expect(markup).toContain("78 %");
  });

  it("never shows a free kick's chance, and may pick the combination for the assistant", () => {
    const markup = render(FREE_KICK, { ownGoals: 0, otherGoals: 0 });
    const text = textOf(markup);
    expect(text).toContain("15e minute, 0-0 : coup franc aux abords de la surface. Hugo Martin est ton meilleur frappeur.");
    expect(text).toContain("Hugo Martin tente sa chance directement : but ou rien.");
    expect(text).not.toContain("%");
    const [shoot, combine] = optionsOf(markup);
    expect(attribute(shoot, "data-player-key")).toBe("p-9");
    expect(attribute(combine, "data-player-key")).toBeUndefined();
    expect(attribute(combine, "data-assistant")).toBe("true");
    expect(combine).toContain('checked=""');
    expect(shoot).not.toContain('checked=""');
  });

  it("names the substitute an option brings on", () => {
    expect(textOf(render(KNOCK, { ownGoals: 2, otherGoals: 1 }))).toContain("Théo Roux entre à sa place.");
    expect(textOf(render(EXHAUSTED))).toContain("Théo Roux entre avec des jambes neuves.");
  });

  it("says what an exhausted player has left, when the page knows it", () => {
    expect(textOf(render(EXHAUSTED, { ownGoals: 0, otherGoals: 1, playerFitness: 47.6 }))).toContain(
      "75e minute, tu es mené 0-1 : Léo Bernard n'a plus de jambes (condition 48).",
    );
    expect(textOf(render(EXHAUSTED, { ownGoals: 0, otherGoals: 1 }))).toContain(
      "75e minute, tu es mené 0-1 : Léo Bernard n'a plus de jambes.",
    );
  });

  it("names the captain and the opponent of a scuffle", () => {
    const markup = render(SCUFFLE, { ownGoals: 0, otherGoals: 0 });
    const text = textOf(markup);
    expect(text).toContain("Échauffourée");
    expect(text).toContain("30e minute, 0-0 : ça chauffe sur le terrain face à Rhône FC. Noé Petit, ton capitaine, est au milieu.");
    expect(text).toContain("Tes joueurs peuvent se remobiliser, mais Noé Petit risque un carton.");
    const [calm, protest] = optionsOf(markup);
    expect(attribute(calm, "data-player-key")).toBeUndefined();
    expect(attribute(protest, "data-player-key")).toBe("p-7");
  });

  it("tells the score from the player's club, and the minutes left until the 90th", () => {
    const leading = render(LEADING, { ownGoals: 2, otherGoals: 1 });
    expect(textOf(leading)).toContain("Réaction tactique · 75e");
    expect(textOf(leading)).toContain("Tu mènes, fin de match");
    expect(textOf(leading)).toContain("75e minute, tu mènes 2-1 : il reste 15 minutes. Comment finir le match ?");
    expect(optionsOf(leading).map((row) => attribute(row, "data-option"))).toEqual(["ATTACK", "STEADY", "DEFEND"]);
    expect(textOf(leading)).toContain("Chercher le break");

    const behind = textOf(render(CHASING, { ownGoals: 0, otherGoals: 1 }));
    expect(behind).toContain("Tu es mené");
    expect(behind).toContain("60e minute, tu es mené 0-1 : il reste 30 minutes pour revenir.");
    expect(behind).toContain("Tout pour l'attaque");

    const level = textOf(render({ ...CHASING, minute: 75, assistant: 1 }));
    expect(level).toContain("À égalité, fin de match");
    expect(level).toContain("75e minute, 1-1 : il reste 15 minutes pour faire la différence.");
  });

  it("offers the three instructions once each on a late tactical card, the one the club plays with marked « (actuelle) »", () => {
    const rowsOf = (event: ChoiceEventView, locale: Locale = "fr"): string[] =>
      optionsOf(render(event, { ownGoals: 2, otherGoals: 1 }, locale)).map(textOf);
    const playingWith = (event: ChoiceEventView, instruction: "ATTACK" | "DEFEND"): ChoiceEventView => ({
      ...event,
      options: event.options.map((offered) => ({ ...offered, current: offered.instruction === instruction })),
    });

    // Ahead: break, balance, close; balanced so far.
    const [attack, balanced, close] = rowsOf(LEADING);
    expect(attack).toContain("Chercher le break");
    expect(balanced).toContain("Garder l'équilibre (actuelle)");
    expect(balanced).toContain("Jeu équilibré jusqu'à la 90e : ni plus ouvert, ni plus fermé.");
    expect(close).toContain("Fermer le jeu");
    expect(rowsOf(LEADING).join(" ").match(/\(actuelle\)/g)).toHaveLength(1);
    // Behind or level, closing the game is offered too; the mark follows the instruction played.
    const chasing = rowsOf(playingWith(CHASING, "DEFEND"));
    expect(chasing[0]).toContain("Tout pour l'attaque");
    expect(chasing[0]).not.toContain("(actuelle)");
    expect(chasing[2]).toContain("Fermer le jeu (actuelle)");
    expect(chasing[2]).toContain("Match plus fermé jusqu'à la 90e : moins d'occasions des deux côtés.");
    // The other cards mark none.
    expect(textOf(render(HOTHEAD))).not.toContain("(actuelle)");

    const english = rowsOf(playingWith(LEADING, "ATTACK"), "en");
    expect(english[0]).toContain("Go for the killer goal (current)");
    expect(english[1]).toContain("Stay balanced");
    expect(english[1]).toContain("A balanced game until the 90th minute: neither more open nor tighter.");
    expect(english[2]).toContain("Close the game down");
  });

  it("speaks British English", () => {
    const penalty = textOf(render(PENALTY, {}, "en"));
    expect(penalty).toContain("Set piece · 60th");
    expect(penalty).toContain("Penalty to you!");
    expect(penalty).toContain("60th minute, 1-1: a foul in the box, and the referee gives you a penalty. Who takes it?");
    expect(penalty).toContain("78% chance of scoring");
    expect(penalty).toContain("Assistant's pick");
    expect(penalty).toContain("Confirm");
    expect(textOf(render(LEADING, { ownGoals: 2, otherGoals: 1 }, "en"))).toContain(
      "75th minute, you lead 2-1: 15 minutes left. How do you see the game out?",
    );
    const behind = textOf(render(CHASING, { ownGoals: 0, otherGoals: 1 }, "en"));
    expect(behind).toContain("You're behind");
    expect(behind).toContain("60th minute, you trail 0-1: 30 minutes left to get back into it.");
    expect(textOf(render(HOTHEAD, {}, "en"))).toContain("Théo Roux comes on for him: no more risk of a red.");
  });

  it("has every text of every event, in both languages", () => {
    const cases: [ChoiceEventView, Partial<CardProps>][] = [
      [PENALTY, {}],
      [FREE_KICK, {}],
      [HOTHEAD, {}],
      [SCUFFLE, {}],
      [KNOCK, {}],
      [EXHAUSTED, { playerFitness: 40 }],
      [EXHAUSTED, {}],
      [LEADING, { ownGoals: 2, otherGoals: 1 }],
      [CHASING, { ownGoals: 0, otherGoals: 1 }],
      [CHASING, {}],
    ];
    for (const locale of ["fr", "en"] as const) {
      for (const [event, props] of cases) {
        const markup = render(event, props, locale);
        const label = `${locale} ${event.kind}`;
        expect(textOf(markup), label).not.toContain("choiceCard.");
        expect(textOf(markup), label).not.toMatch(/[{}]/);
        expect(optionsOf(markup), label).toHaveLength(event.options.length);
      }
    }
  });
});
