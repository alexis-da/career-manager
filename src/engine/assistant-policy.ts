/**
 * The assistant's policy in a career (Save.assistantPolicy, docs/design/effectif-adjoint.md § 2), for what he takes care
 * of: the line-up before each match (selectAssistantLineup) and the contracts at the season's turn (wantsToKeep).
 * « Meilleur onze » (BEST) is the game as it was before the policies; « Lancer les jeunes » (YOUTH) starts the club's young
 * players in league matches where they are rated little below the starter, and renews its prospects. A pure function of the
 * save's state: no draw. Stored with each career: never renamed.
 */
export const ASSISTANT_POLICIES = ["BEST", "YOUTH"] as const;

export type AssistantPolicy = (typeof ASSISTANT_POLICIES)[number];

/** Every career's until its player chooses: the game before the policies, a career from before them included. */
export const DEFAULT_ASSISTANT_POLICY: AssistantPolicy = "BEST";
