import type { Metadata } from "next";
import { Panel } from "../_components/panel";

export const metadata: Metadata = { title: "Transferts" };

export default function TransfersPage() {
  return (
    <div className="space-y-5">
      <h1 className="font-heading text-4xl font-bold">Transferts</h1>
      <Panel>
        <p className="text-muted-foreground">Bientôt disponible.</p>
      </Panel>
    </div>
  );
}
