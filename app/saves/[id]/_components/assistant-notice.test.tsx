import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AssistantSettings as Settings } from "@/src/db/assistant-settings";
import { inLanguage } from "@/src/i18n/test-intl";
import { AssistantSettings } from "../club/_components/assistant-settings";
import { AssistantNotice } from "./assistant-notice";

// The Server Actions need a request, and the switches a router: the buttons alone are rendered here.
vi.mock("../club/actions", () => ({
  closeAssistantNoticeAction: vi.fn(),
  setAssistantSettingAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ASSISTANT: Settings = { lineupByAssistant: true, contractsByAssistant: true, noticeOpen: true };

describe("AssistantNotice", () => {
  it("tells a career what the assistant now does, and leads to his settings", () => {
    const html = renderToStaticMarkup(inLanguage(<AssistantNotice saveId="save-1" settings={ASSISTANT} />));
    expect(html).toContain("Ton adjoint prend le relais");
    expect(html).toContain("Plus de plafond salarial");
    expect(html).toContain("aligne le onze avant chaque match, dans ton dispositif.");
    expect(html).toContain("je te préviens avant de laisser partir un titulaire");
    expect(html).toContain("Au mercato, je te propose de vendre ceux qui ne jouent pas.");
    expect(html).toContain('href="/saves/save-1/club#reglages"');
    expect(html).toContain('data-testid="assistant-notice-close"');
  });

  it("leaves a line-up the player saved his, in both languages", () => {
    const own: Settings = { ...ASSISTANT, lineupByAssistant: false, contractsByAssistant: false };
    const fr = renderToStaticMarkup(inLanguage(<AssistantNotice saveId="save-1" settings={own} />));
    expect(fr).toContain("Ta composition enregistrée reste la tienne");
    expect(fr).toContain("Les contrats restent entre tes mains.");
    expect(fr).not.toContain("aligne le onze");
    const en = renderToStaticMarkup(inLanguage(<AssistantNotice saveId="save-1" settings={own} />, "en"));
    expect(en).toContain("Your assistant takes over");
    expect(en).toContain("Your saved line-up stays yours");
  });
});

describe("AssistantSettings", () => {
  it("has a switch for the line-up and one for the contracts, each saying what it means now", () => {
    const html = renderToStaticMarkup(
      inLanguage(<AssistantSettings saveId="save-1" settings={{ ...ASSISTANT, contractsByAssistant: false }} />),
    );
    expect(html).toContain("Ton adjoint s&#x27;occupe de");
    expect(html).toContain('data-testid="settings-assistant-lineup"');
    expect(html).toContain('data-testid="settings-assistant-contracts"');
    expect(html).toContain("Il aligne le meilleur onze avant chaque match, dans ton dispositif.");
    expect(html).toContain("Tu décides des contrats : sans prolongation, un joueur part libre en fin de saison.");
    expect((html.match(/role="switch"/g) ?? []).length).toBe(2);
    expect(html).toContain('aria-checked="false"');
  });
});
