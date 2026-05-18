import type { ReviewCard, ReviewModule } from "@/lib/subjects/types";
import type { UnknownRecord } from "./reviewRuntimeTypes";
import { getCardStateKey, getExerciseStateKey } from "./exerciseKeys";
import { resolveCourseLanguage, resolveCourseFileSeed, resolveRuntimeDefaultDataset } from "./courseProfiles";
import {tag} from "@/lib/practice/generator/shared/i18n";
import {isUsableStarterCode} from "@/components/review/module/runtime/starterContent";

export type ReviewTargetKind = "sketch" | "exercise" | "quiz" | "card" | "project" | "text" | "video";
export type LooseManifestRecord = UnknownRecord & {
  id?: string;
  language?: string;
  lang?: string;
  workspace?: unknown;
  codeWorkspace?: unknown;
  ideWorkspace?: unknown;
  stdin?: string;
  codeStdin?: string;
  initialStdin?: string;
  userEdited?: boolean;
  workspaceOrigin?: string;
  exerciseId?: string;
  stableExerciseId?: string;
  runner?: unknown;
  answer?: unknown;
  recipe?: UnknownRecord | null;
  solutionCode?: string;
  solutionFiles?: unknown;
  sketch?: unknown;
  starterSketch?: unknown;
  status?: string;
  updatedAt?: number;
  code?: string;
  starterCode?: string;
  starterFiles?: unknown;
};

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
  starterFiles?: unknown;
  solutionFiles?: unknown;
  starterCode?: string;
  solutionCode?: string;
  starterWorkspace?: unknown;
  runtimeDefaults?: UnknownRecord | null;
  topicRuntimeDefaults?: UnknownRecord | null;
  moduleRuntimeDefaults?: UnknownRecord | null;
  sqlDatasetId?: string;
  sqlDatasetResolutionSource?: string;
  sqlDatasetResolutionError?: string;
  toolManifest?: LooseManifestRecord | null;
  item: LooseManifestRecord | null;
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
function asRecord(value: unknown): LooseManifestRecord | null {
  return typeof value === "object" && value !== null
    ? (value as LooseManifestRecord)
    : null;
}
function pickStarterCodeFromMessageBase(
    item: unknown,
    resolveMessage?: (key: string) => string | undefined,
) {
  /**
   * Starter code may come from i18n/messageBase ONLY after it has been
   * resolved into real code text for the active locale.
   *
   * Valid:
   *   "-- Affiche tous les produits.\nSELECT * FROM products;"
   *
   * Invalid:
   *   "@:quiz.some_id.starterCode"
   *
   * The runtime registry does not currently have a locale-aware resolver, so
   * callers normally pass no resolver and this returns undefined. The
   * curriculum/compiler layer should resolve localized starter code before it
   * reaches this runtime layer.
   */
  const itemRecord = asRecord(item);
  const messageBase =
      typeof itemRecord?.messageBase === "string" && itemRecord.messageBase.trim()
          ? itemRecord.messageBase.trim()
          : "";

  if (!messageBase || !resolveMessage) return undefined;

  const resolved = resolveMessage(`${messageBase}.starterCode`);
  return isUsableStarterCode(resolved) ? resolved : undefined;
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



function mergeManifestParts(
  primary: UnknownRecord | null | undefined,
  secondary: UnknownRecord | null | undefined,
): LooseManifestRecord | null {
  if (!primary && !secondary) return null;
  if (!primary) return asRecord(secondary);
  if (!secondary) return asRecord(primary);

  return {
    ...secondary,
    ...primary,
    runtime: {
      ...(asRecord(secondary.runtime) ?? {}),
      ...(asRecord(primary.runtime) ?? {}),
    },
    workspace: {
      ...(asRecord(secondary.workspace) ?? {}),
      ...(asRecord(primary.workspace) ?? {}),
    },
    recipe: {
      ...(asRecord(secondary.recipe) ?? {}),
      ...(asRecord(primary.recipe) ?? {}),
    },
    starterFiles: primary.starterFiles ?? secondary.starterFiles,
    solutionFiles: primary.solutionFiles ?? secondary.solutionFiles,
    starterCode: isUsableStarterCode(primary.starterCode)
        ? primary.starterCode
        : isUsableStarterCode(secondary.starterCode)
            ? secondary.starterCode
            : undefined,
    solutionCode:
      typeof primary.solutionCode === "string"
        ? primary.solutionCode
        : typeof secondary.solutionCode === "string"
          ? secondary.solutionCode
          : undefined,
  };
}

function pickStarterFiles(item: unknown, subjectSlug: string, language?: string) {
  return resolveCourseFileSeed({ subjectSlug, language, target: item }).starterFiles;
}

function pickSolutionFiles(item: unknown, subjectSlug: string, language?: string) {
  return resolveCourseFileSeed({ subjectSlug, language, target: item }).solutionFiles;
}

function pickStarterCode(
    item: unknown,
    subjectSlug: string,
    language?: string,
    resolveMessage?: (key: string) => string | undefined,
) {
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

  if (isUsableStarterCode(explicit)) {
    return explicit;
  }

  const fromMessageBase = pickStarterCodeFromMessageBase(item, resolveMessage);

  if (isUsableStarterCode(fromMessageBase)) {
    return fromMessageBase;
  }

  return undefined;
}
function pickSolutionCode(item: unknown, subjectSlug: string, language?: string) {
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

function inferRuntimeDefaultLanguage(
  runtimeDefaults: UnknownRecord | null | undefined,
  subjectSlug: string,
) {
  const explicit = String(runtimeDefaults?.language ?? runtimeDefaults?.lang ?? "").trim();
  if (explicit) return explicit;

  if (String(runtimeDefaults?.kind ?? "").toLowerCase() === "sql") {
    return "sql";
  }

  return defaultLanguageForSubject(subjectSlug);
}

function pickLanguage(
  item: unknown,
  fallbackLanguage: string,
  subjectSlug: string,
  runtimeDefaults: UnknownRecord | null | undefined,
) {
  return resolveCourseLanguage({
    subjectSlug,
    language: fallbackLanguage,
    runtimeDefaults,
    target: item,
  });
}

function buildRuntimeEntryContext(args: {
  subjectSlug: string;
  item: unknown;
  topicRuntimeDefaults: UnknownRecord | null;
  moduleRuntimeDefaults: UnknownRecord | null;
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
      runtime: asRecord(card.spec)?.runtime ?? null,
      workspace: asRecord(card.spec)?.workspace ?? null,
    } as LooseManifestRecord;
  }

  if (card.type === "project" || card.type === "quiz") {
    return {
      ...(card.spec ?? {}),
      runtime: asRecord(card.spec)?.runtime ?? null,
      workspace: asRecord(card.spec)?.workspace ?? null,
    } as LooseManifestRecord;
  }

  const cardSpec = asRecord("spec" in card ? card.spec : null);
  return {
    ...(cardSpec ?? {}),
    workspace: cardSpec?.workspace ?? null,
  } as LooseManifestRecord;
}

function getProjectExerciseEntries(card: Extract<ReviewCard, { type: "project" }>) {
  const steps = Array.isArray(card.spec?.steps) ? card.spec.steps : [];
  return steps
    .map((step) => {
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
  resolveMessage?: (key: string) => string | undefined;
}): ReviewTargetRegistry {
  const { mod, subjectSlug, moduleSlug, resolveMessage } = args;
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
      const topicMeta = asRecord(topic.meta);
      const rawManifest = asRecord(topicMeta?.rawManifest);
      const moduleRuntimeDefaults =
        mod.runtimeDefaults ??
        asRecord(asRecord((mod as ReviewModule & { meta?: UnknownRecord | null }).meta)?.runtimeDefaults) ??
        null;
      const topicRuntimeDefaults =
        asRecord(asRecord(topic.meta)?.runtimeDefaults) ??
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
        const cardRecord = card as ReviewCard & { spec?: unknown };
        const rawSketch =
          card.type === "sketch"
            ? rawSketches.find((sketch) => asRecord(sketch)?.id === lastIdSegment(card.sketchId))
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
        const mergedCardManifest = mergeManifestParts(asRecord(rawSketch), asRecord(cardRecord.spec));
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
          starterCode: pickStarterCode(
              mergedCardManifest,
              subjectSlug,
              cardRuntimeContext.language,
              resolveMessage,
          ),
          solutionCode: pickSolutionCode(mergedCardManifest, subjectSlug, cardRuntimeContext.language),
          runtimeDefaults: topicRuntimeDefaults,
          topicRuntimeDefaults,
          moduleRuntimeDefaults,
          sqlDatasetId: cardRuntimeContext.datasetResolution.datasetId,
          sqlDatasetResolutionSource: cardRuntimeContext.datasetResolution.source,
          sqlDatasetResolutionError: cardRuntimeContext.datasetResolution.error,
          starterWorkspace: asRecord(mergedCardManifest?.workspace) ?? asRecord(cardRecord.spec)?.workspace ?? null,
          toolManifest: mergedCardManifest ?? buildToolManifest(card),
          item: mergedCardManifest,
        };

        byKey[cardEntry.targetKey] = cardEntry;
        byRoute[cardRouteKey] = cardEntry.targetKey;
        orderedKeys.push(cardEntry.targetKey);

        if (card.type !== "project") continue;

        for (const exercise of getProjectExerciseEntries(card)) {
          const rawExercise =
            rawExercises.find((item) => asRecord(item)?.id === exercise.exerciseId) ??
            rawExercises.find((item) => asRecord(item)?.id === exercise.step?.id) ??
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
          const mergedExerciseManifest = mergeManifestParts(
            asRecord(rawExercise),
            asRecord(exercise.step),
          );
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
            starterCode: pickStarterCode(
                mergedExerciseManifest,
                subjectSlug,
                exerciseRuntimeContext.language,
                resolveMessage,
            ),
            solutionCode: pickSolutionCode(mergedExerciseManifest, subjectSlug, exerciseRuntimeContext.language),
            runtimeDefaults: topicRuntimeDefaults,
            topicRuntimeDefaults,
            moduleRuntimeDefaults,
            sqlDatasetId: exerciseRuntimeContext.datasetResolution.datasetId,
            sqlDatasetResolutionSource: exerciseRuntimeContext.datasetResolution.source,
            sqlDatasetResolutionError: exerciseRuntimeContext.datasetResolution.error,
            starterWorkspace: asRecord(mergedExerciseManifest?.workspace) ?? null,
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
