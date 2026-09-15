import type { Metadata } from "next";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";

export const metadata: Metadata = { title: "Transferts" };

export default function TransfersPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Transferts</CardTitle>
        <CardDescription>Bientôt disponible.</CardDescription>
      </CardHeader>
    </Card>
  );
}
