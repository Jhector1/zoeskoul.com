import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTeachingUser, ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import {
  learningAssignmentAudienceCreateData,
  learningAssignmentScalarData,
  resolveLearningAssignmentWrite,
} from "@/lib/learningAssignments/assignmentAdminServer";
import { LearningAssignmentInputSchema } from "@/lib/validators/learningDelivery";

export const runtime = "nodejs";

export async function GET() {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const assignments = await prisma.learningAssignment.findMany({
    where: ownedTeachingRecordWhere(teachingUser),
    orderBy: { updatedAt: "desc" },
    include: {
      subject: { select: { id: true, slug: true, title: true, visibility: true } },
      owner: { select: { id: true, name: true, email: true } },
      users: { include: { user: { select: { id: true, name: true, email: true } } } },
      groups: { include: { group: { select: { id: true, name: true, slug: true } } } },
    },
  });
  return NextResponse.json({ assignments });
}

export async function POST(req: Request) {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  const assignment = await prisma.learningAssignment.create({
    data: {
      ...learningAssignmentScalarData(parsed.data),
      ownerId: teachingUser.id,
      ...learningAssignmentAudienceCreateData(resolution),
    },
    include: {
      subject: { select: { id: true, slug: true, title: true, visibility: true } },
      users: { include: { user: { select: { id: true, name: true, email: true } } } },
      groups: { include: { group: { select: { id: true, name: true, slug: true } } } },
    },
  });

  return NextResponse.json({ assignment }, { status: 201 });
}
