import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EditorPlayer, LineupEditor } from "@/src/db/lineup";
import type { SquadView } from "@/src/db/squad";
import { POSITION_PROFILES } from "@/src/engine/balance";
import { formationPositions } from "@/src/engine/formations";
import { ATTRIBUTE_NAMES, clampRating, overallFor, type AttributeName } from "@/src/engine/generation";
import { resolveLineup, selectLineup, selectRestedLineup, type SavedLineup } from "@/src/engine/lineup";
import { POSITIONS, type Position } from "@/src/engine/positions";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { LineupScreen } from "./lineup-editor";

// The editor alone is rendered here: a Server Action needs a request.
vi.mock("@/app/saves/[id]/lineup/actions", () => ({ saveLineupAction: vi.fn() }));
vi.mock("@/app/saves/[id]/squad/actions", () => ({
  releasePlayerAction: vi.fn(),
  renewContractAction: vi.fn(),
  sellPlayerAction: vi.fn(),
}));

const CLEAN = { suspended: false, suspendedLater: null, bookingRisks: [], bookingRiskNextMatch: false };

/** A player of the managed club whose attributes are his position's profile at a level, as the engine's tests build them. */
function player(id: string, position: Position, level: number, fitness = 100): EditorPlayer {
  const attributes = Object.fromEntries(
    ATTRIBUTE_NAMES.map((name) => [name, clampRating(level + POSITION_PROFILES[position][name])]),
  ) as Record<AttributeName, number>;
  return {
    id,
    position,
    overall: overallFor(position, attributes),
    injured: false,
    suspended: false,
    firstName: "Test",
    lastName: id,
    age: 25,
    injuredUntil: null,
    fitness,
    form: 50,
    morale: 50,
    discipline: CLEAN,
    ...attributes,
  };
}

/** Two players at every position, the second a point below: the first goalkeeper tired, under the assistant's rest. */
const PLAYERS: EditorPlayer[] = POSITIONS.flatMap((position) => [
  player(`${position}#1`, position, 72, position === "GK" ? 60 : 100),
  player(`${position}#2`, position, 71),
]);

const FORMATION = "4-3-3";

/** The squad screen's view: no sheet is open in a static render, so no player of it is read. */
const SQUAD: SquadView = {
  currentDate: new Date(Date.UTC(2026, 6, 1)),
  startYear: 2026,
  windowOpen: true,
  nextWindowOpensOn: new Date(Date.UTC(2027, 0, 1)),
  club: { name: "Rhône FC", budget: 10_000_000, wageBudget: 20_000_000, payroll: 15_000_000 },
  players: [],
};

const editorWith = (saved: SavedLineup | null): LineupEditor => ({
  formation: FORMATION,
  saved,
  instruction: saved?.instruction ?? "BALANCED",
  matchDate: new Date(Date.UTC(2026, 7, 15)),
  clubColors: { primary: "#123456", secondary: "#654321" },
  tier: 1,
  players: PLAYERS,
});

const render = (saved: SavedLineup | null, locale: Locale = "fr"): string =>
  renderToStaticMarkup(inLanguage(<LineupScreen saveId="save-1" editor={editorWith(saved)} squad={SQUAD} opponent={null} />, locale));

/** The status beside « Enregistrer »: its text, tags dropped. */
const statusOf = (markup: string): string =>
  (/<p role="status"[^>]*data-testid="lineup-status"[^>]*>(.*?)<\/p>/.exec(markup)?.[1] ?? "").replace(/<[^>]+>/g, "");

/** The player key of each slot of the pitch, by index. */
const pitchOf = (markup: string): string[] =>
  [...markup.matchAll(/data-slot-index="(\d+)" data-slot-player-key="([^"]+)"/g)]
    .sort(([, a], [, b]) => Number(a) - Number(b))
    .map(([, , key]) => key);

/** A lineup as the manager saves it: the automatic one, every slot filled. */
const SAVED: SavedLineup = (() => {
  const lineup = selectLineup(PLAYERS, formationPositions(FORMATION));
  return {
    starters: lineup.starters.map(({ index, player: { id } }) => ({ slot: index, playerKey: id })),
    benchOrder: lineup.bench.map(({ id }) => id),
  };
})();

