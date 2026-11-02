"use client";

import { useTranslations } from "next-intl";
import { useState, type KeyboardEvent } from "react";
import { Input } from "@/src/components/ui/input";
import { searchClubs, type ClubChoice } from "../_lib/club-search";

type ClubSearchProps = {
  clubs: readonly ClubChoice[];
  onChoose: (clubId: string) => void;
};

/**
 * The search among all the clubs: the field and its results under it, two children of the grid around them. A result chosen,
 * by a click or by Enter for the first one, the field empties; Enter never sends the form.
 */
export function ClubSearch({ clubs, onChoose }: ClubSearchProps) {
  const t = useTranslations("createSave");
  const [query, setQuery] = useState("");
  const results = searchClubs(clubs, query);
  const label = t("search", { count: clubs.length });

  const choose = (clubId: string) => {
    onChoose(clubId);
    setQuery("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const first = results?.at(0);
      if (first !== undefined) {
        choose(first.value);
      }
    }
  };

  return (
    <>
      <div className="min-w-0">
        <label htmlFor="club-search" className="sr-only">
          {label}
        </label>
        <Input
          id="club-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={label}
          autoComplete="off"
          className="h-12 px-4 md:text-[0.9375rem] dark:bg-transparent"
          data-testid="club-search"
        />
      </div>
      {results !== null &&
        (results.length === 0 ? (
          <p role="status" className="text-sm text-muted-foreground lg:col-span-2 lg:row-start-2">
            {t("searchEmpty")}
          </p>
        ) : (
          <ul className="min-w-0 space-y-1.5 lg:col-span-2 lg:row-start-2">
            {results.map((club) => (
              <li key={club.value}>
                <button
                  type="button"
                  onClick={() => choose(club.value)}
                  className="flex min-h-11 w-full flex-wrap items-center justify-between gap-x-3 rounded-lg bg-card px-3.5 py-1.5 text-left transition-colors outline-none hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/50"
                  data-testid="club-search-result"
                >
                  <span className="min-w-0 text-sm font-semibold wrap-break-word">{club.label}</span>
                  <span className="text-xs text-muted-foreground">{club.competition}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </>
  );
}
