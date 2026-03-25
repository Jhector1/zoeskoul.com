import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { AssignmentPatchSchema } from "@/lib/validators/assignment";

type Ctx = { params: Promise<{ id: string }> };

function serializeAssignment(a: any) {
  return {
    ...a,
    // flatten for UI convenience
    topicIds: (a.topics ?? []).map((t: any) => t.topicId),
    topics: (a.topics ?? []).map((t: any) => ({
      topicId: t.topicId,
      order: t.order,
      topic: t.topic,
    })),
  };
}

export async function GET(req: Request, ctx: Ctx) {
  await requireAdmin(req);
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id } = await ctx.params;

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      section: {
        select: {
          id: true,
          title: true,
          slug: true,
          topics: {
            orderBy: { order: "asc" },
            include: {
              topic: { select: { id: true, slug: true, titleKey: true, order: true } },
            },
          },
        },
      },
      topics: {
        orderBy: { order: "asc" },
        include: {
          topic: { select: { id: true, slug: true, titleKey: true, order: true } },
        },
      },
      _count: { select: { sessions: true } },
    },
  });

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ assignment: serializeAssignment(assignment) });
}

export async function PATCH(req: Request, ctx: Ctx) {
  await requireAdmin(req);
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = AssignmentPatchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data as any;

  // ✅ accept either topicIds: string[] or topics: { topicId, order }[]
  const topicIdsFromPayload: string[] | undefined =
    Array.isArray(data.topicIds) ? data.topicIds : undefined;

  const topicsFromPayload: { topicId: string; order?: number }[] | undefined =
    Array.isArray(data.topics) ? data.topics : undefined;

  const normalizedTopicRows =
    topicsFromPayload?.map((t, i) => ({
      topicId: t.topicId,
      order: t.order ?? i,
    })) ??
    topicIdsFromPayload?.map((topicId, i) => ({ topicId, order: i }));

  /**
   * ✅ IMPORTANT:
   * Do NOT spread `data` directly into Prisma `update.data`.
   * Zod/UI payload may contain fields Prisma doesn't accept (like `sectionId`, `topicIds`, `topics`).
   */
  const updateData: any = {};

  // ----- scalar fields (ONLY if present) -----
  if (data.status !== undefined) updateData.status = data.status;
  if (data.difficulty !== undefined) updateData.difficulty = data.difficulty;
  if (data.questionCount !== undefined) updateData.questionCount = data.questionCount;

  if (data.availableFrom !== undefined) updateData.availableFrom = data.availableFrom ?? null;
  if (data.dueAt !== undefined) updateData.dueAt = data.dueAt ?? null;

  if (data.description !== undefined) updateData.description = data.description ?? null;

  // ----- ✅ sectionId -> section connect -----
  // Prisma expects `section: { connect: { id } }`, not `sectionId: ...`
  if (data.sectionId !== undefined) {
    updateData.section =
      data.sectionId === null
        ? undefined // section is required in your schema, so don't allow null here
        : { connect: { id: data.sectionId } };
  }

  // ----- ✅ rewrite join table if provided -----
  if (normalizedTopicRows) {
    updateData.topics = {
      deleteMany: {},
      createMany: { data: normalizedTopicRows },
    };
  }

  const updated = await prisma.assignment.update({
    where: { id },
    data: updateData,
    include: {
      section: {
        select: {
          id: true,
          title: true,
          slug: true,
          topics: {
            orderBy: { order: "asc" },
            include: { topic: { select: { id: true, slug: true, titleKey: true, order: true } } },
          },
        },
      },
      topics: {
        orderBy: { order: "asc" },
        include: { topic: { select: { id: true, slug: true, titleKey: true, order: true } } },
      },
      _count: { select: { sessions: true } },
    },
  });

  return NextResponse.json({ assignment: serializeAssignment(updated) });
}

export async function DELETE(req: Request, ctx: Ctx) {
  await requireAdmin(req);
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { id } = await ctx.params;

  const count = await prisma.practiceSession.count({ where: { assignmentId: id } });
  if (count > 0) {
    return NextResponse.json(
      { error: "Cannot delete: assignment has sessions." },
      { status: 409 }
    );
  }

  await prisma.assignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
