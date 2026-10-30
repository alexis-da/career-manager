"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { rememberSeen, type SeenItem } from "../_lib/first-steps";

/**
 * Ticks a first action once its screen is open: in the browser, where the page can write its cookie. The refresh is
 * for the browser's Back: without it, the dashboard comes back from the router's cache, its action unticked.
 */
export function MarkSeen({ saveId, item }: { saveId: string; item: SeenItem }) {
  const router = useRouter();
  useEffect(() => {
    rememberSeen(saveId, item);
    router.refresh();
  }, [router, saveId, item]);
  return null;
}