describe("the line-up's status", () => {
  it("never says a line-up is saved when none ever was: the eleven shown is the automatic one the match plays", () => {
    const markup = render(null);

    expect(statusOf(markup)).toBe("Onze automatique · pas encore enregistré");
    expect(markup).not.toContain("Composition enregistrée");
    // What the match plays without a saved lineup (resolveLineup without one): the best available at each slot, the tired
    // goalkeeper included, where the assistant's « Composition automatique » would rest him.
    const played = resolveLineup(FORMATION, null, PLAYERS).starters.map(({ player: { id } }) => id);
    expect(pitchOf(markup)).toEqual(played);
    expect(pitchOf(markup)[0]).toBe("GK#1");
    expect(selectRestedLineup(PLAYERS, formationPositions(FORMATION)).starters[0].player.id).toBe("GK#2");
    // Nothing to save until the eleven changes.
    expect(/<button[^>]*data-testid="lineup-save"[^>]*>/.exec(markup)?.[0]).toContain('disabled=""');
  });

  it("says a saved line-up is saved, in the same grey", () => {
    const markup = render(SAVED);

    expect(statusOf(markup)).toBe("Composition enregistrée");
    expect(markup).toMatch(/data-testid="lineup-status"><span class="text-muted-foreground">Composition enregistrée</);
    expect(render(null)).toMatch(/data-testid="lineup-status"><span class="text-muted-foreground">Onze automatique/);
  });

  it("speaks British English", () => {
    expect(statusOf(render(null, "en"))).toBe("Automatic eleven · not saved yet");
    expect(statusOf(render(SAVED, "en"))).toBe("Line-up saved");
  });
});

describe("the line-up's hint", () => {
  it("says « Touche » under a finger and « Clique » under a mouse, one of them shown", () => {
    const markup = render(null);

    expect(markup).toContain(
      '<span class="pointer-coarse:hidden">Sélectionne un poste sur le terrain pour voir qui peut y jouer, du mieux noté à ce poste au moins bien noté, ou glisse un joueur sur un poste. Clique sur un joueur de la liste pour voir sa fiche.</span>',
    );
    expect(markup).toContain(
      '<span class="hidden pointer-coarse:inline">Sélectionne un poste sur le terrain pour voir qui peut y jouer, du mieux noté à ce poste au moins bien noté, ou glisse un joueur sur un poste. Touche un joueur de la liste pour voir sa fiche.</span>',
    );
    const english = render(null, "en");
    expect(english).toContain("Click a player in the list to view his profile.");
    expect(english).toContain("Tap a player in the list to view his profile.");
  });
});

describe("a nation's line-up", () => {
  /** His 23 in the club's editor, as the national coach's page gives them: no squad screen, his assistant's eleven unsaved. */
  const renderNation = (saved: SavedLineup | null): string =>
    renderToStaticMarkup(
      inLanguage(
        <LineupScreen
          saveId="save-1"
          editor={editorWith(saved)}
          opponent={null}
          unsaved="assistant"
          texts={{ selectHint: { touch: "Touche un poste.", click: "Clique sur un poste." }, pickerAbout: "Classés." }}
        />,
      ),
    );

  it("shows his assistant's eleven while none is saved, the one his match then plays, with nothing to save", () => {
    const markup = renderNation(null);

    const rested = selectRestedLineup(PLAYERS, formationPositions(FORMATION)).starters.map(({ player: { id } }) => id);
    expect(pitchOf(markup)).toEqual(rested);
    expect(pitchOf(markup)[0]).toBe("GK#2");
    expect(statusOf(markup)).toBe("Onze automatique · pas encore enregistré");
    expect(/<button[^>]*data-testid="lineup-save"[^>]*>/.exec(markup)?.[0]).toContain('disabled=""');
  });

  it("opens on his saved line-up once there is one", () => {
    const markup = renderNation(SAVED);

    expect(pitchOf(markup)[0]).toBe("GK#1");
    expect(statusOf(markup)).toBe("Composition enregistrée");
  });

  it("has no player's sheet: the page's hint in place of the club's, and no column kept for one", () => {
    const markup = renderNation(null);

    expect(markup).toContain('<span class="pointer-coarse:hidden">Clique sur un poste.</span>');
    expect(markup).toContain('<span class="hidden pointer-coarse:inline">Touche un poste.</span>');
    expect(markup).not.toContain("pour voir sa fiche");
    expect(markup).not.toContain("xl:grid-cols-[17rem_minmax(0,1fr)_18.5rem]");
    expect(render(null)).toContain("xl:grid-cols-[17rem_minmax(0,1fr)_18.5rem]");
  });
});
