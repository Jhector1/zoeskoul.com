import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { AssignmentCreateSchema } from "@/lib/validators/assignment";

export async function POST(req: Request) {
  await requireAdmin(req);

  const body = await req.json().catch(() => null);
  const parsed = AssignmentCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Join-table inputs are API fields, not scalar Assignment columns.
  const { topicIds, topics, ...rest } = parsed.data as any;
  const topicRows: Array<{ topicId: string; order: number }> = Array.isArray(topics)
    ? topics.map((row: any, index: number) => ({
        topicId: String(row.topicId),
        order: Number.isFinite(row.order) ? row.order : index,
      }))
    : Array.isArray(topicIds)
      ? topicIds.map((topicId: string, index: number) => ({ topicId, order: index }))
      : [];

  const created = await prisma.assignment.create({
    data: {
      ...rest,
      description: rest.description ?? null,
      topics: topicRows.length
        ? { createMany: { data: topicRows } }
        : undefined,
    },
    include: {
      section: { select: { id: true, title: true, slug: true } },
      topics: { orderBy: { order: "asc" }, include: { topic: true } },
      _count: { select: { sessions: true } },
    },
  });

  return NextResponse.json({
    assignment: {
      ...created,
      topicIds: created.topics.map((t) => t.topicId),
    },
  });
}
