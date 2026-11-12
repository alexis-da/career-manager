import type { ReactNode } from "react";

type PointerTextProps = {
  touch: ReactNode; // under a finger: « Touche… », "Tap…"
  click: ReactNode; // under a mouse or a trackpad: « Clique… », "Click…"
};

/**
 * A text that names a gesture, in the words of the screen it is read on: « Touche » on a touch screen (a coarse
 * pointer), « Clique » under a mouse or a trackpad, and on a screen without any pointer. The server does not know the
 * screen: both are in the page, CSS shows one, and the other, out of the layout (display: none), is out of what a
 * screen reader reads too. A phone never says « Clique ».
 */
export function PointerText({ touch, click }: PointerTextProps) {
  return (
    <>
      <span className="pointer-coarse:hidden">{click}</span>
      <span className="hidden pointer-coarse:inline">{touch}</span>
    </>
  );
}
