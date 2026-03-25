import { PracticeKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  getActor,
  ensureGuestId,
  attachGuestCookie,
  actorKeyOf,
} from "@/lib/practice/actor";
import { rngFromActor } from "@/lib/practice/catalog";
import { toDbTopicSlug } from "@/lib/practice/topicSlugs";
import {
  bodyJsonResponse,
  bodyJsonWithGuestCookie,
  enforceSameOriginPost,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import {
  parseReviewQuizKey,
  resolveReviewAccess,
} from "@/lib/review/api/access/resolveReviewAccess";
import { buildReviewQuizKey } from "@/lib/review/api/quiz/keys";
import {
  filterPoolByPreferKind,
  pickTopicsForQuizPreferUnique,
  pickUniqueExerciseKey,
  readPoolFromTopicMeta,
  shortHash,
} from "@/lib/review/api/quiz/helpers";
// import {
//   ReviewQuizSpecSchema,
//   type ReviewQuizSpec,
// } from "@/lib/review/api/quiz/schema";
import { hasReviewModule } from "@/lib/subjects/registry";
import { getLocaleFromCookie } from "@/serverUtils";
// import {type ReviewQuizSpec} from "@/lib/subjects/types";
import {ReviewQuizSpecSchema,  type ReviewQuizRequestSpec} from "@/lib/review/api/quiz/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reviewRegistryMissingResponse(
    subjectSlug: string,
    moduleSlug: string,
    setGuestId?: string | null,
) {
  return bodyJsonWithGuestCookie(
      {
        message: "Module not found in review registry for this subject.",
        detail: { subjectSlug, moduleSlug },
      },
      404,
      setGuestId,
  );
}

