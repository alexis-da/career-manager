import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DisciplineStatus } from "@/src/db/discipline-view";
import type { ClubLineupPlayer, LineupPlayer } from "@/src/db/lineup";
import { FORMATIONS } from "@/src/engine/formations";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage, testTranslator } from "@/src/i18n/test-intl";
import { disciplineBadges, hasPlayerBadges, nextMatchCard, PlayerBadges } from "./player-badges";
import { Pitch } from "./pitch";

const CLEAN: DisciplineStatus = { suspended: false, suspendedLater: null, bookingRisks: [], bookingRiskNextMatch: false };

/** Suspended for the next match: sent off, or his fifth yellow card in its competition. */
const SUSPENDED: DisciplineStatus = { ...CLEAN, suspended: true };
/** Free for a league match, suspended for his next cup tie. */
const CUP_BAN: DisciplineStatus = { ...CLEAN, suspendedLater: "CUP" };
/** Four yellow cards in the league, the next match a league one. */
const ON_FOUR: DisciplineStatus = { ...CLEAN, bookingRisks: [{ competition: "LEAGUE", yellows: 4 }], bookingRiskNextMatch: true };
/** Four yellow cards in the cup, the next match a league one. */
const ON_FOUR_IN_CUP: DisciplineStatus = { ...CLEAN, bookingRisks: [{ competition: "CUP", yellows: 4 }] };

const labels = (discipline: DisciplineStatus | null, locale: Locale = "fr") =>
  disciplineBadges(discipline, testTranslator(locale, "player")).map(({ id, tone, label }) => [id, tone, label]);

type BadgedPlayer = Parameters<typeof PlayerBadges>[0]["player"];

const NONE: BadgedPlayer = { injuredUntil: null, discipline: CLEAN, contractExpiring: false, arrivedThisSeason: false };

const renderBadges = (player: BadgedPlayer, locale: Locale = "fr"): string =>
  renderToStaticMarkup(inLanguage(<PlayerBadges player={player} />, locale));

/** Each badge: its test id, its title and its text. */
const badgesOf = (markup: string) =>
  [...markup.matchAll(/<span title="([^"]*)" data-testid="([^"]+)"[^>]*>([^<]*)<\/span>/g)].map(([, title, testId, text]) => ({
    testId,
    title: title.replaceAll("&#x27;", "'"),
    text,
  }));

describe("the discipline's badges", () => {
  it("say nothing of a clean player, nor of one whose club's matches are not read", () => {
    expect(labels(CLEAN)).toEqual([]);
    expect(labels(null)).toEqual([]);
  });

  it("put the next match's suspension first, in red, the later one and the yellow cards in amber", () => {
    expect(labels(SUSPENDED)).toEqual([["suspended", "danger", "Suspendu"]]);
    expect(labels(CUP_BAN)).toEqual([["suspended-later", "warning", "Suspendu en coupe"]]);
    expect(labels({ ...CLEAN, suspendedLater: "LEAGUE" })).toEqual([["suspended-later", "warning", "Suspendu en championnat"]]);
    expect(labels(ON_FOUR)).toEqual([["booking-risk", "warning", "4 jaunes"]]);
    expect(labels(ON_FOUR_IN_CUP)).toEqual([["booking-risk", "warning", "4 jaunes en coupe"]]);
    expect(labels({ ...SUSPENDED, bookingRisks: [...ON_FOUR.bookingRisks, ...ON_FOUR_IN_CUP.bookingRisks] })).toEqual([
      ["suspended", "danger", "Suspendu"],
      ["booking-risk", "warning", "4 jaunes"],
      ["booking-risk", "warning", "4 jaunes en coupe"],
    ]);
  });

  it("speak British English", () => {
    expect(labels(SUSPENDED, "en")).toEqual([["suspended", "danger", "Suspended"]]);
    expect(labels(CUP_BAN, "en")).toEqual([["suspended-later", "warning", "Cup ban"]]);
    expect(labels({ ...CLEAN, suspendedLater: "LEAGUE" }, "en")).toEqual([["suspended-later", "warning", "League ban"]]);
    expect(labels(ON_FOUR, "en")).toEqual([["booking-risk", "warning", "4 yellows"]]);
    expect(labels(ON_FOUR_IN_CUP, "en")).toEqual([["booking-risk", "warning", "4 cup yellows"]]);
  });

  it("show among the player's other badges, after the injury, each with its sentence on hover", () => {
    const markup = renderBadges({
      ...NONE,
      injuredUntil: new Date(Date.UTC(2026, 10, 20)),
      discipline: { ...SUSPENDED, bookingRisks: ON_FOUR.bookingRisks },
      contractExpiring: true,
    });

    expect(badgesOf(markup)).toEqual([
      { testId: "player-badge-injured", title: "Blessé jusqu'au 20 novembre 2026", text: "Blessé · 20 nov." },
      { testId: "player-badge-suspended", title: "Suspendu pour le prochain match", text: "Suspendu" },
      {
        testId: "player-badge-booking-risk",
        title: "4 jaunes en championnat : un de plus vaut une suspension",
        text: "4 jaunes",
      },
      { testId: "player-badge-expiring", title: "Contrat terminé en fin de saison", text: "Expire" },
    ]);
    expect(markup).toContain("bg-loss/15 text-loss");
    expect(badgesOf(renderBadges({ ...NONE, discipline: CUP_BAN }, "en"))).toEqual([
      { testId: "player-badge-suspended-later", title: "Suspended for his next cup match", text: "Cup ban" },
    ]);
    expect(badgesOf(renderBadges({ ...NONE, discipline: ON_FOUR_IN_CUP }, "en"))).toEqual([
      { testId: "player-badge-booking-risk", title: "4 yellow cards in the cup: one more means a suspension", text: "4 cup yellows" },
    ]);
  });

  it("count as badges, which the squad's card keeps room for", () => {
    expect(hasPlayerBadges(NONE)).toBe(false);
    expect(hasPlayerBadges({ ...NONE, discipline: null })).toBe(false);
    for (const discipline of [SUSPENDED, CUP_BAN, ON_FOUR, ON_FOUR_IN_CUP]) {
      expect(hasPlayerBadges({ ...NONE, discipline })).toBe(true);
    }
  });

  it("give a slot a red card for the next match's suspension, a yellow one for a booking that would bring one", () => {
    expect(nextMatchCard(SUSPENDED)).toBe("danger");
    expect(nextMatchCard({ ...SUSPENDED, bookingRiskNextMatch: true })).toBe("danger");
    expect(nextMatchCard(ON_FOUR)).toBe("warning");
    // His cup yellows are no risk in a league match, his cup ban no matter in it: the sheet and the list say them.
    expect(nextMatchCard(ON_FOUR_IN_CUP)).toBeNull();
    expect(nextMatchCard(CUP_BAN)).toBeNull();
    expect(nextMatchCard(CLEAN)).toBeNull();
    expect(nextMatchCard(undefined)).toBeNull();
  });
});

