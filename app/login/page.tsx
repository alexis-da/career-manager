import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { appPassword } from "@/src/lib/auth";
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
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <section className="w-full max-w-sm space-y-6 rounded-lg border bg-card p-6">
        <header className="space-y-1">
          <h1 className="font-heading text-4xl font-bold tracking-wide uppercase">Career Manager</h1>
          <p className="text-sm text-muted-foreground">Accès privé : entrez le mot de passe.</p>
        </header>
        <LoginForm next={typeof next === "string" ? next : null} />
      </section>
    </main>
  );
}
