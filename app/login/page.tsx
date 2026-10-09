import type { Metadata } from "next";
import { getCurrentUser } from "@/src/auth/current-user";
import { appPassword } from "@/src/lib/auth";
import { AccountPanel } from "../_components/account-panel";
import { BrandHeader } from "../_components/brand-header";
import { LoginForm } from "./_components/login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Connexion" };

/** Auth.js sends its errors here (src/auth/auth.ts, pages.error), as ?error=<type>. */
function signInErrorMessage(error: string): string {
  return error === "AccessDenied"
    ? "Connexion refusée : ce compte Google n'a pas d'adresse e-mail vérifiée."
    : "La connexion avec Google a échoué. Réessayez.";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const user = await getCurrentUser();
  // The sign-in page with Google: the logo, the tagline, the button. The password form only in the « closed » mode,
  // with APP_PASSWORD set (proxy.ts sends every request here until it is typed).
  const passwordRequired = appPassword() !== null;

  return (
    <main className="brand flex flex-1 items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm space-y-8">
        <BrandHeader logoHeight={64} />
        {passwordRequired && (
          <section lang="fr" className="space-y-4 rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Accès privé : entrez le mot de passe.</p>
            <LoginForm next={typeof next === "string" ? next : null} />
          </section>
        )}
        <section lang="fr" className="space-y-4 rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Retrouvez vos parties sur tous vos appareils.</p>
          {typeof error === "string" && (
            <p role="alert" className="text-sm text-loss">
              {signInErrorMessage(error)}
            </p>
          )}
          <AccountPanel user={user} />
        </section>
      </div>
    </main>
  );
}
