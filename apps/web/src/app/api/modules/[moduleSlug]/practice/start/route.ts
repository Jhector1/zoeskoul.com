import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/lib/practice/actor";
import { resolveSubscriberPracticeAccess } from "@/lib/practice/experience/access";
import { startOrResumePracticeSession } from "@/lib/practice/sessionStart";

export const runtime = "nodejs";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ moduleSlug: string }> }
) {
  const { moduleSlug } = await params;
  const body = await req.json().catch(() => ({} as any));

  const raw = typeof body?.returnUrl === "string" ? body.returnUrl : null;
  const returnUrl = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : null;

  const actor = await getActor();
  const access = await resolveSubscriberPracticeAccess(prisma, actor);
  if (!access.ok) {
    return NextResponse.json(
      {
        message: access.message,
        code: access.code,
        dailyFiveUrl: "/practice/daily",
        billingUrl: "/billing",
      },
      { status: access.status },
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

  const presetId = mod.practicePresetId ?? null;
  const sectionIds = mod.sections.map((s) => s.id);
  const homeSection = mod.sections[0] ?? null;

  if (!homeSection) {
    return NextResponse.json({ message: "Module has no sections." }, { status: 400 });
  }

  const topicSlugs = Array.from(
      new Set(
          mod.sections
              .flatMap((s) => s.topics ?? [])
              .map((x) => x.topic?.slug)
              .filter(Boolean)
      )
  ) as string[];

  const payload = {
    topicSlugs,
    difficulty: "hard" as const,
    questionCount: 15,
    allowReveal: false,
    showDebug: false,
    preferPurpose,
  };

  const resumeData: any = {};
  if (returnUrl) resumeData.returnUrl = returnUrl;
  if (presetId) resumeData.presetId = presetId;
  resumeData.preferPurpose = preferPurpose;

  const { session, resumed } = await startOrResumePracticeSession({
    prisma,
    actor,
    findWhere: {
      mode: "standard",
      status: "active",
      assignmentId: null,
      sectionId: { in: sectionIds },
    },
    resumeData,
    createData: {
      mode: "standard",
      status: "active",
      assignmentId: null,
      sectionId: homeSection.id,
      difficulty: "hard",
      targetCount: 15,
      returnUrl: returnUrl ? String(returnUrl) : null,
      presetId,
      preferPurpose,
      meta: { kind: "subscriber_practice" },
    },
    select: { id: true },
  });

  return NextResponse.json({
    sessionId: (session as any).id,
    resumed,
    experienceMode: "standard",
    ...payload,
  });
}