import { prisma } from "@/lib/prisma";
import type { NextResponse } from "next/server";
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
  filterPoolForPurposeAndKind,
  type PoolItem,
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

type ReviewQuizQuestion = {
  kind: "practice";
  id: string;
  title?: string;
  carryFromPrev?: boolean;
  fetch: {
    subject: string;
    module?: string;
    section?: string;
    topic?: string;
    difficulty?: "easy" | "medium" | "hard";
    allowReveal?: boolean;
    preferPurpose?: "quiz" | "project";
    preferKind?: ReviewQuizRequestSpec["preferKind"];
    exerciseKey?: string;
    seedPolicy?: "actor" | "global";
    salt?: string;
  };
  maxAttempts?: number | null;
};

function asReviewQuizQuestions(value: unknown): ReviewQuizQuestion[] | null {
  return Array.isArray(value) ? (value as ReviewQuizQuestion[]) : null;
}

function isPrismaCodeError(
    error: unknown,
): error is { code?: string } {
  return typeof error === "object" && error !== null && "code" in error;
}

function defaultPurposeForMode(mode: "quiz" | "project") {
  return mode === "project" ? "project" : "quiz";
}

function explicitQuizExerciseKeys(spec: ReviewQuizRequestSpec) {
  return Array.isArray((spec as any).exerciseKeys)
    ? Array.from(
        new Set(
          ((spec as any).exerciseKeys as unknown[])
            .map((key) => String(key ?? "").trim())
            .filter(Boolean),
        ),
      )
    : [];
}

function isCodeInputPoolItem(item: PoolItem) {
  return String(item.kind ?? "").trim() === "code_input";
}

function quizPoolForTopic(slug: string, preferKind: ReviewQuizRequestSpec["preferKind"]) {
  const topic = findRegistryTopic(slug);
  const rawPool = readPoolFromTopicMeta(topic?.meta);
  const quizPool = filterPoolForPurposeAndKind(rawPool, "quiz", preferKind ?? null)
    .filter((item) => !isCodeInputPoolItem(item));

  return { topic, rawPool, quizPool };
}

function matchesProjectQuestionShape(args: {
  question: ReviewQuizQuestion;
  step: NonNullable<ReviewQuizRequestSpec["steps"]>[number];
  quizKey: string;
  index: number;
}) {
  const { question, step, quizKey, index } = args;
  const expectedTopic = toDbTopicSlug(step.topic ?? "");
  const expectedPurpose = defaultPurposeForMode("project");
  const expectedSalt = `${quizKey}|step=${step.id}|slot=${index + 1}`;

  return (
    question.kind === "practice" &&
    question.fetch?.topic === expectedTopic &&
    question.fetch?.preferPurpose === expectedPurpose &&
    (step.preferKind == null || question.fetch?.preferKind === step.preferKind) &&
    (step.exerciseKey == null || question.fetch?.exerciseKey === step.exerciseKey) &&
    question.fetch?.salt === expectedSalt
  );
}

function matchesQuizQuestionShape(args: {
  question: ReviewQuizQuestion;
  spec: ReviewQuizRequestSpec;
  index: number;
}) {
  const { question, spec, index } = args;
  const expectedTopic = spec.topic ? toDbTopicSlug(spec.topic) : "";
  const expectedPurpose = defaultPurposeForMode("quiz");
  const explicitKeys = explicitQuizExerciseKeys(spec);
  const expectedExerciseKey = explicitKeys[index] ?? null;

  return (
    question.kind === "practice" &&
    question.fetch?.preferPurpose === expectedPurpose &&
    (!expectedTopic || question.fetch?.topic === expectedTopic) &&
    (spec.preferKind == null || question.fetch?.preferKind === spec.preferKind) &&
    (!expectedExerciseKey || question.fetch?.exerciseKey === expectedExerciseKey)
  );
}