export async function POST(req: Request) {
  if (!enforceSameOriginPost(req)) {
    return bodyJsonResponse({ message: "Forbidden." }, 403);
  }

  const actor0 = await getActor();
  const ensured = ensureGuestId(actor0);
  const actor = ensured.actor;
  const setGuestId = ensured.setGuestId;
  const locale = await getLocaleFromCookie();

  const payload = await readJsonSafe(req);
  if (!payload) {
    return bodyJsonWithGuestCookie(
        { message: "Invalid JSON body." },
        400,
        setGuestId,
    );
  }

  const parsed = ReviewQuizSpecSchema.safeParse(payload);
  if (!parsed.success) {
    return bodyJsonWithGuestCookie(
        {
          message: "Invalid quiz spec",
          issues: parsed.error.issues,
        },
        400,
        setGuestId,
    );
  }

  const parsedSpec = parsed.data;

  const gate = await resolveReviewAccess({
    prisma,
    actor,
    locale,
    req,
    subjectSlug: parsedSpec.subject,
    moduleRef: parsedSpec.moduleSlug,
  });

  if (!gate.ok) {
    return attachGuestCookie(gate.res as any, setGuestId);
  }

  if (!hasReviewModule(gate.scope.subjectSlug, gate.scope.moduleSlug)) {
    return reviewRegistryMissingResponse(
        gate.scope.subjectSlug,
        gate.scope.moduleSlug,
        setGuestId,
    );
  }

  const spec: ReviewQuizRequestSpec = {
    ...parsedSpec,
    subject: gate.scope.subjectSlug,
    moduleSlug: gate.scope.moduleSlug,
  };

  const mode = spec.mode ?? "quiz";
  const n = spec.n ?? 4;
  const defaultMaxAttempts = spec.maxAttempts ?? 1;
  const actorKey = actorKeyOf(actor);

  // server-owned canonical key; ignore caller-supplied quizKey
  const quizKey = buildReviewQuizKey(spec);

  const existing = await prisma.reviewQuizInstance.findUnique({
    where: {
      actorKey_quizKey: { actorKey, quizKey },
    },
    select: {
      questions: true,
    },
  });

  if (existing?.questions) {
    return bodyJsonWithGuestCookie(
        {
          questions: existing.questions,
          quizKey,
          requested: mode === "project" ? (spec.steps?.length ?? 0) : n,
          generated: Array.isArray(existing.questions) ? existing.questions.length : undefined,
          frozen: true,
        },
        200,
        setGuestId,
    );
  }

  const wantsAll = !spec.topic || spec.topic === "all";
  let allowedTopicSlugs: string[] = [];

  if (spec.section) {
    const section = await prisma.practiceSection.findUnique({
      where: { slug: spec.section },
      select: {
        slug: true,
        module: { select: { slug: true } },
        subject: { select: { slug: true } },
        topics: {
          orderBy: { order: "asc" },
          select: {
            topic: {
              select: { slug: true, genKey: true },
            },
          },
        },
      },
    });

    if (!section) {
      return bodyJsonWithGuestCookie(
          { message: `Section "${spec.section}" not found.` },
          404,
          setGuestId,
      );
    }

    if (section.subject?.slug !== spec.subject) {
      return bodyJsonWithGuestCookie(
          { message: `Section "${spec.section}" is not in subject "${spec.subject}".` },
          400,
          setGuestId,
      );
    }

    if (section.module?.slug !== spec.moduleSlug) {
      return bodyJsonWithGuestCookie(
          { message: `Section "${spec.section}" is not in module "${spec.moduleSlug}".` },
          400,
          setGuestId,
      );
    }

    const pool = section.topics
        .map((x) => x.topic)
        .filter((t) => t?.genKey)
        .map((t) => t.slug);

    if (!pool.length) {
      return bodyJsonWithGuestCookie(
          { message: `Section "${spec.section}" has no topics with genKey.` },
          400,
          setGuestId,
      );
    }

    allowedTopicSlugs = pool;

    if (mode === "quiz" && !wantsAll) {
      const dbSlug = toDbTopicSlug(spec.topic!);

      if (!pool.includes(dbSlug)) {
        return bodyJsonWithGuestCookie(
            { message: `Topic "${dbSlug}" is not part of section "${spec.section}".` },
            400,
            setGuestId,
        );
      }

      allowedTopicSlugs = [dbSlug];
    }
  } else {
    const rows = await prisma.practiceTopic.findMany({
      where: {
        subject: { is: { slug: spec.subject } },
        module: { is: { slug: spec.moduleSlug } },
        genKey: { not: null },
      },
      select: { slug: true },
      orderBy: [{ order: "asc" }, { slug: "asc" }],
      take: 2000,
    });

    if (!rows.length) {
      return bodyJsonWithGuestCookie(
          {
            message: `No topics found for subject="${spec.subject}" module="${spec.moduleSlug}" (with genKey).`,
          },
          404,
          setGuestId,
      );
    }

    allowedTopicSlugs = rows.map((r) => r.slug);

    if (mode === "quiz" && !wantsAll) {
      const dbSlug = toDbTopicSlug(spec.topic!);
      const ok = rows.some((r) => r.slug === dbSlug);

      if (!ok) {
        return bodyJsonWithGuestCookie(
            { message: `Topic "${dbSlug}" is not in this subject/module.` },
            400,
            setGuestId,
        );
      }

      allowedTopicSlugs = [dbSlug];
    }
  }

  let questions: any[] = [];

  if (mode === "project") {
    const steps = spec.steps ?? [];
    if (!steps.length) {
      return bodyJsonWithGuestCookie(
          { message: "Project spec requires steps[]." },
          400,
          setGuestId,
      );
    }

    const qk = shortHash(quizKey);

    for (const st of steps) {
      const dbSlug = toDbTopicSlug(st.topic);

      if (!allowedTopicSlugs.includes(dbSlug)) {
        return bodyJsonWithGuestCookie(
            {
              message:
                  `Project step topic "${dbSlug}" is not allowed by this subject/module/section.`,
              detail: {
                stepId: st.id,
                stepTopic: st.topic,
                normalized: dbSlug,
              },
            },
            400,
            setGuestId,
        );
      }
    }

    questions = steps.map((st, i) => {
      const dbSlug = toDbTopicSlug(st.topic);

      return {
        kind: "practice" as const,
        id: `proj:${st.id}:${qk}`,
        title: st.title ?? `Step ${i + 1}`,
        carryFromPrev: Boolean(st.carryFromPrev),
        fetch: {
          subject: spec.subject,
          module: spec.moduleSlug,
          section: spec.section,
          topic: dbSlug,
          difficulty: st.difficulty ?? spec.difficulty ?? "easy",
          allowReveal: Boolean(spec.allowReveal),
          preferKind: st.preferKind ?? spec.preferKind ?? null,
          exerciseKey: st.exerciseKey ?? undefined,
          seedPolicy: st.seedPolicy ?? "global",
          salt: `${quizKey}|step=${st.id}|slot=${i + 1}`,
        },
        maxAttempts: st.maxAttempts ?? (spec.maxAttempts ?? 10),
      };
    });
  } else {
    const rng = rngFromActor({
      userId: actor.userId,
      guestId: actor.guestId,
      sessionId: null,
      salt: `review-quiz-instance:${quizKey}`,
    });

    const pickedTopics = pickTopicsForQuizPreferUnique(rng, allowedTopicSlugs, n);
    const qk = shortHash(quizKey);

    const uniqPickedTopics = Array.from(new Set(pickedTopics));
    const topicRows = await prisma.practiceTopic.findMany({
      where: { slug: { in: uniqPickedTopics } },
      select: { slug: true, meta: true },
    });

    const poolBySlug = new Map<string, { key: string; w: number; kind?: string | null }[]>();

    for (const row of topicRows) {
      const pool = readPoolFromTopicMeta((row as any).meta);
      poolBySlug.set(
          row.slug,
          filterPoolByPreferKind(pool, spec.preferKind ?? null),
      );
    }

    const missingPool = uniqPickedTopics.filter(
        (s) => (poolBySlug.get(s)?.length ?? 0) === 0,
    );

    if (missingPool.length) {
      return bodyJsonWithGuestCookie(
          {
            message:
                "Cannot generate a no-duplicate quiz because some topics have empty meta.pool (or preferKind filtered everything out).",
            detail: {
              missingPool,
              preferKind: spec.preferKind ?? null,
            },
          },
          400,
          setGuestId,
      );
    }

    const usedByTopic = new Map<string, Set<string>>();
    const out: any[] = [];

    for (let i = 0; i < n; i++) {
      const pickedTopic = pickedTopics[i];
      const pool = poolBySlug.get(pickedTopic)!;

      const used = usedByTopic.get(pickedTopic) ?? new Set<string>();
      const exerciseKey = pickUniqueExerciseKey(rng, pool, used);

      if (!exerciseKey) break;

      usedByTopic.set(pickedTopic, used);

      out.push({
        kind: "practice" as const,
        id: `p${i + 1}:${qk}`,
        fetch: {
          subject: spec.subject,
          module: spec.moduleSlug,
          section: spec.section,
          topic: pickedTopic,
          difficulty: spec.difficulty ?? "easy",
          allowReveal: Boolean(spec.allowReveal),
          preferKind: spec.preferKind ?? null,
          exerciseKey,
          salt: `${quizKey}|topic=${pickedTopic}|slot=${i + 1}|q=${i + 1}|k=${exerciseKey}`,
        },
        maxAttempts: defaultMaxAttempts,
      });
    }

    questions = out;
  }

  try {
    await prisma.reviewQuizInstance.create({
      data: {
        actorKey,
        quizKey,
        spec,
        questions,
      },
    });
  } catch (e: any) {
    if (e?.code !== "P2002") throw e;
  }

  const saved = await prisma.reviewQuizInstance.findUnique({
    where: {
      actorKey_quizKey: { actorKey, quizKey },
    },
    select: {
      questions: true,
    },
  });

  const outQuestions = (saved?.questions ?? questions) as any[];

  return bodyJsonWithGuestCookie(
      {
        questions: outQuestions,
        quizKey,
        mode,
        requested: mode === "project" ? (spec.steps?.length ?? 0) : n,
        generated: Array.isArray(outQuestions) ? outQuestions.length : undefined,
        truncated:
            mode === "quiz"
                ? Array.isArray(outQuestions) && outQuestions.length < n
                : false,
        frozen: true,
      },
      200,
      setGuestId,
  );
}

