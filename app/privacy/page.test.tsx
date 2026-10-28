import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL } from "@/src/config/contact";
import PrivacyPage from "./page";

describe("privacy page", () => {
  const markup = renderToStaticMarkup(<PrivacyPage />);

  it("has its title and every section, in French", () => {
    expect(markup).toContain("Confidentialité · Late Winner");
    for (const section of ["Responsable", "Données traitées", "Finalités", "Durées de conservation", "Hébergement", "Tes droits"]) {
      expect(markup).toContain(`>${section}</h2>`);
    }
  });

  it("names the controller and the contact address, as a mailto link", () => {
    expect(markup).toContain("Alexis Da Cruz");
    expect(markup).toContain(`href="mailto:${CONTACT_EMAIL}"`);
  });

  it("says what is processed and what is not", () => {
    for (const text of ["lw_uid", "30 jours", "Supprimer mon compte", "Vercel", "Neon", "CNIL", "Aucun cookie tiers"]) {
      expect(markup).toContain(text);
    }
  });

  it("lists the language cookie among the comfort cookies, in French and in the English summary", () => {
    expect(markup).toContain("Trois cookies de confort : la langue que tu choisis, lw_lang (un an)");
    expect(markup).toContain("keep the language you choose (lw_lang, one");
  });

  it("ends with an English summary in a block marked as English", () => {
    expect(markup).toMatch(/<section lang="en"[^>]*><h2[^>]*>English summary<\/h2>/);
  });
});
