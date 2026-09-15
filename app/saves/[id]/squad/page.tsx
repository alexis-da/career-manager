import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";

export const metadata: Metadata = { title: "Effectif" };

export default function SquadPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Effectif</CardTitle>
        <CardDescription>Bientôt disponible.</CardDescription>
      </CardHeader>
    </Card>
  );
}
