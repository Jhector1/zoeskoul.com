import {
  canonicalizeBoardBody,
  mergeBoardBodies,
} from "@/components/tools/board/merge";
import { prisma } from "@/lib/prisma";
import {
  bodyJsonResponse,
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  TUTORING_DOCUMENT_LIMITS,
  boardDocumentKey,
  isValidBoardCardKey,
  isValidModuleKey,
  utf8Bytes,
  validateBoardDocumentInput,
} from "@/lib/tutoring/sessionDocumentPolicy";
import { getTutoringRequestAccess } from "@/lib/tutoring/sessionRequestAccess";

export const runtime = "nodejs";

const OWNER_KEY = "shared";
const MAX_REQUEST_BYTES = TUTORING_DOCUMENT_LIMITS.maxBoardBytes * 2 + 64 * 1024;

function retryAfterResponse(resetMs: number) {
  const response = bodyJsonResponse({ error: "Too many requests" }, 429);
  response.headers.set(
    "Retry-After",
    String(Math.max(1, Math.ceil((resetMs - Date.now()) / 1000))),
  );
  return response;
}

async function enforceWriteRateLimit(userId: string, sessionId: string) {
  try {
    return await rateLimit(`tutoring-board:${userId}:${sessionId}`, {
      bucket: "tutoring-board-save",
      limit: 90,
      window: "60 s",
    });
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const allowed = await getTutoringRequestAccess(id);
  if (!allowed) return bodyJsonResponse({ error: "Forbidden" }, 403);

  const url = new URL(req.url);
  const moduleKey = url.searchParams.get("moduleKey")?.trim() ?? "";
  const cardKey = url.searchParams.get("cardKey")?.trim() ?? "";
  const toolId = url.searchParams.get("toolId")?.trim() ?? "";
  if (
    !isValidModuleKey(allowed.tutoringSession.moduleKeys, moduleKey) ||
    !isValidBoardCardKey(cardKey) ||
    toolId !== "board"
  ) {
    return bodyJsonResponse({ error: "Document not found" }, 404);
  }
  const scope = await prisma.tutoringSession.findFirst({
    where: {
      id,
      boardKeys: { has: boardDocumentKey(moduleKey, cardKey) },
    },
    select: { id: true },
  });
  if (!scope) return bodyJsonResponse({ error: "Document not found" }, 404);

  const document = await prisma.tutoringSessionDocument.findUnique({
    where: {
      tutoring_session_document: {
        sessionId: id,
        ownerKey: OWNER_KEY,
        moduleKey,
        cardKey,
        toolId,
      },
    },
    select: { body: true, updatedAt: true, revision: true },
  });

  const response = bodyJsonResponse({
    body: document?.body ?? "",
    updatedAt: document?.updatedAt ?? null,
    revision: document?.revision ?? 0,
    readOnly: !allowed.canEditSharedDocuments,
  });
  response.headers.set("ETag", `W/\"${document?.revision ?? 0}\"`);
  return response;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!enforceSameOriginPost(req)) {
    return bodyJsonResponse({ error: "Forbidden" }, 403);
  }
  if (exceedsContentLength(req, MAX_REQUEST_BYTES)) {
    return bodyJsonResponse({ error: "Request body is too large" }, 413);
  }

  const { id } = await params;
  const allowed = await getTutoringRequestAccess(id);
  if (!allowed) return bodyJsonResponse({ error: "Forbidden" }, 403);
  if (!allowed.canEditSharedDocuments) {
    return bodyJsonResponse({ error: "Read only" }, 403);
  }

  const limited = await enforceWriteRateLimit(allowed.userId, id);
  if (!limited) return bodyJsonResponse({ error: "Service unavailable" }, 503);
  if (!limited.ok) return retryAfterResponse(limited.resetMs);

  const payload = await readJsonSafe(req);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return bodyJsonResponse({ error: "Invalid document" }, 400);
  }

  const raw = payload as Record<string, unknown>;
  const moduleKey = String(raw.moduleKey ?? "").trim();
  const cardKey = String(raw.cardKey ?? "").trim();
  const toolId = String(raw.toolId ?? "").trim();
  const body = typeof raw.body === "string" ? raw.body : "";
  const baseBody = typeof raw.baseBody === "string" ? raw.baseBody : "";
  const expectedRevision = Number(raw.expectedRevision ?? 0);
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return bodyJsonResponse({ error: "Invalid document revision" }, 400);
  }
  if (!isValidModuleKey(allowed.tutoringSession.moduleKeys, moduleKey)) {
    return bodyJsonResponse({ error: "Module not found" }, 404);
  }
  if (!isValidBoardCardKey(cardKey) || toolId !== "board") {
    return bodyJsonResponse({ error: "Invalid document key" }, 400);
  }
  if (utf8Bytes(baseBody) > TUTORING_DOCUMENT_LIMITS.maxBoardBytes) {
    return bodyJsonResponse({ error: "Invalid base document" }, 413);
  }

  const canonicalBody = canonicalizeBoardBody(body);
  if (canonicalBody == null) {
    return bodyJsonResponse({ error: "Invalid board document" }, 400);
  }
  const scope = await prisma.tutoringSession.findFirst({
    where: {
      id,
      boardKeys: { has: boardDocumentKey(moduleKey, cardKey) },
    },
    select: { id: true },
  });

  const validated = validateBoardDocumentInput({
    moduleKeys: allowed.tutoringSession.moduleKeys,
    scopeAllowed: Boolean(scope),
    moduleKey,
    cardKey,
    toolId,
    body: canonicalBody,
  });
  if (!validated.ok) {
    return bodyJsonResponse({ error: validated.error }, validated.status);
  }

  try {
    const saved = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.tutoringSessionDocument.findUnique({
          where: {
            tutoring_session_document: {
              sessionId: id,
              ownerKey: OWNER_KEY,
              moduleKey,
              cardKey,
              toolId,
            },
          },
          select: { id: true, body: true, byteSize: true, revision: true },
        });

        let nextBody = canonicalBody;
        if (existing && expectedRevision !== existing.revision) {
          nextBody = mergeBoardBodies({
            baseBody,
            incomingBody: canonicalBody,
            currentBody: existing.body,
          });
        } else if (!existing && expectedRevision !== 0) {
          throw new Error("TUTORING_DOCUMENT_CONFLICT");
        }

        const nextBytes = utf8Bytes(nextBody);
        if (nextBytes > TUTORING_DOCUMENT_LIMITS.maxBoardBytes) {
          throw new Error("TUTORING_DOCUMENT_TOO_LARGE");
        }

        const aggregate = await tx.tutoringSessionDocument.aggregate({
          where: { sessionId: id, ownerKey: OWNER_KEY, toolId: "board" },
          _count: { _all: true },
          _sum: { byteSize: true },
        });
        const currentCount = aggregate._count._all;
        const currentBytes = aggregate._sum.byteSize ?? 0;
        const nextTotalBytes = currentBytes - (existing?.byteSize ?? 0) + nextBytes;

        if (
          (!existing &&
            currentCount >= TUTORING_DOCUMENT_LIMITS.maxSharedBoardDocuments) ||
          nextTotalBytes > TUTORING_DOCUMENT_LIMITS.maxSharedBoardBytes
        ) {
          throw new Error("TUTORING_DOCUMENT_QUOTA");
        }

        if (!existing) {
          return tx.tutoringSessionDocument.create({
            data: {
              sessionId: id,
              ownerKey: OWNER_KEY,
              moduleKey,
              cardKey,
              toolId,
              format: "plain",
              body: nextBody,
              byteSize: nextBytes,
              updatedByUserId: allowed.userId,
            },
            select: { body: true, updatedAt: true, revision: true },
          });
        }

        const updated = await tx.tutoringSessionDocument.updateMany({
          where: { id: existing.id, revision: existing.revision },
          data: {
            body: nextBody,
            byteSize: nextBytes,
            format: "plain",
            revision: { increment: 1 },
            updatedByUserId: allowed.userId,
          },
        });
        if (updated.count !== 1) throw new Error("TUTORING_DOCUMENT_CONFLICT");

        return tx.tutoringSessionDocument.findUniqueOrThrow({
          where: { id: existing.id },
          select: { body: true, updatedAt: true, revision: true },
        });
      },
      { isolationLevel: "Serializable" },
    );

    return bodyJsonResponse({
      body: saved.body,
      updatedAt: saved.updatedAt,
      revision: saved.revision,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (
      message === "TUTORING_DOCUMENT_CONFLICT" ||
      ["P2002", "P2034"].includes(
        String((error as { code?: unknown } | null)?.code ?? ""),
      )
    ) {
      return bodyJsonResponse({ error: "Document changed; retry the save" }, 409);
    }
    if (message === "TUTORING_DOCUMENT_TOO_LARGE") {
      return bodyJsonResponse({ error: "Board document is too large" }, 413);
    }
    if (message === "TUTORING_DOCUMENT_QUOTA") {
      return bodyJsonResponse({ error: "Session board storage limit reached" }, 413);
    }
    console.error("[tutoring-board] save failed", { sessionId: id, error });
    return bodyJsonResponse({ error: "Could not save board" }, 500);
  }
}
