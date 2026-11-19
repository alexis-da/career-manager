/**
 * The national coach's cost (npm run measure:coach -- [--seasons=N] [--seed=S] [--nation=CODE]; docs/design/selections.md,
 * N4 and N4b): two worldVersion 2 twins of the demo save (demo seed unless --seed, demo club), one whose player coaches a
 * nation from the first season (the strongest of Europe unless --nation), the other without; both played N seasons
 * (default 2: the first cycle and its summer tournament), every match simulated as « Simuler » plays it, the assistant
 * deciding, each season followed by advanceToNextSeason (the assistant managing the club's contracts). Measures, for each
 * international break and for the summer tournament, the process CPU and the time of the steps that played it (the coach's
 * steps against the other twin's single step), how many of the coach's matches stopped the game, how many matches the
 * full engine played; then, in the coach's first break of the second season, his match at stake played live instead,
 * segment by segment as the live page asks for it: the cost of its kick-off and of each step; and, the other twin's
 * player taking over a nation just qualified once its second season's qualifiers are over, his summer tournament played in
 * June in steps, against the tournament a save without a coach plays at its transition. Prints a markdown report.
 * The twins and their throwaway owner are deleted at the end. Writes to the local database only.
 */
import "dotenv/config";
import { prisma } from "../src/db/client";
import { Prisma } from "../src/generated/prisma/client";
import { isLocalDatabase } from "../src/db/database-url";
import { playNextMatchday } from "../src/db/matchday";
import { acceptCoachOffer } from "../src/db/national-coach";
import { getNationsView } from "../src/db/nations-view";
import { advanceNationalLiveMatch, getNationalLive } from "../src/db/national-live";
import { createSave } from "../src/db/saves";
import { advanceToNextSeason } from "../src/db/season";
import { DEMO_CLUB_SLUG, DEMO_SEED } from "../src/db/test-support";
import type { LivePause } from "../src/engine/live";
import { isNationCode, nationByCode, type NationCode } from "../src/engine/nations";
import { QUALIFIER_EUROPE, QUALIFIER_WORLD } from "../src/engine/tournaments";
import { WORLD_START_YEAR } from "../src/engine/world";

const OWNER = "measure-national-coach";

type Cost = { cpuMs: number; wallMs: number };

/** Runs `work`, with the process CPU (user and system) and the time it took. */
async function measured<T>(work: () => Promise<T>): Promise<{ value: T; cost: Cost }> {
  const cpu = process.cpuUsage();
  const wall = performance.now();
  const value = await work();
  const used = process.cpuUsage(cpu);
  return { value, cost: { cpuMs: (used.user + used.system) / 1000, wallMs: performance.now() - wall } };
}

const add = (a: Cost, b: Cost): Cost => ({ cpuMs: a.cpuMs + b.cpuMs, wallMs: a.wallMs + b.wallMs });
const ZERO: Cost = { cpuMs: 0, wallMs: 0 };

/** A break or a summer tournament as a twin played it: its first date, its steps and their cost. */
type SessionRecord = { from: string; steps: number; stops: number; cost: Cost };

type TwinRecord = { sessions: SessionRecord[]; clubDates: { count: number; cost: Cost } };

function parseOptions(argv: readonly string[]): { seasons: number; seed: string; nation: string | null } {
  const value = (name: string): string | undefined => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  return { seasons: Number(value("seasons") ?? 2), seed: value("seed") ?? DEMO_SEED, nation: value("nation") ?? null };
}

async function createTwin(name: string, seed: string): Promise<string> {
  const club = await prisma.club.findUniqueOrThrow({ where: { slug: DEMO_CLUB_SLUG }, select: { id: true } });
  const { id } = await createSave({ name, managerName: "Test", clubId: club.id, seed, ownerId: OWNER, worldVersion: 2 });
  return id;
}

/**
 * Plays a twin's season, every date simulated: the club's dates counted together, each break or tournament by its steps,
 * a step of the coach that played his match at stake counted as a stop. With `live`, the coach's first match at stake of
 * the season is played live instead, its kick-off and each step measured.
 */
