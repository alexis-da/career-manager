import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CONTACT_EMAIL } from "@/src/config/contact";
import { PrivacyDocument } from "./_components/privacy-document";

describe("privacy page, in French", () => {
  const markup = renderToStaticMarkup(<PrivacyDocument locale="fr" />);

  it("has its title, its date and every section, in French", () => {
    expect(markup).toContain("Confidentialité · Late Winner");
    expect(markup).toContain("Mise à jour le 30 octobre 2026.");
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
    expect(markup).toContain("Des cookies de confort : la langue que tu choisis, lw_lang (un an)");
    expect(markup).toContain("keep the language you choose (lw_lang, one");
    expect(markup).toContain("lw_seen_… (trente jours, envoyés pour cette partie seulement)");
    expect(markup).toContain("first steps (lw_seen_…, thirty days)");
  });

  it("ends with an English summary in a block marked as English, of the same date", () => {
    expect(markup).toMatch(/<section lang="en"[^>]*><h2[^>]*>English summary<\/h2>/);
    expect(markup).toContain("Last updated 30 October 2026.");
  });
});

describe("privacy page, in English", () => {
  const markup = renderToStaticMarkup(<PrivacyDocument locale="en" />);

  it("is the whole document in English, of the French one's date, without the summary", () => {
    expect(markup).toMatch(/<article lang="en"/);
    expect(markup).toContain("Privacy · Late Winner");
    expect(markup).toContain("Last updated 30 October 2026.");
    for (const section of ["Controller", "Data processed", "Purposes", "Retention periods", "Hosting", "Your rights"]) {
      expect(markup).toContain(`>${section}</h2>`);
    }
    expect(markup).not.toContain("English summary");
    expect(markup).not.toContain("Confidentialité");
  });

  it("says what the French one says: cookies, retention, hosting, rights", () => {
    for (const text of [
      "lw_uid",
      "Comfort cookies: the language you choose, lw_lang (one year)",
      "lw_seen_… (thirty days, sent for that career only)",
      "30 days",
      "24 hours after its week ends",
      "Delete my account",
      "Vercel",
      "Neon",
      "CNIL",
      "No third-party cookies",
      `href="mailto:${CONTACT_EMAIL}"`,
    ]) {
      expect(markup).toContain(text);
    }
  });
});
