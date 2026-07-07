import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";
import { listPublishedPracticeExerciseOptions } from "@/lib/practice/challenges/publishedCatalog";
import {
  buildDailyFiveMeta,
  dailyFiveExperienceKey,
  listDailyPracticeSubjectOptions,
  pickDailyFiveQueue,
  utcDayKey,
} from "@/lib/practice/experience/dailyFive";
import { DAILY_PRACTICE_TARGET_COUNT } from "@/lib/practice/experience/config";
import { filterDailyPracticeOptionsForActor } from "@/lib/practice/experience/dailyAccess";

export const runtime = "nodejs";

type StartDailyFiveBody = {
  locale?: string;
  subjectSlug?: string;
};

function subjectSelectionResponse(
  subjects: ReturnType<typeof listDailyPracticeSubjectOptions>,
  message = "Choose a subject for today’s practice.",
) {
  return NextResponse.json(
    {
      message,
      code: "DAILY_SUBJECT_REQUIRED",
      targetCount: DAILY_PRACTICE_TARGET_COUNT,
      subjects,
    },
    { status: 428 },
  );
}

export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor.userId) {
    return NextResponse.json(
      {
        message: "Sign in to start today’s daily practice.",
        code: "AUTH_REQUIRED",
      },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as StartDailyFiveBody;
  const locale = String(body.locale ?? "en");
  const requestedSubjectSlug = String(body.subjectSlug ?? "").trim() || null;
  const dayKey = utcDayKey();
  const experienceKey = dailyFiveExperienceKey(actor.userId, dayKey);

  // A daily set is immutable after creation. Always resume today's existing
  // session before asking for a subject so refreshes and deep links cannot
  // silently replace the learner's queue.
  const existing = await prisma.practiceSession.findUnique({
    where: { experienceKey },
    select: {
      id: true,
      status: true,
      section: {
        select: {
          subject: { select: { slug: true } },
          module: { select: { slug: true } },
        },
      },
    },
  });

  if (existing) {
    return NextResponse.json({
      sessionId: existing.id,
      resumed: true,
      completed: existing.status === "completed",
      subjectSlug: existing.section.subject?.slug ?? null,
      moduleSlug: existing.section.module?.slug ?? null,
    });
  }

  const publishedOptions = await listPublishedPracticeExerciseOptions();
  const options = await filterDailyPracticeOptionsForActor({
    prisma,
    actor,
    options: publishedOptions,
  });
  const subjects = listDailyPracticeSubjectOptions({
    options,
    targetCount: DAILY_PRACTICE_TARGET_COUNT,
  });

  if (!requestedSubjectSlug) {
    return subjectSelectionResponse(subjects);
  }

  const selectedSubject = subjects.find(
    (subject) => subject.subjectSlug === requestedSubjectSlug,
  );
  if (!selectedSubject) {
    return subjectSelectionResponse(
      subjects,
      "That subject does not currently have enough eligible daily-practice exercises.",
    );
  }

  const queue = pickDailyFiveQueue({
    options,
    userId: actor.userId,
    dayKey,
    subjectSlug: selectedSubject.subjectSlug,
    targetCount: DAILY_PRACTICE_TARGET_COUNT,
  });

  if (queue.length !== DAILY_PRACTICE_TARGET_COUNT) {
    return NextResponse.json(
      {
        message: `The selected subject does not currently have ${DAILY_PRACTICE_TARGET_COUNT} unique eligible standalone single-file code exercises.`,
        code: "DAILY_PRACTICE_POOL_INCOMPLETE",
        targetCount: DAILY_PRACTICE_TARGET_COUNT,
        subjects,
      },
      { status: 409 },
    );
  }

  // PracticeSession keeps one section/module as a database anchor. The queue
  // itself can span modules inside the chosen subject; each next target is
  // resolved from the signed server-authored daily metadata.
  const first = queue[0];
  const subject = await prisma.practiceSubject.findUnique({
    where: { slug: first.subjectSlug },
    select: { id: true },
  });
  const section = subject
    ? await prisma.practiceSection.findFirst({
        where: {
          slug: first.sectionSlug,
          subjectId: subject.id,
        },
        select: {
          id: true,
          moduleId: true,
          module: { select: { slug: true } },
        },
      })
    : null;

  if (!section || section.module?.slug !== first.moduleSlug) {
    return NextResponse.json(
      { message: "The daily-practice section is not available in the practice database." },
      { status: 404 },
    );
  }

  const difficulty = "easy" as const;

  try {
    const session = await prisma.practiceSession.create({
      data: {
        mode: "daily_five",
        experienceKey,
        dayKey: new Date(`${dayKey}T00:00:00.000Z`),
        status: "active",
        userId: actor.userId,
        guestId: null,
        sectionId: section.id,
        moduleId: section.moduleId,
        difficulty,
        targetCount: DAILY_PRACTICE_TARGET_COUNT,
        preferPurpose: first.exercisePurpose,
        returnUrl: `/${encodeURIComponent(locale)}/practice/daily`,
        meta: buildDailyFiveMeta({ dayKey, locale, queue }),
        helpPolicy: {
          stepKeys: ["concept", "hint_1", "hint_2", "reveal"],
        },
      },
      select: { id: true },
    });

    return NextResponse.json({
      sessionId: session.id,
      resumed: false,
      completed: false,
      subjectSlug: first.subjectSlug,
      moduleSlug: first.moduleSlug,
    });
  } catch (error: any) {
    // The unique experienceKey closes the double-click/concurrent request race.
    if (String(error?.code ?? "") === "P2002") {
      const raced = await prisma.practiceSession.findUnique({
        where: { experienceKey },
        select: {
          id: true,
          status: true,
          section: {
            select: {
              subject: { select: { slug: true } },
              module: { select: { slug: true } },
            },
          },
        },
      });
      if (raced) {
        return NextResponse.json({
          sessionId: raced.id,
          resumed: true,
          completed: raced.status === "completed",
          subjectSlug: raced.section.subject?.slug ?? first.subjectSlug,
          moduleSlug: raced.section.module?.slug ?? first.moduleSlug,
        });
      }
    }
    throw error;
  }
}
