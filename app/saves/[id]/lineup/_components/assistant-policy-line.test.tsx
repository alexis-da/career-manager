import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { inLanguage } from "@/src/i18n/test-intl";
import { AssistantPolicyLine } from "./assistant-policy-line";

// The reminder of the assistant's policy on his card of the line-up (docs/design/effectif-adjoint.md § 2.1).
describe("AssistantPolicyLine", () => {
  it("names his policy and leads to Club → Réglages, in both languages", () => {
    const fr = renderToStaticMarkup(inLanguage(<AssistantPolicyLine saveId="save-1" policy="BEST" />));
    expect(fr).toContain('data-testid="lineup-assistant-policy"');
    expect(fr).toContain('data-policy="BEST"');
    expect(fr).toContain("Consigne : Meilleur onze");
    const link = /<a [^>]*data-testid="lineup-assistant-policy-change"[^>]*>([^<]*)/.exec(fr);
    expect(link?.[0]).toContain('href="/saves/save-1/club#reglages"');
    expect(link?.[1]).toBe("Changer");

    const en = renderToStaticMarkup(inLanguage(<AssistantPolicyLine saveId="save-1" policy="YOUTH" />, "en"));
    expect(en).toContain("Brief: Give youth a chance");
    expect(en).toContain(">Change<");
  });

  it("says nothing without a policy: a nation's editor", () => {
    expect(renderToStaticMarkup(inLanguage(<AssistantPolicyLine saveId="save-1" policy={undefined} />))).toBe("");
  });
});
