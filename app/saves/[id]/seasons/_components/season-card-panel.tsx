"use client";

import { DownloadIcon, Share2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, buttonVariants } from "@/src/components/ui/button";
import { cn } from "@/src/lib/utils";

/**
 * A button of the screen's main pair: equal parts of their line, at a thumb's height, the orange one in the type of the
 * titles, the other outlined in the light of the text on blue.
 */
const mainButton = (orange: boolean): string =>
  cn(
    "h-13 flex-1",
    orange ? "font-heading text-[1.375rem] font-semibold" : "border-2 text-base font-bold dark:border-on-blue dark:bg-transparent dark:hover:bg-on-blue/10",
  );

const subscribeToNothing = () => () => {};

/** Whether the browser can share a PNG file (Web Share API level 2): mostly phones. */
function canShareFiles(): boolean {
  if (typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    return navigator.canShare({ files: [new File([""], "card.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

export type CardFile = { url: string; fileName: string };

type SeasonCardActionsProps = {
  square: CardFile; // the file shared and downloaded
  shareTitle: string; // never a club name: the card leaves the game
  main?: boolean; // the screen's one full orange action: « Partager » where the browser shares files, else « Télécharger »
  children?: ReactNode; // after the buttons, on their line
};

/**
 * « Télécharger » and, where the browser shares files, « Partager », which hands the square PNG itself to the system's
 * share sheet. The file is fetched beforehand: a share must start right on the click.
 */
export function SeasonCardActions({ square, shareTitle, main = false, children }: SeasonCardActionsProps) {
  const t = useTranslations("seasons.cardPanel");
  const shareable = useSyncExternalStore(subscribeToNothing, canShareFiles, () => false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!shareable) {
      return;
    }
    let cancelled = false;
    fetch(square.url)
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((blob) => {
        if (!cancelled) {
          setFile(new File([blob], square.fileName, { type: "image/png" }));
        }
      })
      // No file, no share button: downloading still works.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [shareable, square.url, square.fileName]);

  const share = async () => {
    if (file === null) {
      return;
    }
    try {
      await navigator.share({ files: [file], title: shareTitle });
    } catch {
      // Cancelled by the player, or refused by the browser: nothing to report.
    }
  };

  const orangeDownload = main && !shareable;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={square.url}
        download={square.fileName}
        data-testid="season-card-download"
        className={cn(buttonVariants({ variant: orangeDownload ? "club" : "outline", size: "lg", className: "px-4" }), main && mainButton(orangeDownload))}
      >
        <DownloadIcon data-icon="inline-start" />
        {t("download")}
      </a>
      {shareable && (
        <Button
          variant={main ? "club" : "outline"}
          size="lg"
          className={cn("px-4", main && mainButton(true))}
          disabled={file === null}
          onClick={share}
          data-testid="season-card-share"
        >
          <Share2Icon data-icon="inline-start" />
          {t("share")}
        </Button>
      )}
      {children}
    </div>
  );
}

type SeasonCardPanelProps = {
  square: CardFile; // 1080 × 1080, the default: previewed, downloaded and shared
  landscape: CardFile; // 1200 × 630, downloaded from a quieter link
  shareTitle: string; // never a club name: the card leaves the game
};

/**
 * The season's card, centred: its square preview, its buttons and, on a line of its own, « Version paysage ». The card has
 * the page's midnight blue: a border of the cards' colour draws its edge.
 */
export function SeasonCardPanel({ square, landscape, shareTitle }: SeasonCardPanelProps) {
  const t = useTranslations("seasons.cardPanel");
  return (
    <div className="mx-auto w-full max-w-md space-y-3" data-testid="season-card">
      <Image
        src={square.url}
        alt={t("alt", { title: shareTitle })}
        width={1080}
        height={1080}
        unoptimized
        priority
        data-testid="season-card-image"
        className="h-auto w-full rounded-xl border-2"
      />
      <SeasonCardActions square={square} shareTitle={shareTitle} main>
        <a
          href={landscape.url}
          download={landscape.fileName}
          data-testid="season-card-landscape"
          className="basis-full text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center max-sm:justify-center"
        >
          {t("landscape")}
        </a>
      </SeasonCardActions>
    </div>
  );
}
