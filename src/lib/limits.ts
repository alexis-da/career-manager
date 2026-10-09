// How many saves a player may keep, by kind of user. Constants rather than environment variables: they are rules of
// the game, the same everywhere. They only apply when a save is created: signing in with Google may give an account
// more saves than this (the anonymous user's join the account's), and nothing is taken away then.

export const MAX_SAVES_ANONYMOUS = 1;
export const MAX_SAVES_REGISTERED = 3;

export type UserKind = "ANONYMOUS" | "REGISTERED";

/** The most saves a user of this kind may own. */
export function maxSavesFor(kind: UserKind): number {
  return kind === "REGISTERED" ? MAX_SAVES_REGISTERED : MAX_SAVES_ANONYMOUS;
}

/** Whether a user of this kind, owning this many saves, may create another one. */
export function canCreateSave(kind: UserKind, saveCount: number): boolean {
  return saveCount < maxSavesFor(kind);
}

/** Thrown by createSave when the owner already has as many saves as their kind allows. */
export class SaveLimitError extends Error {
  constructor(
    readonly kind: UserKind,
    readonly saveCount: number,
  ) {
    super(`Save limit reached: a ${kind} user may own ${maxSavesFor(kind)} save(s) and owns ${saveCount}`);
    this.name = "SaveLimitError";
  }
}
