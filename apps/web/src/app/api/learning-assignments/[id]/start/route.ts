import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, actorKeyOf } from "@/lib/practice/actor";
import { getLearningAssignmentForUser } from "@/lib/learningAssignments/assignmentAccessServer";
import { learningAssignmentAvailability } from "@/lib/learningAssignments/assignmentWindow";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(_req: Request, context: Context) {
  const actor = await getActor();
  if (!actor.userId) {
    return NextResponse.json({ error: "Sign in to open this assigned course." }, { status: 401 });
  }

  const { id } = await context.params;
  const assignment = await getLearningAssignmentForUser(prisma, {
    assignmentId: id,
    userId: actor.userId,
  });
  if (!assignment) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });

  const availability = learningAssignmentAvailability(assignment);
  if (availability !== "open" && availability !== "past_due") {
    return NextResponse.json(
      { error: availability === "upcoming" ? "This course is not open yet." : "This course assignment is closed.", availability },
      { status: 403 },
    );
  }

  const actorKey = actorKeyOf(actor);
  await prisma.subjectEnrollment.upsert({
    where: { actorKey_subjectId: { actorKey, subjectId: assignment.subjectId } },
    create: {
      actorKey,
      userId: actor.userId,
      subjectId: assignment.subjectId,
      source: "assignment",
      status: "enrolled",
      lastSeenAt: new Date(),
      meta: { learningAssignmentId: assignment.id },
    },
    update: {
      userId: actor.userId,
      source: "assignment",
      archivedAt: null,
      lastSeenAt: new Date(),
      meta: { learningAssignmentId: assignment.id },
    },
  });

  const defaultModuleSlug = assignment.subject.modules[0]?.slug ?? null;
  const href = defaultModuleSlug
    ? `/subjects/${encodeURIComponent(assignment.subject.slug)}/modules/${encodeURIComponent(defaultModuleSlug)}`
    : `/subjects/${encodeURIComponent(assignment.subject.slug)}/modules`;

  return NextResponse.json({ ok: true, href, subjectSlug: assignment.subject.slug, defaultModuleSlug });
}
