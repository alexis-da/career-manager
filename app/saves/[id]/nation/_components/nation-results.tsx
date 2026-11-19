import { useTranslations } from "next-intl";
import { Panel } from "@/src/components/panel";
import type { NationalTeamView } from "@/src/db/national-view";
import { lineKey } from "../_lib/nation";
import { NationMatchLine } from "./nation-match-line";

/** His nation's matches played this season, the latest first, each with its stage and its result. */
export function NationResults({ view }: { view: NationalTeamView }) {
  const t = useTranslations("nationalTeam.results");
  return (
    <Panel aria-labelledby="nation-results-title" data-testid="nation-results" className="space-y-3">
      <h2 id="nation-results-title" className="font-heading text-[1.75rem] leading-none">
        {t("title")}
      </h2>
      {view.results.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      ) : (
        <ol className="space-y-1.5">
          {view.results.map((line) => (
            <NationMatchLine key={lineKey(line)} line={line} code={view.code} testId="nation-result" />
          ))}
        </ol>
      )}
    </Panel>
  );
}
