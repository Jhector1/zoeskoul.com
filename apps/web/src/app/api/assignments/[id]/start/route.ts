import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";

export const runtime = "nodejs";

/**
 * Starts a teacher-authored assignment run.
 *
 * Assignment access is deliberately separate from subscription access:
 * - the learner must be signed in;
 * - the assignment must be published and inside its availability window;
 * - Assignment.maxAttempts limits whole runs;
 * - Assignment.maxQuestionAttempts limits submissions per question.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = await getActor();

  if (!actor.userId) {
    return NextResponse.json(
      { message: "Sign in to start this assignment.", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  const now = new Date();
  const assignment = await prisma.assignment.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      sectionId: true,
      difficulty: true,
      questionCount: true,
      availableFrom: true,
      dueAt: true,
      maxAttempts: true,
      maxQuestionAttempts: true,
      allowReveal: true,
      helpPolicy: true,
      section: {
        select: {
          subject: { select: { slug: true } },
          module: { select: { slug: true } },
        },
      },
    },
  });

  if (!assignment || assignment.status !== "published") {
    return NextResponse.json(
      { message: "Assignment not available." },
      { status: 404 },
    );
  }
  if (assignment.availableFrom && now < assignment.availableFrom) {
    return NextResponse.json({ message: "Not open yet." }, { status: 403 });
  }
  if (assignment.dueAt && now > assignment.dueAt) {
    return NextResponse.json({ message: "Past due." }, { status: 403 });
  }
  const reviewReturnUrl =
    assignment.section?.subject?.slug && assignment.section?.module?.slug
      ? `/subjects/${encodeURIComponent(assignment.section.subject.slug)}` +
        `/modules/${encodeURIComponent(assignment.section.module.slug)}`
      : null;

  // Reopening an assignment resumes the learner's unfinished run instead of
  // silently consuming another whole-assignment attempt.
  const activeRun = await prisma.practiceSession.findFirst({
    where: {
      assignmentId: assignment.id,
      userId: actor.userId,
      status: "active",
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, meta: true },
  });

  if (activeRun) {
    const meta =
      activeRun.meta && typeof activeRun.meta === "object" && !Array.isArray(activeRun.meta)
        ? (activeRun.meta as Record<string, unknown>)
        : null;
    const runNumber = Math.max(1, Number(meta?.runNumber ?? 1) || 1);

    if (reviewReturnUrl) {
      await prisma.practiceSession.update({
        where: { id: activeRun.id },
        data: { returnUrl: reviewReturnUrl },
      });
    }

    return NextResponse.json({
      sessionId: activeRun.id,
      experienceMode: "assignment",
      runNumber,
      resumed: true,
      returnUrl: reviewReturnUrl,
    });
  }

  const used = await prisma.practiceSession.count({
    where: {
      assignmentId: assignment.id,
      userId: actor.userId,
    },
  });

  if (assignment.maxAttempts != null && used >= assignment.maxAttempts) {
    return NextResponse.json(
      {
        message: "No assignment runs remaining.",
        code: "ASSIGNMENT_RUN_LIMIT_REACHED",
        attemptsUsed: used,
        maxAttempts: assignment.maxAttempts,
      },
      { status: 403 },
    );
  }

  const runNumber = used + 1;
  const experienceKey = `assignment:${assignment.id}:${actor.userId}:${runNumber}`;

  try {
    const session = await prisma.practiceSession.create({
      data: {
        mode: "assignment",
        experienceKey,
        assignmentId: assignment.id,
        sectionId: assignment.sectionId,
        returnUrl: reviewReturnUrl,
        difficulty: assignment.difficulty,
        targetCount: assignment.questionCount,
        preferPurpose: "quiz",
        helpPolicy:
          assignment.helpPolicy ??
          ({
            stepKeys: assignment.allowReveal
              ? ["concept", "hint_1", "hint_2", "reveal"]
              : ["concept", "hint_1", "hint_2"],
          } as const),
        userId: actor.userId,
        guestId: null,
        meta: {
          kind: "assignment",
          assignmentId: assignment.id,
          runNumber,
          maxQuestionAttempts: assignment.maxQuestionAttempts,
        },
      },
      select: { id: true },
    });

    return NextResponse.json({
      sessionId: session.id,
      experienceMode: "assignment",
      runNumber,
      resumed: false,
      returnUrl: reviewReturnUrl,
    });
  } catch (error: any) {
    if (String(error?.code ?? "") === "P2002") {
      const raced = await prisma.practiceSession.findUnique({
        where: { experienceKey },
        select: { id: true },
      });
      if (raced) {
        return NextResponse.json({
          sessionId: raced.id,
          experienceMode: "assignment",
          runNumber,
          resumed: true,
          returnUrl: reviewReturnUrl,
        });
      }
    }
    throw error;
  }
}
