import type { Metadata } from "next";
import { getLineupEditor } from "@/src/db/lineup";
import { formatShortDate } from "@/src/lib/format";
import { LineupEditor } from "./_components/lineup-editor";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Composition" };

export default async function LineupPage({ params }: PageProps<"/saves/[id]/lineup">) {
  const { id } = await params;
  const editor = await getLineupEditor(id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="font-heading text-4xl font-bold">Composition</h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          Pour le match du {formatShortDate(editor.matchDate)} · cliquez sur un poste, puis sur un joueur
        </p>
      </div>
      {/* A new key after each save: the editor starts again from what is now saved. */}
      <LineupEditor
        key={`${editor.formation}:${JSON.stringify(editor.saved)}`}
        saveId={id}
        formation={editor.formation}
        saved={editor.saved}
        players={editor.players}
      />
    </div>
  );
}
