import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getTeachingUser,
  ownedTeachingRecordWhere,
} from "@/lib/teaching/teachingAccess";
import {
  learningAssignmentAudienceReplaceData,
  learningAssignmentScalarData,
  resolveLearningAssignmentWrite,
} from "@/lib/learningAssignments/assignmentAdminServer";
import { syncPendingLearningAssignmentInvites } from "@/lib/learningAssignments/assignmentInvites";
import { LearningAssignmentInputSchema } from "@/lib/validators/learningDelivery";

type Context = { params: Promise<{ id: string }> };

const assignmentInclude = {
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
  subject: {
    select: { id: true, slug: true, title: true, visibility: true },
  },
};

async function ownedAssignment(id: string) {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return { teachingUser: null, assignment: null };

  const assignment = await prisma.learningAssignment.findFirst({
    where: { id, ...ownedTeachingRecordWhere(teachingUser) },
    include: assignmentInclude,
  });
  return { teachingUser, assignment };
}

export async function GET(_req: Request, context: Context) {
  const { id } = await context.params;
  const { teachingUser, assignment } = await ownedAssignment(id);
  if (!teachingUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ assignment });
}

export async function PATCH(req: Request, context: Context) {
  const { id } = await context.params;
  const { teachingUser, assignment } = await ownedAssignment(id);
  if (!teachingUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const updated = await prisma.$transaction(async (tx) => {
    await tx.learningAssignment.update({
      where: { id },
      data: {
        ...learningAssignmentScalarData(parsed.data),
        ...learningAssignmentAudienceReplaceData(resolution),
      },
    });

    await syncPendingLearningAssignmentInvites(tx, {
      assignmentId: id,
      pendingEmails: resolution.pendingEmails,
    });

    return tx.learningAssignment.findUniqueOrThrow({
      where: { id },
      include: assignmentInclude,
    });
  });

  return NextResponse.json({
    assignment: updated,
    pendingInvites: resolution.pendingEmails,
  });
}

export async function DELETE(_req: Request, context: Context) {
  const { id } = await context.params;
  const { teachingUser, assignment } = await ownedAssignment(id);
  if (!teachingUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.learningAssignment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
