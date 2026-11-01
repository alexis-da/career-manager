import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { GoogleSignInButton } from "@/app/_components/account-panel";
import { ACCOUNT_BANNER_COOKIE } from "../_lib/account-banner";
import { AccountBannerFrame } from "./account-banner-frame";

/**
 * Asks an anonymous player to sign in once their save has a matchday played: their career lives in a cookie of this
 * browser until then. Closed, it stays away 7 days (ACCOUNT_BANNER_COOKIE). One line; two on a phone rather than cut.
 */
export async function AccountBanner({ show }: { show: boolean }) {
  if (!show || (await cookies()).has(ACCOUNT_BANNER_COOKIE)) {
    return null;
  }
  const t = await getTranslations("accountBanner");
  return (
    <AccountBannerFrame>
      <p className="min-w-0 flex-1 truncate text-sm max-sm:whitespace-normal">{t("message")}</p>
      <GoogleSignInButton compact className="shrink-0" />
    </AccountBannerFrame>
  );
}
