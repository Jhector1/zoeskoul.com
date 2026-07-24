import { prisma } from "@/lib/prisma";
import { bodyJsonResponse, enforceSameOriginPost, exceedsContentLength, readJsonSafe } from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import { getTeachingUser, ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { TutoringSessionInputSchema } from "@/lib/validators/tutoringSession";
import { createTutoringSession } from "@/lib/tutoring/sessionAdminServer";

export const runtime = "nodejs";

export async function GET() {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return bodyJsonResponse({ error: "Forbidden" }, 403);
  const sessions = await prisma.tutoringSession.findMany({
    where: ownedTeachingRecordWhere(teachingUser),
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      status: true,
      selectionScope: true,
      allowStudentEditing: true,
      createdAt: true,
      updatedAt: true,
      subject: { select: { id: true, slug: true, title: true, visibility: true } },
      _count: {
        select: {
          users: true,
          groups: true,
          documents: { where: { ownerKey: "shared", toolId: "board" } },
        },
      },
    },
  });
  return bodyJsonResponse({ sessions });
}

export async function POST(req: Request) {
  if (!enforceSameOriginPost(req)) return bodyJsonResponse({ error: "Forbidden" }, 403);
  if (exceedsContentLength(req, 64 * 1024)) {
    return bodyJsonResponse({ error: "Request body is too large" }, 413);
  }
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return bodyJsonResponse({ error: "Forbidden" }, 403);
  try {
    const limited = await rateLimit(`tutoring-admin-create:${teachingUser.id}`, {
      bucket: "tutoring-admin-create",
      limit: 20,
      window: "1 h",
    });
    if (!limited.ok) return bodyJsonResponse({ error: "Too many requests" }, 429);
  } catch {
    return bodyJsonResponse({ error: "Service unavailable" }, 503);
  }

  const parsed = TutoringSessionInputSchema.safeParse(await readJsonSafe(req));
  if (!parsed.success) {
    return bodyJsonResponse({ error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  try {
    const result = await createTutoringSession(prisma, { teachingUser, input: parsed.data });
    if (!result.ok) return bodyJsonResponse(result, result.status);
    return bodyJsonResponse({ session: result.session, pendingInvites: result.pendingInvites }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const expectedMessages = new Set([
      "The selected course has no published modules.",
      "The selected module was not found.",
      "The selected section or topic was not found in the published course.",
    ]);
    if (expectedMessages.has(message) || message.startsWith("Tutoring ")) {
      return bodyJsonResponse({ error: message }, 400);
    }
    console.error("[tutoring-admin] create failed", {
      ownerId: teachingUser.id,
      error,
    });
    return bodyJsonResponse({ error: "Could not create tutoring session." }, 500);
  }
}
