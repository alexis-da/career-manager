import { createHmac } from "node:crypto";

// The seed of a weekly challenge's saves: an HMAC of its week under a server secret (AUTH_SECRET), so that nobody knows
// it in advance and rehearses the challenge in an ordinary save, whose creation form takes any seed: the same seed and
// club give the same matches, shot for shot. Stored once in Challenge.seed and never shown. Pure: the secret is passed
// in. Apart from the engine because of node:crypto, which client components cannot bundle.

/** A challenge's seed: the same week and secret always give the same 64 hex characters. */
export function challengeSeed(secret: string, weekKey: string): string {
  if (secret === "") {
    throw new Error("A challenge seed needs a secret");
  }
  return createHmac("sha256", secret).update(`challenge:${weekKey}`).digest("hex");
}
