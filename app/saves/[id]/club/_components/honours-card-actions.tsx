"use client";

import type { ComponentProps } from "react";
import { COMPUTER_QUERY, useMediaQuery } from "@/src/hooks/use-media-query";
import { SeasonCardActions } from "../../seasons/_components/season-card-panel";

/**
 * The buttons of the last season's card, from 1024 px. Not rendered below rather than hidden: where the browser shares
 * files, they fetch the PNG as soon as they mount, and a phone has the card on the season's page.
 */
export function HonoursCardActions(props: ComponentProps<typeof SeasonCardActions>) {
  return useMediaQuery(COMPUTER_QUERY) ? <SeasonCardActions {...props} /> : null;
}
