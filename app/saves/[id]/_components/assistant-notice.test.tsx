import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AssistantSettings as Settings } from "@/src/db/assistant-settings";
import { inLanguage } from "@/src/i18n/test-intl";
import { AssistantSettings } from "../club/_components/assistant-settings";
import { AssistantNotice } from "./assistant-notice";

// The Server Actions need a request, and the switches a router: the buttons alone are rendered here.
vi.mock("../club/actions", () => ({
  closeAssistantNoticeAction: vi.fn(),
  setAssistantPolicyAction: vi.fn(),
  setAssistantSettingAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const ASSISTANT: Settings = { lineupByAssistant: true, contractsByAssistant: true, policy: "BEST", noticeOpen: true };

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

  /** The policy's radios, by value: the tag of each. */
  const radiosOf = (html: string): Record<string, string> =>
    Object.fromEntries((html.match(/<input[^>]*name="assistant-policy"[^>]*>/g) ?? []).map((tag) => [/value="(\w+)"/.exec(tag)?.[1], tag]));

  it("offers his two policies under the switches, the chosen one checked, each saying what it does", () => {
    const html = renderToStaticMarkup(inLanguage(<AssistantSettings saveId="save-1" settings={{ ...ASSISTANT, policy: "YOUTH" }} />));
    const radios = radiosOf(html);

    expect(html).toContain('data-testid="settings-assistant-policy"');
    expect(html).toContain('data-active="true"');
    expect(html).toContain("Sa consigne");
    expect(html).toContain('data-testid="settings-assistant-policy-best"');
    expect(html).toContain("Les plus forts, reposés. Il prolonge les joueurs utiles.");
    expect(html).toContain('data-testid="settings-assistant-policy-youth"');
    expect(html).toContain("Tes 21 ans et moins jouent en championnat si l&#x27;écart est faible ; il prolonge tes espoirs.");
    expect(Object.keys(radios)).toEqual(["BEST", "YOUTH"]);
    expect(radios.YOUTH).toContain('checked=""');
    expect(radios.BEST).not.toContain("checked");
    expect(html).not.toContain('data-testid="settings-assistant-policy-inactive"');
    // The switches first: the policy only works on what they leave to him.
    expect(html.indexOf("settings-assistant-contracts")).toBeLessThan(html.indexOf("settings-assistant-policy"));
  });

  it("greys his policy while the player keeps both the line-up and the contracts, and says why, in both languages", () => {
    const own: Settings = { ...ASSISTANT, lineupByAssistant: false, contractsByAssistant: false };
    const fr = renderToStaticMarkup(inLanguage(<AssistantSettings saveId="save-1" settings={own} />));
    expect(fr).toMatch(/<fieldset disabled=""[^>]*data-testid="settings-assistant-policy"[^>]*data-active="false"/);
    expect(fr).toContain("Ton adjoint ne fait ni ton onze ni tes contrats : sa consigne attendra que tu lui en rendes un.");
    expect(radiosOf(fr).BEST).toContain('checked=""');

    const en = renderToStaticMarkup(inLanguage(<AssistantSettings saveId="save-1" settings={own} />, "en"));
    expect(en).toContain("His brief");
    expect(en).toContain("Best eleven");
    expect(en).toContain("Give youth a chance");
    expect(en).toContain("Your assistant handles neither your eleven nor your contracts");
    // One of them back to him: the policy works again.
    const contracts = renderToStaticMarkup(inLanguage(<AssistantSettings saveId="save-1" settings={{ ...own, contractsByAssistant: true }} />));
    expect(contracts).toContain('data-active="true"');
    expect(contracts).not.toContain("sa consigne attendra");
  });
});
