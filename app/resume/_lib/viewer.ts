import "server-only";
import { getCurrentUser } from "@/src/auth/current-user";
import { prisma } from "@/src/db/client";
import type { ResumeViewer } from "@/src/lib/resume-link";

/** The player of the browser that opens a resume link, and how many careers they have: none, or another's (resumeViewOf). */
export async function currentResumeViewer(): Promise<ResumeViewer> {
  const user = await getCurrentUser();
  if (user === null) {
    return null;
  }
  return { id: user.id, kind: user.kind, saves: await prisma.save.count({ where: { ownerId: user.id } }) };
}
