import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import type { ReviewProgressState } from "@/lib/review/progressTypes";
import { getTutoringRequestAccess } from "@/lib/tutoring/sessionRequestAccess";
import type { TutoringSnapshot } from "@/lib/tutoring/sessionSnapshot";

export const runtime = "nodejs";

const PROGRESS_CARD_KEY = "review-progress";
const PROGRESS_TOOL_ID = "progress";
const MAX_PROGRESS_BYTES = 2_000_000;

function emptyProgress(): ReviewProgressState {
  return {
    topics: {},
    quizVersion: 0,
    moduleCompleted: false,
    moduleCompletedAt: undefined,
  };
}

function moduleBelongsToSession(snapshot: unknown, moduleSlug: string) {
  const typed = snapshot as TutoringSnapshot | null;
  return Boolean(
    typed?.modules?.some((item) => item.sessionModuleSlug === moduleSlug),
  );
}

function parseStoredProgress(body: string | null | undefined): ReviewProgressState {
  if (!body) return emptyProgress();

  try {
    const parsed = JSON.parse(body) as ReviewProgressState;
    return parsed && typeof parsed === "object" ? parsed : emptyProgress();
  } catch {
    return emptyProgress();
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const allowed = await getTutoringRequestAccess(id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const moduleSlug = url.searchParams.get("moduleSlug")?.trim() ?? "";
  if (
    !moduleSlug ||
    !moduleBelongsToSession(allowed.tutoringSession.snapshot, moduleSlug)
  ) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  const document = await prisma.tutoringSessionDocument.findUnique({
    where: {
      tutoring_session_document: {
        sessionId: id,
        moduleKey: moduleSlug,
        cardKey: PROGRESS_CARD_KEY,
        toolId: PROGRESS_TOOL_ID,
      },
    },
  });

  return NextResponse.json({
    progress: parseStoredProgress(document?.body),
    updatedAt: document?.updatedAt ?? null,
    revision: document?.revision ?? 0,
    readOnly: !allowed.canEdit,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const allowed = await getTutoringRequestAccess(id);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!allowed.canEdit) {
    return NextResponse.json({ error: "Read only" }, { status: 403 });
  }

  const payload = await req.json().catch(() => null);
  const moduleSlug = String(payload?.moduleSlug ?? "").trim();
  const state = payload?.state;
  if (
    !moduleSlug ||
    !state ||
    typeof state !== "object" ||
    Array.isArray(state) ||
    !moduleBelongsToSession(allowed.tutoringSession.snapshot, moduleSlug)
  ) {
    return NextResponse.json({ error: "Invalid progress payload" }, { status: 400 });
  }

  const serialized = JSON.stringify(state);
  if (Buffer.byteLength(serialized, "utf8") > MAX_PROGRESS_BYTES) {
    return NextResponse.json({ error: "Progress document is too large" }, { status: 413 });
  }

  const document = await prisma.tutoringSessionDocument.upsert({
    where: {
      tutoring_session_document: {
        sessionId: id,
        moduleKey: moduleSlug,
        cardKey: PROGRESS_CARD_KEY,
        toolId: PROGRESS_TOOL_ID,
      },
    },
    create: {
      sessionId: id,
      moduleKey: moduleSlug,
      cardKey: PROGRESS_CARD_KEY,
      toolId: PROGRESS_TOOL_ID,
      format: "plain",
      body: serialized,
    },
    update: {
      body: serialized,
      format: "plain",
      revision: { increment: 1 },
    },
  });

  return NextResponse.json({
    state,
    updatedAt: document.updatedAt,
    revision: document.revision,
  });
}
