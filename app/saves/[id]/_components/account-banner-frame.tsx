"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { ACCOUNT_BANNER_CLOSED_SECONDS, ACCOUNT_BANNER_COOKIE } from "../_lib/account-banner";

/** The banner's frame: its cross hides it at once and remembers it for 7 days in a cookie the page reads. */
export function AccountBannerFrame({ children }: { children: ReactNode }) {
  const t = useTranslations("accountBanner");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(true);
  if (!open) {
    return null;
  }
  const close = () => {
    document.cookie = `${ACCOUNT_BANNER_COOKIE}=1; Max-Age=${ACCOUNT_BANNER_CLOSED_SECONDS}; Path=/; SameSite=Lax`;
    setOpen(false);
  };
  return (
    <div
      role="region"
      aria-label={t("label")}
      data-testid="account-banner"
      className="flex items-center gap-2 rounded-card border bg-card py-1.5 pr-1.5 pl-3 text-foreground sm:gap-3"
    >
      {children}
      <button
        type="button"
        onClick={close}
        aria-label={tCommon("close")}
        data-testid="account-banner-close"
        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:size-11"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
