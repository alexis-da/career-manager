import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { ClubInitials } from "@/src/components/club-initials";
import { Badge } from "@/src/components/ui/badge";
import { buttonVariants } from "@/src/components/ui/button";
import type { SaveSummary } from "@/src/db/saves";
import { formatDate } from "@/src/lib/format";
import { DeleteSaveDialog } from "./delete-save-dialog";

type SaveCardProps = {
  save: SaveSummary;
  main: boolean; // the screen's full orange action, when the creation form does not have it
};

/** A career of the home page: its club's initials, what it is, the way back to it, and the one to delete it. */
export function SaveCard({ save, main }: SaveCardProps) {
  const t = useTranslations("home");
  const locale = useLocale();
  // A challenge save's name is the game's, not the player's: in the player's language.
  const name = save.challengeWeek === null ? save.name : t("challengeSaveName", { week: save.challengeWeek });
  return (
    <li data-save-name={save.name} className="@container rounded-card bg-card p-4 lg:p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2.5 @lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        <ClubInitials name={save.club.name} className="size-13 rounded-[0.875rem] text-[1.375rem]" />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="min-w-0 text-lg leading-tight font-bold wrap-break-word">{name}</span>
            {save.challengeWeek !== null && (
              <Badge variant="outline" className="border-(--club) text-(--club)">
                {t("challengeBadge")}
              </Badge>
            )}
          </p>
          <p className="text-sm wrap-break-word">{save.club.name}</p>
          <p className="text-[0.8125rem] wrap-break-word text-muted-foreground tabular-nums">
            {save.managerName} · {formatDate(save.currentDate, locale)}
          </p>
        </div>
        <div className="col-span-full flex items-center justify-end gap-1.5 @lg:col-span-1">
          <DeleteSaveDialog saveId={save.id} saveName={name} />
          <Link
            href={`/saves/${save.id}`}
            data-testid="open-save"
            className={buttonVariants({ variant: main ? "club" : "outline", className: "h-11 px-4 text-sm font-bold" })}
          >
            {t("resume")}
            <span className="sr-only"> {name}</span>
          </Link>
        </div>
      </div>
    </li>
  );
}
