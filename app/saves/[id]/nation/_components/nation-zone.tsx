import { useTranslations } from "next-intl";
import { Panel, PanelTitle } from "@/src/components/panel";
import type { ZoneTableView } from "@/src/db/nations-view";
import type { NationCode } from "@/src/engine/nations";
import type { TournamentCode } from "@/src/engine/tournaments";
import { tournamentName } from "../../_components/coach-names";
import { ZoneTable } from "../../_components/zone-table";

type NationZoneProps = {
  code: NationCode; // his nation: its row set apart
  zone: ZoneTableView;
  tournament: TournamentCode | null;
  year: number | null;
};

/** The qualifiers of his nation's zone in the cycle in progress, as the Sélections tab shows them, its row set apart. */
export function NationZone({ code, zone, tournament, year }: NationZoneProps) {
  const tNations = useTranslations("nations");
  const tWorld = useTranslations("world");
  return (
    <Panel aria-labelledby="nation-zone-title" className="space-y-3">
      <PanelTitle id="nation-zone-title">
        {tNations("campaign.title")}
        {tournament !== null && ` · ${tournamentName(tournament, year, tNations)}`}
      </PanelTitle>
      <ZoneTable zone={zone} t={tNations} tWorld={tWorld} highlight={code} testIdPrefix="nation" />
    </Panel>
  );
}
