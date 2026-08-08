import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import { bodyJsonResponse } from "@/lib/practice/api/shared/http";
import { getTutoringRequestAccess } from "./sessionRequestAccess";
import { parseTutoringSnapshot } from "./sessionSnapshot";
import { resolveTutoringSnapshotContentScope } from "./sessionContentAccessCore";
import { TUTORING_SESSION_HEADER } from "@zoeskoul/learning-contracts/tutoring/contentRequestProtocol";

export type TutoringContentAccessResult =
  | { kind: "none" }
  | {
      kind: "allowed";
      sessionId: string;
      sourceModuleSlug: string;
      sessionModuleSlug: string;
    }
  | { kind: "denied"; res: Response };

function readTutoringSessionId(req: Request) {
  return String(req.headers.get(TUTORING_SESSION_HEADER) ?? "").trim();
}

/**
 * Authorize exercise-definition requests made from a tutoring session.
 *
 * This deliberately does not grant normal course enrollment. It grants access
 * only when the authenticated viewer can open the session and the requested
 * subject/module is present in that session's frozen snapshot.
 */
export async function resolveTutoringContentAccess(args: {
  prisma: PrismaClient;
  req: Request;
  actor: Actor;
  subjectSlug?: string | null;
  moduleSlug?: string | null;
}): Promise<TutoringContentAccessResult> {
  const sessionId = readTutoringSessionId(args.req);
  if (!sessionId) return { kind: "none" };

  const subjectSlug = String(args.subjectSlug ?? "").trim();
  const moduleSlug = String(args.moduleSlug ?? "").trim();
  if (!args.actor.userId) {
    return {
      kind: "denied",
      res: bodyJsonResponse(
        {
          message: "Sign in to open this tutoring session.",
          code: "TUTORING_AUTH_REQUIRED",
        },
        401,
      ),
    };
  }
  if (!subjectSlug || !moduleSlug) {
    return {
      kind: "denied",
      res: bodyJsonResponse(
        {
          message: "The tutoring content request is missing its subject or module.",
          code: "TUTORING_SCOPE_REQUIRED",
        },
        400,
      ),
    };
  }

  const access = await getTutoringRequestAccess(sessionId);
  if (!access || access.userId !== args.actor.userId) {
    return {
      kind: "denied",
      res: bodyJsonResponse(
        {
          message: "You do not have access to this tutoring session.",
          code: "TUTORING_SESSION_FORBIDDEN",
        },
        403,
      ),
    };
  }

  const stored = await args.prisma.tutoringSession.findUnique({
    where: { id: sessionId },
    select: { snapshot: true },
  });
  const snapshot = parseTutoringSnapshot(stored?.snapshot);
  if (!snapshot) {
    return {
      kind: "denied",
      res: bodyJsonResponse(
        {
          message: "The tutoring session content snapshot is unavailable.",
          code: "TUTORING_SNAPSHOT_UNAVAILABLE",
        },
        409,
      ),
    };
  }

  const scope = resolveTutoringSnapshotContentScope({
    snapshot,
    subjectSlug,
    moduleSlug,
  });
  if (!scope.ok) {
    return {
      kind: "denied",
      res: bodyJsonResponse(
        {
          message: "This subject or module is not included in the tutoring session.",
          code: "TUTORING_CONTENT_OUT_OF_SCOPE",
        },
        403,
      ),
    };
  }

  return {
    kind: "allowed",
    sessionId,
    sourceModuleSlug: scope.sourceModuleSlug,
    sessionModuleSlug: scope.sessionModuleSlug,
  };
}