function existingQuestionsMatchSpec(args: {
  spec: ReviewQuizRequestSpec;
  mode: "quiz" | "project";
  quizKey: string;
  questions: ReviewQuizQuestion[];
}) {
  const { spec, mode, quizKey, questions } = args;

  if (mode === "project") {
    const steps = spec.steps ?? [];
    if (questions.length !== steps.length) return false;

    return steps.every((step, index) =>
      matchesProjectQuestionShape({
        question: questions[index] as ReviewQuizQuestion,
        step,
        quizKey,
        index,
      }),
    );
  }

  if (!questions.length) return false;

  const explicitKeys = explicitQuizExerciseKeys(spec);
  const expectedCount = explicitKeys.length || (spec.n ?? 4);
  if (questions.length !== expectedCount) return false;

  return questions.every((question, index) =>
    matchesQuizQuestionShape({
      question,
      spec,
      index,
    }),
  );
}

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

const DEV_REVIEW_CLONE_TOPICS = {
  python: {
    "e2e-review-clone": {
      "e2e-section": ["e2e-review-topic"],
    },
  },
  sql: {
    "e2e-sql-review-clone": {
      "e2e-sql-section": ["e2e-sql-topic"],
    },
  },
  linux: {
    "e2e-terminal-review-clone": {
      "e2e-terminal-section": ["e2e-terminal-topic"],
    },
  },
} as const;

function getDevCloneTopicSlugs(args: {
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug?: string | null;
}) {
  const subjectEntry =
    DEV_REVIEW_CLONE_TOPICS[
      args.subjectSlug as keyof typeof DEV_REVIEW_CLONE_TOPICS
    ];
  const moduleEntry =
    subjectEntry?.[
      args.moduleSlug as keyof typeof subjectEntry
    ] ?? null;

  if (!moduleEntry) return null;

  if (args.sectionSlug) {
    const sectionTopics =
      moduleEntry[
        args.sectionSlug as keyof typeof moduleEntry
      ] ?? null;

    return sectionTopics ? [...sectionTopics] : null;
  }

  return (Object.values(moduleEntry) as ReadonlyArray<readonly string[]>).flatMap(
    (topicSlugs) => topicSlugs.slice(),
  );
}

