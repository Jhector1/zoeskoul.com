import { buildReviewFromManifestCore } from "@zoeskoul/curriculum-runtime/review";
import { makeTopicDef } from "@/lib/subjects/_core/topicMeta";
import type { TopicBundleManifest } from "@/lib/subjects/_core/manifestTypes";
import type {
  Difficulty,
  ReviewEmbeddedTryIt,
  ReviewModule,
  ReviewModuleSection,
  ReviewProjectSpec,
  ReviewProjectStep,
  ReviewTopicShape,
  SeedPolicy,
} from "@/lib/subjects/types";
import type { PracticeKind } from "@zoeskoul/db";
import { loadDraftModuleTopics, subjectWithoutDraftWrapper, type DraftRef, type LoadedDraftTopic } from "./fs";

type JsonObject = Record<string, unknown>;

const TRY_IT_EXERCISE_STEP_FIELDS = [
  "kind",
  "purpose",
  "language",
  "lang",
  "starterCode",
  "starterFiles",
  "workspace",
  "files",
  "initialFiles",
  "workspaceFiles",
  "fixtureFiles",
  "fixtures",
  "fileFixtures",
  "runtime",
  "recipe",
  "ideConfig",
  "solutionCode",
  "solutionFiles",
  "tests",
  "expected",
  "messageBase",
  "datasetId",
  "sqlDatasetId",
  "fixedSqlDialect",
  "sqlDialect",
  "sqlSchemaSql",
  "sqlSeedSql",
  "sqlInitialTableSnapshots",
] as const;

function asRecord(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getByPath(root: unknown, keyPath: string) {
  const parts = keyPath.split(".").filter(Boolean);
  let current: unknown = root;

  for (const part of parts) {
    const object = asRecord(current);
    if (!object) return undefined;
    current = object[part];
  }

  return current;
}

function normalizeMessageRef(value: string) {
  return value.startsWith("@:") ? value.slice(2) : value;
}

function createDraftMessageResolver(messagesJson: unknown | null) {
  return (rawKey: string, fallback = rawKey) => {
    const key = normalizeMessageRef(rawKey);
    const resolved = messagesJson ? getByPath(messagesJson, key) : undefined;
    return typeof resolved === "string" ? resolved : fallback;
  };
}

function deepResolveTagged(value: unknown, resolveMessage: (key: string, fallback?: string) => string): unknown {
  if (typeof value === "string") {
    if (!value.startsWith("@:")) return value;
    return resolveMessage(value, value);
  }

  if (Array.isArray(value)) return value.map((item) => deepResolveTagged(item, resolveMessage));

  const object = asRecord(value);
  if (!object) return value;

  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [key, deepResolveTagged(child, resolveMessage)]),
  );
}

function normalizeExercisePurpose(value: unknown, kind?: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "quiz") return "quiz";
  if (raw === "project" || raw === "try_it" || raw === "try-it" || raw === "practice" || raw === "capstone") {
    return "project";
  }
  if (!raw && String(kind ?? "").trim() === "code_input") return "project";
  if (!raw) return "quiz";
  return raw;
}

type DraftPoolItem = {
  key: string;
  w: number;
  kind: string | null;
  purpose: string;
};

function buildPool(manifest: TopicBundleManifest): DraftPoolItem[] {
  const exercises = Array.isArray(manifest.exercises) ? manifest.exercises : [];
  const pool: DraftPoolItem[] = [];

  for (const exercise of exercises) {
    const record = asRecord(exercise);
    const key = asString(record?.id);
    if (!key) continue;

    const kind = asString(record?.kind) || null;
    pool.push({
      key,
      w: asNumber(record?.weight) ?? 1,
      kind,
      purpose: normalizeExercisePurpose(record?.purpose, kind),
    });
  }

  return pool;
}

function pickExerciseStepFields(exercise: JsonObject | null, resolveMessage: (key: string, fallback?: string) => string) {
  if (!exercise) return {};

  const picked: JsonObject = {};
  for (const key of TRY_IT_EXERCISE_STEP_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(exercise, key)) {
      const value = exercise[key];
      if (value !== undefined) picked[key] = value;
    }
  }

  return deepResolveTagged(picked, resolveMessage) as JsonObject;
}

function findExerciseManifestByKey(manifest: TopicBundleManifest, exerciseKey: string) {
  const exercises = Array.isArray(manifest.exercises) ? manifest.exercises : [];
  for (const exercise of exercises) {
    const record = asRecord(exercise);
    if (!record) continue;

    const id = asString(record.id);
    const key = asString(record.exerciseKey);
    const exerciseId = asString(record.exerciseId);
    const stableId = asString(record.stableExerciseId);
    if (id === exerciseKey || key === exerciseKey || exerciseId === exerciseKey || stableId === exerciseKey) return record;
  }

  return null;
}

