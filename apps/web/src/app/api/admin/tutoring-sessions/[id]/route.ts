import { prisma } from "@/lib/prisma";
import {
  bodyJsonResponse,
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import { getTeachingUser, ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { updateTutoringSession } from "@/lib/tutoring/sessionAdminServer";
import { safeParseTutoringSessionUpdate } from "@/lib/validators/tutoringSession";

export const runtime = "nodejs";

async function enforceAdminMutationLimit(userId: string, sessionId: string) {
  try {
    return await rateLimit(`tutoring-admin-mutate:${userId}:${sessionId}`, {
      bucket: "tutoring-admin-mutate",
      limit: 60,
      window: "60 s",
    });
  } catch {
    return null;
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!enforceSameOriginPost(req)) return bodyJsonResponse({ error: "Forbidden" }, 403);
  if (exceedsContentLength(req, 64 * 1024)) {
    return bodyJsonResponse({ error: "Request body is too large" }, 413);
  }
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return bodyJsonResponse({ error: "Forbidden" }, 403);

  const { id } = await params;
  const limited = await enforceAdminMutationLimit(teachingUser.id, id);
  if (!limited) return bodyJsonResponse({ error: "Service unavailable" }, 503);
  if (!limited.ok) return bodyJsonResponse({ error: "Too many requests" }, 429);

  const parsed = safeParseTutoringSessionUpdate(await readJsonSafe(req));
  if (!parsed.success) {
    return bodyJsonResponse(
      { error: "Invalid payload", details: parsed.error.flatten() },
      400,
    );
  }

  const result = await updateTutoringSession(prisma, {
    teachingUser,
    sessionId: id,
    input: parsed.data,
  });
  if (!result.ok) return bodyJsonResponse(result, result.status);
  return bodyJsonResponse({
    session: result.session,
    pendingInvites: result.pendingInvites,
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!enforceSameOriginPost(req)) return bodyJsonResponse({ error: "Forbidden" }, 403);
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return bodyJsonResponse({ error: "Forbidden" }, 403);

  const { id } = await params;
  const limited = await enforceAdminMutationLimit(teachingUser.id, id);
  if (!limited) return bodyJsonResponse({ error: "Service unavailable" }, 503);
  if (!limited.ok) return bodyJsonResponse({ error: "Too many requests" }, 429);

  const existing = await prisma.tutoringSession.findFirst({
    where: { id, ...ownedTeachingRecordWhere(teachingUser) },
    select: { id: true },
  });
  if (!existing) return bodyJsonResponse({ error: "Not found" }, 404);

  await prisma.tutoringSession.delete({ where: { id } });
  return bodyJsonResponse({ ok: true });
}
