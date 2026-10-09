import { notFound } from "next/navigation";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./client";

export type OwnedSave = { id: string; ownerId: string | null };

/** Who is asking: a user, or nobody (no valid cookie). */
export type SaveViewer = { id: string } | null;

/**
 * The saves a viewer may see: their own, and nothing without a user. An inherited save (ownerId NULL, from before
 * owners) is nobody's until the administrator's sign-in attaches it to their account (src/auth/google.ts).
 */
export function visibleSavesWhere(viewer: SaveViewer): Prisma.SaveWhereInput {
  return viewer === null ? { id: { in: [] } } : { ownerId: viewer.id };
}

/**
 * The single access check of a save: the save if the viewer owns it; notFound() otherwise, the same answer as a save
 * that does not exist, so another player's save ids reveal nothing.
 */
export async function loadOwnedSave(saveId: string, viewer: SaveViewer): Promise<OwnedSave> {
  if (viewer === null) {
    notFound();
  }
  const save = await prisma.save.findFirst({
    where: { id: saveId, ...visibleSavesWhere(viewer) },
    select: { id: true, ownerId: true },
  });
  if (save === null) {
    notFound();
  }
  return save;
}
