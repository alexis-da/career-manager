"use client";

import { useEffect, useState } from "react";
import { challengeClubNameAction } from "../actions";

/**
 * The week's club by name on the public challenge page, asked for once in the browser (challengeClubNameAction): no
 * club's name is in a public page's HTML (CLAUDE.md, « Communication sortante »). Until it comes, an empty bar of a name's
 * width holds its place in the line; if it never comes, the line goes on without it.
 */
export function ChallengeClubName({ weekKey }: { weekKey: string }) {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    challengeClubNameAction(weekKey).then(
      (loaded) => {
        if (current) {
          setName(loaded ?? "");
        }
      },
      () => {
        if (current) {
          setName("");
        }
      },
    );
    return () => {
      current = false;
    };
  }, [weekKey]);
  return (
    <strong data-testid="challenge-club" aria-busy={name === null} className="font-bold text-primary-foreground">
      {name ?? <span aria-hidden className="inline-block h-[1em] w-36 animate-pulse rounded bg-white/15 align-[-0.125em]" />}
    </strong>
  );
}
