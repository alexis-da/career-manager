import { useLocale, useTranslations } from "next-intl";
import Link from "@/src/components/link";
import { ClubInitials } from "@/src/components/club-initials";
import { buttonVariants } from "@/src/components/ui/button";
import type { ClubPreview, Dashboard } from "@/src/db/dashboard";
import type { FormationName } from "@/src/engine/formations";
import type { NationalNext } from "@/src/db/national-view";
import type { ManagedBreak } from "@/src/db/nations-view";
import type { OpponentPreview } from "@/src/db/opponent";
import type { NationCode } from "@/src/engine/nations";
import { isTournament } from "@/src/engine/tournaments";
import { competitionName, countryName } from "@/src/i18n/countries";
import { formatDayMonth, formatDecimal, formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { isEuropeStage, isNeutralStage, stageLabel } from "../_lib/stage";
import { nationalStage, tournamentName } from "./coach-names";
import { CoachNationMark } from "./coach-nation-mark";
import { GameActions } from "./game-actions";
import { OpponentSheet } from "./opponent-sheet";
import { ResultPill } from "./result-pill";

/** A secondary control on the hero's blue, outlined. */
const ON_BLUE = "dark:border-on-blue/60 dark:bg-transparent dark:hover:bg-on-blue/10";

/** The hero's « Préparer », beside its main action. */
const PREPARE = cn("h-12 text-base font-bold lg:h-14 lg:px-6", ON_BLUE);

/** The two teams face to face: a column each on a phone, VS between them. */
const FACE_TO_FACE = "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 lg:gap-5";

/** A team's mark in the hero, larger on a computer. */
const HERO_MARK = "size-14 rounded-[1rem] text-2xl lg:size-20 lg:rounded-[1.25rem] lg:text-4xl";

function HeroTeam({ team, managed, away }: { team: ClubPreview; managed: boolean; away: boolean }) {
  const t = useTranslations("dashboard");
  const tWorld = useTranslations("world");
  const locale = useLocale();
  const country = team.country === null ? null : countryName(team.country, tWorld);
  return (
    // A column on a phone, the name under the initials; on a computer, side by side, the away team's mirrored.
    <div className={cn("flex min-w-0 flex-col items-center gap-1.5 text-center lg:flex-row lg:gap-4", away ? "lg:flex-row-reverse lg:text-right" : "lg:text-left")}>
      <ClubInitials name={team.name} managed={managed} className={HERO_MARK} />
      <div className="min-w-0 space-y-1">
        <p className="text-[0.8125rem] leading-tight font-semibold wrap-break-word lg:text-[1.375rem] lg:font-bold">{team.name}</p>
        {/* A European match: the club's country, its rank and points those of the league phase. */}
        {country !== null && (
          <p data-testid="hero-team-country" className="text-xs font-semibold text-on-blue">
            {country}
          </p>
        )}
        <p className="text-xs text-on-blue tabular-nums">
          {/* No rank before a club's first match, nor for a cup opponent from another league: no points to give either. */}
          {team.rank === null ? "—" : `${t("teamRank", { rank: team.rank })} · ${t("points", { count: team.points })}`}
          {team.averageOverall !== null && <span className="max-lg:hidden"> · {t("averageRating", { rating: formatDecimal(team.averageOverall, locale) })}</span>}
        </p>
        {team.form.length > 0 && (
          <div className={cn("flex gap-1 max-lg:hidden", away && "justify-end")}>
            {team.form.map((result, index) => (
              <ResultPill key={index} result={result} className="bg-background" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A nation in the hero, as a club is there: its mark and its name; the player's own on the orange, said under its name. */
function HeroNation({ code, own, away }: { code: NationCode; own: boolean; away: boolean }) {
  const t = useTranslations("dashboardHero");
  const tWorld = useTranslations("world");
  return (
    <div className={cn("flex min-w-0 flex-col items-center gap-1.5 text-center lg:flex-row lg:gap-4", away ? "lg:flex-row-reverse lg:text-right" : "lg:text-left")}>
      <CoachNationMark code={code} own={own} className={HERO_MARK} />
      <div className="min-w-0 space-y-1">
        <p className="text-[0.8125rem] leading-tight font-semibold wrap-break-word lg:text-[1.375rem] lg:font-bold">{tWorld(`nationalities.${code}`)}</p>
        {own && <p className="text-xs text-on-blue">{t("yourNation")}</p>}
      </div>
    </div>
  );
}

/**
 * The national coach's next match at stake, in place of his club's (docs/design/selections.md § 9.3): its day, « Sélection »
 * or its tournament, its stage, home, away or « Terrain neutre », when his club plays next, and the two nations.
 */
function NationalMatch({ next, clubNext }: { next: NationalNext; clubNext: Date | null }) {
  const t = useTranslations("dashboardHero");
  const tNations = useTranslations("nations");
  const tStage = useTranslations("stage");
  const locale = useLocale();
  return (
    // Its parts are the card's own rows: the wrapper only names the match.
    <div data-testid="hero-national" data-nation={next.code} data-live={next.live || undefined} className="contents">
      <div className="space-y-0.5 text-xs font-bold tracking-wider text-on-blue uppercase">
        <h2 id="dashboard-hero">{t("title")}</h2>
        <p data-testid="hero-national-stage">
          {[
            formatShortDate(next.date, locale),
            // A summer tournament names itself, with its year; the qualifiers and the friendlies are the national team's.
            isTournament(next.competition) ? tournamentName(next.competition, next.date.getUTCFullYear(), tNations) : t("national"),
            nationalStage(next, tNations),
            next.neutral ? tStage("neutral") : t(next.home === next.code ? "home" : "away"),
          ].join(" · ")}
        </p>
        {clubNext !== null && (
          <p data-testid="hero-national-club-next" className="pt-1 text-[0.8125rem] font-semibold tracking-normal text-primary-foreground normal-case">
            {t("clubNext", { date: formatShortDate(clubNext, locale) })}
          </p>
        )}
      </div>
      <div className={FACE_TO_FACE}>
        <HeroNation code={next.home} own={next.home === next.code} away={false} />
        <p className="text-center font-heading text-[2.125rem] leading-none lg:text-5xl">VS</p>
        <HeroNation code={next.away} own={next.away === next.code} away />
      </div>
    </div>
  );
}

/** The state of the game the hero's actions follow, as the sidebar's card has it (getSaveHeader). */
export type HeroPlay = {
  liveMatch: boolean; // a match waits live: the managed club's, or its national coach's
  liveHref: string; // where it is played on, within the save: « /live », « /live/nation »
  seasonFinished: boolean; // every match of the season played, a national coach's summer tournament included
  nextBreak: boolean; // an international break comes before the next match: « Passer la trêve »
};

type NextMatchHeroProps = {
  saveId: string;
  dashboard: Dashboard;
  formation: FormationName;
  opponent: OpponentPreview | null;
  // An international break before the match (« Passer la trêve » first), or just played (« Après la trêve »).
  internationalBreak: ManagedBreak | null;
  // The national coach's next match at stake, when it comes before his club's next match: the hero shows it instead.
  nationalNext: NationalNext | null;
  play: HeroPlay;
  className?: string;
};

/**
 * The dashboard's lead card, in the bright blue: the next match, and what to do about it. The game's main action is here,
 * the screen's only full orange one, with « Préparer » and « Simuler » beside it; the sidebar's card leaves them to it. A
 * national coach's match at stake comes first: the main action plays up to it and opens it live, as a club match's, and
 * « Préparer » leads to his national team.
 */
export function NextMatchHero({ saveId, dashboard, formation, opponent, internationalBreak, nationalNext, play, className }: NextMatchHeroProps) {
  const t = useTranslations("dashboardHero");
  const tFormations = useTranslations("formations");
  const tStage = useTranslations("stage");
  const tWorld = useTranslations("world");
  const locale = useLocale();
  const { nextMatch } = dashboard;
  // Nothing to prepare once the season is over, or with a match already under way.
  const prepare =
    play.liveMatch ? null : nationalNext !== null ? (
      <Link href={`/saves/${saveId}/nation`} data-testid="dashboard-prepare-nation" className={buttonVariants({ variant: "outline", className: PREPARE })}>
        {t("prepare")}
      </Link>
    ) : (
      nextMatch !== null && (
        <Link href={`/saves/${saveId}/lineup`} data-testid="dashboard-lineup" className={buttonVariants({ variant: "outline", className: PREPARE })}>
          {t("prepare")}
        </Link>
      )
    );
  return (
    <section
      aria-labelledby="dashboard-hero"
      data-testid="dashboard-next-match"
      className={cn("flex flex-col justify-between gap-4 rounded-card bg-primary p-5 text-primary-foreground lg:gap-5 lg:p-6", className)}
    >
      {nationalNext !== null ? (
        <NationalMatch next={nationalNext} clubNext={nextMatch?.fixture.scheduledAt ?? null} />
      ) : (
        <>
          <div className="space-y-0.5 text-xs font-bold tracking-wider text-on-blue uppercase">
            <h2 id="dashboard-hero">
              {t("title")}
              {nextMatch !== null && ` · ${stageLabel(nextMatch.fixture, tStage)}`}
            </h2>
            {nextMatch !== null && (
              <p>
                {[
                  formatShortDate(nextMatch.fixture.scheduledAt, locale),
                  // A European final is on neutral ground.
                  isNeutralStage(nextMatch.fixture) ? tStage("neutral") : t(nextMatch.fixture.home.isManaged ? "home" : "away"),
                  // A European match names its competition in its stage, above.
                  ...(isEuropeStage(nextMatch.fixture) ? [] : [competitionName(nextMatch.fixture.competitionCode, tWorld)]),
                ].join(" · ")}
              </p>
            )}
            {internationalBreak !== null && (
              <p data-testid="hero-break" data-state={internationalBreak.state} className="pt-1 text-[0.8125rem] font-semibold tracking-normal text-primary-foreground normal-case">
                {internationalBreak.state === "upcoming"
                  ? t("breakAhead", {
                      from: formatDayMonth(internationalBreak.from, locale),
                      to: formatDayMonth(internationalBreak.to, locale),
                      count: internationalBreak.players.length,
                    })
                  : t("afterBreak")}
              </p>
            )}
          </div>

          {nextMatch === null ? (
            <p className="py-6 text-center text-on-blue">{t(play.seasonFinished ? "seasonOver" : "noUpcomingMatch")}</p>
          ) : (
            <div className={FACE_TO_FACE}>
              <HeroTeam team={nextMatch.home} managed={nextMatch.fixture.home.isManaged} away={false} />
              <div className="text-center">
                <p className="font-heading text-[2.125rem] leading-none lg:text-5xl">VS</p>
                {nextMatch.stadium !== null && <p className="mt-1 max-w-24 text-[0.6875rem] leading-tight text-on-blue lg:max-w-32">{nextMatch.stadium}</p>}
              </div>
              <HeroTeam team={nextMatch.away} managed={nextMatch.fixture.away.isManaged} away />
            </div>
          )}
        </>
      )}

      <GameActions
        saveId={saveId}
        seasonFinished={play.seasonFinished}
        liveMatch={play.liveMatch}
        liveHref={play.liveHref}
        worldVersion={dashboard.worldVersion}
        hero
        nextBreak={play.nextBreak}
        prepare={prepare}
      />

      {/* The club's eleven and its opponent: nothing of the kind for a national match, whose « Préparer » has them. */}
      {nationalNext === null && nextMatch !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-on-blue">
          <p>{t("formation", { formation: tFormations(`label.${formation}`) })}</p>
          {opponent !== null && <OpponentSheet preview={opponent} triggerClassName={ON_BLUE} />}
        </div>
      )}
    </section>
  );
}
