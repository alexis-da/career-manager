import { FlameIcon } from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOwnedSave } from "@/src/auth/current-user";
import { Panel } from "@/src/components/panel";
import { getRewardsPage, type RewardsPageView } from "@/src/db/rewards-view";
import { CAREER_ITEMS, type CareerItem } from "@/src/engine/shop";
import { CycleTrack, lotWords } from "../_components/daily-missions";
import { TokenChip } from "../_components/mission-chips";
import { CareerShop } from "./_components/career-shop";
import { Collection } from "./_components/collection";
import { TokenJournal } from "./_components/token-journal";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("rewards"))("title") };
}

/** A shortcut's purchase, from the address (« ?buy=EXPRESS_CARE&player=… »): the sheet opens on it. */
function openingOf(query: Record<string, string | string[] | undefined>): { item: CareerItem; playerSaveId?: string } | null {
  const buy = query.buy;
  const item = CAREER_ITEMS.find((candidate) => candidate === buy);
  if (item === undefined) {
    return null;
  }
  const player = query.player;
  return typeof player === "string" && player !== "" ? { item, playerSaveId: player } : { item };
}

/** The player's streak: its days, its cycle, its record, its cycles done, its next lot, and the shield in reserve. */
async function StreakPanel({ streak, nextLot }: { streak: NonNullable<RewardsPageView["streak"]>; nextLot: RewardsPageView["nextLot"] }) {
  const t = await getTranslations("rewards");
  const tMissions = await getTranslations("missions");
  const locale = await getLocale();
  return (
    <Panel aria-labelledby="rewards-streak-title" data-testid="rewards-streak" data-streak={streak.current} className="flex flex-col gap-3">
      <h2 id="rewards-streak-title" className="font-heading text-xl leading-tight">
        {t("streak.title")}
      </h2>
      <p className="flex items-center gap-2 text-lg font-bold">
        <FlameIcon aria-hidden className="size-5 shrink-0 text-(--club)" />
        {t("streak.days", { count: streak.current })}
      </p>
      <CycleTrack streak={streak} />
      <p className="text-sm text-muted-foreground tabular-nums">
        {t("streak.record", { count: streak.best })} · {t("streak.cycles", { count: streak.cycles })}
      </p>
      <p data-testid="rewards-next-lot" className="text-sm leading-snug">
        {nextLot === null ? t("streak.allLots") : t("streak.nextLot", { cycle: nextLot.cycle, lot: lotWords(nextLot.cosmetics, tMissions, t, locale) })}
      </p>
      <p data-testid="rewards-shield" data-shield={String(streak.shield)} className="text-sm text-muted-foreground">
        {streak.shield ? t("streak.shield") : t("streak.noShield")}
      </p>
    </Panel>
  );
}

/**
 * Club → Récompenses (missions v2): the player's tokens and their journal, the streak, the career's shop and the player's
 * own, then the collection. A challenge save has no shop: its tokens and collection only, and why.
 */
export default async function RewardsPage({ params, searchParams }: PageProps<"/saves/[id]/rewards">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  // Not simulation code: the player's streak and journal follow the real day.
  const now = new Date();
  const [t, view, query] = await Promise.all([getTranslations("rewards"), getRewardsPage(id, now), searchParams]);
  const today = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 data-testid="rewards-title" className="font-heading text-4xl font-bold">
          {t("title")}
        </h1>
        <TokenChip count={view.tokens} className="min-h-8 px-3 text-sm" />
      </div>
      {view.challenge && (
        <p data-testid="rewards-challenge" className="rounded-card bg-card px-5 py-4 text-sm leading-snug">
          {t("challenge")}
        </p>
      )}
      {/* One column under lg; from there the tokens and the streak beside the shop. */}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Panel aria-labelledby="rewards-tokens-title" data-testid="rewards-tokens" data-tokens={view.tokens} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="rewards-tokens-title" className="font-heading text-xl leading-tight">
                {t("tokens.title")}
              </h2>
              <p className="font-heading text-3xl leading-none normal-case tabular-nums">{view.tokens}</p>
            </div>
            <p className="text-sm leading-snug text-muted-foreground">{t("tokens.about")}</p>
            <TokenJournal entries={view.journal} today={today} />
          </Panel>
          {view.streak !== null && <StreakPanel streak={view.streak} nextLot={view.nextLot} />}
        </div>
        {!view.challenge && (
          <div className="space-y-5">
            <CareerShop saveId={id} shop={view.shop} opening={openingOf(query)} />
          </div>
        )}
      </div>
      <Collection saveId={id} cosmetics={view.cosmetics} tokens={view.tokens} shop={!view.challenge} />
    </div>
  );
}
