import { auth } from "@/lib/auth";
import { getActor } from "@/lib/practice/actor";
import PracticeClient from "./practice-client";
import { enforceModuleAccessOrRedirect } from "@/lib/billing/enforceModuleAccessOrRedirect";
import { prisma } from "@/lib/prisma";
import { resolvePrivilegedLearningAccess } from "@/lib/access/resolvePrivilegedLearningAccess";
import { resolvePracticeViewer } from "@/lib/practice/experience/viewer";
import { notFound, redirect } from "next/navigation";
import { getSubjectPublicationState } from "@/lib/subjects/server/subjectPublication";
import { resolvePracticeExperienceMode } from "@/lib/practice/experience/resolve";
import { assertSessionOwnerMatchesActor } from "@/lib/practice/api/shared/sessionAccess";
import {
  getPracticeRuntimeSurfacePolicy,
  isPracticeExperienceAllowedOnSurface,
} from "@/lib/practice/experience/routePolicy";
import { buildModulePracticeHref } from "@/lib/practice/experience/modulePracticeHref";
import type { PracticeExperienceMode } from "@/lib/practice/experience/types";
import { isModuleAssignmentMeta } from "@/lib/practice/experience/moduleAssignment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { locale: string; subjectSlug: string; moduleSlug: string };
type SP = Record<string, string | string[] | undefined>;

function scalar(sp: SP, key: string) {
  const value = sp[key];
  return typeof value === "string" ? value : null;
}

function redirectToOwnedSurface(args: {
  locale: string;
  mode: PracticeExperienceMode;
  sessionId: string;
}): never {
  const query = new URLSearchParams({ sessionId: args.sessionId });

  if (args.mode === "daily_five") {
    redirect(`/${encodeURIComponent(args.locale)}/practice/daily?${query}`);
  }

  if (
    args.mode === "onboarding_trial" ||
    args.mode === "public_challenge"
  ) {
    redirect(`/${encodeURIComponent(args.locale)}/practice/trial?${query}`);
  }

  return notFound();
}

export default async function ModulePracticePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { locale, subjectSlug, moduleSlug } = await params;
  const sp = await searchParams;
  const practiceSessionId = scalar(sp, "sessionId");

  const [authSession, actor] = await Promise.all([auth(), getActor()]);
  const sessionUser: any = (authSession as any)?.user ?? null;
  const userId = actor.userId;
  const email: string | null = sessionUser?.email ?? null;

  const [access, publication, routeSession] = await Promise.all([
    resolvePrivilegedLearningAccess({ userId, email }),
    getSubjectPublicationState(subjectSlug),
    practiceSessionId
      ? prisma.practiceSession.findUnique({
          where: { id: practiceSessionId },
          select: {
            id: true,
            userId: true,
            guestId: true,
            mode: true,
            assignmentId: true,
            meta: true,
            section: {
              select: {
                subject: { select: { slug: true } },
                module: { select: { slug: true } },
              },
            },
          },
        })
      : Promise.resolve(null),
  ]);
  const { bypass } = access;

  if (!bypass && !publication.isAvailable) notFound();
  if (practiceSessionId && !routeSession) notFound();

  if (routeSession) {
    try {
      assertSessionOwnerMatchesActor(routeSession, actor);
    } catch {
      notFound();
    }
  }

  const initialExperienceMode = routeSession
    ? resolvePracticeExperienceMode(routeSession)
    : getPracticeRuntimeSurfacePolicy("module_practice").defaultMode;

  if (
    !isPracticeExperienceAllowedOnSurface({
      surface: "module_practice",
      mode: initialExperienceMode,
    }) &&
    practiceSessionId
  ) {
    redirectToOwnedSurface({
      locale,
      mode: initialExperienceMode,
      sessionId: practiceSessionId,
    });
  }

  // The persisted session owns its curriculum scope. If a stale or copied URL
  // points at the wrong subject/module, normalize to the canonical route rather
  // than mounting the right session under the wrong learning context.
  const sessionSubjectSlug = routeSession?.section?.subject?.slug ?? null;
  const sessionModuleSlug = routeSession?.section?.module?.slug ?? null;
  if (
    practiceSessionId &&
    sessionSubjectSlug &&
    sessionModuleSlug &&
    (sessionSubjectSlug !== subjectSlug || sessionModuleSlug !== moduleSlug)
  ) {
    redirect(
      buildModulePracticeHref({
        locale,
        subjectSlug: sessionSubjectSlug,
        moduleSlug: sessionModuleSlug,
        sessionId: practiceSessionId,
        mode:
          initialExperienceMode === "assignment" ? "assignment" : "standard",
        returnTo: scalar(sp, "returnTo"),
        sectionSlug: scalar(sp, "section"),
        topicSlug: scalar(sp, "topic"),
        questionCount: Number(scalar(sp, "questionCount")) || null,
        preferPurpose:
          scalar(sp, "preferPurpose") === "quiz" ||
          scalar(sp, "preferPurpose") === "project" ||
          scalar(sp, "preferPurpose") === "mixed"
            ? (scalar(sp, "preferPurpose") as "quiz" | "project" | "mixed")
            : null,
        purposePolicy:
          scalar(sp, "purposePolicy") === "strict" ||
          scalar(sp, "purposePolicy") === "fallback"
            ? (scalar(sp, "purposePolicy") as "strict" | "fallback")
            : null,
      }),
    );
  }

  const isAssignment = initialExperienceMode === "assignment";
  const isModuleAssignment = Boolean(
    isAssignment && routeSession && isModuleAssignmentMeta(routeSession.meta),
  );

  // Teacher assignments own access through the published Assignment and the
  // learner-owned session. Review-module assignments still follow the module's
  // normal free/paid entitlement, but never require an unlimited-practice
  // subscription. Subscriber practice requires both subscription and module
  // entitlement.
  if (!isAssignment) {
    const viewer = await resolvePracticeViewer(prisma, {
      userId,
      guestId: null,
    });
    if (!bypass && !viewer.subscribed) {
      const daily = new URLSearchParams({ subject: subjectSlug, module: moduleSlug });
      redirect(`/${encodeURIComponent(locale)}/practice/daily?${daily.toString()}`);
    }
  }

  if (!isAssignment || isModuleAssignment) {
    const nextPath = buildModulePracticeHref({
      locale,
      subjectSlug,
      moduleSlug,
      sessionId: practiceSessionId,
      mode: isAssignment ? "assignment" : "standard",
      returnTo: scalar(sp, "returnTo"),
      sectionSlug: scalar(sp, "section"),
      topicSlug: scalar(sp, "topic"),
      questionCount: Number(scalar(sp, "questionCount")) || null,
      preferPurpose:
        scalar(sp, "preferPurpose") === "quiz" ||
        scalar(sp, "preferPurpose") === "project" ||
        scalar(sp, "preferPurpose") === "mixed"
          ? (scalar(sp, "preferPurpose") as "quiz" | "project" | "mixed")
          : null,
      purposePolicy:
        scalar(sp, "purposePolicy") === "strict" ||
        scalar(sp, "purposePolicy") === "fallback"
          ? (scalar(sp, "purposePolicy") as "strict" | "fallback")
          : null,
    });

    await enforceModuleAccessOrRedirect({
      prisma,
      actor,
      bypass,
      locale,
      subjectSlug,
      moduleSlug,
      nextPath,
    });
  }

  return (
    <PracticeClient
      subjectSlug={subjectSlug}
      moduleSlug={moduleSlug}
      sessionId={practiceSessionId}
      initialExperienceMode={initialExperienceMode}
    />
  );
}
