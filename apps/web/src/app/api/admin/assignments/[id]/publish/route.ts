import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/requireAdmin";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  await requireAdmin(req);

  const { id } = await ctx.params;

  const assignment = await prisma.assignment.update({
    where: { id },
    data: { status: "published" },
    include: {
      topics: { orderBy: { order: "asc" }, include: { topic: true } },
      section: { select: { id: true, slug: true, title: true } },
    },
  });

  return NextResponse.json({ assignment });
}
