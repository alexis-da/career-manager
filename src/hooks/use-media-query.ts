import { useCallback, useSyncExternalStore } from "react";

/** Whether a media query matches, kept up to date; false during server rendering. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** A mouse or a trackpad: a pointer that can hover. False on a touch screen, which cannot. */
export const HOVER_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/** The width from which a save's navigation is a sidebar: Tailwind's lg. */
export const COMPUTER_QUERY = "(min-width: 64rem)";
