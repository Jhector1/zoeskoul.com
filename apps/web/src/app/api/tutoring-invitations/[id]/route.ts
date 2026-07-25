import { z } from "zod";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  bodyJsonResponse,
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  acceptTutoringSessionInviteById,
  declineTutoringSessionInviteById,
} from "@/lib/tutoring/sessionInvites";

export const runtime = "nodejs";

const ResponseSchema = z.object({ action: z.enum(["accept", "decline"]) });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!enforceSameOriginPost(req)) return bodyJsonResponse({ error: "Forbidden" }, 403);
  if (exceedsContentLength(req, 8 * 1024)) {
    return bodyJsonResponse({ error: "Request body is too large" }, 413);
  }
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return bodyJsonResponse({ error: "Sign in required" }, 401);

  const parsed = ResponseSchema.safeParse(await readJsonSafe(req));
  if (!parsed.success) return bodyJsonResponse({ error: "Invalid response" }, 400);
  const { id } = await params;
  try {
    const limited = await rateLimit(`tutoring-invite-response:${userId}:${id}`, {
      bucket: "tutoring-invite-response",
      limit: 20,
      window: "1 h",
    });
    if (!limited.ok) return bodyJsonResponse({ error: "Too many requests" }, 429);
  } catch {
    return bodyJsonResponse({ error: "Service unavailable" }, 503);
  }

  const args = {
    inviteId: id,
    userId,
    userEmail: session?.user?.email,
  };
  const result =
    parsed.data.action === "accept"
      ? await acceptTutoringSessionInviteById(prisma, args)
      : await declineTutoringSessionInviteById(prisma, args);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "email_mismatch" ? 403 : 409;
    const error =
      result.reason === "session_unavailable"
        ? "The tutor has not opened this session yet."
        : result.reason === "email_mismatch"
          ? "Use the ZoeSkoul account that received this invitation."
          : "This invitation is no longer available.";
    return bodyJsonResponse({ error, reason: result.reason }, status);
  }

  return bodyJsonResponse({
    ok: true,
    action: parsed.data.action,
    sessionId: result.session.id,
  });
}
