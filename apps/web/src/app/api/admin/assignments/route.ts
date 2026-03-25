import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { AssignmentCreateSchema } from "@/lib/validators/assignment"; // or whatever you use

export async function POST(req: Request) {
  await requireAdmin(req);
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = AssignmentCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // ✅ pull topicIds out (NOT a Prisma field)
  const { topicIds, ...rest } = parsed.data as any;

  const created = await prisma.assignment.create({
    data: {
      ...rest,

      // normalize nullable strings
      description: rest.description ?? null,

      // ✅ write join table
      topics: Array.isArray(topicIds)
        ? {
            createMany: {
              data: topicIds.map((topicId: string, i: number) => ({
                topicId,
                order: i,
              })),
            },
          }
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
