"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { PlayerProfile } from "@/src/db/players";
import { PlayerSheet } from "../../_components/player-sheet";

type MarketPlayerSheetProps = {
  profile: PlayerProfile;
  startYear: number;
  closeHref: string; // the same list, without the player param
  footer: ReactNode;
};

/** The player sheet of the transfer page: opened by the URL, closed by going back to the list's URL. */
export function MarketPlayerSheet({ profile, startYear, closeHref, footer }: MarketPlayerSheetProps) {
  const router = useRouter();
  return (
    <PlayerSheet
      profile={profile}
      startYear={startYear}
      footer={footer}
      onClose={() => router.push(closeHref, { scroll: false })}
    />
  );
}
