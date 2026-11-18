/**
 * Cost of a display of the History tab (chantier « historique », docs/design/historique.md § 8; npm run
 * measure:history -- [--seasons=10] [--at=5,10] [--seed=S] [--club=slug] [--repeat=10] [--no-archive]).
 *
 * Plays a worldVersion 2 twin of the demo save (its seed and club unless given), season after season, each followed by
 * its transition (the assistant handling the managed club's contracts). At each count of completed seasons of --at,
 * archives them as the daily maintenance does (SeasonArchive, rows deleted: the production's state since 16/11) unless
 * --no-archive, then measures a display of the History tab:
 * - cold, the server's cache empty: readCompletedCareer and readLiveCareer, then the pure history;
 * - warm, the completed part in the cache: readLiveCareer and the pure history only;
 * queries counted by the client (Prisma's query events), CPU time (process.cpuUsage, user and system; about 15.6 ms of
 * granularity under Windows, hence the --repeat runs, averaged), wall time, and the cached part's size as JSON.
 * Local database only, as every measure.
 */
import "dotenv/config";
import { getCareerHistory, readCompletedCareer, readLiveCareer, careerHistoryView } from "../src/db/career-history";
import { prisma } from "../src/db/client";
import { assertLocalDatabase, isLocalDatabase, pgConnection } from "../src/db/database-url";
import { playNextMatchday } from "../src/db/matchday";
import { SequentialPrismaPg } from "../src/db/pg-adapter";
import { createSave } from "../src/db/saves";
import { advanceToNextSeason } from "../src/db/season";
import { runArchivePass } from "../src/db/season-archiving";
import { DEMO_CLUB_SLUG, DEMO_SEED } from "../src/db/test-support";
import { PrismaClient } from "../src/generated/prisma/client";

type Options = { seasons: number; at: number[]; seed: string; club: string; repeat: number; archive: boolean };

function parseOptions(argv: readonly string[]): Options {
  const value = (name: string): string | undefined => argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  const at = (value("at") ?? "5,10").split(",").map(Number);
  return {
    seasons: Number(value("seasons") ?? Math.max(...at)),
    at,
    seed: value("seed") ?? DEMO_SEED,
    club: value("club") ?? DEMO_CLUB_SLUG,
    repeat: Number(value("repeat") ?? 10),
    archive: !argv.includes("--no-archive"),
  };
}

/** A client of its own, counting the queries it sends: the local database only, as every client. */
function countingClient(url: string): { db: PrismaClient; queries: () => number; reset: () => void } {
  assertLocalDatabase(url, "DATABASE_URL");
  const db = new PrismaClient({ adapter: new SequentialPrismaPg(pgConnection(url)), log: [{ emit: "event", level: "query" }] });
  let count = 0;
  db.$on("query", () => {
    count++;
  });
  return { db, queries: () => count, reset: () => (count = 0) };
}

const cpuMs = (start: NodeJS.CpuUsage): number => {
  const used = process.cpuUsage(start);
  return (used.user + used.system) / 1000;
};

type Measure = { queries: number; cpuMs: number; wallMs: number };

/** A work's queries (its first run) and its CPU and wall time, averaged over runs. */
async function measure(counter: ReturnType<typeof countingClient>, runs: number, work: () => Promise<unknown>): Promise<Measure> {
  counter.reset();
  await work();
  const queries = counter.queries();
  const cpu = process.cpuUsage();
  const wall = performance.now();
  for (let run = 0; run < runs; run++) {
    await work();
  }
  return { queries, cpuMs: cpuMs(cpu) / runs, wallMs: (performance.now() - wall) / runs };
}

const fixed = (value: number, digits = 1): string => value.toFixed(digits);

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const url = process.env.DATABASE_URL ?? "";
  if (url === "" || !isLocalDatabase(url)) {
    throw new Error("Refusing to write anywhere else than the local database");
  }
  console.log(`Database ${new URL(url).pathname.slice(1)} (local), seed ${options.seed}, club ${options.club}`);
  const owner = `measure-history-${options.seed}`;
  await prisma.user.deleteMany({ where: { id: owner } });
  await prisma.user.create({ data: { id: owner, kind: "REGISTERED", lastSeenAt: new Date() } });
  const counter = countingClient(url);
  const rows: string[] = [];
  try {
    const club = await prisma.club.findUniqueOrThrow({ where: { slug: options.club }, select: { id: true } });
    const { id: saveId } = await createSave({ name: "Mesure historique", managerName: "Test", clubId: club.id, seed: options.seed, ownerId: owner, worldVersion: 2 });
    for (let season = 1; season <= options.seasons; season++) {
      const began = performance.now();
      while ((await playNextMatchday(saveId)) !== null) {
        // every date of the season
      }
      await advanceToNextSeason(saveId, { assistantContracts: true });
      console.log(`  season ${season}: ${Math.round((performance.now() - began) / 1000)} s`);
      if (!options.at.includes(season)) {
        continue;
      }
      if (options.archive) {
        // As the maintenance does: archived, then their rows deleted (twice: the second pass deletes what the first archived).
        for (let pass = 0; pass < 2; pass++) {
          await runArchivePass(prisma, { mode: "delete", deleteAfterMs: 0, saveIds: [saveId], maxSeasons: 1000, maxRows: 100_000_000, maxMs: 600_000 });
        }
      }
      const archives = await prisma.seasonArchive.count({ where: { saveId } });
      const completed = await readCompletedCareer(counter.db, saveId);
      const cold = await measure(counter, options.repeat, () => getCareerHistory(counter.db, saveId));
      const warm = await measure(counter, options.repeat, async () => careerHistoryView(completed, await readLiveCareer(counter.db, saveId, completed.matches)));
      const history = await getCareerHistory(counter.db, saveId);
      const bytes = Buffer.byteLength(JSON.stringify(completed));
      rows.push(
        `| ${season} | ${archives} | ${completed.matches.length} | ${completed.lines.length} | ${fixed(bytes / 1024, 0)} Ko | ${cold.queries} | ${fixed(cold.cpuMs)} ms | ${fixed(cold.wallMs)} ms | ${warm.queries} | ${fixed(warm.cpuMs)} ms | ${fixed(warm.wallMs)} ms | ${history.legends.length} / ${history.onTheWay.length} |`,
      );
      console.log(rows[rows.length - 1]);
    }
  } finally {
    await prisma.user.deleteMany({ where: { id: owner } });
    await counter.db.$disconnect();
    await prisma.$disconnect();
  }
  console.log(
    [
      "",
      `Affichage de l'onglet Histoire, ${options.repeat} répétitions (CPU et durée moyennés, requêtes de la première) :`,
      "",
      "| Saisons terminées | Archives | Matchs du club | Lignes de joueurs | Partie en cache (JSON) | À froid : requêtes | CPU | durée | En cache : requêtes | CPU | durée | Légendes / en route |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      ...rows,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
