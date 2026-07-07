import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";
import { checkModuleAccess } from "@/lib/access/moduleAccessServer";
import { startOrResumePracticeSession } from "@/lib/practice/sessionStart";
import {
  MODULE_ASSIGNMENT_META_KIND,
  MODULE_ASSIGNMENT_STORAGE_MODE,
  moduleAssignmentExperienceKey,
  readModuleAssignmentMeta,
} from "@/lib/practice/experience/moduleAssignment";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ moduleSlug: string }> },
) {
  const { moduleSlug } = await params;
  const body = await req.json().catch(() => ({} as any));

  const raw = typeof body?.returnUrl === "string" ? body.returnUrl : null;
  const returnUrl = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
  const requestedResumeSessionId =
    typeof body?.resumeSessionId === "string" && body.resumeSessionId.trim()
      ? body.resumeSessionId.trim()
      : null;

  const actor = await getActor();
  if (!actor.userId) {
    return NextResponse.json(
      { message: "Sign in to start this assignment.", code: "AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  const preferPurpose = "quiz" as const;

  const mod = await prisma.practiceModule.findUnique({
    where: { slug: moduleSlug },
    select: {
      id: true,
      slug: true,
      practicePresetId: true,
      sections: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          slug: true,
          topics: {
            orderBy: { order: "asc" },
            select: { topic: { select: { slug: true } } },
          },
        },
      },
    },
  });

  if (!mod) {
    return NextResponse.json({ message: "Module not found." }, { status: 404 });
  }

  // A module assignment follows the module's normal learning entitlement. It
  // must not use the subscriber-only unlimited-practice gate.
  const access = await checkModuleAccess(prisma, {
    actor,
    moduleSlug: mod.slug,
  });
  if (!access.ok) {
    return NextResponse.json(
      {
        message:
          access.reason === "requires_login"
            ? "Sign in to start this assignment."
            : "This module requires access before its assignment can be started.",
        code:
          access.reason === "requires_login"
            ? "AUTH_REQUIRED"
            : "MODULE_ACCESS_REQUIRED",
      },
      { status: access.reason === "requires_login" ? 401 : 403 },
    );
  }

  const presetId = mod.practicePresetId ?? null;
  const homeSection = mod.sections[0] ?? null;

  if (!homeSection) {
    return NextResponse.json({ message: "Module has no sections." }, { status: 400 });
  }

  const topicSlugs = Array.from(
    new Set(
      mod.sections
        .flatMap((section) => section.topics ?? [])
        .map((item) => item.topic?.slug)
        .filter(Boolean),
    ),
  ) as string[];

  const payload = {
    topicSlugs,
    difficulty: "hard" as const,
    questionCount: 15,
    allowReveal: false,
    showDebug: false,
    preferPurpose,
  };

  const resumeData: any = {
    preferPurpose,
    moduleId: mod.id,
  };
  if (returnUrl) resumeData.returnUrl = returnUrl;
  if (presetId) resumeData.presetId = presetId;

  // Preserve a previously-started module assignment referenced by review
  // progress. Older builds may not have written experienceKey/moduleId yet.
  // Only a session that belongs to this learner and carries the explicit
  // module-assignment metadata may be resumed; an old subscriber-practice
  // session id is deliberately ignored rather than deleted or repurposed.
  if (requestedResumeSessionId) {
    const requestedSession = await prisma.practiceSession.findFirst({
      where: {
        id: requestedResumeSessionId,
        userId: actor.userId,
        assignmentId: null,
      },
      select: {
        id: true,
        moduleId: true,
        meta: true,
      },
    });

    const requestedMeta = readModuleAssignmentMeta(requestedSession?.meta);
    const matchesModule =
      requestedSession != null &&
      requestedMeta != null &&
      (requestedSession.moduleId === mod.id || requestedMeta.moduleSlug === mod.slug);

    if (matchesModule) {
      await prisma.practiceSession.update({
        where: { id: requestedSession.id },
        data: resumeData,
      });

      return NextResponse.json({
        sessionId: requestedSession.id,
        resumed: true,
        experienceMode: "assignment",
        ...payload,
      });
    }
  }

  // The database's assignment-mode constraint requires a real assignmentId.
  // A review-module assignment is a separate product intent, not an Assignment
  // row, so it is stored as a standard session with module_assignment metadata.
  // resolvePracticeExperienceMode promotes that metadata back to assignment UI.
  const experienceKey = moduleAssignmentExperienceKey(actor.userId, mod.id);

  let started: Awaited<ReturnType<typeof startOrResumePracticeSession>>;
  try {
    started = await startOrResumePracticeSession({
      prisma,
      actor,
      findWhere: {
        experienceKey,
        assignmentId: null,
      },
      resumeData,
      createData: {
        experienceKey,
        mode: MODULE_ASSIGNMENT_STORAGE_MODE,
        status: "active",
        assignmentId: null,
        moduleId: mod.id,
        sectionId: homeSection.id,
        difficulty: "hard",
        targetCount: 15,
        returnUrl: returnUrl ? String(returnUrl) : null,
        presetId,
        preferPurpose,
        meta: {
          kind: MODULE_ASSIGNMENT_META_KIND,
          source: "review_module",
          moduleSlug: mod.slug,
        },
      },
      select: { id: true },
    });
  } catch (error: any) {
    console.error("[module-assignment] unable to start", {
      moduleSlug: mod.slug,
      code: String(error?.code ?? ""),
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      {
        message: "Unable to start the module assignment.",
        code: "MODULE_ASSIGNMENT_START_FAILED",
      },
      { status: 500 },
    );
  }

  const { session, resumed } = started;

  return NextResponse.json({
    sessionId: (session as any).id,
    resumed,
    experienceMode: "assignment",
    ...payload,
  });
}