async function playSeason(
  saveId: string,
  record: TwinRecord,
  live: { kickOff: Cost; steps: Cost[] } | null,
  more: () => Promise<boolean> = async () => true,
): Promise<void> {
  let session: SessionRecord | null = null;
  let liveDone = live === null;
  while (await more()) {
    if (!liveDone && live !== null) {
      // To the coach's next match at stake, then that match live.
      const stop = await measured(() => playNextMatchday(saveId, { untilNationalStop: true }));
      if (stop.value?.national?.stopNext === true && stop.value.national.played === 0) {
        const kickOff = await measured(() => playNextMatchday(saveId, { pauseManagedMatch: true }));
        live.kickOff = kickOff.cost;
        const matchId = kickOff.value?.national?.matchId ?? null;
        let pause: LivePause | null = (await getNationalLive(saveId, matchId))?.pause ?? null;
        while (pause !== null) {
          const at = pause;
          const step = await measured(() => advanceNationalLiveMatch(saveId, at, {}, "segment"));
          live.steps.push(step.cost);
          pause = step.value.pause;
        }
        liveDone = true;
        continue;
      }
      if (stop.value === null) {
        return;
      }
    }
    const step = await measured(() => playNextMatchday(saveId));
    if (step.value === null) {
      return;
    }
    const international = step.value.national !== undefined || step.value.internationalBreak !== undefined;
    if (!international) {
      record.clubDates = { count: record.clubDates.count + 1, cost: add(record.clubDates.cost, step.cost) };
      continue;
    }
    session ??= { from: step.value.date.toISOString().slice(0, 10), steps: 0, stops: 0, cost: ZERO };
    session.steps++;
    session.stops += step.value.national?.matchId !== null && step.value.national !== undefined ? 1 : 0;
    session.cost = add(session.cost, step.cost);
    if (step.value.internationalBreak !== undefined) {
      record.sessions.push(session);
      session = null;
    }
  }
}

