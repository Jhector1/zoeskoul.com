import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getTeachingUser,
  ownedTeachingRecordWhere,
} from "@/lib/teaching/teachingAccess";
import {
  learningAssignmentAudienceCreateData,
  learningAssignmentScalarData,
  resolveLearningAssignmentWrite,
} from "@/lib/learningAssignments/assignmentAdminServer";
import { syncPendingLearningAssignmentInvites } from "@/lib/learningAssignments/assignmentInvites";
import { LearningAssignmentInputSchema } from "@/lib/validators/learningDelivery";

export const runtime = "nodejs";

const assignmentInclude = {
  subject: {
    select: { id: true, slug: true, title: true, visibility: true },
  },
  owner: { select: { id: true, name: true, email: true } },
  users: {
    include: { user: { select: { id: true, name: true, email: true } } },
  },
  groups: {
    include: { group: { select: { id: true, name: true, slug: true } } },
  },
  invites: {
    orderBy: { email: "asc" as const },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      sentAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
  },
};

export async function GET() {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const assignments = await prisma.learningAssignment.findMany({
    where: ownedTeachingRecordWhere(teachingUser),
    orderBy: { updatedAt: "desc" },
    include: assignmentInclude,
  });
  return NextResponse.json({ assignments });
}

export async function POST(req: Request) {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = LearningAssignmentInputSchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const resolution = await resolveLearningAssignmentWrite(prisma, {
    teachingUser,
    input: parsed.data,
  });
  if (!resolution.ok) {
    return NextResponse.json(
      { error: resolution.error },
      { status: resolution.status },
    );
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const created = await tx.learningAssignment.create({
      data: {
        ...learningAssignmentScalarData(parsed.data),
        ownerId: teachingUser.id,
        ...learningAssignmentAudienceCreateData(resolution),
      },
      select: { id: true },
    });

    await syncPendingLearningAssignmentInvites(tx, {
      assignmentId: created.id,
      pendingEmails: resolution.pendingEmails,
    });

    return tx.learningAssignment.findUniqueOrThrow({
      where: { id: created.id },
      include: assignmentInclude,
    });
  });

  return NextResponse.json(
    {
      assignment,
      pendingInvites: resolution.pendingEmails,
    },
    { status: 201 },
  );
}
