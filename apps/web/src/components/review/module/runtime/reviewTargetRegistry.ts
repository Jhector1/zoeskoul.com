import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import { getCardStateKey, getExerciseStateKey } from "./exerciseKeys";
import { resolveCourseLanguage, resolveCourseFileSeed, resolveRuntimeDefaultDataset } from "./courseProfiles";

export type ReviewTargetKind = "sketch" | "exercise" | "quiz" | "card" | "project" | "text" | "video";

export type ReviewTargetEntry = {
  targetKey: string;
  routeKey: string;
  targetKind: ReviewTargetKind;
  sectionSlug: string;
  topicId: string;
  topicSlug: string;
  cardId: string;
  cardType: ReviewCard["type"];
  targetSlug: string;
  ownerKind: "card" | "exercise";
  ownerKey: string;
  cardKey: string;
  toolScopeKey: string;
  exerciseId?: string;
  exerciseStateKey?: string;
  language?: string;
  starterFiles?: any;
  solutionFiles?: any;
  starterCode?: string;
  solutionCode?: string;
  starterWorkspace?: any;
  runtimeDefaults?: any;
  topicRuntimeDefaults?: any;
  moduleRuntimeDefaults?: any;
  sqlDatasetId?: string;
  sqlDatasetResolutionSource?: string;
  sqlDatasetResolutionError?: string;
  toolManifest?: any;
  item: any;
};

export type ReviewTargetRegistry = {
  byKey: Record<string, ReviewTargetEntry>;
  orderedKeys: string[];
  byRoute: Record<string, string>;
};