export async function DELETE(req: Request) {
  if (!enforceSameOriginPost(req)) {
    return bodyJsonResponse({ message: "Forbidden." }, 403);
  }

  const actor0 = await getActor();
  const ensured = ensureGuestId(actor0);
  const actor = ensured.actor;
  const setGuestId = ensured.setGuestId;
  const locale = await getLocaleFromCookie();

  const { searchParams } = new URL(req.url);
  const quizKey = (searchParams.get("quizKey") ?? "").trim();

  if (!quizKey) {
    return bodyJsonWithGuestCookie(
        { message: "Missing quizKey." },
        400,
        setGuestId,
    );
  }

  if (!quizKey.startsWith("review-quiz|")) {
    return bodyJsonWithGuestCookie(
        { message: "Invalid review quizKey." },
        400,
        setGuestId,
    );
  }

  const parsed = parseReviewQuizKey(quizKey);

  if (!parsed.subjectSlug || !parsed.moduleSlug) {
    return bodyJsonWithGuestCookie(
        { message: "quizKey does not include subject/module." },
        400,
        setGuestId,
    );
  }

  const gate = await resolveReviewAccess({
    prisma,
    actor,
    locale,
    req,
    subjectSlug: parsed.subjectSlug,
    moduleRef: parsed.moduleSlug,
  });

  if (!gate.ok) {
    return attachGuestCookie(gate.res as any, setGuestId);
  }

  if (!hasReviewModule(gate.scope.subjectSlug, gate.scope.moduleSlug)) {
    return reviewRegistryMissingResponse(
        gate.scope.subjectSlug,
        gate.scope.moduleSlug,
        setGuestId,
    );
  }

  const actorKey = actorKeyOf(actor);

  await prisma.reviewQuizInstance.deleteMany({
    where: {
      actorKey,
      quizKey,
    },
  });

  return bodyJsonWithGuestCookie({ ok: true }, 200, setGuestId);
}