const ms = (value: number): string => `${Math.round(value)} ms`;
const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length);

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const url = process.env.DATABASE_URL ?? "";
  if (url === "" || !isLocalDatabase(url)) {
    throw new Error("Refusing to write anywhere else than the local database");
  }
  console.log(`Database: ${new URL(url).pathname.slice(1)} (local), seed ${options.seed}`);
  await prisma.user.deleteMany({ where: { id: OWNER } });
  await prisma.user.createMany({ data: [{ id: OWNER, kind: "REGISTERED", lastSeenAt: new Date() }], skipDuplicates: true });
  try {
    const coachId = await createTwin("Mesure sélectionneur", options.seed);
    const plainId = await createTwin("Mesure sans sélectionneur", options.seed);
    const strengths = await prisma.nationSave.findMany({ where: { saveId: coachId }, select: { code: true, strength: true } });
    const nation: NationCode =
      options.nation !== null && isNationCode(options.nation)
        ? options.nation
        : strengths
            .flatMap((row) => (isNationCode(row.code) && nationByCode(row.code).zone === "EUROPE" ? [{ code: row.code, strength: row.strength ?? 0 }] : []))
            .sort((a, b) => b.strength - a.strength)[0].code;
    await prisma.nationSave.updateMany({ where: { saveId: coachId, code: nation }, data: { offeredIn: WORLD_START_YEAR } });
    await acceptCoachOffer(coachId, nation);

    const coach: TwinRecord = { sessions: [], clubDates: { count: 0, cost: ZERO } };
    const plain: TwinRecord = { sessions: [], clubDates: { count: 0, cost: ZERO } };
    const live = { kickOff: ZERO, steps: [] as Cost[] };
    const transitions: { coach: Cost; plain: Cost }[] = [];
    const june: TwinRecord = { sessions: [], clubDates: { count: 0, cost: ZERO } };
    let takenOver: NationCode | null = null;
    for (let season = 0; season < options.seasons; season++) {
      console.log(`Season ${season + 1}…`);
      await playSeason(coachId, coach, season === 1 ? live : null);
      if (season === 1) {
        // Its qualifiers over, the other twin's player takes over a nation just qualified: its tournament, in June.
        const qualifiersLeft = async () =>
          (await prisma.internationalMatch.count({ where: { saveId: plainId, played: false, competition: { in: [QUALIFIER_EUROPE, QUALIFIER_WORLD] } } })) > 0;
        await playSeason(plainId, plain, null, qualifiersLeft);
        takenOver = (await getNationsView(plainId))?.campaign?.draw?.groups[0].rows[0].code ?? null;
        if (takenOver !== null) {
          await prisma.coachSpell.create({ data: { saveId: plainId, code: takenOver, fromYear: WORLD_START_YEAR + 1, objective: 1, objectiveYear: WORLD_START_YEAR + 2 } });
          await prisma.save.update({ where: { id: plainId }, data: { nationCode: takenOver } });
        }
        await playSeason(plainId, june, null);
      } else {
        await playSeason(plainId, plain, null);
      }
      const a = await measured(() => advanceToNextSeason(coachId, { assistantContracts: true }));
      const b = await measured(() => advanceToNextSeason(plainId, { assistantContracts: true }));
      transitions.push({ coach: a.cost, plain: b.cost });
    }
    const fullEngine = await prisma.internationalMatch.count({ where: { saveId: coachId, outcome: { not: Prisma.DbNull } } });
    const spell = await prisma.coachSpell.findFirst({ where: { saveId: coachId }, orderBy: { createdAt: "desc" } });

    const lines: string[] = [];
    lines.push(`## Sélectionneur : coût (seed ${options.seed}, ${options.seasons} saisons, ${nation})`, "");
    lines.push("| Trêve ou tournoi | Étapes (sélectionneur) | Arrêts | CPU sélectionneur | Durée | CPU sans sélectionneur | Durée |", "| --- | --- | --- | --- | --- | --- | --- |");
    coach.sessions.forEach((session, index) => {
      const other = plain.sessions[index];
      lines.push(
        `| ${session.from} | ${session.steps} | ${session.stops} | ${ms(session.cost.cpuMs)} | ${ms(session.cost.wallMs)} | ${other === undefined ? "—" : ms(other.cost.cpuMs)} | ${other === undefined ? "—" : ms(other.cost.wallMs)} |`,
      );
    });
    const breaks = (record: TwinRecord) => record.sessions.filter((session) => !session.from.includes("-06-"));
    lines.push(
      "",
      `Moyenne par trêve : sélectionneur ${ms(mean(breaks(coach).map((s) => s.cost.cpuMs)))} de CPU (${ms(mean(breaks(coach).map((s) => s.cost.wallMs)))}), sans sélectionneur ${ms(mean(breaks(plain).map((s) => s.cost.cpuMs)))} (${ms(mean(breaks(plain).map((s) => s.cost.wallMs)))}).`,
      `Arrêts par saison : ${(coach.sessions.reduce((sum, s) => sum + s.stops, 0) / options.seasons).toFixed(1)} ; matchs du moteur complet : ${fullEngine}.`,
      `Une date de club, en moyenne : ${ms(coach.clubDates.cost.cpuMs / Math.max(1, coach.clubDates.count))} de CPU.`,
      `Passages de saison (CPU) : ${transitions.map((t) => `${ms(t.coach.cpuMs)} contre ${ms(t.plain.cpuMs)}`).join(" ; ")}.`,
      `Match en direct de la sélection : coup d'envoi ${ms(live.kickOff.cpuMs)} de CPU (${ms(live.kickOff.wallMs)}), ${live.steps.length} étapes de ${ms(mean(live.steps.map((s) => s.cpuMs)))} de CPU en moyenne (${ms(mean(live.steps.map((s) => s.wallMs)))}), la dernière ${ms(live.steps.at(-1)?.cpuMs ?? 0)} (la fin de la trêve comprise).`,
      `Mission : ${spell?.code} depuis ${spell?.fromYear}, ${spell?.outcome ?? "en poste"}${spell?.exceeded ? `, ${spell.exceeded} tournoi dépassé` : ""}.`,
      `Tournoi d'été d'un sélectionneur (${takenOver ?? "—"}, repris qualifié) : ${june.sessions.map((s) => `${s.steps} étapes, ${s.stops} arrêts, ${ms(s.cost.cpuMs)} de CPU (${ms(s.cost.wallMs)})`).join(" ; ") || "—"}.`,
    );
    console.log(`\n${lines.join("\n")}`);
  } finally {
    await prisma.user.deleteMany({ where: { id: OWNER } });
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
