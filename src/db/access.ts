import { notFound } from "next/navigation";
import type { Prisma } from "../generated/prisma/client";
import { prisma } from "./client";

export type OwnedSave = { id: string; ownerId: string | null };

/** Who is asking: a user, or nobody (no valid cookie). */
export type SaveViewer = { id: string } | null;

/**
 * The saves a viewer may see: their own, and the inherited saves, from before owners (ownerId NULL).
 * TODO(2026-10-08, accès session 3): remove the inherited saves once they are attached to the administrator's account.
 */
export function visibleSavesWhere(viewer: SaveViewer): Prisma.SaveWhereInput {
  return viewer === null ? { ownerId: null } : { OR: [{ ownerId: viewer.id }, { ownerId: null }] };
}

/**
 * The single access check of a save: the save if the viewer owns it, or if it is an inherited save (transitional
 * rule, see visibleSavesWhere); notFound() otherwise, the same answer as a save that does not exist, so another
 * player's save ids reveal nothing.
 */
export async function loadOwnedSave(saveId: string, viewer: SaveViewer): Promise<OwnedSave> {
  const save = await prisma.save.findFirst({
    where: { id: saveId, ...visibleSavesWhere(viewer) },
    select: { id: true, ownerId: true },
  });
  if (save === null) {
    notFound();
  }
  return save;
}
