import type { ComponentProps } from "react";
import { cn } from "@/src/lib/utils";

/** A way on from a card: 44 px high on a phone. */
export const CLUB_CARD_LINK =
  "text-sm font-semibold text-(--club) hover:text-(--club-hover) max-sm:inline-flex max-sm:min-h-11 max-sm:items-center";

/** The title of a card of the Club screen. */
export function ClubCardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("font-heading text-xl leading-tight lg:text-[1.625rem]", className)} {...props} />;
}
