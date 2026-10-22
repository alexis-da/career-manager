import type { Metadata } from "next";
import Link from "next/link";
import { requireOwnedSave } from "@/src/auth/current-user";
import { PlayerFace } from "@/src/components/player-face";
import { MANAGED_ROW, TABLE_CELL, TABLE_HEAD, TABLE_ROW } from "@/src/components/table-styles";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { getSeasonResults } from "@/src/db/season-results";
import { seasonLabel } from "@/src/engine/world";
import { formatDecimal } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { Panel } from "../_components/panel";
import { POSITION_SHORT } from "../_lib/positions";
import { rankLabel, recordLabel } from "../_lib/seasons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Palmarès" };

/** The managed club's completed seasons, most recent first, each with a link to its card. */
export default async function SeasonsPage({ params }: PageProps<"/saves/[id]/seasons">) {
  const { id } = await params;
  // Another player's save, or one that does not exist: 404, before anything is read.
  await requireOwnedSave(id);
  const { clubColors, seasons } = await getSeasonResults(id);

  return (
    <div className="space-y-5">
      <h1 className="font-heading text-4xl font-bold">Palmarès</h1>

      {seasons.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted-foreground">
            Aucune saison terminée pour l&apos;instant : le bilan de chaque saison s&apos;affichera ici.
          </p>
        </Panel>
      ) : (
        <Panel className="p-2 sm:p-3">
          <Table className="tabular-nums">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className={TABLE_HEAD}>Saison</TableHead>
                <TableHead className={TABLE_HEAD}>Compétition</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")}>Classement</TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")} title="Points">
                  Pts
                </TableHead>
                <TableHead className={cn(TABLE_HEAD, "text-right")} title="Victoires, nuls, défaites">
                  V-N-D
                </TableHead>
                <TableHead className={TABLE_HEAD}>Meilleur joueur</TableHead>
                <TableHead className={TABLE_HEAD}>
                  <span className="sr-only">Carte</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {seasons.map((season) => (
                <TableRow
                  key={season.seasonId}
                  data-season={season.startYear}
                  className={cn(TABLE_ROW, season.champion && MANAGED_ROW)}
                >
                  <TableCell className={cn(TABLE_CELL, "font-heading text-base font-semibold")}>
                    {seasonLabel(season.startYear)}
                  </TableCell>
                  <TableCell className={TABLE_CELL}>{season.competitionName}</TableCell>
                  <TableCell
                    data-column="rank"
                    className={cn(TABLE_CELL, "text-right font-heading text-base font-bold", season.champion && "text-(--club)")}
                  >
                    {rankLabel(season.rank)}
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>{season.points}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>{recordLabel(season)}</TableCell>
                  <TableCell className={cn(TABLE_CELL, "whitespace-nowrap")}>
                    {season.bestPlayer === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <PlayerFace
                          playerKey={season.bestPlayer.playerKey}
                          age={season.bestPlayer.age}
                          clubColors={clubColors}
                          size={28}
                          className="mr-2 inline-block align-middle"
                        />
                        <span className="font-semibold">{season.bestPlayer.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {POSITION_SHORT[season.bestPlayer.position]} · {season.bestPlayer.goals} buts ·{" "}
                          {season.bestPlayer.assists} passes · note {formatDecimal(season.bestPlayer.rating)}
                        </span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className={cn(TABLE_CELL, "text-right")}>
                    <Link
                      href={`/saves/${id}/seasons/${season.seasonId}`}
                      aria-label={`Voir la carte de la saison ${seasonLabel(season.startYear)}`}
                      className="font-semibold whitespace-nowrap text-(--club) hover:underline"
                    >
                      Voir la carte
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
    </div>
  );
}
