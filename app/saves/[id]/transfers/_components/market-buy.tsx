"use client";

import Link from "@/src/components/link";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { PlayerFace } from "@/src/components/player-face";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import type { MarketOverview } from "@/src/db/market";
import type { MarketProposal, MarketProposals } from "@/src/db/market-proposals";
import { contractEndDate } from "@/src/engine/economy";
import { MARKET_ENTRIES, type MarketEntry } from "@/src/engine/market-proposals";
import { formatDate, formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { attributesShown } from "../../_components/attribute-bars";
import { DEFAULT_CONTRACT_LENGTH, RefusalAlert } from "../../_components/contract-fields";
import { Panel } from "@/src/components/panel";
import { positionTextClass } from "../../_lib/positions";
import { marketHref } from "../_lib/market-url";
import { makeTransferOfferAction, signFreeAgentAction } from "../actions";

/** Players of an entry beside the lead card on a computer. */
const SPOTTED = 3;

/** Attributes on the lead card: its three best on a phone, six on a computer. */
const STATS = 6;
const PHONE_STATS = 3;

const fullName = (player: MarketProposal): string => `${player.firstName} ${player.lastName}`;

/** An amount inside a sentence, kept on one line: « 1 M€ » never breaks before its unit on a phone. */
const unbroken = (amount: string): string => amount.replaceAll(" ", "\u00a0");

function Tag({ proposal }: { proposal: MarketProposal }) {
  const t = useTranslations("market.tags");
  return (
    <Badge data-testid="market-tag" className="h-auto bg-(--club) px-2.5 py-1 tracking-wide text-(--club-fg) uppercase">
      {proposal.tag === "gem" ? t("gem", { potential: proposal.potential }) : t(proposal.tag)}
    </Badge>
  );
}

/** A player's best attributes as bars, on the blue of the lead card. */
function Stats({ proposal }: { proposal: MarketProposal }) {
  const t = useTranslations("player");
  const { attributes, position } = proposal;
  const best = [...attributesShown(position)].sort((a, b) => attributes[b] - attributes[a]).slice(0, STATS);
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 xl:grid-cols-2">
      {best.map((name, index) => (
        <div
          key={name}
          data-attribute={name}
          className={cn("grid grid-cols-[4.5rem_minmax(0,1fr)_1.75rem] items-center gap-2.5 text-sm", index >= PHONE_STATS && "max-xl:hidden")}
        >
          <span className="text-on-blue">{t(`attributes.${name}`)}</span>
          <span aria-hidden className="h-2 overflow-hidden rounded-full bg-background">
            <span className="block h-2 rounded-full bg-(--club)" style={{ width: `${attributes[name]}%` }} />
          </span>
          <span className="text-right font-bold tabular-nums">{attributes[name]}</span>
        </div>
      ))}
    </div>
  );
}

type ProposalCardProps = {
  proposal: MarketProposal;
  windowOpen: boolean;
  onPass: () => void;
  onRecruit: () => void;
};

