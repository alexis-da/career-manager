import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EditorPlayer, LineupEditor } from "@/src/db/lineup";
import type { SquadView } from "@/src/db/squad";
import { POSITION_PROFILES } from "@/src/engine/balance";
import { formationPositions } from "@/src/engine/formations";
import { ATTRIBUTE_NAMES, clampRating, overallFor, type AttributeName } from "@/src/engine/generation";
import { resolveLineup, selectAssistantLineup, selectLineup, selectRestedLineup, type SavedLineup } from "@/src/engine/lineup";
import { POSITIONS, type Position } from "@/src/engine/positions";
import type { Locale } from "@/src/i18n/locale";
import { inLanguage } from "@/src/i18n/test-intl";
import { LineupScreen } from "./lineup-editor";

// The editor alone is rendered here: a Server Action needs a request.
vi.mock("@/app/saves/[id]/lineup/actions", () => ({ saveLineupAction: vi.fn(), saveLineupPlanAction: vi.fn() }));
vi.mock("@/app/saves/[id]/club/actions", () => ({ setAssistantSettingAction: vi.fn() }));
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
  club: { name: "Rhône FC", budget: 10_000_000 },
  players: [],
};

/** A club's editor: its assistant makes the line-up (a new career's way), or its player, with what he saved. */
const editorWith = (saved: SavedLineup | null, byAssistant = true, youth: LineupEditor["youth"] = null): LineupEditor => ({
  formation: FORMATION,
  saved,
  instruction: saved?.instruction ?? "BALANCED",
  matchDate: new Date(Date.UTC(2026, 7, 15)),
  clubColors: { primary: "#123456", secondary: "#654321" },
  tier: 1,
  players: PLAYERS,
  byAssistant,
  youth,
});

const renderEditor = (editor: LineupEditor, locale: Locale = "fr"): string =>
  renderToStaticMarkup(inLanguage(<LineupScreen saveId="save-1" editor={editor} squad={SQUAD} opponent={null} />, locale));

/** The club's editor, its assistant making the line-up unless told otherwise. */
const render = (saved: SavedLineup | null, locale: Locale = "fr", byAssistant = true): string =>
  renderEditor(editorWith(saved, byAssistant), locale);

/** The status of who makes the eleven: its text, tags dropped, its apostrophes as written. */
const statusOf = (markup: string): string =>
  (/<p role="status"[^>]*data-testid="lineup-status"[^>]*>(.*?)<\/p>/.exec(markup)?.[1] ?? "").replace(/<[^>]+>/g, "").replaceAll("&#x27;", "'");

