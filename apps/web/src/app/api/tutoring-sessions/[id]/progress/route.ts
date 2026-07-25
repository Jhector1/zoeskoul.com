import { prisma } from "@/lib/prisma";
import {
  bodyJsonResponse,
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import {
  REVIEW_PROGRESS_LIMITS,
  ReviewProgressWriteSchema,
} from "@/lib/review/api/progress/schemas";
import {
  getReviewProgressSaveRevision,
  mergeReviewProgressForSave,
} from "@/lib/review/api/progress/mergeProgressForSave";
import type { ReviewProgressState } from "@/lib/review/progressTypes";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  TUTORING_DOCUMENT_LIMITS,
  isValidModuleKey,
  utf8Bytes,
} from "@/lib/tutoring/sessionDocumentPolicy";
import { getTutoringRequestAccess } from "@/lib/tutoring/sessionRequestAccess";
import {
  TUTORING_PROGRESS_CARD_KEY,
  TUTORING_PROGRESS_TOOL_ID,
} from "@/lib/tutoring/sessionWorkspace";
import { withTutoringBaseline } from "@/lib/tutoring/sessionWorkspaceMerge";
import { resolveTutoringRequestWorkspace } from "@/lib/tutoring/sessionWorkspaceRequest";

export const runtime = "nodejs";

function emptyProgress(): ReviewProgressState {
  return { topics: {} };
}

