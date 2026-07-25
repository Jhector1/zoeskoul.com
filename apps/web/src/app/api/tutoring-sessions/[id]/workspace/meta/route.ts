import { prisma } from "@/lib/prisma";
import { bodyJsonResponse } from "@/lib/practice/api/shared/http";
import { getTutoringRequestAccess } from "@/lib/tutoring/sessionRequestAccess";
import { getTutoringWorkspaceMeta } from "@/lib/tutoring/sessionWorkspace";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const allowed = await getTutoringRequestAccess(id);
  if (!allowed) return bodyJsonResponse({ error: "Forbidden" }, 403);

  const meta = await getTutoringWorkspaceMeta(prisma, {
    sessionId: id,
    moduleKeys: allowed.tutoringSession.moduleKeys,
  });

  return bodyJsonResponse({
    status: allowed.tutoringSession.status,
    publishedVersion: meta.publishedVersion,
    publishedAt: meta.publishedAt,
  });
}
