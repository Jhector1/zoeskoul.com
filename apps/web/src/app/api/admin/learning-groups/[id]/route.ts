import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeachingUser, ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { resolveUsersByEmail } from "@/lib/teaching/recipientResolution";
import { LearningGroupInputSchema } from "@/lib/validators/learningDelivery";

type Context = { params: Promise<{ id: string }> };

async function ownedGroup(id: string) {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return { teachingUser: null, group: null };
  const group = await prisma.learningGroup.findFirst({
    where: { id, ...ownedTeachingRecordWhere(teachingUser) },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { assignments: true } },
    },
  });
  return { teachingUser, group };
}

export async function GET(_req: Request, context: Context) {
  const { id } = await context.params;
  const { teachingUser, group } = await ownedGroup(id);
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ group });
}

export async function PATCH(req: Request, context: Context) {
  const { id } = await context.params;
  const { teachingUser, group } = await ownedGroup(id);
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

  const updated = await prisma.learningGroup.update({
    where: { id },
    data: {
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      members: {
        deleteMany: {},
        ...(resolved.users.length
          ? { createMany: { data: resolved.users.map((user) => ({ userId: user.id })) } }
          : {}),
      },
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
  });
  return NextResponse.json({ group: updated });
}

export async function DELETE(_req: Request, context: Context) {
  const { id } = await context.params;
  const { teachingUser, group } = await ownedGroup(id);
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.learningGroup.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
