import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTutoringRequestAccess } from "@/lib/tutoring/sessionRequestAccess";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const allowed = await getTutoringRequestAccess(id);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(req.url);
  const moduleKey = url.searchParams.get("moduleKey") ?? "";
  const cardKey = url.searchParams.get("cardKey") ?? "";
  const toolId = url.searchParams.get("toolId") ?? "";
  const document = await prisma.tutoringSessionDocument.findUnique({
    where: {
      tutoring_session_document: { sessionId: id, moduleKey, cardKey, toolId },
    },
  });
  return NextResponse.json({
    body: document?.body ?? "",
    updatedAt: document?.updatedAt ?? null,
    revision: document?.revision ?? 0,
    readOnly: !allowed.canEdit,
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const allowed = await getTutoringRequestAccess(id);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!allowed.canEdit) {
    return NextResponse.json({ error: "Read only" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body.body !== "string" || body.body.length > 2_000_000) {
    return NextResponse.json({ error: "Invalid document" }, { status: 400 });
  }
  const moduleKey = String(body.moduleKey ?? "");
  const cardKey = String(body.cardKey ?? "");
  const toolId = String(body.toolId ?? "");
  if (!moduleKey || !cardKey || !toolId) {
    return NextResponse.json({ error: "Missing document key" }, { status: 400 });
  }
  const document = await prisma.tutoringSessionDocument.upsert({
    where: {
      tutoring_session_document: { sessionId: id, moduleKey, cardKey, toolId },
    },
    create: {
      sessionId: id,
      moduleKey,
      cardKey,
      toolId,
      format: body.format === "plain" ? "plain" : "markdown",
      body: body.body,
    },
    update: {
      body: body.body,
      format: body.format === "plain" ? "plain" : "markdown",
      revision: { increment: 1 },
    },
  });
  return NextResponse.json({
    updatedAt: document.updatedAt,
    revision: document.revision,
  });
}
