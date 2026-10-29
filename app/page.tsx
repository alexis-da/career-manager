import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/src/auth/current-user";
import { TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Badge } from "@/src/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { listClubsByCompetition } from "@/src/db/clubs";
import { countOwnedSaves, listSaves } from "@/src/db/saves";
import { seasonLabel, WORLD_START_DATE, WORLD_START_YEAR } from "@/src/engine/world";
import { formatDate } from "@/src/lib/format";
import { canCreateSave } from "@/src/lib/limits";
import { cn } from "@/src/lib/utils";
import { AccountPanel } from "./_components/account-panel";
import { BrandFooter } from "./_components/brand-footer";
import { BrandHeader } from "./_components/brand-header";
import { ChallengeTeaser } from "./_components/challenge-teaser";
import { CreateSaveForm, type CreatableCompetition } from "./_components/create-save-form";
import { DeleteAccountDialog } from "./_components/delete-account-dialog";
import { DeleteSaveDialog } from "./_components/delete-save-dialog";
import { SaveLimitNotice } from "./_components/save-limit-notice";
import { ACCOUNT_DELETED_PARAM } from "./_lib/account";

export const dynamic = "force-dynamic";

// The Server Actions of this page include the creation of a save (createSave), several thousand rows in one
// transaction: up to 60 s, as the purge route.
export const maxDuration = 60;

/** The competitions a save can be created in, their countries named in the player's language and sorted by name. */
async function creatableCompetitions(): Promise<CreatableCompetition[]> {
  const [competitions, t, locale] = await Promise.all([listClubsByCompetition(), getTranslations("world"), getLocale()]);
  return competitions
    .map((competition) => ({ ...competition, countryName: t(`countries.${competition.country}`) }))
    .sort((a, b) => a.countryName.localeCompare(b.countryName, locale) || a.tier - b.tier);
}

/** The season a new save starts, above the creation form. */
async function NewSaveIntro() {
  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  return (
    <div className="space-y-1">
      <h2 className="eyebrow">{t("newSave")}</h2>
      <p className="text-xs text-muted-foreground">
        {t("seasonStart", { season: seasonLabel(WORLD_START_YEAR), date: formatDate(WORLD_START_DATE, locale) })}
      </p>
    </div>
  );
}

/**
 * A first visit, without a cookie or a session: play in one click. The logo and the catchphrase, the creation form
 * at once (the first save creates the anonymous player), and Google second, for a player coming back on another device.
 */
async function WelcomePage({ accountDeleted }: { accountDeleted: boolean }) {
  const [competitions, t] = await Promise.all([creatableCompetitions(), getTranslations("home")]);
  return (
    <main className="brand flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-md space-y-8 px-4 py-10">
        <BrandHeader logoHeight={80} />
        {accountDeleted && (
          <p role="status" className="rounded-lg border bg-card px-4 py-3 text-sm">
            {t("accountDeleted")}
          </p>
        )}
        <section className="space-y-4 rounded-lg border bg-card p-5">
          <NewSaveIntro />
          <CreateSaveForm competitions={competitions} />
        </section>
        <ChallengeTeaser />
        <section className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("otherDevice")}</p>
          <AccountPanel user={null} />
        </section>
        <BrandFooter />
      </div>
    </main>
  );
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await getCurrentUser();
  if (user === null) {
    return <WelcomePage accountDeleted={(await searchParams)[ACCOUNT_DELETED_PARAM] === "1"} />;
  }
  const [saves, competitions, ownedSaves, t, locale] = await Promise.all([
    listSaves(user),
    creatableCompetitions(),
    countOwnedSaves(user.id),
    getTranslations("home"),
    getLocale(),
  ]);
  const atLimit = !canCreateSave(user.kind, ownedSaves);
  // A challenge save's name is the game's, not the player's: in the player's language.
  const nameOf = (save: (typeof saves)[number]) =>
    save.challengeWeek === null ? save.name : t("challengeSaveName", { week: save.challengeWeek });

  return (
    <main className="brand flex-1 bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <BrandHeader logoHeight={80} />
          <AccountPanel user={user} />
        </div>

        <p className="text-muted-foreground">{t("intro")}</p>
        <div className="grid items-start gap-5 lg:grid-cols-[1fr_22rem]">
          <section className="space-y-3 rounded-lg border bg-card p-5" data-testid="saves">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="eyebrow">{t("saves")}</h2>
              <p className="text-xs text-muted-foreground tabular-nums">{t("saveCount", { count: saves.length })}</p>
            </div>
            {saves.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className={TABLE_HEAD}>{t("columns.name")}</TableHead>
                    <TableHead className={TABLE_HEAD}>{t("columns.manager")}</TableHead>
                    <TableHead className={TABLE_HEAD}>{t("columns.club")}</TableHead>
                    <TableHead className={TABLE_HEAD}>{t("columns.date")}</TableHead>
                    <TableHead className={cn(TABLE_HEAD, "text-right")}>
                      <span className="sr-only">{t("columns.actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saves.map((save) => (
                    <TableRow key={save.id} data-save-name={save.name} className={TABLE_ROW}>
                      <TableCell className={cn(TABLE_CELL, "font-semibold")}>
                        <span className="flex items-center gap-2">
                          <Link href={`/saves/${save.id}`} className="hover:underline" data-testid="open-save">
                            {nameOf(save)}
                          </Link>
                          {save.challengeWeek !== null && (
                            <Badge variant="outline" className="border-(--brand-orange) text-(--brand-orange)">
                              {t("challengeBadge")}
                            </Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className={TABLE_CELL}>{save.managerName}</TableCell>
                      <TableCell className={TABLE_CELL}>
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-4 w-1 shrink-0 rounded-full"
                            style={{ background: save.club.primaryColor }}
                          />
                          {save.club.name}
                        </span>
                      </TableCell>
                      <TableCell className={cn(TABLE_CELL, "tabular-nums")}>{formatDate(save.currentDate, locale)}</TableCell>
                      <TableCell className={cn(TABLE_CELL, "text-right")}>
                        <DeleteSaveDialog saveId={save.id} saveName={nameOf(save)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <div className="space-y-5">
            <section className="space-y-4 rounded-lg border bg-card p-5">
              <NewSaveIntro />
              {atLimit ? <SaveLimitNotice user={user} /> : <CreateSaveForm competitions={competitions} />}
            </section>
            <ChallengeTeaser />
          </div>
        </div>

        <BrandFooter>{user.kind === "REGISTERED" && <DeleteAccountDialog />}</BrandFooter>
      </div>
    </main>
  );
}
