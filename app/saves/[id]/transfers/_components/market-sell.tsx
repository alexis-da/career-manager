import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PlayerFace } from "@/src/components/player-face";
import { Badge } from "@/src/components/ui/badge";
import type { MarketSales, SaleRow } from "@/src/db/market-sales";
import type { SaleQuote } from "@/src/db/transfers";
import { formatMoney } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { SellPlayerDialog } from "../../_components/contract-actions";
import { Panel } from "@/src/components/panel";
import { refusalMessage } from "../../_lib/refusal-message";

/** A sale that is not the screen's main action. `dark:` too: the outline button sets its border and fill under it. */
const OUTLINED_SALE =
  "border-(--club) font-bold text-(--club) hover:text-(--club-hover) dark:border-(--club) dark:bg-transparent dark:hover:bg-(--club)/10";

const fullName = (row: SaleRow): string => `${row.firstName} ${row.lastName}`;

/** An offer's sentence, its amount in bold. The messages stay plain text: src/i18n/messages.test.ts formats them so. */
function OfferSentence({ text, amount }: { text: string; amount: string }) {
  const start = text.indexOf(amount);
  return (
    <>
      {text.slice(0, start)}
      <strong className="whitespace-nowrap">{amount}</strong>
      {text.slice(start + amount.length)}
    </>
  );
}

/** The sale's confirmation, handed only what it needs of the row. */
function SellButton({ saveId, row, primary = false, className }: { saveId: string; row: SaleRow; primary?: boolean; className: string }) {
  const { id, firstName, lastName, terms } = row;
  return <SellPlayerDialog saveId={saveId} player={{ id, firstName, lastName }} terms={terms} primary={primary} triggerClassName={className} />;
}

/**
 * The best offer for a player: the blue card at the head of « Vendre », or the small card beside the proposals of
 * « Acheter » on a computer. Nothing for a row without an offer.
 */
export function SaleOfferCard({ saveId, row, variant }: { saveId: string; row: SaleRow; variant: "lead" | "side" }): ReactNode {
  const t = useTranslations("marketSell");
  const tPositions = useTranslations("positions");
  const locale = useLocale();
  const { sale } = row.terms;
  if (!sale.ok) {
    return null;
  }
  const name = fullName(row);
  const position = tPositions(`short.${row.position}`);
  const fee = formatMoney(sale.fee, locale);
  const value = formatMoney(row.marketValue, locale);

  if (variant === "side") {
    return (
      <Panel aria-label={name} data-testid="market-sale-offer" data-player-id={row.id} className="flex flex-col gap-2.5 p-4">
        <p className="eyebrow text-(--club)">{t("side.label")}</p>
        <p className="text-[0.9375rem] leading-snug">
          <OfferSentence
            text={t("side.offer", { club: sale.buyerName, fee, player: name, position, overall: row.overall, value })}
            amount={fee}
          />
        </p>
        <SellButton saveId={saveId} row={row} className={cn("h-11 w-full text-[0.9375rem]", OUTLINED_SALE)} />
      </Panel>
    );
  }

  return (
    <Panel
      aria-label={name}
      data-testid="market-sale-offer"
      data-player-id={row.id}
      className="flex flex-col gap-3 bg-primary p-4.5 text-primary-foreground"
    >
      <Badge className="h-auto bg-(--club) px-2.5 py-1 tracking-wide text-(--club-fg) uppercase">{t("lead.tag")}</Badge>
      <div className="flex items-center gap-3.5">
        <PlayerFace
          playerKey={row.playerKey}
          age={row.age}
          clubColors={row.clubColors}
          size={70}
          background="var(--background)"
          className="shrink-0 rounded-full border-3 border-primary-foreground"
        />
        <div className="min-w-0 space-y-0.5">
          <h2 className="text-xl leading-tight font-bold wrap-break-word">{name}</h2>
          <p className="text-sm text-on-blue">{t("lead.details", { position, overall: row.overall, age: row.age })}</p>
        </div>
      </div>
      <p className="text-[0.9375rem] leading-snug">
        <OfferSentence text={t("lead.offer", { club: sale.buyerName, fee, value })} amount={fee} />
      </p>
      <SellButton saveId={saveId} row={row} primary className="h-13 w-full font-heading text-[1.375rem] lg:w-auto lg:self-end lg:px-10" />
    </Panel>
  );
}

/** A row's last line: its offer or, while the window is open, why there is none. */
function SaleNote({ sale, windowOpen }: { sale: SaleQuote; windowOpen: boolean }) {
  const t = useTranslations("marketSell.list");
  const tRefusals = useTranslations("refusals");
  const locale = useLocale();
  if (sale.ok) {
    const fee = formatMoney(sale.fee, locale);
    return (
      <p>
        <OfferSentence text={t("offer", { club: sale.buyerName, fee })} amount={fee} />
      </p>
    );
  }
  return windowOpen ? <p className="text-muted-foreground">{refusalMessage(sale.reason, tRefusals, locale)}</p> : null;
}

/** A player out of the lead card: « Vendre » only with an offer, which the dialog would otherwise have to refuse. */
function SaleListRow({ saveId, row, windowOpen }: { saveId: string; row: SaleRow; windowOpen: boolean }) {
  const t = useTranslations("marketSell.list");
  const tPositions = useTranslations("positions");
  const locale = useLocale();
  const { sale } = row.terms;
  return (
    <li
      data-testid="market-sale-row"
      data-player-id={row.id}
      className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-card px-3.5 py-3"
    >
      <span className="text-center font-heading text-[1.625rem] leading-none tabular-nums">{row.overall}</span>
      <div className="min-w-0 space-y-0.5 text-[0.8125rem] leading-snug">
        <p className="text-[0.9375rem] leading-tight font-bold wrap-break-word">{fullName(row)}</p>
        <p className="text-muted-foreground">
          {t("details", { position: tPositions(`short.${row.position}`), value: formatMoney(row.marketValue, locale) })}
        </p>
        <SaleNote sale={sale} windowOpen={windowOpen} />
      </div>
      {sale.ok && <SellButton saveId={saveId} row={row} className={cn("h-10 px-3.5", OUTLINED_SALE)} />}
    </li>
  );
}

/**
 * « Vendre »: no club comes to the manager, so the tab offers what the market would pay today for the players out of
 * the eleven, the best offer first. While the window is closed the rows say nothing: the page has the note.
 */
export function MarketSell({ saveId, sales, windowOpen }: { saveId: string; sales: MarketSales; windowOpen: boolean }): ReactNode {
  const t = useTranslations("marketSell");
  const lead = sales.rows.find((row) => row.terms.sale.ok);
  const others = sales.rows.filter((row) => row !== lead);
  return (
    <div data-testid="market-sell" className="space-y-4">
      {sales.rows.length === 0 && (
        <Panel data-testid="market-sell-empty">
          <p className="text-muted-foreground">{t("empty")}</p>
        </Panel>
      )}
      {lead !== undefined && <SaleOfferCard saveId={saveId} row={lead} variant="lead" />}
      {others.length > 0 && (
        <section aria-labelledby="market-sell-list" className="space-y-2">
          <h2 id="market-sell-list" className="font-heading text-xl">
            {lead === undefined ? t("list.title") : t("list.otherTitle")}
          </h2>
          <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2">
            {others.map((row) => (
              <SaleListRow key={row.id} saveId={saveId} row={row} windowOpen={windowOpen} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