/** A button of the editor by its test id: its opening tag, or null without it. */
const buttonOf = (markup: string, testId: string): string | null =>
  new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`).exec(markup)?.[0] ?? null;

/** The player key of each slot of the pitch, by index. */
const pitchOf = (markup: string): string[] =>
  [...markup.matchAll(/data-slot-index="(\d+)" data-slot-player-key="([^"]+)"/g)]
    .sort(([, a], [, b]) => Number(a) - Number(b))
    .map(([, , key]) => key);

/** The assistant's card: its text, tags dropped; null without it. */
const assistantCardOf = (markup: string): string | null => {
  const card = /<section[^>]*data-testid="lineup-assistant"[^>]*>(.*?)<\/section>/.exec(markup)?.[1];
  return card === undefined
    ? null
    : card
        .replace(/<span class="hidden pointer-coarse:inline">.*?<\/span>/g, "")
        .replace(/<[^>]+>/g, " ")
        .replaceAll("&#x27;", "'");
};

/** A lineup as the manager saves it: the automatic one, every slot filled, the tired goalkeeper in goal. */
const SAVED: SavedLineup = (() => {
  const lineup = selectLineup(PLAYERS, formationPositions(FORMATION));
  return {
    starters: lineup.starters.map(({ index, player: { id } }) => ({ slot: index, playerKey: id })),
    benchOrder: lineup.bench.map(({ id }) => id),
  };
})();

describe("the line-up its assistant makes", () => {
  it("shows his eleven, the one the match plays, and never says a line-up is saved: nothing to save, no orange", () => {
    const markup = render(null);

    expect(statusOf(markup)).toBe("Onze de ton adjoint · il le refait avant chaque match");
    expect(markup).not.toContain("Composition enregistrée");
    // His rested eleven (selectRestedLineup), which the match plays: the tired goalkeeper rested, where the best available
    // at each slot would have him.
    const rested = selectRestedLineup(PLAYERS, formationPositions(FORMATION)).starters.map(({ player: { id } }) => id);
    expect(pitchOf(markup)).toEqual(rested);
    expect(pitchOf(markup)[0]).toBe("GK#2");
    expect(resolveLineup(FORMATION, null, PLAYERS).starters[0].player.id).toBe("GK#1");
    // « Enregistrer » for a draft only; his eleven is made again before each match, no button for it.
    expect(buttonOf(markup, "lineup-save")).toBeNull();
    expect(buttonOf(markup, "lineup-cancel")).toBeNull();
    expect(buttonOf(markup, "lineup-automatic")).toBeNull();
    expect(buttonOf(markup, "lineup-hand-back")).toBeNull();
    // No full orange: the variant of the screen's action is the save's, for a draft.
    expect(markup).not.toContain("bg-(--club)");
  });

  it("says what he does, whom he rests, and how to take the eleven, in his card", () => {
    const card = assistantCardOf(render(null)) ?? "";

    expect(card).toContain("Ton adjoint aligne le onze");
    expect(card).toContain("Avant chaque match, il prend les meilleurs selon la condition, les blessures et les suspensions, dans ton dispositif.");
    expect(card).toContain("Au repos : GK#1 (60 de condition)");
    expect(card).toContain("Clique sur un joueur pour faire ton onze : ton adjoint ne le changera plus.");
    expect(render(null)).toContain('<span class="hidden pointer-coarse:inline">Touche un joueur pour faire ton onze : ton adjoint ne le changera plus.</span>');
    // Nobody tired, nobody rested: no such line.
    const fresh = renderEditor({ ...editorWith(null), players: PLAYERS.map((player) => ({ ...player, fitness: 100 })) });
    expect(fresh).not.toContain('data-testid="lineup-rested"');
  });

  it("leaves a line-up saved before unread: his eleven still, its instruction kept", () => {
    const markup = render({ ...SAVED, instruction: "DEFEND" });

    expect(pitchOf(markup)[0]).toBe("GK#2");
    expect(statusOf(markup)).toBe("Onze de ton adjoint · il le refait avant chaque match");
    const radio = (instruction: string) => new RegExp(`<input[^>]*name="starting-instruction"[^>]*value="${instruction}"[^>]*>`).exec(markup)?.[0];
    expect(markup.match(/<input[^>]*name="starting-instruction"[^>]*>/g)?.find((tag) => tag.includes('value="DEFEND"'))).toContain('checked=""');
    expect(radio("BALANCED")).not.toContain("checked");
  });

  it("starts the Jeunesse objective's young player as the match does", () => {
    const young = player("CB#young", "CB", 71);
    const players = [...PLAYERS, young];
    const youth = { id: "CB#young", leagueStarts: 3 };
    const expected = selectAssistantLineup(players, formationPositions(FORMATION), youth).starters.map(({ player: { id } }) => id);
    const markup = renderEditor({ ...editorWith(null, true, youth), players });

    expect(expected).toContain("CB#young");
    expect(pitchOf(markup)).toEqual(expected);
    expect(selectRestedLineup(players, formationPositions(FORMATION)).starters.map(({ player: { id } }) => id)).not.toContain("CB#young");
  });

  it("speaks British English", () => {
    const markup = render(null, "en");

    expect(statusOf(markup)).toBe("Your assistant's eleven · he picks it again before every match");
    expect(assistantCardOf(markup)).toContain("Your assistant picks the eleven");
    expect(assistantCardOf(markup)).toContain("Rested: GK#1 (60 fitness)");
    expect(assistantCardOf(markup)).toContain("Click a player to make your own eleven: your assistant will no longer change it.");
  });
});

describe("the line-up its player makes", () => {
  it("shows his saved eleven, says it is his, and hands it back to the assistant, nothing to save", () => {
    const markup = render(SAVED, "fr", false);

    expect(pitchOf(markup)[0]).toBe("GK#1");
    expect(statusOf(markup)).toBe("Ton onze · enregistré. Ton adjoint ne remplace qu'un blessé ou un suspendu.");
    expect(markup).toMatch(/data-testid="lineup-status" data-mode="player"><span class="text-muted-foreground">Ton onze · enregistré/);
    expect(buttonOf(markup, "lineup-hand-back")).not.toBeNull();
    expect(markup).toContain("Rendre la main à l&#x27;adjoint");
    expect(buttonOf(markup, "lineup-save")).toBeNull();
    expect(buttonOf(markup, "lineup-automatic")).toBeNull();
    expect(markup).not.toContain('data-testid="lineup-assistant"');
  });

  it("never says a line-up is saved when none was: the automatic eleven the match then plays", () => {
    const markup = render(null, "fr", false);

    expect(statusOf(markup)).toBe("Onze automatique · pas encore enregistré");
    // What the match plays without a saved lineup (resolveLineup without one): the best available at each slot.
    expect(pitchOf(markup)).toEqual(resolveLineup(FORMATION, null, PLAYERS).starters.map(({ player: { id } }) => id));
    expect(pitchOf(markup)[0]).toBe("GK#1");
  });

  it("speaks British English", () => {
    const markup = render(SAVED, "en", false);

    expect(statusOf(markup)).toBe("Your eleven · saved. Your assistant only replaces an injured or suspended player.");
    expect(markup).toContain("Hand back to your assistant");
    expect(statusOf(render(null, "en", false))).toBe("Automatic eleven · not saved yet");
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
  /** His editor as getCoachLineupEditor gives it: nobody says who makes the line-up, his own. */
  const nationEditor = (saved: SavedLineup | null): LineupEditor => ({
    formation: FORMATION,
    saved,
    instruction: saved?.instruction ?? "BALANCED",
    matchDate: new Date(Date.UTC(2026, 8, 4)),
    clubColors: { primary: "#123456", secondary: "#654321" },
    tier: 1,
    players: PLAYERS,
  });

  /** His 23 in the club's editor, as the national coach's page gives them: no squad screen, his assistant's eleven unsaved. */
  const renderNation = (saved: SavedLineup | null): string =>
    renderToStaticMarkup(
      inLanguage(
        <LineupScreen
          saveId="save-1"
          editor={nationEditor(saved)}
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

  it("keeps his « Composition automatique », and none of the club's assistant: his card, his status, his hand back", () => {
    const markup = renderNation(SAVED);

    expect(buttonOf(markup, "lineup-automatic")).not.toBeNull();
    expect(markup).toContain("Composition automatique");
    expect(markup).not.toContain('data-testid="lineup-assistant"');
    expect(buttonOf(markup, "lineup-hand-back")).toBeNull();
    expect(buttonOf(markup, "lineup-cancel")).toBeNull();
    expect(buttonOf(markup, "lineup-save")).toContain('disabled=""');
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