function authoredQuizExerciseKeys(manifest: TopicBundleManifest, rawCard: JsonObject | null) {
  const rawQuiz = asRecord(rawCard?.quiz);
  const explicit = Array.isArray(rawQuiz?.exerciseKeys)
    ? rawQuiz.exerciseKeys.map((key) => asString(key)).filter(Boolean)
    : [];
  if (explicit.length) return Array.from(new Set(explicit));

  const exercises = Array.isArray(manifest.exercises) ? manifest.exercises : [];
  const keys = exercises
    .map((exercise) => asRecord(exercise))
    .filter((exercise): exercise is JsonObject => Boolean(exercise))
    .filter((exercise) => {
      const id = asString(exercise.id);
      if (!id) return false;
      if (String(exercise.kind ?? "").trim() === "code_input") return false;
      return normalizeExercisePurpose(exercise.purpose, exercise.kind) === "quiz";
    })
    .map((exercise) => asString(exercise.id))
    .filter(Boolean);

  const n = Number(rawQuiz?.n ?? keys.length);
  const limit = Number.isFinite(n) && n > 0 ? Math.min(keys.length, Math.floor(n)) : keys.length;
  return Array.from(new Set(keys.slice(0, limit)));
}

function sketchSpecFromManifest(args: {
  manifest: TopicBundleManifest;
  sketchId: string;
  resolveMessage: (key: string, fallback?: string) => string;
}) {
  const sketch = (Array.isArray(args.manifest.sketches) ? args.manifest.sketches : [])
    .map((item) => asRecord(item))
    .find((item) => asString(item?.id) === args.sketchId);
  if (!sketch) return null;

  const runtime = sketch.runtime ?? args.manifest.runtimeDefaults ?? null;
  const archetype = asString(sketch.archetype) || "paragraph";

  if (archetype === "image") {
    const titleKey = asString(sketch.titleKey);
    const altKey = asString(sketch.altKey);
    const captionKey = asString(sketch.captionKey);
    return {
      archetype: "image",
      specVersion: 1,
      ...(titleKey ? { title: args.resolveMessage(titleKey, titleKey) } : {}),
      ...(asString(sketch.src) ? { src: asString(sketch.src) } : {}),
      ...(asString(sketch.publicId) ? { publicId: asString(sketch.publicId) } : {}),
      ...(altKey ? { alt: args.resolveMessage(altKey, altKey) } : {}),
      ...(captionKey ? { caption: args.resolveMessage(captionKey, captionKey) } : {}),
      ...(typeof sketch.aspectRatio === "number" ? { aspectRatio: sketch.aspectRatio } : {}),
      ...(Array.isArray(sketch.markers)
        ? {
            markers: sketch.markers.map((marker) => {
              const markerRecord = asRecord(marker) ?? {};
              const labelKey = asString(markerRecord.labelKey);
              return {
                id: asString(markerRecord.id),
                x: Number(markerRecord.x ?? 0),
                y: Number(markerRecord.y ?? 0),
                ...(labelKey ? { label: args.resolveMessage(labelKey, labelKey) } : {}),
              };
            }),
          }
        : {}),
      ...(runtime ? { runtime } : {}),
    };
  }

  const titleKey = asString(sketch.titleKey);
  const bodyKey = asString(sketch.bodyKey);
  return {
    archetype: "paragraph",
    specVersion: 2,
    ...(titleKey ? { title: args.resolveMessage(titleKey, titleKey) } : {}),
    ...(bodyKey ? { bodyMarkdown: args.resolveMessage(bodyKey, bodyKey) } : {}),
    ...(runtime ? { runtime } : {}),
  };
}

