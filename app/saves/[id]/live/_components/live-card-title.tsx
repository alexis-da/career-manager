import type { ComponentProps } from "react";

/** The title of a card under the score. */
export function LiveCardTitle(props: ComponentProps<"h2">) {
  return <h2 className="font-heading text-xl leading-tight text-balance lg:text-[1.625rem]" {...props} />;
}
