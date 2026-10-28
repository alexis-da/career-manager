import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/src/auth/current-user";
import { appPassword } from "@/src/lib/auth";
import { AccountPanel } from "../_components/account-panel";
import { BrandFooter } from "../_components/brand-footer";
import { BrandHeader } from "../_components/brand-header";
import { LoginForm } from "./_components/login-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("login"))("title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const [user, t] = await Promise.all([getCurrentUser(), getTranslations("login")]);
  // The sign-in page with Google: the logo, the tagline, the button. The password form only in the « closed » mode,
  // with APP_PASSWORD set (proxy.ts sends every request here until it is typed).
  const passwordRequired = appPassword() !== null;

  return (
    <main className="brand flex flex-1 items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-sm space-y-8">
        <BrandHeader logoHeight={64} />
        {passwordRequired && (
          <section className="space-y-4 rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">{t("passwordPrompt")}</p>
            <LoginForm next={typeof next === "string" ? next : null} />
          </section>
        )}
        <section className="space-y-4 rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">{t("googlePrompt")}</p>
          {/* Auth.js sends its errors here (src/auth/auth.ts, pages.error), as ?error=<type>. */}
          {typeof error === "string" && (
            <p role="alert" className="text-sm text-loss" data-testid="sign-in-error">
              {error === "AccessDenied" ? t("accessDenied") : t("googleFailed")}
            </p>
          )}
          <AccountPanel user={user} />
        </section>
        <BrandFooter />
      </div>
    </main>
  );
}
