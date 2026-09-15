import type { Metadata } from "next";
import { Badge } from "@/src/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { getDashboard } from "@/src/db/dashboard";
import { formatMoney } from "@/src/lib/format";
import { FixtureSummary } from "./_components/fixture-summary";
import { GameActions } from "./_components/game-actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Tableau de bord" };

/** Below this many players under contract, the dashboard warns. */
const SQUAD_ALERT_SIZE = 18;
const MIN_GOALKEEPERS = 2;

const ordinal = (rank: number): string => (rank === 1 ? "1er" : `${rank}e`);

const plural = (count: number, singular: string, pluralForm: string): string =>
  `${count} ${count > 1 ? pluralForm : singular}`;

export default async function DashboardPage({ params }: PageProps<"/saves/[id]">) {
  const { id } = await params;
  const dashboard = await getDashboard(id);
  const { club } = dashboard;

  const alerts: string[] = [];
  if (club.players < SQUAD_ALERT_SIZE) {
    alerts.push(`Effectif réduit : ${plural(club.players, "joueur", "joueurs")} sous contrat, ${SQUAD_ALERT_SIZE} au minimum.`);
  }
  if (club.goalkeepers < MIN_GOALKEEPERS) {
    alerts.push(club.goalkeepers === 0 ? "Aucun gardien sous contrat." : "Un seul gardien sous contrat.");
  }
  if (dashboard.expiringContracts > 0) {
    alerts.push(
      `${plural(dashboard.expiringContracts, "contrat expire", "contrats expirent")} en fin de saison.`,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tableau de bord</h1>
          {dashboard.startYear !== null && (
            <p className="text-sm text-muted-foreground tabular-nums">
              Saison {dashboard.startYear}-{String(dashboard.startYear + 1).slice(2)}
            </p>
          )}
        </div>
        <GameActions saveId={id} seasonFinished={dashboard.seasonFinished} />
      </div>

      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Alertes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li key={alert} className="flex items-center gap-2 text-sm">
                  <Badge variant="destructive">Attention</Badge>
                  {alert}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Prochain match</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.nextFixture === null ? (
              <p className="text-sm text-muted-foreground">
                {dashboard.seasonFinished ? "La saison est terminée." : "Aucun match à venir."}
              </p>
            ) : (
              <FixtureSummary fixture={dashboard.nextFixture} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dernier résultat</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.lastResult === null ? (
              <p className="text-sm text-muted-foreground">Aucun match joué cette saison.</p>
            ) : (
              <FixtureSummary fixture={dashboard.lastResult} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Classement</CardTitle>
            <CardDescription>{dashboard.position === null ? "Pas encore de classement." : null}</CardDescription>
          </CardHeader>
          {dashboard.position !== null && (
            <CardContent className="space-y-1">
              <p className="text-3xl font-semibold tabular-nums">
                {ordinal(dashboard.position.rank)}
                <span className="text-base font-normal text-muted-foreground"> sur {dashboard.position.clubs}</span>
              </p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {plural(dashboard.position.points, "point", "points")} après{" "}
                {plural(dashboard.position.played, "match", "matchs")}
              </p>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Finances</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Budget transferts</dt>
              <dd className="text-right font-medium tabular-nums">{formatMoney(club.budget)}</dd>
              <dt className="text-muted-foreground">Masse salariale</dt>
              <dd className="text-right font-medium tabular-nums">{formatMoney(club.payroll)}</dd>
              <dt className="text-muted-foreground">Budget salarial</dt>
              <dd className="text-right font-medium tabular-nums">{formatMoney(club.wageBudget)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Effectif</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Joueurs sous contrat</dt>
              <dd className="text-right font-medium tabular-nums">{club.players}</dd>
              <dt className="text-muted-foreground">Gardiens</dt>
              <dd className="text-right font-medium tabular-nums">{club.goalkeepers}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
