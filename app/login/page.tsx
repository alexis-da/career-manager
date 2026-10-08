import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appPassword } from "@/src/lib/auth";
import { BrandHeader } from "../_components/brand-header";
import { LoginForm } from "./_components/login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Without a password, the app is open: nothing to sign in to.
  if (appPassword() === null) {
    redirect("/");
  }
  const { next } = await searchParams;

  return (
    <main className="brand flex flex-1 items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm space-y-8">
        <BrandHeader logoHeight={64} />
        <section lang="fr" className="space-y-4 rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Accès privé : entrez le mot de passe.</p>
          <LoginForm next={typeof next === "string" ? next : null} />
        </section>
      </div>
    </main>
  );
}