function enrichReviewTopic(args: {
  topic: ReviewTopicShape;
  manifest: TopicBundleManifest;
  resolveMessage: (key: string, fallback?: string) => string;
}) {
  const rawCards = Array.isArray(args.manifest.cards) ? args.manifest.cards : [];
  const resolvedManifest = deepResolveTagged(args.manifest, args.resolveMessage) as TopicBundleManifest;
  const topicSlug = `${args.manifest.prefix}.${args.manifest.topicId}`;

  const cards = args.topic.cards.map((card, index) => {
    const rawCard =
      asRecord(rawCards[index]) ??
      asRecord(
        rawCards.find((candidate) => {
          const candidateRecord = asRecord(candidate);
          return candidateRecord?.id === card.id;
        }),
      );
    if (!rawCard) return card;

    let nextCard: typeof card = card;

    if (nextCard.type === "sketch") {
      const rawSketchId = asString(rawCard.sketchId) || asString((nextCard as any).sketchId);
      const props = rawSketchId
        ? sketchSpecFromManifest({ manifest: args.manifest, sketchId: rawSketchId, resolveMessage: args.resolveMessage })
        : null;
      if (props) {
        nextCard = {
          ...nextCard,
          props: {
            ...(asRecord((nextCard as any).props) ?? {}),
            ...props,
          },
        } as typeof card;
      }
    }

    if (nextCard.type === "quiz") {
      const exerciseKeys = authoredQuizExerciseKeys(args.manifest, rawCard);
      if (!exerciseKeys.length) return nextCard;
      return {
        ...nextCard,
        spec: {
          ...(nextCard as any).spec,
          subject: args.manifest.subjectSlug,
          moduleSlug: args.manifest.moduleSlug,
          section: args.manifest.sectionSlug,
          topic: topicSlug,
          exerciseKeys,
          n: exerciseKeys.length,
        },
      } as typeof card;
    }

    if (nextCard.type === "project") {
      const spec = (nextCard as any).spec as ReviewProjectSpec;
      const steps = Array.isArray(spec?.steps) ? spec.steps : [];
      const enrichedSteps = steps.map((step) => {
        const exerciseKey = asString(step.exerciseKey) || asString(step.id);
        const authoredExercise = exerciseKey ? findExerciseManifestByKey(args.manifest, exerciseKey) : null;
        const authoredFields = pickExerciseStepFields(authoredExercise, args.resolveMessage);
        const resolvedStep = deepResolveTagged(step, args.resolveMessage) as ReviewProjectStep;
        return {
          ...authoredFields,
          ...resolvedStep,
          exerciseKey: asString(resolvedStep.exerciseKey) || exerciseKey || asString(authoredExercise?.id),
        } as ReviewProjectStep;
      });

      return {
        ...nextCard,
        spec: {
          ...spec,
          subject: args.manifest.subjectSlug,
          moduleSlug: args.manifest.moduleSlug,
          section: args.manifest.sectionSlug,
          topic: topicSlug,
          steps: enrichedSteps,
          runtime: args.manifest.runtimeDefaults ?? spec?.runtime ?? null,
        },
      } as typeof card;
    }

    if (nextCard.type !== "text" && nextCard.type !== "sketch") return nextCard;

    const rawTryIt = asRecord(rawCard.tryIt);
    if (!rawTryIt) return nextCard;

    const tryItId = asString(rawTryIt.id);
    const exerciseKey = asString(rawTryIt.exerciseKey);
    if (!tryItId || !exerciseKey) return nextCard;

    const titleKey = asString(rawTryIt.titleKey);
    const promptKey = asString(rawTryIt.promptKey);
    const title = titleKey ? args.resolveMessage(titleKey, titleKey) : undefined;
    const prompt = promptKey ? args.resolveMessage(promptKey, promptKey) : undefined;
    const difficulty = (asString(rawTryIt.difficulty) || "easy") as Difficulty;
    const preferKind = (asString(rawTryIt.preferKind) || "code_input") as PracticeKind;
    const seedPolicy = (asString(rawTryIt.seedPolicy) || "global") as SeedPolicy;
    const maxAttempts = typeof rawTryIt.maxAttempts === "number" ? rawTryIt.maxAttempts : null;
    const authoredExercise = findExerciseManifestByKey(args.manifest, exerciseKey);
    const authoredExerciseStepFields = pickExerciseStepFields(authoredExercise, args.resolveMessage);

    const tryItStep = {
      ...authoredExerciseStepFields,
      id: tryItId.replace(/-/g, "_"),
      title,
      prompt,
      exerciseKey,
      difficulty,
      preferKind,
      seedPolicy,
      maxAttempts,
    };

    const spec: ReviewProjectSpec = {
      mode: "project",
      subject: args.manifest.subjectSlug,
      moduleSlug: args.manifest.moduleSlug,
      section: args.manifest.sectionSlug,
      topic: topicSlug,
      difficulty,
      preferKind,
      allowReveal: true,
      maxAttempts,
      steps: [tryItStep as ReviewProjectStep],
      runtime: args.manifest.runtimeDefaults ?? null,
      tryIt: true,
      uiKind: "try_it",
      displayKind: "try_it",
    } as ReviewProjectSpec;

    const tryIt: ReviewEmbeddedTryIt = {
      id: tryItId,
      title,
      prompt,
      exerciseKey,
      difficulty,
      preferKind,
      seedPolicy,
      required: rawTryIt.required !== false,
      allowReveal: true,
      maxAttempts: maxAttempts ?? undefined,
      spec,
    };

    return {
      ...nextCard,
      tryIt,
    } as typeof card;
  });

  return {
    ...args.topic,
    meta: {
      ...(args.topic.meta ?? {}),
      rawManifest: resolvedManifest,
      runtimeDefaults: args.manifest.runtimeDefaults ?? args.topic.meta?.runtimeDefaults ?? null,
      serviceDefaults: (args.manifest as any).serviceDefaults ?? args.topic.meta?.serviceDefaults ?? null,
      draftPreview: true,
    },
    cards,
  } as ReviewTopicShape;
}

