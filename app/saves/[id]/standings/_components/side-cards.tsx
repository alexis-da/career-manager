"use client";

import { useEffect, useState } from "react";
import { COMPUTER_QUERY, useMediaQuery } from "@/src/hooks/use-media-query";
import { CupCard } from "../../_components/cup-card";
import { MatchCalendarCard } from "../../_components/match-calendar-card";
import { standingsSideCardsAction, type SideCardsData } from "../actions";

/**
 * The cards beside the table, from 1024 px. The server does not know the width, so the page asks for them once it does: a
 * phone, whose tabs have them, never reads them. A failure leaves the table alone, which is still the screen.
 */
export function SideCards({ saveId }: { saveId: string }) {
  const computer = useMediaQuery(COMPUTER_QUERY);
  const [cards, setCards] = useState<SideCardsData | null>(null);

  useEffect(() => {
    if (!computer || cards !== null) {
      return;
    }
    let abandoned = false;
    standingsSideCardsAction(saveId).then(
      (loaded) => {
        if (!abandoned) {
          setCards(loaded);
        }
      },
      () => undefined,
    );
    return () => {
      abandoned = true;
    };
  }, [computer, cards, saveId]);

  if (cards === null) {
    return null;
  }
  return (
    <>
      {cards.fixtures.length > 0 && <MatchCalendarCard saveId={saveId} fixtures={cards.fixtures} />}
      {cards.bracket !== null && <CupCard saveId={saveId} bracket={cards.bracket} linked />}
    </>
  );
}