/** One proposal at a time: who he is, what he brings, what he costs, and the two answers. */
function ProposalCard({ proposal, windowOpen, onPass, onRecruit }: ProposalCardProps) {
  const t = useTranslations("market");
  const tPositions = useTranslations("positions");
  const locale = useLocale();
  return (
    <section
      aria-label={fullName(proposal)}
      data-testid="market-proposal"
      data-player-id={proposal.id}
      className="flex flex-col gap-4 rounded-card bg-primary p-5 text-primary-foreground xl:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-center">
          <p className="font-heading text-[3.375rem] leading-[0.9] tabular-nums" data-testid="market-rating">
            {proposal.overall}
          </p>
          <p className="font-heading text-lg text-on-blue">{tPositions(`short.${proposal.position}`)}</p>
        </div>
        <Tag proposal={proposal} />
      </div>

      <div className="flex items-center gap-3.5">
        <PlayerFace
          playerKey={proposal.playerKey}
          age={proposal.age}
          clubColors={proposal.clubColors}
          size={84}
          className="shrink-0 rounded-full ring-3 ring-(--club)"
        />
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-[1.375rem] leading-tight font-bold wrap-break-word" data-testid="market-player-name">
            {fullName(proposal)}
          </h2>
          <p className="text-sm text-on-blue">
            {t("playerLine", { age: proposal.age, club: proposal.clubName ?? t("freeAgent") })}
          </p>
          {/* Only when he improves the eleven: a gem may be years from it. */}
          {proposal.impact > 0 && (
            <p className="text-sm font-bold text-(--club)" data-testid="market-impact">
              {t("impact", { impact: proposal.impact, slot: tPositions(`short.${proposal.slot}`) })}
            </p>
          )}
        </div>
      </div>

      <Stats proposal={proposal} />

      <div className="flex items-baseline justify-between gap-3">
        <div className="leading-tight">
          <p className="text-sm text-on-blue">{t("suggestedPrice")}</p>
          <p className="text-xs text-on-blue tabular-nums">
            {t("contract", { wage: formatMoney(proposal.askedWage, locale), years: DEFAULT_CONTRACT_LENGTH })}
          </p>
        </div>
        <p className="font-heading text-3xl normal-case tabular-nums" data-testid="market-price">
          {proposal.askingPrice === 0 ? t("free") : formatMoney(proposal.askingPrice, locale)}
        </p>
      </div>

      <div className="grid grid-cols-[1fr_2fr] gap-2.5">
        <Button
          variant="outline"
          onClick={onPass}
          data-testid="market-pass"
          className="h-13 border-2 text-base font-bold dark:border-on-blue dark:bg-transparent dark:hover:bg-on-blue/10"
        >
          {t("pass")}
        </Button>
        <Button variant="club" disabled={!windowOpen} onClick={onRecruit} data-testid="market-recruit" className="h-13 font-heading text-[1.375rem]">
          {t("recruit")}
        </Button>
      </div>
    </section>
  );
}