function buildDraftPreviewTopic(loadedTopic: LoadedDraftTopic) {
  const manifest = loadedTopic.bundleJson as TopicBundleManifest;
  const resolveMessage = createDraftMessageResolver(loadedTopic.messagesJson);
  const pool = buildPool(manifest);

  const built = buildReviewFromManifestCore({
    manifest,
    pool,
    tag: (key) => resolveMessage(key, key) as any,
    makeTopicDef: (input) => makeTopicDef(input as any),
  }) as { topic: ReviewTopicShape };

  return {
    manifest,
    resolveMessage,
    reviewTopic: enrichReviewTopic({
      topic: built.topic,
      manifest,
      resolveMessage,
    }),
  };
}

function humanizeSlug(value: string) {
  return value
    .replace(/--draft$/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function draftPreviewProfileId(catalog: string, subjectSlug: string) {
  const normalizedCatalog = catalog.trim().toLowerCase();
  const normalizedSubject = subjectSlug.trim().toLowerCase();

  // Raw draft preview can use draft subject slugs like
  // python--applied-python-projects--draft. The normal tool policy needs the
  // real programming profile id so the Code/Run tool becomes available.
  if (normalizedCatalog === "python" || normalizedSubject.includes("python")) return "python";
  if (normalizedCatalog === "sql" || normalizedSubject.includes("sql")) return "sql";
  if (
    normalizedCatalog === "linux" ||
    normalizedCatalog === "bash" ||
    normalizedSubject.includes("linux") ||
    normalizedSubject.includes("terminal") ||
    normalizedSubject.includes("bash")
  ) {
    return "bash";
  }

  return subjectWithoutDraftWrapper(catalog, subjectSlug);
}

export async function buildDraftPreviewReviewModule(ref: DraftRef): Promise<ReviewModule> {
  const draftModule = await loadDraftModuleTopics(ref);
  if (!draftModule.topics.length) {
    throw new Error(`No draft topics found for ${ref.catalog}/${ref.subject}/${ref.module}`);
  }

  const builtTopics = draftModule.topics.map((topic) => buildDraftPreviewTopic(topic));
  const primary = builtTopics.find((topic, index) => draftModule.topics[index]?.topicDir === draftModule.selectedTopicDir) ?? builtTopics[0];
  if (!primary) {
    throw new Error(`No draft topics could be built for ${ref.catalog}/${ref.subject}/${ref.module}`);
  }
  const primaryManifest = primary.manifest;

  const topics = builtTopics.map((topic) => topic.reviewTopic);
  const sectionBySlug = new Map<string, ReviewModuleSection>();

  for (const { manifest, resolveMessage, reviewTopic } of builtTopics) {
    const sectionSlug = asString(manifest.sectionSlug) || `${manifest.subjectSlug}-${manifest.moduleSlug}`;
    const section = sectionBySlug.get(sectionSlug) ?? {
      id: sectionSlug,
      slug: sectionSlug,
      title: resolveMessage(
        `topics.${manifest.subjectSlug}.${manifest.moduleSlug}.${manifest.topicId}.sectionTitle`,
        humanizeSlug(sectionSlug),
      ),
      summary: null,
      description: "Dev-only draft preview loaded directly from .curriculum-drafts.",
      order: sectionBySlug.size + 1,
      runtimeDefaults: manifest.runtimeDefaults ?? null,
      topics: [],
    };

    section.topics.push(reviewTopic);
    sectionBySlug.set(sectionSlug, section);
  }

  const sections = Array.from(sectionBySlug.values());
  const fallbackSectionSlug = asString(primaryManifest.sectionSlug) || `${primaryManifest.subjectSlug}-${primaryManifest.moduleSlug}`;
  const firstSectionSlug = sections[0]?.slug ?? fallbackSectionSlug;

  return {
    id: primaryManifest.moduleSlug,
    title: humanizeSlug(primaryManifest.moduleSlug),
    subtitle: "Draft preview — loaded directly from .curriculum-drafts",
    startPracticeSectionSlug: firstSectionSlug,
    profileId: draftPreviewProfileId(ref.catalog, primaryManifest.subjectSlug),
    versionFamily: ref.catalog,
    runtimeDefaults: primaryManifest.runtimeDefaults ?? null,
    serviceDefaults: (primaryManifest as any).serviceDefaults ?? null,
    topics,
    sections,
    contentVersion: null,
  };
}
