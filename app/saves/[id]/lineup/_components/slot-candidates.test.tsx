import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DisciplineStatus } from "@/src/db/discipline-view";
import type { LineupPlayer } from "@/src/db/lineup";
import { FORMATIONS } from "@/src/engine/formations";
import { secondaryPositions, type Position } from "@/src/engine/positions";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { slotCandidates } from "../_lib/candidates";
import { CandidateList, SelectedSlot } from "./slot-candidates";

const SLOTS = FORMATIONS["4-3-3"]; // GK, RB, CB, CB, LB, CDM, CM, CM, RW, ST, LW
const STRIKER_SLOT = 9;
const MIDFIELD_SLOT = 6;

const CLEAN: DisciplineStatus = { suspended: false, suspendedLater: null, bookingRisks: [], bookingRiskNextMatch: false };

const player = (id: string, position: Position, overall: number, more: Partial<LineupPlayer> = {}): LineupPlayer => ({
  id,
  position,
  overall,
  injured: false,
  firstName: "Jean",
  lastName: id,
  age: 25,
  injuredUntil: null,
  fitness: 100,
  form: 50,
  discipline: CLEAN,
  ...more,
});

/** The first key of a winger whose secondary positions, drawn from the key alone, leave out the striker's. */
const WINGER_KEY = Array.from({ length: 1_000 }, (_, index) => `Ailier${index}`).find(
  (key) => !secondaryPositions(key, "LW").includes("ST"),
);

// The striker's slot, held by a striker. A left winger in the stands, who would fill in; a striker on the bench, in form; a
// striker in the stands one booking from a suspension; a midfielder starting elsewhere, out of form; an injured striker on
// the bench and a suspended one in the stands.
const occupant = player("Titulaire", "ST", 75);
const SQUAD = [
  occupant,
  player(WINGER_KEY ?? "", "LW", 74),
  player("Remplacant", "ST", 66, { form: 72 }),
  player("Averti", "ST", 60, {
    discipline: { ...CLEAN, bookingRisks: [{ competition: "LEAGUE", yellows: 4 }], bookingRiskNextMatch: true },
  }),
  player("Milieu", "CM", 70, { form: 30 }),
  player("Blesse", "ST", 79, { injured: true }),
  player("Suspendu", "ST", 62, { suspended: true, discipline: { ...CLEAN, suspended: true } }),
];
const STARTERS = SLOTS.map((_, index) => (index === STRIKER_SLOT ? occupant.id : index === MIDFIELD_SLOT ? "Milieu" : null));
const CANDIDATES = slotCandidates(SQUAD, { starters: STARTERS, bench: ["Remplacant", "Blesse"] }, STRIKER_SLOT, "ST");

const renderList = (locale: Locale = "fr"): string =>
  renderToStaticMarkup(
    inLanguage(<CandidateList candidates={CANDIDATES} slots={SLOTS} position="ST" onPick={() => undefined} />, locale),
  );

/** Each candidate's line: its attributes, and its words, tags left out. */
const rowsOf = (markup: string) =>
  markup
    .split('<li><button type="button"')
    .slice(1)
    .map((row) => ({
      key: /data-player-key="([^"]+)"/.exec(row)?.[1],
      fit: /data-candidate-fit="([^"]+)"/.exec(row)?.[1],
      rating: Number(/data-candidate-rating="(\d+)"/.exec(row)?.[1]),
      place: /data-candidate-place="([^"]+)"/.exec(row)?.[1],
      form: /data-form-trend="([^"]+)"/.exec(row)?.[1],
      fitness: /data-fitness="(\d+)"/.exec(row)?.[1],
      text: row
        .slice(row.indexOf(">") + 1, row.indexOf("</button>"))
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    }));

