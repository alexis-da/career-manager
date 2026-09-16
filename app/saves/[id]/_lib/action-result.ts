/** Answer of a Server Action on a player: a confirmation, or the reason of a refusal, both ready to show. */
export type ActionResult = {
  ok: boolean;
  message: string;
};
