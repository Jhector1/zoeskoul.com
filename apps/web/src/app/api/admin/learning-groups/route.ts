import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeachingUser, ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { resolveUsersByEmail } from "@/lib/teaching/recipientResolution";
import { LearningGroupInputSchema } from "@/lib/validators/learningDelivery";

export const runtime = "nodejs";

export async function GET() {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const groups = await prisma.learningGroup.findMany({
    where: ownedTeachingRecordWhere(teachingUser),
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { assignments: true } },
    },
  });

  return NextResponse.json({ groups });
}

export async function POST(req: Request) {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = LearningGroupInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const resolved = await resolveUsersByEmail(prisma, parsed.data.memberEmails);
  if (resolved.missingEmails.length) {
    return NextResponse.json(
      { error: "Some students do not have ZoeSkoul accounts.", missingEmails: resolved.missingEmails },
      { status: 400 },
    );
  }

  const group = await prisma.learningGroup.create({
    data: {
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      ownerId: teachingUser.id,
      members: resolved.users.length
        ? { createMany: { data: resolved.users.map((user) => ({ userId: user.id })) } }
        : undefined,
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });

  return NextResponse.json({ group }, { status: 201 });
}
