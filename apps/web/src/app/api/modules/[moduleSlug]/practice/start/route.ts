import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActor, ensureGuestId, attachGuestCookie } from "@/lib/practice/actor";
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

  const actor0 = await getActor();
  const ensured = ensureGuestId(actor0);
  const actor = ensured.actor;
  const setGuestId = ensured.setGuestId ?? null;

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
    const res = NextResponse.json({ message: "Module not found." }, { status: 404 });
    return attachGuestCookie(res, setGuestId);
  }

  const presetId = mod.practicePresetId ?? null;
  const sectionIds = mod.sections.map((s) => s.id);
  const homeSection = mod.sections[0] ?? null;

  if (!homeSection) {
    const res = NextResponse.json({ message: "Module has no sections." }, { status: 400 });
    return attachGuestCookie(res, setGuestId);
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
      status: "active",
      assignmentId: null,
      sectionId: { in: sectionIds },
    },
    resumeData,
    createData: {
      status: "active",
      assignmentId: null,
      sectionId: homeSection.id,
      difficulty: "hard",
      targetCount: 15,
      returnUrl: returnUrl ? String(returnUrl) : null,
      presetId,
      preferPurpose,
    },
    select: { id: true },
  });

  const res = NextResponse.json({
    sessionId: (session as any).id,
    resumed,
    ...payload,
  });

  return attachGuestCookie(res, setGuestId);
}