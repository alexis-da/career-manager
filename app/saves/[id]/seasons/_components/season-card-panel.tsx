"use client";

import { DownloadIcon, Share2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button, buttonVariants } from "@/src/components/ui/button";
import { Panel } from "../../_components/panel";

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

type CardFile = { url: string; fileName: string };

type SeasonCardPanelProps = {
  square: CardFile; // 1080 × 1080, the default: previewed, downloaded and shared
  landscape: CardFile; // 1200 × 630, downloaded from a quieter link
  shareTitle: string; // never a club name: the card leaves the game
};

/**
 * The season's card: its square preview, « Télécharger », « Version paysage » and, where the browser shares files,
 * « Partager », which hands the square PNG itself to the system's share sheet. The file is fetched beforehand: a share
 * must start right on the click.
 */
export function SeasonCardPanel({ square, landscape, shareTitle }: SeasonCardPanelProps) {
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

  return (
    <Panel className="space-y-4" data-testid="season-card">
      <Image
        src={square.url}
        alt={t("alt", { title: shareTitle })}
        width={1080}
        height={1080}
        unoptimized
        priority
        data-testid="season-card-image"
        className="h-auto w-full max-w-md rounded-md border"
      />
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={square.url}
          download={square.fileName}
          data-testid="season-card-download"
          className={buttonVariants({ variant: "club", size: "lg", className: "px-4" })}
        >
          <DownloadIcon data-icon="inline-start" />
          {t("download")}
        </a>
        {shareable && (
          <Button
            variant="outline"
            size="lg"
            className="px-4"
            disabled={file === null}
            onClick={share}
            data-testid="season-card-share"
          >
            <Share2Icon data-icon="inline-start" />
            {t("share")}
          </Button>
        )}
        <a
          href={landscape.url}
          download={landscape.fileName}
          data-testid="season-card-landscape"
          className="ml-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("landscape")}
        </a>
      </div>
    </Panel>
  );
}
