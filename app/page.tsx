import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/src/components/ui/table";
import { listClubsByCompetition } from "@/src/db/clubs";
import { listSaves } from "@/src/db/saves";
import { formatDate } from "@/src/lib/format";
import { CreateSaveForm } from "./_components/create-save-form";
import { DeleteSaveDialog } from "./_components/delete-save-dialog";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [saves, competitions] = await Promise.all([listSaves(), listClubsByCompetition()]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Career Manager</h1>
        <p className="text-muted-foreground">Reprenez une carrière ou commencez-en une nouvelle.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Parties</CardTitle>
            <CardDescription>
              {saves.length === 0 ? "Aucune partie pour l'instant." : `${saves.length} partie${saves.length > 1 ? "s" : ""}`}
            </CardDescription>
          </CardHeader>
          {saves.length > 0 && (
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Club</TableHead>
                    <TableHead>Date en jeu</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {saves.map((save) => (
                    <TableRow key={save.id} data-save-name={save.name}>
                      <TableCell className="font-medium">
                        <Link href={`/saves/${save.id}`} className="hover:underline">
                          {save.name}
                        </Link>
                      </TableCell>
                      <TableCell>{save.managerName}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="size-3 shrink-0 rounded-full ring-1 ring-border"
                            style={{ background: save.club.primaryColor }}
                          />
                          {save.club.name}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDate(save.currentDate)}</TableCell>
                      <TableCell className="text-right">
                        <DeleteSaveDialog saveId={save.id} saveName={save.name} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nouvelle partie</CardTitle>
            <CardDescription>La saison commence le 1er juillet 2024.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateSaveForm competitions={competitions} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
