/**
 * Balance of the world with the second divisions (npm run measure:balance -- [seasons] [out.json]): plays a
 * worldVersion 2 twin of the demo save (demo seed, demo club) for several seasons, then prints, by division, goals per
 * match, home wins and draws, and by country the strength of the promoted clubs against the first division's last club
 * to stay up, their rank the next season, and the clubs going up and down more than once. The twin and its throwaway
 * owner are deleted at the end. Writes to the database: refuses any other than the test branch (sparkling-darkness).
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "../src/db/client";
import { seasonMovementsSchema } from "../src/db/promotion";
import { advanceToNextSeason } from "../src/db/season";
import { getStandings } from "../src/db/standings";
import { createSave } from "../src/db/saves";
import { DEMO_CLUB_SLUG, DEMO_SEED, playRemainingMatchdays } from "../src/db/test-support";
import { PROMOTION_RELEGATION } from "../src/engine/balance";
import { averageStarterRating, selectLineup } from "../src/engine/lineup";
import { countryOf } from "../src/engine/promotion";

const TEST_HOST = "sparkling-darkness";
const OWNER = "test-owner-measure-balance";

type DivisionTally = { matches: number; goals: number; homeWins: number; draws: number };
type SeasonRecord = {
  startYear: number;
  strength: Record<string, number>; // club slug → mean starter rating at the season's kickoff
  competitionOf: Record<string, string>; // club slug → competition code that season
  ranks: Record<string, number>; // club slug → final rank
  sizes: Record<string, number>; // competition code → clubs
  tallies: Record<string, DivisionTally>; // competition code → matches
  moves: { slug: string; from: string; to: string; reason: string; rank: number }[]; // at the end of the season
};

const round = (value: number, digits = 1): number => Math.round(value * 10 ** digits) / 10 ** digits;
const mean = (values: number[]): number => (values.length === 0 ? Number.NaN : values.reduce((a, b) => a + b, 0) / values.length);
const percent = (part: number, whole: number): string => `${round((100 * part) / whole)} %`;

async function strengths(saveId: string): Promise<{ strength: Record<string, number>; competitionOf: Record<string, string> }> {
  const clubs = await prisma.clubSave.findMany({
    where: { saveId },
    select: {
      id: true,
      club: { select: { slug: true } },
      competition: { select: { code: true } },
      players: { where: { saveId }, select: { playerKey: true, position: true, overall: true, injuredUntil: true } },
    },
  });
  const strength: Record<string, number> = {};
  const competitionOf: Record<string, string> = {};
  for (const club of clubs) {
    const squad = club.players.map((player) => ({
      id: player.playerKey,
      position: player.position,
      overall: player.overall,
      injured: player.injuredUntil !== null,
    }));
    strength[club.club.slug] = averageStarterRating(selectLineup(squad));
    competitionOf[club.club.slug] = club.competition.code;
  }
  return { strength, competitionOf };
}

async function playSeason(saveId: string): Promise<SeasonRecord> {
  const kickoff = await strengths(saveId);
  const save = await prisma.save.findUniqueOrThrow({ where: { id: saveId }, select: { currentDate: true } });
  const seasons = await prisma.season.findMany({
    where: { saveId, completed: false },
    select: { id: true, startYear: true, competition: { select: { code: true } } },
  });
  const started = performance.now();
  await playRemainingMatchdays(saveId);

  const ranks: Record<string, number> = {};
  const sizes: Record<string, number> = {};
  const tallies: Record<string, DivisionTally> = {};
  for (const season of seasons) {
    const table = await getStandings(saveId, season.id);
    sizes[season.competition.code] = table.length;
    for (const row of table) {
      ranks[row.club] = row.rank;
    }
    const fixtures = await prisma.fixture.findMany({
      where: { saveId, seasonId: season.id },
      select: { homeGoals: true, awayGoals: true },
    });
    const tally: DivisionTally = { matches: 0, goals: 0, homeWins: 0, draws: 0 };
    for (const { homeGoals, awayGoals } of fixtures) {
      const home = homeGoals ?? 0;
      const away = awayGoals ?? 0;
      tally.matches++;
      tally.goals += home + away;
      tally.homeWins += home > away ? 1 : 0;
      tally.draws += home === away ? 1 : 0;
    }
    tallies[season.competition.code] = tally;
  }

  const transition = await advanceToNextSeason(saveId);
  const closed = await prisma.season.findMany({ where: { saveId, startYear: transition.completedStartYear }, select: { movements: true } });
  const clubIds = await prisma.club.findMany({ select: { id: true, slug: true } });
  const slugOf = new Map(clubIds.map((club) => [club.id, club.slug]));
  const moves = closed.flatMap((season) =>
    season.movements === null
      ? []
      : seasonMovementsSchema.parse(season.movements).map((move) => ({
          slug: slugOf.get(move.clubId) ?? move.clubId,
          from: move.from,
          to: move.to,
          reason: move.reason,
          rank: move.rank,
        })),
  );
  console.log(`  season ${transition.completedStartYear}: ${Math.round((performance.now() - started) / 1000)} s, ${moves.length} moves`);
  return { startYear: seasons[0]?.startYear ?? save.currentDate.getUTCFullYear(), ...kickoff, ranks, sizes, tallies, moves };
}

function report(records: SeasonRecord[]): string {
  const lines: string[] = [];
  const codes = Object.keys(records[0].tallies).sort();

  lines.push("1. Matches by division, all seasons");
  lines.push("division      matches  goals/match  home wins  draws");
  for (const scope of ["tier 1", "tier 2", ...codes]) {
    const selected = codes.filter((code) => (scope.startsWith("tier") ? code.endsWith(`.${scope.slice(-1)}`) : code === scope));
    const total = selected.flatMap((code) => records.map((record) => record.tallies[code])).reduce(
      (sum, tally) => ({
        matches: sum.matches + tally.matches,
        goals: sum.goals + tally.goals,
        homeWins: sum.homeWins + tally.homeWins,
        draws: sum.draws + tally.draws,
      }),
      { matches: 0, goals: 0, homeWins: 0, draws: 0 },
    );
    lines.push(
      `${scope.padEnd(12)}  ${String(total.matches).padStart(7)}  ${round(total.goals / total.matches, 2).toFixed(2).padStart(11)}  ${percent(total.homeWins, total.matches).padStart(9)}  ${percent(total.draws, total.matches).padStart(5)}`,
    );
  }

  lines.push("", "2. Strength at kickoff (mean starter rating): second division champion against the first division's 15th");
  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    const row = Object.keys(PROMOTION_RELEGATION)
      .sort()
      .map((country) => {
        const at = (code: string, rank: number) =>
          Object.entries(record.ranks).find(([slug, value]) => value === rank && record.competitionOf[slug] === code)?.[0];
        const champion = at(`${country}.2`, 1);
        const fifteenth = at(`${country}.1`, 15);
        return `${country} ${champion === undefined ? "?" : round(record.strength[champion])} vs ${fifteenth === undefined ? "?" : round(record.strength[fifteenth])}`;
      });
    lines.push(`  season ${index + 1}: ${row.join(" · ")}`);
  }

  lines.push("", "3. Promoted clubs, by country: strength at the next kickoff against the last first division club to stay up, rank the next season");
  for (const country of Object.keys(PROMOTION_RELEGATION).sort()) {
    lines.push(`  ${country}`);
    for (let index = 0; index + 1 < records.length; index++) {
      const record = records[index];
      const next = records[index + 1];
      const promoted = record.moves.filter((move) => move.reason === "PROMOTED" && countryOf(move.from) === country);
      const firstSize = record.sizes[`${country}.1`];
      const staying = Object.entries(record.ranks).find(
        ([slug, rank]) => record.competitionOf[slug] === `${country}.1` && rank === firstSize - PROMOTION_RELEGATION[country],
      )?.[0];
      const promotedStrength = mean(promoted.map((move) => next.strength[move.slug]));
      const stayingStrength = staying === undefined ? Number.NaN : next.strength[staying];
      const nextRanks = promoted.map((move) => `${move.slug} ${next.ranks[move.slug] ?? "?"}e`).join(", ");
      lines.push(
        `    after season ${index + 1}: promoted ${round(promotedStrength)} vs last kept ${round(stayingStrength)} (${staying ?? "?"}) · next season: ${nextRanks}`,
      );
    }
  }

  lines.push("", "4. Clubs moving more than once");
  const movesBySlug = new Map<string, string[]>();
  for (const [index, record] of records.entries()) {
    for (const move of record.moves) {
      movesBySlug.set(move.slug, [...(movesBySlug.get(move.slug) ?? []), `${move.reason === "PROMOTED" ? "↑" : "↓"}${index + 1}`]);
    }
  }
  const lifts = [...movesBySlug].filter(([, moves]) => moves.length > 1).sort(([a], [b]) => a.localeCompare(b));
  for (const country of Object.keys(PROMOTION_RELEGATION).sort()) {
    const ofCountry = lifts.filter(([slug]) => countryOf(records[0].competitionOf[slug] ?? "") === country);
    lines.push(`  ${country}: ${ofCountry.length} — ${ofCountry.map(([slug, moves]) => `${slug} ${moves.join(" ")}`).join(", ") || "none"}`);
  }
  const yoYos = [...movesBySlug].filter(([, moves]) => moves.some((move, index) => index > 0 && move[0] !== moves[index - 1][0] && Number(move.slice(1)) === Number(moves[index - 1].slice(1)) + 1));
  lines.push(`  up then down (or down then up) the next season: ${yoYos.length}`);
  return lines.join("\n");
}

async function main(): Promise<void> {
  const host = new URL(process.env.DIRECT_URL ?? "").host;
  console.log(`Database: ${host}`);
  if (!host.includes(TEST_HOST)) {
    throw new Error(`Refusing to write anywhere else than the test branch (${TEST_HOST})`);
  }
  const seasons = Number(process.argv[2] ?? 6);
  const out = process.argv[3];

  await prisma.user.createMany({ data: [{ id: OWNER, kind: "REGISTERED", lastSeenAt: new Date() }], skipDuplicates: true });
  const club = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
  const { id: saveId } = await createSave({
    name: "Mesure équilibrage deux divisions",
    managerName: "Test",
    clubId: club.id,
    seed: DEMO_SEED,
    ownerId: OWNER,
    worldVersion: 2,
  });
  try {
    const records: SeasonRecord[] = [];
    for (let index = 0; index < seasons; index++) {
      records.push(await playSeason(saveId));
    }
    const text = report(records);
    console.log(`\n${text}`);
    if (out !== undefined) {
      writeFileSync(out, JSON.stringify({ records, text }, null, 2));
    }
  } finally {
    // The throwaway owner and, by cascade, the twin.
    await prisma.user.delete({ where: { id: OWNER } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
