import type { ComponentProps } from "react";
import { cn } from "@/src/lib/utils";

/** The title of a card of the season's start, as the Club screen titles its own. */
export function SectionTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("font-heading text-xl leading-tight lg:text-[1.625rem]", className)} {...props} />;
}
