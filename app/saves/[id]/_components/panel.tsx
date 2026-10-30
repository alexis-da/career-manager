import type { ComponentProps } from "react";
import { cn } from "@/src/lib/utils";

/** A surface of the dashboard and of the game's pages. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-card bg-card p-5", className)} {...props} />;
}

/** Small uppercase title of a panel. */
export function PanelTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 className={cn("eyebrow", className)} {...props} />;
}
