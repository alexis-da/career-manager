import { cookies } from "next/headers";
import { GoogleSignInButton } from "@/app/_components/account-panel";
import { ACCOUNT_BANNER_COOKIE } from "../_lib/account-banner";
import { AccountBannerFrame } from "./account-banner-frame";

/**
 * Asks an anonymous player to sign in once their save has a matchday played: their career lives in a cookie of this
 * browser until then. Closed, it stays away 7 days (ACCOUNT_BANNER_COOKIE). One line, on a phone too.
 */
export async function AccountBanner({ show }: { show: boolean }) {
  if (!show || (await cookies()).has(ACCOUNT_BANNER_COOKIE)) {
    return null;
  }
  return (
    <AccountBannerFrame>
      <span aria-hidden className="h-4 w-1 shrink-0 rounded-full bg-(--brand-orange)" />
      <p className="min-w-0 flex-1 truncate text-sm">Crée un compte pour ne pas perdre ta carrière</p>
      <GoogleSignInButton compact className="shrink-0" />
    </AccountBannerFrame>
  );
}
