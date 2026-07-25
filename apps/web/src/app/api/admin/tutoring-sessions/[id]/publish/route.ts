import { prisma } from "@/lib/prisma";
import { bodyJsonResponse, enforceSameOriginPost } from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import { getTeachingUser, ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { publishTutoringWorkspaceSnapshot } from "@/lib/tutoring/sessionWorkspace";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!enforceSameOriginPost(req)) {
    return bodyJsonResponse({ error: "Forbidden" }, 403);
  }
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return bodyJsonResponse({ error: "Forbidden" }, 403);

  const { id } = await params;
  try {
    const limited = await rateLimit(`tutoring-publish:${teachingUser.id}:${id}`, {
      bucket: "tutoring-publish",
      limit: 20,
      window: "1 h",
    });
    if (!limited.ok) return bodyJsonResponse({ error: "Too many requests" }, 429);
  } catch {
    return bodyJsonResponse({ error: "Service unavailable" }, 503);
  }

  const session = await prisma.tutoringSession.findFirst({
    where: { id, ...ownedTeachingRecordWhere(teachingUser) },
    select: { id: true, status: true, moduleKeys: true },
  });
  if (!session) return bodyJsonResponse({ error: "Not found" }, 404);
  if (session.status === "archived") {
    return bodyJsonResponse({ error: "Archived sessions cannot be published" }, 409);
  }

  try {
    const meta = await prisma.$transaction(
      async (tx) => {
        const published = await publishTutoringWorkspaceSnapshot(tx, {
          sessionId: session.id,
          moduleKeys: session.moduleKeys,
          publishedByUserId: teachingUser.id,
        });
        await tx.tutoringSession.update({
          where: { id: session.id },
          data: {
            status: "shared",
            sharedAt: new Date(published.publishedAt ?? Date.now()),
          },
        });
        return published;
      },
      { isolationLevel: "Serializable" },
    );

    return bodyJsonResponse({ ok: true, meta });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "TUTORING_PUBLISHED_VERSION_LIMIT") {
      return bodyJsonResponse(
        { error: "This session has reached its published-version limit" },
        409,
      );
    }
    if (message === "TUTORING_PUBLISHED_STORAGE_LIMIT") {
      return bodyJsonResponse(
        { error: "This session has reached its published-workspace storage limit" },
        413,
      );
    }
    if (
      ["P2002", "P2034"].includes(
        String((error as { code?: unknown } | null)?.code ?? ""),
      )
    ) {
      return bodyJsonResponse(
        { error: "The workspace changed while publishing; try again" },
        409,
      );
    }
    console.error("[tutoring-publish] failed", { sessionId: id, error });
    return bodyJsonResponse({ error: "Could not publish the tutor workspace" }, 500);
  }
}