/** The next players of an entry, on a computer: a click brings one to the lead card. */
function Spotted({ players, current, onPick }: { players: MarketProposal[]; current: MarketProposal; onPick: (player: MarketProposal) => void }) {
  const t = useTranslations("market");
  const locale = useLocale();
  return (
    <section aria-labelledby="market-spotted" className="space-y-3">
      <h2 id="market-spotted" className="font-heading text-[1.375rem]">
        {t("spotted")}
      </h2>
      <ul className="space-y-2.5">
        {players.map((player) => (
          <li key={player.id}>
            <button
              type="button"
              aria-pressed={player.id === current.id}
              onClick={() => onPick(player)}
              data-testid="market-spotted-player"
              className={cn(
                "grid w-full grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border-2 bg-card p-3 text-left transition-colors",
                player.id === current.id ? "border-(--club)" : "border-card hover:border-border",
              )}
            >
              <span className={cn("text-center font-heading text-3xl tabular-nums", positionTextClass(player.position))}>{player.overall}</span>
              <span className="min-w-0 leading-tight">
                <span className="block font-bold wrap-break-word">{fullName(player)}</span>
                <span className="text-[0.8125rem] text-muted-foreground">
                  {player.impact > 0 ? t("spottedLine", { age: player.age, impact: player.impact }) : t("spottedAge", { age: player.age })}
                </span>
              </span>
              <span className="text-[0.9375rem] font-bold tabular-nums">
                {player.askingPrice === 0 ? t("free") : formatMoney(player.askingPrice, locale)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The link of a way to make room: orange text, a thumb high on a phone. */
const WAY_LINK = "font-semibold text-(--club) hover:text-(--club-hover) max-sm:inline-flex max-sm:min-h-11 max-sm:items-center";

/**
 * When the wage room alone keeps an entry's players out, and Needs finds nobody it still pays: what is left, then the
 * three ways to make room, selling, releasing a contract, or the next season's wage cap.
 */
function WageLimit({ saveId, wageRoom }: { saveId: string; wageRoom: number }) {
  const t = useTranslations("market.wageLimit");
  const locale = useLocale();
  return (
    <Panel data-testid="market-wage-limit" className="space-y-3">
      <p className="font-bold" data-testid="market-wage-limit-room" data-value={wageRoom}>
        {wageRoom > 0
          ? t("left", { room: unbroken(formatMoney(wageRoom, locale)) })
          : wageRoom === 0
            ? t("none")
            : t("over", { amount: unbroken(formatMoney(-wageRoom, locale)) })}
      </p>
      <p className="text-muted-foreground">{t("how")}</p>
      <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
        <li data-testid="market-wage-limit-sell">
          {t("sell")}{" "}
          <Link href={`/saves/${saveId}/transfers?tab=sell`} className={WAY_LINK}>
            {t("sellLink")}
          </Link>
        </li>
        <li data-testid="market-wage-limit-release">
          {t("release")}{" "}
          <Link href={`/saves/${saveId}/squad`} className={WAY_LINK}>
            {t("releaseLink")}
          </Link>
        </li>
        <li data-testid="market-wage-limit-wait">{t("wait")}</li>
      </ul>
    </Panel>
  );
}

type RecruitDialogProps = {
  saveId: string;
  proposal: MarketProposal;
  overview: MarketOverview;
  onClose: () => void;
  onSigned: () => void;
};

/** The short confirmation before a signing: nothing left to choose, everything to read. */
function RecruitDialog({ saveId, proposal, overview, onClose, onSigned }: RecruitDialogProps) {
  const t = useTranslations("market");
  const tConfirm = useTranslations("market.confirm");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);
  const until = contractEndDate(overview.currentDate, DEFAULT_CONTRACT_LENGTH);

  const confirm = () =>
    startTransition(async () => {
      setRefusal(null);
      try {
        const offer = { saveId, playerSaveId: proposal.id, wage: proposal.askedWage, years: DEFAULT_CONTRACT_LENGTH };
        const result =
          proposal.clubName === null
            ? await signFreeAgentAction(offer)
            : await makeTransferOfferAction({ ...offer, fee: proposal.askingPrice });
        if (result.ok) {
          onSigned();
        } else {
          setRefusal(result.message);
        }
      } catch {
        toast.error(tConfirm("failed"));
      }
    });

  const rows: [string, string][] = [
    [tConfirm("price"), proposal.askingPrice === 0 ? t("free") : formatMoney(proposal.askingPrice, locale)],
    [tConfirm("wage"), formatMoney(proposal.askedWage, locale)],
    [tConfirm("length"), tConfirm("lengthValue", { years: DEFAULT_CONTRACT_LENGTH, date: formatDate(until, locale) })],
    [tConfirm("budgetLeft"), formatMoney(overview.budget - proposal.askingPrice, locale)],
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="market-recruit-dialog">
        <DialogHeader>
          <DialogTitle>{tConfirm("title", { name: fullName(proposal) })}</DialogTitle>
          <DialogDescription>{tConfirm("description")}</DialogDescription>
        </DialogHeader>
        <dl className="space-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <RefusalAlert message={refusal} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{tCommon("cancel")}</DialogClose>
          <Button variant="club" disabled={pending} onClick={confirm} data-testid="market-recruit-confirm">
            {pending ? tConfirm("pending") : tConfirm("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** « Signé ! »: the signing is done, its contract in a sentence. */
function SignedDialog({ proposal, overview, onClose }: { proposal: MarketProposal; overview: MarketOverview; onClose: () => void }) {
  const t = useTranslations("market.signed");
  const locale = useLocale();
  const until = contractEndDate(overview.currentDate, DEFAULT_CONTRACT_LENGTH);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="market-signed" showCloseButton={false} className="justify-items-center gap-3 p-8 text-center">
        <DialogTitle className="font-heading text-5xl leading-none text-(--club)">{t("title")}</DialogTitle>
        <DialogDescription className="text-lg font-bold text-foreground">
          {t("joins", { name: fullName(proposal), club: overview.clubName })}
        </DialogDescription>
        <p className="text-sm text-muted-foreground">
          {t("detail", { years: DEFAULT_CONTRACT_LENGTH, date: formatDate(until, locale), wage: formatMoney(proposal.askedWage, locale) })}
        </p>
        <Button variant="club" onClick={onClose} data-testid="market-signed-continue" className="mt-2 h-12 w-full text-base font-bold">
          {t("continue")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

type MarketBuyProps = {
  saveId: string;
  proposals: MarketProposals;
  overview: MarketOverview;
  sideOffer: ReactNode; // the best offer for a player of the club, under the spotted players on a computer
};

/**
 * Buying without a form: four ways in, one proposal at a time, « Passer » or « Recruter ». Everything shown is a player
 * who would accept and whom the club can pay; the advanced market keeps the rest. When the wage room alone keeps an
 * entry's players out, Needs proposes those it still pays, « within your means », and an entry left empty says what room
 * is left and how to make more.
 */
export function MarketBuy({ saveId, proposals, overview, sideOffer }: MarketBuyProps) {
  const t = useTranslations("market");
  const tPositions = useTranslations("positions");
  const locale = useLocale();
  const [entry, setEntry] = useState<MarketEntry>("needs");
  const [index, setIndex] = useState(0);
  const [recruiting, setRecruiting] = useState<MarketProposal | null>(null);
  const [signedPlayer, setSignedPlayer] = useState<MarketProposal | null>(null);

  const list = proposals.entries[entry];
  // After a signing the list is a new one: the index may lie past its end.
  const position = list.length === 0 ? 0 : index % list.length;
  const current = list.at(position);
  const firstSpotted = Math.floor(position / SPOTTED) * SPOTTED;
  const { weakSpot } = proposals;

  const pick = (next: MarketEntry) => {
    setEntry(next);
    setIndex(0);
  };

  return (
    <div className="space-y-4" data-testid="market-buy">
      <div role="group" aria-label={t("entries.label")} className="flex flex-wrap items-center gap-2">
        {MARKET_ENTRIES.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={key === entry}
            onClick={() => pick(key)}
            data-testid={`market-entry-${key}`}
            className={cn(
              "min-h-11 rounded-full px-4 text-[0.9375rem] transition-colors",
              key === entry ? "bg-(--club) font-bold text-(--club-fg)" : "border font-semibold hover:bg-muted",
            )}
          >
            {t(`entries.${key}`)}
          </button>
        ))}
      </div>

      <p className="text-sm text-muted-foreground" data-testid="market-intro">
        {entry !== "needs" ? (
          t(`intro.${entry}`)
        ) : weakSpot === null ? (
          t("intro.noWeakSpot")
        ) : (
          <>
            {t("intro.weakSpotLead")}{" "}
            <strong className="text-foreground">{tPositions(`label.${weakSpot.position}`).toLocaleLowerCase(locale)}</strong>{" "}
            {weakSpot.reason === "empty"
              ? t("intro.weakSpotEmpty")
              : weakSpot.reason === "outOfLine"
                ? t("intro.weakSpotOutOfLine", { rating: weakSpot.rating })
                : t("intro.weakSpotRating", { rating: weakSpot.rating })}{" "}
            {!proposals.wageBound.needs
              ? t("intro.weakSpotRest")
              : list.length > 0
                ? t("intro.weakSpotAffordable", { room: unbroken(formatMoney(overview.wageRoom, locale)) })
                : t("intro.weakSpotNoRoom")}
          </>
        )}
      </p>

      {current === undefined ? (
        proposals.wageBound[entry] ? (
          <WageLimit saveId={saveId} wageRoom={overview.wageRoom} />
        ) : (
          <Panel data-testid="market-proposals-empty">
            <p className="text-muted-foreground">{t(`empty.${entry}`)}</p>
          </Panel>
        )
      ) : (
        // One column under xl, where the sidebar leaves no room for two: the lead card alone, as on a phone.
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-3">
            <ProposalCard
              key={current.id}
              proposal={current}
              windowOpen={overview.windowOpen}
              onPass={() => setIndex(position + 1)}
              onRecruit={() => setRecruiting(current)}
            />
            <Link
              href={marketHref(saveId, {}, { tab: current.clubName === null ? undefined : "clubs", player: current.id })}
              data-testid="market-adjust"
              className="block text-center text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:flex max-sm:min-h-11 max-sm:items-center max-sm:justify-center"
            >
              {t("adjust")}
            </Link>
          </div>
          <div className="space-y-5 max-xl:hidden">
            <Spotted
              players={list.slice(firstSpotted, firstSpotted + SPOTTED)}
              current={current}
              onPick={(player) => setIndex(list.indexOf(player))}
            />
            {sideOffer}
          </div>
        </div>
      )}

      {recruiting !== null && (
        <RecruitDialog
          key={recruiting.id}
          saveId={saveId}
          proposal={recruiting}
          overview={overview}
          onClose={() => setRecruiting(null)}
          onSigned={() => {
            setSignedPlayer(recruiting);
            setRecruiting(null);
            setIndex(0);
          }}
        />
      )}
      {signedPlayer !== null && <SignedDialog proposal={signedPlayer} overview={overview} onClose={() => setSignedPlayer(null)} />}
    </div>
  );
}
