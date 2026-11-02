import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/src/auth/current-user";
import { Panel } from "@/src/components/panel";
import { appPassword } from "@/src/lib/auth";
import { AccountPanel } from "../_components/account-panel";
import { PublicPage } from "../_components/public-page";
import { LoginForm } from "./_components/login-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("login"))("title") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const [user, t, brand] = await Promise.all([getCurrentUser(), getTranslations("login"), getTranslations("brand")]);
  // The sign-in page with Google: the title, the tagline, the button. The password form only in the « closed » mode, with
  // APP_PASSWORD set (proxy.ts sends every request here until it is typed).
  const passwordRequired = appPassword() !== null;

  return (
    <PublicPage className="max-w-md">
      <div className="space-y-5">
        <header className="space-y-3 text-center">
          <h1 className="font-heading text-[2.875rem] leading-[0.92]">{t("title")}</h1>
          <div lang="en" className="space-y-0.5">
            <p className="font-heading text-2xl">The football career game</p>
            <p className="font-heading text-lg text-(--club)">Take your club to the top</p>
          </div>
          <p className="text-sm text-muted-foreground">{brand("languages")}</p>
        </header>
        {passwordRequired && (
          <Panel className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">{t("passwordPrompt")}</p>
            <LoginForm next={typeof next === "string" ? next : null} />
          </Panel>
        )}
        <Panel className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">{t("googlePrompt")}</p>
          {/* Auth.js sends its errors here (src/auth/auth.ts, pages.error), as ?error=<type>. */}
          {typeof error === "string" && (
            <p role="alert" className="text-sm text-loss" data-testid="sign-in-error">
              {error === "AccessDenied" ? t("accessDenied") : t("googleFailed")}
            </p>
          )}
          <AccountPanel user={user} className="flex justify-center" />
        </Panel>
      </div>
    </PublicPage>
  );
}
