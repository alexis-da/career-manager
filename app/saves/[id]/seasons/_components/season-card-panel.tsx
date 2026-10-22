"use client";

import { DownloadIcon, Share2Icon } from "lucide-react";
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

type SeasonCardPanelProps = {
  cardUrl: string;
  fileName: string; // late-winner-saison-2026-27.png
  shareTitle: string; // never a club name: the card leaves the game
};

/**
 * The season's card: its preview, « Télécharger » and, where the browser shares files, « Partager », which hands the
 * PNG itself to the system's share sheet. The file is fetched beforehand: a share must start right on the click.
 */
export function SeasonCardPanel({ cardUrl, fileName, shareTitle }: SeasonCardPanelProps) {
  const shareable = useSyncExternalStore(subscribeToNothing, canShareFiles, () => false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!shareable) {
      return;
    }
    let cancelled = false;
    fetch(cardUrl)
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((blob) => {
        if (!cancelled) {
          setFile(new File([blob], fileName, { type: "image/png" }));
        }
      })
      // No file, no share button: downloading still works.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [shareable, cardUrl, fileName]);

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
    <Panel className="space-y-4">
      <Image
        src={cardUrl}
        alt={`Carte de la saison : ${shareTitle}`}
        width={1200}
        height={630}
        unoptimized
        priority
        className="h-auto w-full rounded-md border"
      />
      <div className="flex flex-wrap gap-2">
        <a href={cardUrl} download={fileName} className={buttonVariants({ variant: "club", size: "lg", className: "px-4" })}>
          <DownloadIcon data-icon="inline-start" />
          Télécharger
        </a>
        {shareable && (
          <Button variant="outline" size="lg" className="px-4" disabled={file === null} onClick={share}>
            <Share2Icon data-icon="inline-start" />
            Partager
          </Button>
        )}
      </div>
    </Panel>
  );
}