describe("the candidates for a slot", () => {
  it("list those who can play best rated at the slot first, then the injured and the suspended under their own title", () => {
    const markup = renderList();
    const rows = rowsOf(markup);

    expect(rows.map(({ key, fit, rating, place }) => [key, fit, rating, place])).toEqual([
      [WINGER_KEY, "line", 68, "reserve"], // 74 × 0.92
      ["Remplacant", "exact", 66, "substitute"],
      ["Averti", "exact", 60, "reserve"],
      ["Milieu", "other-line", 56, "starter"], // 70 × 0.8
      ["Blesse", "exact", 79, "substitute"],
      ["Suspendu", "exact", 62, "reserve"],
    ]);
    expect(markup.indexOf("Blessés et suspendus")).toBeGreaterThan(markup.indexOf('data-player-key="Milieu"'));
    expect(markup.indexOf("Blessés et suspendus")).toBeLessThan(markup.indexOf('data-player-key="Blesse"'));
    expect(markup).toContain('aria-label="Candidats au poste BU" data-testid="lineup-candidates"');
    expect(rows.every(({ fitness }) => fitness === "100")).toBe(true);
  });

  it("give each one his rating at the slot, his name, where he is, how he fits it, his form and his state", () => {
    const [winger, substitute, booked, midfielder, injured, suspended] = rowsOf(renderList());

    // The figures of the gap drawn, then said for the screen readers; the fitness's and the form's said too.
    expect(winger.text).toMatch(
      /^68 Jean Ailier\d+ AG 74 68 de 74 à 68 Dépanne · Condition au prochain match : 100 100 Forme 50 : moyenne$/,
    );
    expect(substitute.text).toContain("Remplaçant 1");
    expect(substitute.form).toBe("up");
    expect(midfielder.text).toContain("Titulaire en MC");
    expect(midfielder.text).toContain("Hors poste");
    expect(midfielder.form).toBe("down");
    expect(booked.text).toContain("À son poste");
    expect(booked.text).toMatch(/ 4 jaunes$/);
    expect(injured.text).toMatch(/^79 Jean Blesse Remplaçant 2 .* Blessé$/);
    expect(suspended.text).toMatch(/ Suspendu$/);
  });

  it("speak British English", () => {
    const [winger, substitute, , midfielder, injured] = rowsOf(renderList("en"));
    const markup = renderList("en");

    expect(winger.text).toContain("74 68 from 74 to 68 Filling in");
    expect(substitute.text).toContain("Substitute 1");
    expect(midfielder.text).toContain("Starter at CM");
    expect(midfielder.text).toContain("Out of position");
    expect(injured.text).toMatch(/ Injured$/);
    expect(markup).toContain("Injured and suspended");
    expect(markup).toContain("Form 72: good");
  });

  it("are buttons, never the drag sources of a phone's sheet, as tall as a thumb", () => {
    const rows = renderList().split('<li><button type="button"').slice(1);

    expect(rows).toHaveLength(CANDIDATES.length);
    for (const row of rows) {
      expect(row).toContain('data-testid="lineup-candidate"');
      expect(row).toContain("min-h-11");
      expect(row).not.toContain("cursor-grab");
    }
  });
});

describe("the selected slot", () => {
  const renderSlot = (slotPlayer: LineupPlayer | undefined, named: boolean, locale: Locale = "fr") =>
    renderToStaticMarkup(
      inLanguage(
        <SelectedSlot position="ST" player={slotPlayer} named={named} onOpenSheet={() => undefined} onSendToBench={() => undefined} />,
        locale,
      ),
    );
  const textOf = (markup: string) =>
    markup
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .replaceAll("&#x27;", "'")
      .trim();

  it("names its player and how he fits it, with his sheet and the bench a touch away", () => {
    const markup = renderSlot(player("Martin", "CB", 70), true);

    expect(textOf(markup)).toBe(
      "Poste sélectionné : BU Buteur Jean Martin DC 70 42 de 70 à 42 Hors poste Voir la fiche Mettre sur le banc",
    );
    expect(markup).toContain('data-testid="lineup-selection"');
    expect(markup).toContain('data-testid="lineup-open-sheet"');
    expect(markup).toContain('data-testid="lineup-send-to-bench"');
    // From xl, the sheet stands beside the pitch: no button to it there.
    expect(markup).toMatch(/data-testid="lineup-open-sheet" class="[^"]* xl:hidden"/);
  });

  it("leaves the slot's name to the sheet's title, and says when nobody is there", () => {
    expect(textOf(renderSlot(occupant, false))).toBe("Jean Titulaire BU À son poste Voir la fiche Mettre sur le banc");
    const empty = renderSlot(undefined, false);
    expect(textOf(empty)).toBe("Personne à ce poste pour l'instant.");
    expect(empty).not.toContain("lineup-send-to-bench");
    expect(textOf(renderSlot(undefined, true, "en"))).toBe("Selected position: ST Striker Nobody in this position yet.");
  });
});
