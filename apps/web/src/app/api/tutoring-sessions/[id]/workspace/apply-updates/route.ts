import { mergeBoardBodies } from "@/components/tools/board/merge";
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
  isValidModuleKey,
  participantOwnerKey,
  utf8Bytes,
} from "@/lib/tutoring/sessionDocumentPolicy";
import { getTutoringRequestAccess } from "@/lib/tutoring/sessionRequestAccess";
import {
  TUTORING_BOARD_TOOL_ID,
  TUTORING_PROGRESS_CARD_KEY,
  TUTORING_PROGRESS_TOOL_ID,
  getTutoringWorkspaceMeta,
  tutoringReferenceOwnerKey,
} from "@/lib/tutoring/sessionWorkspace";
import {
  getTutoringBaselineVersion,
  mergeTutoringSnapshotValue,
  withTutoringBaseline,
} from "@/lib/tutoring/sessionWorkspaceMerge";

export const runtime = "nodejs";

function parseObject(body: string | null | undefined) {
  if (!body) return { topics: {} } as Record<string, unknown>;
  try {
    const value = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : ({ topics: {} } as Record<string, unknown>);
  } catch {
    return { topics: {} } as Record<string, unknown>;
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!enforceSameOriginPost(req)) {
    return bodyJsonResponse({ error: "Forbidden" }, 403);
  }
  if (exceedsContentLength(req, 16 * 1024)) {
    return bodyJsonResponse({ error: "Request body is too large" }, 413);
  }

  const { id } = await params;
  const allowed = await getTutoringRequestAccess(id);
  if (!allowed || !allowed.canEditOwnProgress) {
    return bodyJsonResponse({ error: "Forbidden" }, 403);
  }
  if (allowed.tutoringSession.status !== "shared") {
    return bodyJsonResponse(
      { error: "Tutor updates can be applied after the session is shared" },
      409,
    );
  }

  const payload = await readJsonSafe(req);
  const moduleKey = String(
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).moduleKey ?? ""
      : "",
  ).trim();
  if (!isValidModuleKey(allowed.tutoringSession.moduleKeys, moduleKey)) {
    return bodyJsonResponse({ error: "Module not found" }, 404);
  }

  try {
    const limited = await rateLimit(`tutoring-apply-update:${allowed.userId}:${id}`, {
      bucket: "tutoring-apply-update",
      limit: 30,
      window: "1 h",
    });
    if (!limited.ok) return bodyJsonResponse({ error: "Too many requests" }, 429);
  } catch {
    return bodyJsonResponse({ error: "Service unavailable" }, 503);
  }

  const meta = await getTutoringWorkspaceMeta(prisma, {
    sessionId: id,
    moduleKeys: allowed.tutoringSession.moduleKeys,
  });
  if (meta.publishedVersion <= 0) {
    return bodyJsonResponse({ error: "No published tutor snapshot is available" }, 409);
  }

  const ownerKey = participantOwnerKey(allowed.userId);
  const latestReferenceOwner = tutoringReferenceOwnerKey(meta.publishedVersion);

  const result = await prisma.$transaction(
    async (tx) => {
      const personalProgress = await tx.tutoringSessionDocument.findUnique({
        where: {
          tutoring_session_document: {
            sessionId: id,
            ownerKey,
            moduleKey,
            cardKey: TUTORING_PROGRESS_CARD_KEY,
            toolId: TUTORING_PROGRESS_TOOL_ID,
          },
        },
        select: { id: true, body: true, revision: true },
      });
      const latestReference = await tx.tutoringSessionDocument.findUnique({
        where: {
          tutoring_session_document: {
            sessionId: id,
            ownerKey: latestReferenceOwner,
            moduleKey,
            cardKey: TUTORING_PROGRESS_CARD_KEY,
            toolId: TUTORING_PROGRESS_TOOL_ID,
          },
        },
        select: { body: true },
      });

      const personalState = parseObject(personalProgress?.body);
      const baselineVersion = getTutoringBaselineVersion(personalState);
      const previousReference =
        baselineVersion > 0
          ? await tx.tutoringSessionDocument.findUnique({
              where: {
                tutoring_session_document: {
                  sessionId: id,
                  ownerKey: tutoringReferenceOwnerKey(baselineVersion),
                  moduleKey,
                  cardKey: TUTORING_PROGRESS_CARD_KEY,
                  toolId: TUTORING_PROGRESS_TOOL_ID,
                },
              },
              select: { body: true },
            })
          : null;

      const baseState = parseObject(previousReference?.body);
      const incomingState = parseObject(latestReference?.body);
      const currentState = personalProgress ? personalState : baseState;
      const mergedState = withTutoringBaseline(
        mergeTutoringSnapshotValue(baseState, incomingState, currentState) as Record<
          string,
          unknown
        >,
        meta.publishedVersion,
      );
      const serializedProgress = JSON.stringify(mergedState);
      const progressBytes = utf8Bytes(serializedProgress);
      if (progressBytes > TUTORING_DOCUMENT_LIMITS.maxProgressBytes) {
        throw new Error("TUTORING_PROGRESS_TOO_LARGE");
      }

      await tx.tutoringSessionDocument.upsert({
        where: {
          tutoring_session_document: {
            sessionId: id,
            ownerKey,
            moduleKey,
            cardKey: TUTORING_PROGRESS_CARD_KEY,
            toolId: TUTORING_PROGRESS_TOOL_ID,
          },
        },
        create: {
          sessionId: id,
          ownerKey,
          moduleKey,
          cardKey: TUTORING_PROGRESS_CARD_KEY,
          toolId: TUTORING_PROGRESS_TOOL_ID,
          format: "plain",
          body: serializedProgress,
          byteSize: progressBytes,
          updatedByUserId: allowed.userId,
        },
        update: {
          body: serializedProgress,
          byteSize: progressBytes,
          revision: { increment: 1 },
          updatedByUserId: allowed.userId,
        },
      });

      const latestBoards = await tx.tutoringSessionDocument.findMany({
        where: {
          sessionId: id,
          ownerKey: latestReferenceOwner,
          moduleKey,
          toolId: TUTORING_BOARD_TOOL_ID,
        },
        select: { cardKey: true, body: true },
      });
      let mergedBoards = 0;
      for (const latestBoard of latestBoards) {
        const [personalBoard, previousBoard] = await Promise.all([
          tx.tutoringSessionDocument.findUnique({
            where: {
              tutoring_session_document: {
                sessionId: id,
                ownerKey,
                moduleKey,
                cardKey: latestBoard.cardKey,
                toolId: TUTORING_BOARD_TOOL_ID,
              },
            },
            select: { body: true },
          }),
          baselineVersion > 0
            ? tx.tutoringSessionDocument.findUnique({
                where: {
                  tutoring_session_document: {
                    sessionId: id,
                    ownerKey: tutoringReferenceOwnerKey(baselineVersion),
                    moduleKey,
                    cardKey: latestBoard.cardKey,
                    toolId: TUTORING_BOARD_TOOL_ID,
                  },
                },
                select: { body: true },
              })
            : Promise.resolve(null),
        ]);

        const mergedBody = personalBoard
          ? mergeBoardBodies({
              baseBody: previousBoard?.body ?? "",
              incomingBody: personalBoard.body,
              currentBody: latestBoard.body,
            })
          : latestBoard.body;
        const boardBytes = utf8Bytes(mergedBody);
        if (boardBytes > TUTORING_DOCUMENT_LIMITS.maxBoardBytes) {
          throw new Error("TUTORING_BOARD_TOO_LARGE");
        }
        await tx.tutoringSessionDocument.upsert({
          where: {
            tutoring_session_document: {
              sessionId: id,
              ownerKey,
              moduleKey,
              cardKey: latestBoard.cardKey,
              toolId: TUTORING_BOARD_TOOL_ID,
            },
          },
          create: {
            sessionId: id,
            ownerKey,
            moduleKey,
            cardKey: latestBoard.cardKey,
            toolId: TUTORING_BOARD_TOOL_ID,
            format: "plain",
            body: mergedBody,
            byteSize: boardBytes,
            updatedByUserId: allowed.userId,
          },
          update: {
            body: mergedBody,
            byteSize: boardBytes,
            revision: { increment: 1 },
            updatedByUserId: allowed.userId,
          },
        });
        mergedBoards += 1;
      }

      return { mergedState, mergedBoards };
    },
    { isolationLevel: "Serializable" },
  ).catch((error) => {
    const message = error instanceof Error ? error.message : "";
    if (message === "TUTORING_PROGRESS_TOO_LARGE") {
      return { error: "Progress document is too large", status: 413 } as const;
    }
    if (message === "TUTORING_BOARD_TOO_LARGE") {
      return { error: "Board document is too large", status: 413 } as const;
    }
    throw error;
  });

  if ("error" in result) {
    return bodyJsonResponse({ error: result.error }, result.status);
  }

  return bodyJsonResponse({
    ok: true,
    state: result.mergedState,
    mergedBoards: result.mergedBoards,
    publishedVersion: meta.publishedVersion,
  });
}
