"use client";

import { CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { chromeIntentUrl, isInAppBrowser } from "@/src/lib/in-app-browser";
import { RESUME_LINK_DAYS } from "@/src/lib/resume-link";
import { cn } from "@/src/lib/utils";
import { ensureResumeLink, resumeLinkFailedSnapshot, resumeLinkPathSnapshot, subscribeToResumeLink } from "../_lib/resume-link-store";

/**
 * This tab's resume link, asked of the server as an in-app page with a career opens (`wanted`): null until it comes, and
 * always outside an app's browser, where nothing is asked.
 */
function useResumeLink(wanted: boolean): { path: string | null; failed: boolean } {
  const path = useSyncExternalStore(subscribeToResumeLink, resumeLinkPathSnapshot, () => null);
  const failed = useSyncExternalStore(subscribeToResumeLink, resumeLinkFailedSnapshot, () => false);
  useEffect(() => {
    if (wanted && isInAppBrowser()) {
      ensureResumeLink();
    }
  }, [wanted]);
  return { path, failed };
}

/** Copies a text: the clipboard, else the copy command on a selected field; false when neither would. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older in-app browsers: the copy command.
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  } catch {
    return false;
  }
}

/**
 * « Copier mon lien de reprise », in place of Google in an app's browser: the link copied in the touch, then shown in a
 * field to copy by hand where the browser would not, with how long it lasts.
 */
export function ResumeLinkCopy({ className }: { className?: string }) {
  const t = useTranslations("inApp");
  const { path, failed } = useResumeLink(true);
  const [copied, setCopied] = useState<{ address: string; ok: boolean } | null>(null);
  const copy = async () => {
    if (path === null) {
      return;
    }
    const address = new URL(path, window.location.origin).toString();
    setCopied({ address, ok: await copyText(address) });
  };
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <Button type="button" variant="outline" onClick={() => void copy()} disabled={path === null} data-testid="resume-link-copy" className="max-sm:h-11">
        <CopyIcon data-icon="inline-start" />
        {path !== null ? t("copyResume") : failed ? t("unavailable") : t("preparing")}
      </Button>
      {copied !== null && (
        <div className="space-y-1.5">
          <p role="status" data-testid="resume-link-status" className="text-sm font-semibold">
            {copied.ok ? t("copied", { days: RESUME_LINK_DAYS }) : t("copyByHand", { days: RESUME_LINK_DAYS })}
          </p>
          <Input
            readOnly
            value={copied.address}
            aria-label={t("linkLabel")}
            onFocus={(event) => event.currentTarget.select()}
            data-testid="resume-link-value"
            className="font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}

/**
 * « Ouvrir dans Chrome », on Android only (the in-app-android variant): the page itself, or with a career its resume
 * link, opened in Chrome by an intent, in the touch.
 */
export function OpenInChrome({ career }: { career: boolean }) {
  const t = useTranslations("inApp");
  const { path } = useResumeLink(career);
  const open = () => {
    const target = career ? (path === null ? null : new URL(path, window.location.origin)) : new URL(window.location.href);
    if (target !== null) {
      window.location.href = chromeIntentUrl(target);
    }
  };
  return (
    <Button
      type="button"
      variant="outline"
      onClick={open}
      disabled={career && path === null}
      data-testid="in-app-chrome"
      className="hidden max-sm:h-11 in-app-android:inline-flex"
    >
      <ExternalLinkIcon data-icon="inline-start" />
      {t("openInChrome")}
    </Button>
  );
}
