import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentProps, ReactNode } from "react";
import { getCurrentUser } from "@/src/auth/current-user";
import { listClubsByCompetition } from "@/src/db/clubs";
import { countOwnedSaves, listSaves } from "@/src/db/saves";
import { suggestClubs } from "@/src/engine/club-suggestions";
import { seasonLabel, WORLD_START_DATE, WORLD_START_YEAR } from "@/src/engine/world";
import type { Country } from "@/src/i18n/countries";
import type { Locale } from "@/src/i18n/locale";
import { formatDate } from "@/src/lib/format";
import { canCreateSave } from "@/src/lib/limits";
import { AccountPanel, GoogleSignInButton } from "./_components/account-panel";
import { ChallengeTeaser } from "./_components/challenge-teaser";
import { CreateSaveForm } from "./_components/create-save-form";
import { DeleteAccountDialog } from "./_components/delete-account-dialog";
import { PublicPage } from "./_components/public-page";
import { SaveCard } from "./_components/save-card";
import { SaveLimitNotice } from "./_components/save-limit-notice";
import { ACCOUNT_DELETED_PARAM } from "./_lib/account";
import { HOME_COLUMNS } from "./_lib/home-columns";

export const dynamic = "force-dynamic";

// The Server Actions of this page include the creation of a save (createSave), several thousand rows in one
// transaction: up to 60 s, as the purge route.
export const maxDuration = 60;

/** The country whose clubs a player is suggested: the one of their language. */
const SUGGESTED_COUNTRY: Record<Locale, Country> = { fr: "fr", en: "en" };

/**
 * What the creation form offers: the competitions a save can be created in, their countries named in the player's
 * language and sorted by name, and the three clubs suggested to a player of that language.
 */
async function creationChoices(): Promise<ComponentProps<typeof CreateSaveForm>> {
  const [listed, t, locale] = await Promise.all([listClubsByCompetition(), getTranslations("world"), getLocale()]);
  const competitions = listed
    .map((competition) => ({ ...competition, countryName: t(`countries.${competition.country}`) }))
    .sort((a, b) => a.countryName.localeCompare(b.countryName, locale) || a.tier - b.tier);
  return { competitions, suggestions: suggestClubs(listed.filter(({ country }) => country === SUGGESTED_COUNTRY[locale])) };
}

/** The foot's lines on the game: the tagline and the catchphrase in English, the brand's language, its languages, its first day. */
async function GameFacts() {
  const [t, tBrand, locale] = await Promise.all([getTranslations("home"), getTranslations("brand"), getLocale()]);
  return (
    <>
      <p lang="en">The football career game · Take your club to the top</p>
      <p>{tBrand("languages")}</p>
      <p>{t("seasonStart", { season: seasonLabel(WORLD_START_YEAR), date: formatDate(WORLD_START_DATE, locale) })}</p>
    </>
  );
}

/** What the page offers beside the game's mark from 1024 px, on one line; a card under the page below that. */
function HomeTools({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-5 lg:flex-row lg:items-center lg:gap-4 lg:rounded-none lg:bg-transparent lg:p-0">
      <ChallengeTeaser />
      {children}
    </div>
  );
}

/** Google for a player without an account, second to the creation form: the way back to careers played elsewhere. */
function OtherDevice() {
  const t = useTranslations("home");
  return (
    <div className="space-y-2.5">
      <p className="text-sm text-muted-foreground lg:hidden">{t("otherDevice")}</p>
      <GoogleSignInButton tall />
    </div>
  );
}

/** A first visit, without a cookie or a session: play in one click, the first save creating the anonymous player. */
async function WelcomePage({ accountDeleted }: { accountDeleted: boolean }) {
  const [choices, t] = await Promise.all([creationChoices(), getTranslations("home")]);
  return (
    <PublicPage
      className="max-w-6xl"
      tools={
        <HomeTools>
          <OtherDevice />
        </HomeTools>
      }
      footer={<GameFacts />}
    >
      {accountDeleted && (
        <p role="status" className="mb-6 rounded-lg bg-card px-4 py-3 text-sm">
          {t("accountDeleted")}
        </p>
      )}
      <CreateSaveForm {...choices} />
    </PublicPage>
  );
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const user = await getCurrentUser();
  if (user === null) {
    return <WelcomePage accountDeleted={(await searchParams)[ACCOUNT_DELETED_PARAM] === "1"} />;
  }
  const [saves, choices, ownedSaves, t] = await Promise.all([
    listSaves(user),
    creationChoices(),
    countOwnedSaves(user.id),
    getTranslations("home"),
  ]);
  const atLimit = !canCreateSave(user.kind, ownedSaves);

  return (
    <PublicPage
      className="max-w-6xl"
      tools={
        <HomeTools>
          {/* At the limit, an anonymous player's Google button is the notice's. */}
          {user.kind === "REGISTERED" ? <AccountPanel user={user} /> : !atLimit && <OtherDevice />}
        </HomeTools>
      }
      footer={
        <>
          <GameFacts />
          {user.kind === "REGISTERED" && <DeleteAccountDialog />}
        </>
      }
    >
      <div className="space-y-12 lg:space-y-16">
        <section aria-labelledby="saves-title" className={HOME_COLUMNS} data-testid="saves">
          <div className="space-y-2 lg:space-y-4">
            <h1 id="saves-title" className="font-heading text-[2.75rem] leading-[0.95] lg:text-7xl lg:leading-[0.88]">
              {t("saves")}
            </h1>
            <p className="text-[0.9375rem] text-muted-foreground lg:text-[1.1875rem]">{t("intro")}</p>
            <p className="text-sm text-muted-foreground tabular-nums">{t("saveCount", { count: saves.length })}</p>
          </div>
          <div className="min-w-0 space-y-3">
            {saves.length > 0 && (
              <ul className="space-y-3">
                {saves.map((save, index) => (
                  <SaveCard key={save.id} save={save} main={atLimit && index === 0} />
                ))}
              </ul>
            )}
            {atLimit && <SaveLimitNotice user={user} />}
          </div>
        </section>
        {!atLimit && <CreateSaveForm {...choices} titleLevel="h2" />}
      </div>
    </PublicPage>
  );
}