function cleanSegment(value: unknown, fallback = "item") {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  return (
    raw
      .replace(/\./g, "-")
      .replace(/_/g, "-")
      .replace(/[^a-zA-Z0-9-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || fallback
  );
}

function lastIdSegment(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const parts = raw.split(/[.:/]/).filter(Boolean);
  return parts[parts.length - 1] ?? raw;
}

function getTopicRouteSlug(topicId: string) {
  return cleanSegment(topicId, "topic");
}

function getCardTargetKind(card: ReviewCard): ReviewTargetKind {
  switch (card.type) {
    case "sketch":
    case "quiz":
    case "project":
    case "text":
    case "video":
      return card.type;
    default:
      return "card";
  }
}

function getCardTargetSlug(card: ReviewCard) {
  if (card.type === "sketch") {
    return cleanSegment(lastIdSegment(card.sketchId), cleanSegment(card.id, "sketch"));
  }
  return cleanSegment(card.id, "card");
}


function registryLooksLikePythonStarterCode(value: string) {
  const s = String(value ?? "").trim();
  if (!s || s.length > 5000) return false;

  return (
    /\bprint\s*\(/.test(s) ||
    /\binput\s*\(/.test(s) ||
    /\bint\s*\(/.test(s) ||
    /\bfloat\s*\(/.test(s) ||
    /\bstr\s*\(/.test(s) ||
    /\bdef\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(s) ||
    /^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*=/.test(s) ||
    /#\s*TODO/i.test(s)
  );
}

function extractRegistryCodeFence(value: string) {
  const source = String(value ?? "");

  const preferred = source.match(/```(?:python|py)\s*([\s\S]*?)```/i);
  if (preferred?.[1]?.trim()) return preferred[1].trim();

  const generic = source.match(/```\s*([\s\S]*?)```/);
  if (generic?.[1]?.trim() && registryLooksLikePythonStarterCode(generic[1])) {
    return generic[1].trim();
  }

  return "";
}

function extractRegistryStarterCodeFromLooseContent(input: unknown, seen = new WeakSet<object>()): string {
  if (input == null) return "";

  if (typeof input === "string") {
    const fenced = extractRegistryCodeFence(input);
    if (fenced) return fenced;
    return registryLooksLikePythonStarterCode(input) ? input.trim() : "";
  }

  if (typeof input !== "object") return "";

  if (seen.has(input as object)) return "";
  seen.add(input as object);

  if (Array.isArray(input)) {
    for (const item of input) {
      const found = extractRegistryStarterCodeFromLooseContent(item, seen);
      if (found) return found;
    }
    return "";
  }

  const obj = input as Record<string, unknown>;

  const preferredKeys = [
    "starterCode",
    "code",
    "content",
    "source",
    "body",
    "markdown",
    "md",
    "text",
    "prompt",
    "instructions",
    "description",
    "example",
    "examples",
    "steps",
    "cards",
    "blocks",
    "children",
    "items",
    "recipe",
    "workspace",
    "spec"
  ];

  for (const key of preferredKeys) {
    if (key in obj) {
      const found = extractRegistryStarterCodeFromLooseContent(obj[key], seen);
      if (found) return found;
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (preferredKeys.includes(key)) continue;
    const found = extractRegistryStarterCodeFromLooseContent(value, seen);
    if (found) return found;
  }

  return "";
}


function pickStarterFiles(item: any, subjectSlug: string, language?: string) {
  return resolveCourseFileSeed({ subjectSlug, language, target: item }).starterFiles;
}

function pickSolutionFiles(item: any, subjectSlug: string, language?: string) {
  return resolveCourseFileSeed({ subjectSlug, language, target: item }).solutionFiles;
}

function pickStarterCode(item: any, subjectSlug: string, language?: string) {
  const explicit = resolveCourseFileSeed({ subjectSlug, language, target: item }).starterCode;
  if (explicit) return explicit;

  // Important: scan the full item, not only item.spec.
  // Some lesson/project/sketch Python examples live on card.content/body/blocks,
  // while spec only has runtime/workspace metadata. This remains a fallback only.
  return extractRegistryStarterCodeFromLooseContent(item) || undefined;
}

function pickSolutionCode(item: any, subjectSlug: string, language?: string) {
  return resolveCourseFileSeed({ subjectSlug, language, target: item }).solutionCode;
}

function defaultLanguageForSubject(subjectSlug: string) {
  switch (subjectSlug) {
    case "sql":
      return "sql";
    case "java":
      return "java";
    case "javascript":
      return "javascript";
    case "c":
      return "c";
    case "cpp":
      return "cpp";
    case "python":
    case "python-for-beginners":
    default:
      return "python";
  }
}

function inferRuntimeDefaultLanguage(runtimeDefaults: any, subjectSlug: string) {
  const explicit = String(runtimeDefaults?.language ?? runtimeDefaults?.lang ?? "").trim();
  if (explicit) return explicit;

  if (String(runtimeDefaults?.kind ?? "").toLowerCase() === "sql") {
    return "sql";
  }

  return defaultLanguageForSubject(subjectSlug);
}

function pickLanguage(item: any, fallbackLanguage: string, subjectSlug: string, runtimeDefaults: any) {
  return resolveCourseLanguage({
    subjectSlug,
    language: fallbackLanguage,
    runtimeDefaults,
    target: item,
  });
}

function buildRuntimeEntryContext(args: {
  subjectSlug: string;
  item: any;
  topicRuntimeDefaults: any;
  moduleRuntimeDefaults: any;
  fallbackLanguage: string;
}) {
  const language = pickLanguage(
    args.item,
    args.fallbackLanguage,
    args.subjectSlug,
    args.topicRuntimeDefaults ?? args.moduleRuntimeDefaults,
  );
  const datasetResolution = resolveRuntimeDefaultDataset({
    subjectSlug: args.subjectSlug,
    language,
    target: args.item,
    topicRuntimeDefaults: args.topicRuntimeDefaults,
    moduleRuntimeDefaults: args.moduleRuntimeDefaults,
    runtimeDefaults: args.topicRuntimeDefaults ?? args.moduleRuntimeDefaults,
  });

  return { language, datasetResolution };
}

function buildRouteKey(args: {
  sectionSlug: string;
  topicSlug: string;
  targetKind: string;
  targetSlug: string;
}) {
  return `${args.sectionSlug}/${args.topicSlug}/${args.targetKind}/${args.targetSlug}`;
}

function buildToolManifest(card: ReviewCard) {
  if (card.type === "sketch") {
    return {
      ...(card.spec ?? {}),
      runtime: (card.spec as any)?.runtime ?? null,
      workspace: (card.spec as any)?.workspace ?? null,
    };
  }

  if (card.type === "project" || card.type === "quiz") {
    return {
      ...(card.spec ?? {}),
      runtime: (card.spec as any)?.runtime ?? null,
      workspace: (card.spec as any)?.workspace ?? null,
    };
  }

  return {
    ...(card as any)?.spec,
    workspace: (card as any)?.spec?.workspace ?? null,
  };
}

function getProjectExerciseEntries(card: Extract<ReviewCard, { type: "project" }>) {
  const steps = Array.isArray(card.spec?.steps) ? card.spec.steps : [];
  return steps
    .map((step: any) => {
      const exerciseId =
        typeof step?.exerciseKey === "string" && step.exerciseKey.trim()
          ? step.exerciseKey.trim()
          : typeof step?.id === "string" && step.id.trim()
            ? step.id.trim()
            : "";

      return {
        step,
        exerciseId,
        routeSlug: cleanSegment(
          typeof step?.id === "string" && step.id.trim() ? step.id : exerciseId,
          "exercise",
        ),
      };
    })
    .filter((entry) => entry.exerciseId);
}

export function buildReviewTargetRegistry(args: {
  mod: ReviewModule;
  subjectSlug: string;
  moduleSlug: string;
}): ReviewTargetRegistry {
  const { mod, subjectSlug, moduleSlug } = args;
  const byKey: Record<string, ReviewTargetEntry> = {};
  const orderedKeys: string[] = [];
  const byRoute: Record<string, string> = {};

  const sections = Array.isArray(mod.sections) ? mod.sections : [];

  for (const section of sections) {
    const sectionSlug = section.slug;
    const topics = Array.isArray(section.topics) ? section.topics : [];

    for (const topic of topics) {
      const topicId = topic.id;
      const topicSlug = getTopicRouteSlug(topicId);
      const rawManifest = (topic.meta as any)?.rawManifest ?? null;
      const moduleRuntimeDefaults =
        (mod as any)?.runtimeDefaults ??
        (mod as any)?.meta?.runtimeDefaults ??
        null;
      const topicRuntimeDefaults =
        (topic as any)?.meta?.runtimeDefaults ??
        moduleRuntimeDefaults ??
        null;
      const topicFallbackLanguage = inferRuntimeDefaultLanguage(
        topicRuntimeDefaults,
        subjectSlug,
      );
      const rawSketches = Array.isArray(rawManifest?.sketches) ? rawManifest.sketches : [];
      const rawExercises = Array.isArray(rawManifest?.exercises) ? rawManifest.exercises : [];
      const cards = Array.isArray(topic.cards) ? topic.cards : [];

      for (const card of cards) {
        const rawSketch =
          card.type === "sketch"
            ? rawSketches.find((sketch: any) => sketch?.id === lastIdSegment((card as any).sketchId))
            : null;
        const cardKey = getCardStateKey({
          subjectSlug,
          moduleSlug,
          sectionSlug,
          topicId,
          cardId: card.id,
        });
        const cardTargetKind = getCardTargetKind(card);
        const cardTargetSlug = getCardTargetSlug(card);
        const cardRouteKey = buildRouteKey({
          sectionSlug,
          topicSlug,
          targetKind: cardTargetKind,
          targetSlug: cardTargetSlug,
        });
        const cardRuntimeContext = buildRuntimeEntryContext({
          subjectSlug,
          item: rawSketch ?? card,
          topicRuntimeDefaults,
          moduleRuntimeDefaults,
          fallbackLanguage: topicFallbackLanguage,
        });
        const cardEntry: ReviewTargetEntry = {
          targetKey: `card:${cardKey}`,
          routeKey: cardRouteKey,
          targetKind: cardTargetKind,
          sectionSlug,
          topicId,
          topicSlug,
          cardId: card.id,
          cardType: card.type,
          targetSlug: cardTargetSlug,
          ownerKind: "card",
          ownerKey: cardKey,
          cardKey,
          toolScopeKey: `${cardKey}:general`,
          language: cardRuntimeContext.language,
          starterFiles: pickStarterFiles(rawSketch ?? card, subjectSlug, cardRuntimeContext.language),
          solutionFiles: pickSolutionFiles(rawSketch ?? card, subjectSlug, cardRuntimeContext.language),
          starterCode: pickStarterCode(rawSketch ?? card, subjectSlug, cardRuntimeContext.language),
          solutionCode: pickSolutionCode(rawSketch ?? card, subjectSlug, cardRuntimeContext.language),
          runtimeDefaults: topicRuntimeDefaults,
          topicRuntimeDefaults,
          moduleRuntimeDefaults,
          sqlDatasetId: cardRuntimeContext.datasetResolution.datasetId,
          sqlDatasetResolutionSource: cardRuntimeContext.datasetResolution.source,
          sqlDatasetResolutionError: cardRuntimeContext.datasetResolution.error,
          starterWorkspace: rawSketch?.workspace ?? (card.spec as any)?.workspace ?? null,
          toolManifest: rawSketch
            ? {
                ...rawSketch,
                runtime: rawSketch.runtime ?? (card.spec as any)?.runtime ?? null,
                workspace: rawSketch.workspace ?? (card.spec as any)?.workspace ?? null,
              }
            : buildToolManifest(card),
          item: rawSketch ?? card,
        };

        byKey[cardEntry.targetKey] = cardEntry;
        byRoute[cardRouteKey] = cardEntry.targetKey;
        orderedKeys.push(cardEntry.targetKey);

        if (card.type !== "project") continue;

        for (const exercise of getProjectExerciseEntries(card)) {
          const rawExercise =
            rawExercises.find((item: any) => item?.id === exercise.exerciseId) ??
            rawExercises.find((item: any) => item?.id === exercise.step?.id) ??
            null;
          const exerciseStateKey = getExerciseStateKey(
            {
              subjectSlug,
              moduleSlug,
              sectionSlug,
              topicId,
              cardId: card.id,
            },
            exercise.exerciseId,
          );
          const exerciseRouteKey = buildRouteKey({
            sectionSlug,
            topicSlug,
            targetKind: "exercise",
            targetSlug: exercise.routeSlug,
          });
          const exerciseRuntimeContext = buildRuntimeEntryContext({
            subjectSlug,
            item: rawExercise ?? exercise.step,
            topicRuntimeDefaults,
            moduleRuntimeDefaults,
            fallbackLanguage: topicFallbackLanguage,
          });
          const exerciseEntry: ReviewTargetEntry = {
            targetKey: `exercise:${exerciseStateKey}`,
            routeKey: exerciseRouteKey,
            targetKind: "exercise",
            sectionSlug,
            topicId,
            topicSlug,
            cardId: card.id,
            cardType: card.type,
            targetSlug: exercise.routeSlug,
            ownerKind: "exercise",
            ownerKey: exerciseStateKey,
            cardKey,
            toolScopeKey: exerciseStateKey,
            exerciseId: exercise.exerciseId,
            exerciseStateKey,
            language: exerciseRuntimeContext.language,
            starterFiles: pickStarterFiles(rawExercise ?? exercise.step, subjectSlug, exerciseRuntimeContext.language),
            solutionFiles: pickSolutionFiles(rawExercise ?? exercise.step, subjectSlug, exerciseRuntimeContext.language),
            starterCode: pickStarterCode(rawExercise ?? exercise.step, subjectSlug, exerciseRuntimeContext.language),
            solutionCode: pickSolutionCode(rawExercise ?? exercise.step, subjectSlug, exerciseRuntimeContext.language),
            runtimeDefaults: topicRuntimeDefaults,
            topicRuntimeDefaults,
            moduleRuntimeDefaults,
            sqlDatasetId: exerciseRuntimeContext.datasetResolution.datasetId,
            sqlDatasetResolutionSource: exerciseRuntimeContext.datasetResolution.source,
            sqlDatasetResolutionError: exerciseRuntimeContext.datasetResolution.error,
            starterWorkspace: rawExercise?.workspace ?? exercise.step?.workspace ?? null,
            toolManifest: rawExercise ?? exercise.step ?? null,
            item: rawExercise ?? exercise.step,
          };

          byKey[exerciseEntry.targetKey] = exerciseEntry;
          byRoute[exerciseRouteKey] = exerciseEntry.targetKey;
          orderedKeys.push(exerciseEntry.targetKey);
        }
      }
    }
  }

  return { byKey, orderedKeys, byRoute };
}

export function getReviewTargetEntryByRoute(
  registry: ReviewTargetRegistry | null | undefined,
  route: {
    sectionSlug?: string | null;
    topicSlug?: string | null;
    targetKind?: string | null;
    targetSlug?: string | null;
  },
) {
  if (!registry) return null;
  const { sectionSlug, topicSlug, targetKind, targetSlug } = route;
  if (!sectionSlug || !topicSlug || !targetKind || !targetSlug) return null;
  const routeKey = buildRouteKey({ sectionSlug, topicSlug, targetKind, targetSlug });
  const targetKey = registry.byRoute[routeKey];
  return targetKey ? registry.byKey[targetKey] ?? null : null;
}
