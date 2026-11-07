"use client";

import { DownloadIcon, LinkIcon, Share2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, buttonVariants } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/src/components/ui/dialog";
import { SITE_URL } from "@/src/config/site";
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

/** A quieter button on a line of its own, under the main ones: « Copier le lien ». */
const QUIET_BUTTON = "basis-full text-muted-foreground hover:text-foreground";

const subscribeToNothing = () => () => {};

/**
 * Whether the browser can share a PNG file itself (Web Share API level 2): most phones' browsers, not an app's own
 * browser (Instagram, TikTok, Snap…), nor most computers'.
 */
function canShareFiles(): boolean {
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    return navigator.canShare({ files: [new File([""], "card.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

/**
 * An iPhone or an iPad (which says it is a Mac, with a touch screen): a download lands in Files, never in Photos, and an
 * app's browser often refuses it; a long press on the image saves it to Photos.
 */
function isAppleMobile(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

export type CardFile = { url: string; fileName: string };

type SeasonCardActionsProps = {
  square: CardFile; // the file shared and saved
  shareTitle: string; // the card's title, for its image's description: never a club name, the card leaves the game
  main?: boolean; // the screen's one full orange action: « Partager » where the browser shares files, else « Enregistrer »
  children?: ReactNode; // after the buttons, on a line of their own
};

/**
 * The card's way out of the game. Where the browser shares files, « Partager » hands the square PNG itself to the system's
 * share sheet, alone: Instagram, TikTok and Snap take an image, and drop or choke on a text beside it. The file is fetched
 * beforehand: a share must start right on the click. Elsewhere (an app's browser, most computers), or once the browser
 * refuses the share it claimed it could make, « Enregistrer l'image » comes first, downloading the PNG or, on an iPhone,
 * opening it for a long press to Photos, with a sentence on posting it from the gallery. « Copier le lien » copies the
 * game's address: the card's own link opens for its owner alone.
 */
export function SeasonCardActions({ square, shareTitle, main = false, children }: SeasonCardActionsProps) {
  const t = useTranslations("seasons.cardPanel");
  const canShare = useSyncExternalStore(subscribeToNothing, canShareFiles, () => false);
  const appleMobile = useSyncExternalStore(subscribeToNothing, isAppleMobile, () => false);
  const [file, setFile] = useState<File | null>(null);
  const [refused, setRefused] = useState(false); // the browser claimed it could share the file, then would not
  const [viewing, setViewing] = useState(false);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const shares = canShare && !refused;

  useEffect(() => {
    if (!canShare) {
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
      // No file, no share: saving it is the way left.
      .catch(() => {
        if (!cancelled) {
          setRefused(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canShare, square.url, square.fileName]);

  const share = async () => {
    if (file === null) {
      return;
    }
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      // Cancelled by the player: nothing to say. Refused by the browser: saving it is the way left.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setRefused(true);
      }
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setCopy("copied");
    } catch {
      // An app's browser may refuse the clipboard: the address is shown instead, to copy by hand.
      setCopy("failed");
    }
  };

  const saveOrange = main && !shares;
  // Alone on its line when it is the orange one: its name, in the titles' type, would not fit in half of a phone's.
  const saveClass = cn("px-4", main && mainButton(saveOrange), saveOrange && "basis-full");
  const save = (
    <>
      <DownloadIcon data-icon="inline-start" />
      {t("download")}
    </>
  );
  // Beside the other buttons on the club's card; under them, quieter, on the season's page.
  const copyLinkButton = (
    <Button
      variant={main ? "ghost" : "outline"}
      size="lg"
      className={cn("px-4", main && QUIET_BUTTON)}
      onClick={copyLink}
      data-testid="season-card-copy-link"
    >
      <LinkIcon data-icon="inline-start" />
      {t("copyLink")}
    </Button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {shares && (
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
      {appleMobile ? (
        <Button
          variant={saveOrange ? "club" : "outline"}
          size="lg"
          className={saveClass}
          onClick={() => setViewing(true)}
          data-testid="season-card-download"
        >
          {save}
        </Button>
      ) : (
        <a
          href={square.url}
          download={square.fileName}
          data-testid="season-card-download"
          className={cn(buttonVariants({ variant: saveOrange ? "club" : "outline", size: "lg" }), saveClass)}
        >
          {save}
        </a>
      )}
      {!main && copyLinkButton}
      {!shares && (
        <p data-testid="season-card-save-hint" className="basis-full text-sm text-muted-foreground">
          {t("saveHint")}
        </p>
      )}
      {main && copyLinkButton}
      {copy !== "idle" && (
        <p data-testid="season-card-link-copied" role="status" className="basis-full text-sm text-muted-foreground">
          {copy === "copied" ? t("linkCopied") : t("copyFailed", { url: SITE_URL })}
        </p>
      )}
      {children}
      <Dialog open={viewing} onOpenChange={setViewing}>
        <DialogContent data-testid="season-card-viewer" className="sm:max-w-md">
          <DialogTitle>{t("viewerTitle")}</DialogTitle>
          {/* The image itself, whole: the one iOS offers to save to Photos on a long press. */}
          <Image
            src={square.url}
            alt={t("alt", { title: shareTitle })}
            width={1080}
            height={1080}
            unoptimized
            data-testid="season-card-viewer-image"
            className="h-auto w-full rounded-xl"
          />
          <DialogDescription>{t("viewerHint")}</DialogDescription>
        </DialogContent>
      </Dialog>
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