function hasReviewModuleOrDevClone(subjectSlug: string, moduleSlug: string) {
  return (
    hasReviewModule(subjectSlug, moduleSlug) ||
    Array.isArray(
      getDevCloneTopicSlugs({ subjectSlug, moduleSlug, sectionSlug: null }),
    )
  );
}

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
  const devCloneTopicSlugs = getDevCloneTopicSlugs(args);

  if (devCloneTopicSlugs) {
    return {
      ok: true as const,
      topicSlugs: devCloneTopicSlugs,
    };
  }

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
    return attachGuestCookie(gate.res as NextResponse, setGuestId);
  }

  if (!hasReviewModuleOrDevClone(gate.scope.subjectSlug, gate.scope.moduleSlug)) {
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
  const defaultPurpose = defaultPurposeForMode(mode);
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

  const existingQuestions = asReviewQuizQuestions(existing?.questions);
  const existingMatches =
      existingQuestions &&
      existingQuestionsMatchSpec({
        spec,
        mode,
        quizKey,
        questions: existingQuestions,
      });

  if (existingQuestions && existingMatches) {
    return bodyJsonWithGuestCookie(
        {
          questions: existingQuestions,
          quizKey,
          requested: mode === "project" ? (spec.steps?.length ?? 0) : n,
          generated: existingQuestions.length,
          frozen: true,
        },
        200,
        setGuestId,
    );
  }

  if (existingQuestions && !existingMatches) {
    await prisma.reviewQuizInstance.deleteMany({
      where: {
        actorKey,
        quizKey,
      },
    });
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

  let questions: ReviewQuizQuestion[] = [];

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
          preferPurpose: defaultPurposeForMode("project"),
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
    const explicitKeys = explicitQuizExerciseKeys(spec);
    const qk = shortHash(quizKey);

    if (explicitKeys.length) {
      if (wantsAll || !spec.topic) {
        return bodyJsonWithGuestCookie(
          {
            message: "Explicit authored quiz exercise keys require a concrete topic.",
            detail: {
              subject: spec.subject,
              module: spec.moduleSlug,
              section: spec.section ?? null,
              topic: spec.topic ?? null,
              exerciseKeys: explicitKeys,
            },
          },
          400,
          setGuestId,
        );
      }

      const dbSlug = toDbTopicSlug(spec.topic);

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
              exerciseKeys: explicitKeys,
            },
          },
          400,
          setGuestId,
        );
      }

      const { rawPool, quizPool } = quizPoolForTopic(dbSlug, spec.preferKind ?? null);
      const availableQuizKeys = new Set(quizPool.map((item) => item.key));
      const missingKeys = explicitKeys.filter((key) => !availableQuizKeys.has(key));

      if (missingKeys.length) {
        return bodyJsonWithGuestCookie(
          {
            message: "Authored quiz card references exercises that are not available in the quiz pool.",
            detail: {
              topic: dbSlug,
              missingKeys,
              exerciseKeys: explicitKeys,
              availableQuizKeys: quizPool.map((item) => item.key),
              rawPoolCount: rawPool.length,
              quizPoolCount: quizPool.length,
              preferPurpose: "quiz",
              preferKind: spec.preferKind ?? null,
            },
          },
          400,
          setGuestId,
        );
      }

      questions = explicitKeys.map((exerciseKey, i) => ({
        kind: "practice" as const,
        id: `q${i + 1}:${qk}:${shortHash(exerciseKey)}`,
        fetch: {
          subject: spec.subject,
          module: spec.moduleSlug,
          section: spec.section,
          topic: dbSlug,
          difficulty: spec.difficulty ?? "easy",
          allowReveal: Boolean(spec.allowReveal),
          preferPurpose: "quiz",
          preferKind: spec.preferKind ?? null,
          exerciseKey,
          seedPolicy: "global",
          salt: `${quizKey}|topic=${dbSlug}|slot=${i + 1}|q=${i + 1}|k=${exerciseKey}`,
        },
        maxAttempts: defaultMaxAttempts,
      }));
    } else {
      const rng = rngFromActor({
        userId: actor.userId,
        guestId: actor.guestId,
        sessionId: null,
        salt: `review-quiz-instance:${quizKey}`,
      });

      const pickedTopics = pickTopicsForQuizPreferUnique(rng, allowedTopicSlugs, n);
      const uniqPickedTopics = Array.from(new Set(pickedTopics));

      const poolBySlug = new Map<string, PoolItem[]>();

      for (const slug of uniqPickedTopics) {
        const { quizPool } = quizPoolForTopic(slug, spec.preferKind ?? null);
        poolBySlug.set(slug, quizPool);
      }

      const missingPool = uniqPickedTopics.filter(
        (s) => (poolBySlug.get(s)?.length ?? 0) === 0,
      );

      if (missingPool.length) {
        return bodyJsonWithGuestCookie(
          {
            message:
              "Cannot generate a no-duplicate quiz because some topics have no exercises after purpose/preferKind filtering.",
            detail: {
              missingPool,
              preferPurpose: "quiz",
              preferKind: spec.preferKind ?? null,
            },
          },
          400,
          setGuestId,
        );
      }

      const usedByTopic = new Map<string, Set<string>>();
      const out: ReviewQuizQuestion[] = [];

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
            preferPurpose: defaultPurpose,
            preferKind: spec.preferKind ?? null,
            exerciseKey,
            salt: `${quizKey}|topic=${pickedTopic}|slot=${i + 1}|q=${i + 1}|k=${exerciseKey}`,
          },
          maxAttempts: defaultMaxAttempts,
        });
      }

      questions = out;
    }
  }
  if (mode === "quiz" && questions.length === 0) {
    return bodyJsonWithGuestCookie(
      {
        message: "Quiz generation returned no questions.",
        detail: {
          subject: spec.subject,
          module: spec.moduleSlug,
          section: spec.section ?? null,
          topic: spec.topic ?? null,
          requested: n,
          exerciseKeys: explicitQuizExerciseKeys(spec),
          allowedTopicSlugs,
          preferPurpose: "quiz",
          preferKind: spec.preferKind ?? null,
        },
      },
      400,
      setGuestId,
    );
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
  } catch (error: unknown) {
    if (!isPrismaCodeError(error) || error.code !== "P2002") throw error;
  }

  const saved = await prisma.reviewQuizInstance.findUnique({
    where: {
      actorKey_quizKey: { actorKey, quizKey },
    },
    select: {
      questions: true,
    },
  });

  const outQuestions = asReviewQuizQuestions(saved?.questions) ?? questions;

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
    return attachGuestCookie(gate.res as NextResponse, setGuestId);
  }

  if (!hasReviewModuleOrDevClone(gate.scope.subjectSlug, gate.scope.moduleSlug)) {
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