function parseStoredProgress(body: string | null | undefined): ReviewProgressState {
  if (!body) return emptyProgress();
  try {
    const value = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as ReviewProgressState)
      : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

async function enforceWriteRateLimit(userId: string, sessionId: string) {
  try {
    return await rateLimit(`tutoring-progress:${userId}:${sessionId}`, {
      bucket: "tutoring-progress-save",
      limit: 120,
      window: "60 s",
    });
  } catch {
    return null;
  }
}

function retryAfterResponse(resetMs: number) {
  const response = bodyJsonResponse({ error: "Too many requests" }, 429);
  response.headers.set(
    "Retry-After",
    String(Math.max(1, Math.ceil((resetMs - Date.now()) / 1000))),
  );
  return response;
}

async function findProgressDocument(args: {
  sessionId: string;
  ownerKey: string;
  moduleKey: string;
}) {
  return prisma.tutoringSessionDocument.findUnique({
    where: {
      tutoring_session_document: {
        sessionId: args.sessionId,
        ownerKey: args.ownerKey,
        moduleKey: args.moduleKey,
        cardKey: TUTORING_PROGRESS_CARD_KEY,
        toolId: TUTORING_PROGRESS_TOOL_ID,
      },
    },
    select: { body: true, updatedAt: true, revision: true },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const allowed = await getTutoringRequestAccess(id);
  if (!allowed) return bodyJsonResponse({ error: "Forbidden" }, 403);

  const url = new URL(req.url);
  const moduleSlug = url.searchParams.get("moduleSlug")?.trim() ?? "";
  if (!isValidModuleKey(allowed.tutoringSession.moduleKeys, moduleSlug)) {
    return bodyJsonResponse({ error: "Module not found" }, 404);
  }

  const { resolved, meta } = await resolveTutoringRequestWorkspace({
    request: req,
    access: allowed,
  });
  if (!resolved) return bodyJsonResponse({ error: "Forbidden" }, 403);

  const direct = await findProgressDocument({
    sessionId: id,
    ownerKey: resolved.ownerKey,
    moduleKey: moduleSlug,
  });
  const fallback =
    !direct && resolved.sourceOwnerKey
      ? await findProgressDocument({
          sessionId: id,
          ownerKey: resolved.sourceOwnerKey,
          moduleKey: moduleSlug,
        })
      : null;
  const source = direct ?? fallback;
  let progress = parseStoredProgress(source?.body);
  if (!direct && resolved.view === "mine") {
    progress = withTutoringBaseline(progress, resolved.baselineVersion);
  }

  return bodyJsonResponse({
    progress,
    updatedAt: source?.updatedAt ?? null,
    revision: source?.revision ?? 0,
    readOnly: resolved.readOnly,
    workspaceView: resolved.view,
    publishedVersion: meta.publishedVersion,
    baselineVersion: resolved.baselineVersion,
    derivedFromTutorWorkspace: !direct && Boolean(fallback),
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!enforceSameOriginPost(req)) {
    return bodyJsonResponse({ error: "Forbidden" }, 403);
  }
  if (exceedsContentLength(req, REVIEW_PROGRESS_LIMITS.maxPayloadBytes)) {
    return bodyJsonResponse({ error: "Progress payload is too large" }, 413);
  }

  const { id } = await params;
  const allowed = await getTutoringRequestAccess(id);
  if (!allowed) return bodyJsonResponse({ error: "Forbidden" }, 403);

  const payload = await readJsonSafe(req);
  const parsed = ReviewProgressWriteSchema.safeParse(payload);
  if (!parsed.success) {
    return bodyJsonResponse(
      { error: "Invalid progress payload", issues: parsed.error.issues },
      400,
    );
  }

  const payloadRecord =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const { resolved, meta } = await resolveTutoringRequestWorkspace({
    request: req,
    access: allowed,
    payload: payloadRecord,
  });
  if (!resolved) return bodyJsonResponse({ error: "Forbidden" }, 403);
  if (resolved.readOnly || resolved.view === "reference" || resolved.view === "learner") {
    return bodyJsonResponse({ error: "Read only" }, 403);
  }

  const limited = await enforceWriteRateLimit(allowed.userId, id);
  if (!limited) return bodyJsonResponse({ error: "Service unavailable" }, 503);
  if (!limited.ok) return retryAfterResponse(limited.resetMs);

  const moduleSlug = parsed.data.moduleRef;
  if (!isValidModuleKey(allowed.tutoringSession.moduleKeys, moduleSlug)) {
    return bodyJsonResponse({ error: "Module not found" }, 404);
  }

  let state = parsed.data.state as ReviewProgressState;
  if (resolved.view === "mine") {
    state = withTutoringBaseline(state, meta.publishedVersion);
  }
  const ownerKey = resolved.ownerKey;

  try {
    const saved = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.tutoringSessionDocument.findUnique({
          where: {
            tutoring_session_document: {
              sessionId: id,
              ownerKey,
              moduleKey: moduleSlug,
              cardKey: TUTORING_PROGRESS_CARD_KEY,
              toolId: TUTORING_PROGRESS_TOOL_ID,
            },
          },
          select: { id: true, body: true, byteSize: true, revision: true },
        });

        const previousState = parseStoredProgress(existing?.body);
        const incomingRevision = getReviewProgressSaveRevision(state);
        const existingSaveRevision = getReviewProgressSaveRevision(previousState);
        if (existing && incomingRevision < existingSaveRevision) {
          throw new Error("TUTORING_PROGRESS_STALE");
        }

        const nextSaveRevision = Math.max(
          existingSaveRevision + 1,
          incomingRevision,
          Date.now(),
        );
        const stateToPersist = mergeReviewProgressForSave({
          previousState,
          incomingState: state,
          saveRevision: nextSaveRevision,
        });
        const serialized = JSON.stringify(stateToPersist);
        const byteSize = utf8Bytes(serialized);
        if (byteSize > TUTORING_DOCUMENT_LIMITS.maxProgressBytes) {
          throw new Error("TUTORING_PROGRESS_TOO_LARGE");
        }

        const aggregate = await tx.tutoringSessionDocument.aggregate({
          where: { sessionId: id, ownerKey, toolId: TUTORING_PROGRESS_TOOL_ID },
          _count: { _all: true },
          _sum: { byteSize: true },
        });
        const nextTotalBytes =
          (aggregate._sum.byteSize ?? 0) - (existing?.byteSize ?? 0) + byteSize;
        if (
          (!existing &&
            aggregate._count._all >=
              TUTORING_DOCUMENT_LIMITS.maxParticipantProgressDocuments) ||
          nextTotalBytes > TUTORING_DOCUMENT_LIMITS.maxParticipantProgressBytes
        ) {
          throw new Error("TUTORING_PROGRESS_QUOTA");
        }

        if (!existing) {
          const document = await tx.tutoringSessionDocument.create({
            data: {
              sessionId: id,
              ownerKey,
              moduleKey: moduleSlug,
              cardKey: TUTORING_PROGRESS_CARD_KEY,
              toolId: TUTORING_PROGRESS_TOOL_ID,
              format: "plain",
              body: serialized,
              byteSize,
              updatedByUserId: allowed.userId,
            },
            select: { updatedAt: true, revision: true },
          });
          return { ...document, state: stateToPersist };
        }

        const updated = await tx.tutoringSessionDocument.updateMany({
          where: { id: existing.id, revision: existing.revision },
          data: {
            body: serialized,
            byteSize,
            revision: { increment: 1 },
            updatedByUserId: allowed.userId,
          },
        });
        if (updated.count !== 1) throw new Error("TUTORING_PROGRESS_CONFLICT");

        const document = await tx.tutoringSessionDocument.findUniqueOrThrow({
          where: { id: existing.id },
          select: { updatedAt: true, revision: true },
        });
        return { ...document, state: stateToPersist };
      },
      { isolationLevel: "Serializable" },
    );

    return bodyJsonResponse({
      state: saved.state,
      updatedAt: saved.updatedAt,
      revision: saved.revision,
      workspaceView: resolved.view,
      publishedVersion: meta.publishedVersion,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message === "TUTORING_PROGRESS_STALE" ||
      message === "TUTORING_PROGRESS_CONFLICT" ||
      ["P2002", "P2034"].includes(
        String((error as { code?: unknown } | null)?.code ?? ""),
      )
    ) {
      return bodyJsonResponse({ error: "Progress changed; retry the save" }, 409);
    }
    if (message === "TUTORING_PROGRESS_TOO_LARGE") {
      return bodyJsonResponse({ error: "Progress document is too large" }, 413);
    }
    if (message === "TUTORING_PROGRESS_QUOTA") {
      return bodyJsonResponse(
        { error: "Participant progress storage limit reached" },
        413,
      );
    }
    console.error("[tutoring-progress] save failed", { sessionId: id, error });
    return bodyJsonResponse({ error: "Could not save progress" }, 500);
  }
}
