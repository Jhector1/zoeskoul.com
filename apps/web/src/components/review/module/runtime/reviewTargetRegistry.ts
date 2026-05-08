import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import { getCardStateKey, getExerciseStateKey } from "./exerciseKeys";
import { resolveCourseLanguage, resolveCourseFileSeed, resolveRuntimeDefaultDataset } from "./courseProfiles";
import {tag} from "@/lib/practice/generator/shared/i18n";

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
function pickStarterCodeFromMessageBase(item: any) {
  const messageBase =
      typeof item?.messageBase === "string" && item.messageBase.trim()
          ? item.messageBase.trim()
          : "";

  if (!messageBase) return undefined;

  const key = `${messageBase}.starterCode`;
  const value = tag(key);

  if (!value || value === key) return undefined;

  return value;
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



function mergeManifestParts<T extends Record<string, any>>(primary: T | null | undefined, secondary: T | null | undefined): T | any {
  if (!primary && !secondary) return null;
  if (!primary) return secondary;
  if (!secondary) return primary;

  return {
    ...secondary,
    ...primary,
    runtime: {
      ...(secondary as any).runtime,
      ...(primary as any).runtime,
    },
    workspace: {
      ...(secondary as any).workspace,
      ...(primary as any).workspace,
    },
    recipe: {
      ...(secondary as any).recipe,
      ...(primary as any).recipe,
    },
    starterFiles: (primary as any).starterFiles ?? (secondary as any).starterFiles,
    solutionFiles: (primary as any).solutionFiles ?? (secondary as any).solutionFiles,
    starterCode: (primary as any).starterCode ?? (secondary as any).starterCode,
    solutionCode: (primary as any).solutionCode ?? (secondary as any).solutionCode,
  };
}

function pickStarterFiles(item: any, subjectSlug: string, language?: string) {
  return resolveCourseFileSeed({ subjectSlug, language, target: item }).starterFiles;
}

function pickSolutionFiles(item: any, subjectSlug: string, language?: string) {
  return resolveCourseFileSeed({ subjectSlug, language, target: item }).solutionFiles;
}

function pickStarterCode(item: any, subjectSlug: string, language?: string) {
  /**
   * Only explicit starter sources may seed the editor.
   *
   * Priority:
   * 1. raw manifest starterCode / starterFiles / workspace starter
   * 2. localized messageBase.starterCode
   *
   * Never use solutionCode, recipe.solutionCode, prompt, body, code, source,
   * content, or examples as starter code.
   */
  const explicit = resolveCourseFileSeed({
    subjectSlug,
    language,
    target: item,
  }).starterCode;

  if (explicit && explicit.trim()) {
    return explicit;
  }

  const fromMessageBase = pickStarterCodeFromMessageBase(item);

  if (fromMessageBase && fromMessageBase.trim()) {
    return fromMessageBase;
  }

  return undefined;
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
        const mergedCardManifest = mergeManifestParts(rawSketch, card as any);
        const cardRuntimeContext = buildRuntimeEntryContext({
          subjectSlug,
          item: mergedCardManifest,
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
          starterFiles: pickStarterFiles(mergedCardManifest, subjectSlug, cardRuntimeContext.language),
          solutionFiles: pickSolutionFiles(mergedCardManifest, subjectSlug, cardRuntimeContext.language),
          starterCode: pickStarterCode(mergedCardManifest, subjectSlug, cardRuntimeContext.language),
          solutionCode: pickSolutionCode(mergedCardManifest, subjectSlug, cardRuntimeContext.language),
          runtimeDefaults: topicRuntimeDefaults,
          topicRuntimeDefaults,
          moduleRuntimeDefaults,
          sqlDatasetId: cardRuntimeContext.datasetResolution.datasetId,
          sqlDatasetResolutionSource: cardRuntimeContext.datasetResolution.source,
          sqlDatasetResolutionError: cardRuntimeContext.datasetResolution.error,
          starterWorkspace: mergedCardManifest?.workspace ?? (card.spec as any)?.workspace ?? null,
          toolManifest: mergedCardManifest ?? buildToolManifest(card),
          item: mergedCardManifest,
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
          const mergedExerciseManifest = mergeManifestParts(rawExercise, exercise.step as any);
          const exerciseRuntimeContext = buildRuntimeEntryContext({
            subjectSlug,
            item: mergedExerciseManifest,
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
            starterFiles: pickStarterFiles(mergedExerciseManifest, subjectSlug, exerciseRuntimeContext.language),
            solutionFiles: pickSolutionFiles(mergedExerciseManifest, subjectSlug, exerciseRuntimeContext.language),
            starterCode: pickStarterCode(mergedExerciseManifest, subjectSlug, exerciseRuntimeContext.language),
            solutionCode: pickSolutionCode(mergedExerciseManifest, subjectSlug, exerciseRuntimeContext.language),
            runtimeDefaults: topicRuntimeDefaults,
            topicRuntimeDefaults,
            moduleRuntimeDefaults,
            sqlDatasetId: exerciseRuntimeContext.datasetResolution.datasetId,
            sqlDatasetResolutionSource: exerciseRuntimeContext.datasetResolution.source,
            sqlDatasetResolutionError: exerciseRuntimeContext.datasetResolution.error,
            starterWorkspace: mergedExerciseManifest?.workspace ?? null,
            toolManifest: mergedExerciseManifest,
            item: mergedExerciseManifest,
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
