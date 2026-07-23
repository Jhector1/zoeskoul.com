import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeachingUser, ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import {
  learningAssignmentAudienceReplaceData,
  learningAssignmentScalarData,
  resolveLearningAssignmentWrite,
} from "@/lib/learningAssignments/assignmentAdminServer";
import { LearningAssignmentInputSchema } from "@/lib/validators/learningDelivery";

type Context = { params: Promise<{ id: string }> };

async function ownedAssignment(id: string) {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return { teachingUser: null, assignment: null };
  const assignment = await prisma.learningAssignment.findFirst({
    where: { id, ...ownedTeachingRecordWhere(teachingUser) },
    include: {
      users: { include: { user: { select: { id: true, name: true, email: true } } } },
      groups: { include: { group: { select: { id: true, name: true, slug: true } } } },
      subject: { select: { id: true, slug: true, title: true, visibility: true } },
    },
  });
  return { teachingUser, assignment };
}

export async function GET(_req: Request, context: Context) {
  const { id } = await context.params;
  const { teachingUser, assignment } = await ownedAssignment(id);
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ assignment });
}

export async function PATCH(req: Request, context: Context) {
  const { id } = await context.params;
  const { teachingUser, assignment } = await ownedAssignment(id);
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = LearningAssignmentInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const resolution = await resolveLearningAssignmentWrite(prisma, {
    teachingUser,
    input: parsed.data,
  });
  if (!resolution.ok) {
    return NextResponse.json(
      {
        error: resolution.error,
        ...(resolution.missingEmails
          ? { missingEmails: resolution.missingEmails }
          : {}),
      },
      { status: resolution.status },
    );
  }

  const updated = await prisma.learningAssignment.update({
    where: { id },
    data: {
      ...learningAssignmentScalarData(parsed.data),
      ...learningAssignmentAudienceReplaceData(resolution),
    },
    include: {
      subject: { select: { id: true, slug: true, title: true, visibility: true } },
      users: { include: { user: { select: { id: true, name: true, email: true } } } },
      groups: { include: { group: { select: { id: true, name: true, slug: true } } } },
    },
  });

  return NextResponse.json({ assignment: updated });
}

export async function DELETE(_req: Request, context: Context) {
  const { id } = await context.params;
  const { teachingUser, assignment } = await ownedAssignment(id);
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!assignment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.learningAssignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