const SLOTS = FORMATIONS["4-3-3"];

const starter = (id: string, discipline: DisciplineStatus, injured = false): ClubLineupPlayer => ({
  id,
  position: "ST",
  overall: 70,
  injured,
  suspended: discipline.suspended,
  firstName: "Jean",
  lastName: id,
  age: 25,
  injuredUntil: null,
  fitness: 100,
  discipline,
});

/** The pitch's slots with a player, by slot: its label, whether its face is in red, and the card on it. */
function slotsOf(players: ClubLineupPlayer[], locale: Locale = "fr") {
  const markup = renderToStaticMarkup(
    inLanguage(
      <Pitch
        slots={SLOTS}
        starters={players.map(({ id }) => id)}
        players={new Map(players.map((player) => [player.id, player]))}
        clubColors={{ primary: "#000000", secondary: "#ffffff" }}
        label="Mon onze"
        fitnessAt="nextMatch"
      />,
      locale,
    ),
  );
  return markup
    .split('data-testid="pitch-slot"')
    .slice(1)
    .map((slot) => ({
      label: /aria-label="([^"]*)"/.exec(slot)?.[1].replaceAll("&#x27;", "'"),
      red: slot.includes("border-loss"),
      card: /data-card-mark="([a-z]+)"/.exec(slot)?.[1] ?? null,
    }));
}

describe("the pitch, before the next match", () => {
  it("marks a suspended starter out as an injured one, with his own word and a red card", () => {
    const [banned, hurt, risky, cupRisk, both] = slotsOf([
      starter("Banni", SUSPENDED),
      starter("Blesse", CLEAN, true),
      starter("Averti", ON_FOUR),
      starter("Coupe", { ...ON_FOUR_IN_CUP, suspendedLater: "CUP" }),
      starter("Double", SUSPENDED, true),
    ]);

    expect(banned).toMatchObject({ red: true, card: "red" });
    expect(banned.label).toMatch(/^Gardien : Jean Banni, .+, suspendu, Condition au prochain match : 100$/);
    expect(hurt).toMatchObject({ red: true, card: null });
    expect(hurt.label).toContain(", blessé, Condition");
    expect(both).toMatchObject({ red: true, card: "red" });
    expect(both.label).toContain(", blessé, suspendu, Condition");
    // One booking from a suspension in the next match: in sight, amber; the cup's matters are only words.
    expect(risky).toMatchObject({ red: false, card: "yellow" });
    expect(risky.label).toContain(", 4 jaunes, Condition");
    expect(cupRisk).toMatchObject({ red: false, card: null });
    expect(cupRisk.label).toContain(", suspendu en coupe, 4 jaunes en coupe, Condition");
  });

  it("speaks British English", () => {
    const [banned, risky] = slotsOf([starter("Banni", SUSPENDED), starter("Averti", ON_FOUR)], "en");

    expect(banned.label).toContain(", suspended, Fitness at the next match: 100");
    expect(risky.label).toContain(", 4 yellows, Fitness");
  });

  it("draws no card for a player without a status: an opponent's, or at a break", () => {
    const opponent: LineupPlayer = {
      id: "Adverse",
      position: "ST",
      overall: 70,
      injured: false,
      firstName: "Jean",
      lastName: "Adverse",
      age: 25,
      injuredUntil: null,
      fitness: 100,
    };
    const markup = renderToStaticMarkup(
      inLanguage(
        <Pitch
          slots={SLOTS}
          starters={[opponent.id]}
          players={new Map([[opponent.id, opponent]])}
          clubColors={{ primary: "#000000", secondary: "#ffffff" }}
          label="Son onze"
        />,
      ),
    );

    expect(markup).not.toContain("data-card-mark");
    expect(markup).not.toContain("border-loss");
  });
});
