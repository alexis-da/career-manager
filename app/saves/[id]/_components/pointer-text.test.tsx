import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PointerText } from "./pointer-text";

describe("a text naming a gesture", () => {
  it("puts both words in the page, « Touche » shown under a finger only, « Clique » everywhere else", () => {
    expect(renderToStaticMarkup(<p><PointerText touch="Touche un poste" click="Clique sur un poste" /></p>)).toBe(
      '<p><span class="pointer-coarse:hidden">Clique sur un poste</span><span class="hidden pointer-coarse:inline">Touche un poste</span></p>',
    );
  });
});
