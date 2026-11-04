import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inLanguage } from "@/src/i18n/test-intl";
import { formBarClass } from "../_lib/ratings";
import { FormArrow, formTrend } from "./form-arrow";

const FORMS = Array.from({ length: 99 }, (_, index) => index + 1);

describe("the form's arrow", () => {
  it("points up, flat or down where the squad's form gauge turns green, stays neutral or turns red", () => {
    for (const form of FORMS) {
      const gauge = formBarClass(form);
      expect(formTrend(form), `form ${form}`).toBe(gauge === "bg-win" ? "up" : gauge === "bg-loss" ? "down" : "flat");
    }
    expect([65, 64, 50, 36, 35].map(formTrend)).toEqual(["up", "flat", "flat", "flat", "down"]);
  });

  it("is drawn, never written, its figure and what it means on hover and for the screen readers", () => {
    const good = renderToStaticMarkup(inLanguage(<FormArrow form={72} />));

    expect(good).toContain('data-form-trend="up"');
    expect(good).toContain("text-win");
    expect(good).toContain("lucide-arrow-up-right");
    expect(good).toMatch(/title="Forme 72 : bonne"/);
    expect(good).toContain('<span class="sr-only">Forme 72 : bonne</span>');
    expect(good.replace(/<[^>]+>/g, "")).toBe("Forme 72 : bonne");

    const poor = renderToStaticMarkup(inLanguage(<FormArrow form={30} />, "en"));
    expect(poor).toContain("text-loss");
    expect(poor).toContain("lucide-arrow-down-right");
    expect(poor).toContain("Form 30: poor");
    expect(renderToStaticMarkup(inLanguage(<FormArrow form={50} />, "en"))).toContain("Form 50: average");
  });
});
