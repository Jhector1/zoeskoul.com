// src/app/api/review/quiz/route.ts
import { PracticeKind } from "@zoeskoul/db";
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
import {
  ReviewQuizSpecSchema,
  type ReviewQuizRequestSpec,
} from "@/lib/review/api/quiz/schemas";
import { hasReviewModule } from "@/lib/subjects/registry";
// import { SECTIONS, TOPICS } from "@/lib/subjects/data";
import { getLocaleFromCookie } from "@/serverUtils";
import { SECTIONS, TOPICS } from "@/lib/subjects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RegistrySection = {
  slug: string;
  subjectSlug: string;
  moduleSlug: string;
  topicSlugs: string[];
};

type RegistryTopic = {
  slug: string;
  subjectSlug: string;
  moduleSlug: string;
  genKey?: string | null;
  meta?: unknown;
};

function resolveMaxAttempts(
    stepMaxAttempts: number | null | undefined,
    parentMaxAttempts: number | null | undefined,
    fallback: number | null,
): number | null {
  if (stepMaxAttempts !== undefined) return stepMaxAttempts;
  if (parentMaxAttempts !== undefined) return parentMaxAttempts;
  return fallback;
}

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

function findRegistrySection(args: {
  sectionSlug: string;
  subjectSlug: string;
  moduleSlug: string;
}) {
  const { sectionSlug, subjectSlug, moduleSlug } = args;

  return (SECTIONS as RegistrySection[]).find(
      (s) =>
          s.slug === sectionSlug &&
          s.subjectSlug === subjectSlug &&
          s.moduleSlug === moduleSlug,
  );
}

function findRegistryTopic(slug: string) {
  return (TOPICS as RegistryTopic[]).find((t) => t.slug === slug);
}

function getAllowedTopicSlugsFromRegistry(args: {
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug?: string | null;
}) {
  const { subjectSlug, moduleSlug, sectionSlug } = args;

  if (sectionSlug) {
    const section = findRegistrySection({
      sectionSlug,
      subjectSlug,
      moduleSlug,
    });

    if (!section) {
      return {
        ok: false as const,
        status: 404,
        body: {
          message: `Section "${sectionSlug}" not found in registry.`,
        },
      };
    }

    const pool = section.topicSlugs.filter((slug) => {
      const t = findRegistryTopic(slug);
      return Boolean(t?.genKey);
    });

    if (!pool.length) {
      return {
        ok: false as const,
        status: 400,
        body: {
          message: `Section "${sectionSlug}" has no topics with genKey in registry.`,
        },
      };
    }

    return {
      ok: true as const,
      section,
      topicSlugs: pool,
    };
  }

  const pool = (TOPICS as RegistryTopic[])
      .filter(
          (t) =>
              t.subjectSlug === subjectSlug &&
              t.moduleSlug === moduleSlug &&
              Boolean(t.genKey),
      )
      .map((t) => t.slug);

  if (!pool.length) {
    return {
      ok: false as const,
      status: 404,
      body: {
        message: `No topics found in registry for subject="${subjectSlug}" module="${moduleSlug}" (with genKey).`,
      },
    };
  }

  return {
    ok: true as const,
    topicSlugs: pool,
  };
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
    moduleSlug: parsedSpec.moduleSlug,
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
  const defaultMaxAttempts = resolveMaxAttempts(undefined, spec.maxAttempts, 1);
  const actorKey = actorKeyOf(actor);

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
          generated: Array.isArray(existing.questions)
              ? existing.questions.length
              : undefined,
          frozen: true,
        },
        200,
        setGuestId,
    );
  }

  const wantsAll = !spec.topic || spec.topic === "all";

  const registryAllowed = getAllowedTopicSlugsFromRegistry({
    subjectSlug: spec.subject,
    moduleSlug: spec.moduleSlug,
    sectionSlug: spec.section ?? null,
  });

  if (!registryAllowed.ok) {
    return bodyJsonWithGuestCookie(
        registryAllowed.body,
        registryAllowed.status,
        setGuestId,
    );
  }

  let allowedTopicSlugs = registryAllowed.topicSlugs;

  if (mode === "quiz" && !wantsAll) {
    const dbSlug = toDbTopicSlug(spec.topic!);

    if (!allowedTopicSlugs.includes(dbSlug)) {
      return bodyJsonWithGuestCookie(
          {
            message: `Topic "${dbSlug}" is not part of the allowed review scope.`,
            detail: {
              requested: spec.topic,
              normalized: dbSlug,
              subject: spec.subject,
              module: spec.moduleSlug,
              section: spec.section ?? null,
              allowedTopicSlugs,
            },
          },
          400,
          setGuestId,
      );
    }

    allowedTopicSlugs = [dbSlug];
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

    const safeSteps: Array<(typeof steps)[number] & { topic: string }> = [];

    for (const [index, st] of steps.entries()) {
      if (!st.topic) {
        return bodyJsonWithGuestCookie(
            {
              message: "Project step requires a topic.",
              detail: {
                stepId: st.id,
                stepIndex: index,
                parentTopic: spec.topic ?? null,
              },
            },
            400,
            setGuestId,
        );
      }

      safeSteps.push({
        ...st,
        topic: st.topic,
      });
    }

    const qk = shortHash(quizKey);

    for (const st of safeSteps) {
      const dbSlug = toDbTopicSlug(st.topic);

      if (!allowedTopicSlugs.includes(dbSlug)) {
        return bodyJsonWithGuestCookie(
            {
              message: `Project step topic "${dbSlug}" is not allowed by this subject/module/section.`,
              detail: {
                stepId: st.id,
                stepTopic: st.topic,
                normalized: dbSlug,
                allowedTopicSlugs,
              },
            },
            400,
            setGuestId,
        );
      }
    }

    questions = safeSteps.map((st, i) => {
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
        maxAttempts: resolveMaxAttempts(
            st.maxAttempts,
            spec.maxAttempts,
            null,
        ),
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

    const poolBySlug = new Map<
        string,
        { key: string; w: number; kind?: string | null }[]
    >();

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

      if (!pickedTopic) {
        break;
      }

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
            mode === "quiz" ? Array.isArray(outQuestions) && outQuestions.length < n : false,
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
    moduleSlug: parsed.moduleSlug,
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