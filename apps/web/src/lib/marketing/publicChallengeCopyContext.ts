import "server-only";

import { resolveManifestExercise } from "@zoeskoul/curriculum-runtime/curriculum/resolveManifestExercise";

import { resolveTopicBundleManifest } from "@/lib/curriculum/resolveTopicBundleManifest";
import type { PublishedChallengeExerciseOption } from "@/lib/practice/challenges/publishedCatalog";

import { enrichPublicChallengeCopyContext } from "./publicChallengeCopyContextAdapters";
import type {
  PublicChallengeCopyContext,
  PublicChallengeStoryFrame,
} from "./publicChallengeCopyContextTypes";

const STORY_FRAMES: readonly PublicChallengeStoryFrame[] = [
  {
    id: "release-check",
    guidance: "Use a developer finishing a small task before a product release. Start with the situation, not 'Imagine you are'.",
    fallbackLead: "A product team is preparing a release, and you need to finish one small but important task.",
  },
  {
    id: "support-investigation",
    guidance: "Use a support or engineering investigation into a user-facing issue. Lead with the problem.",
    fallbackLead: "A support team has flagged an issue, and you are the engineer asked to handle the next step.",
  },
  {
    id: "internal-tool",
    guidance: "Use maintenance of an internal tool used by coworkers. Keep it practical and concise.",
    fallbackLead: "You are maintaining an internal tool your team relies on every day.",
  },
  {
    id: "qa-handoff",
    guidance: "Use a QA handoff that needs one change verified before sign-off. Avoid the same opening used by other challenges.",
    fallbackLead: "QA has handed you one last check before the work can be signed off.",
  },
  {
    id: "ops-workflow",
    guidance: "Use an operations workflow. Invent only harmless narrative context, never technical requirements.",
    fallbackLead: "An operations team needs your help completing a routine workflow safely.",
  },
  {
    id: "incident-followup",
    guidance: "Use a calm follow-up after a small production issue, with a targeted fix and verification.",
    fallbackLead: "A small production issue was found, and you are handling the follow-up fix.",
  },
  {
    id: "teammate-request",
    guidance: "Use a concise request from a teammate on a shared system. Keep the language natural.",
    fallbackLead: "A teammate asks you to take care of a focused change in the shared system.",
  },
  {
    id: "client-delivery",
    guidance: "Use preparation for an internal stakeholder or fictional client delivery. Do not invent brands.",
    fallbackLead: "A team is preparing a client delivery and needs this task completed accurately.",
  },
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function oneLine(value: unknown) {
  return text(value).replace(/\s+/g, " ").trim();
}

function firstString(records: Array<Record<string, unknown> | null>, key: string) {
  for (const record of records) {
    const value = text(record?.[key]);
    if (value) return value;
  }
  return "";
}

function firstValue(records: Array<Record<string, unknown> | null>, key: string) {
  for (const record of records) {
    if (record && record[key] !== undefined) return record[key];
  }
  return null;
}

function compact(value: unknown) {
  if (value === null || value === undefined) return null;
  try {
    const json = JSON.stringify(value);
    return json.length <= 4000 ? value : `${json.slice(0, 3999)}…`;
  } catch {
    return null;
  }
}

function stableIndex(value: string, length: number) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function storyFrameFor(option: PublishedChallengeExerciseOption) {
  const seed = `${option.subjectSlug}|${option.topicSlug}|${option.exerciseKey}`;
  return STORY_FRAMES[stableIndex(seed, STORY_FRAMES.length)]!;
}

async function resolveTagged(value: unknown, locale: string) {
  const raw = text(value);
  if (!raw || !raw.startsWith("@:")) return raw;
  const key = raw.slice(2).trim();
  if (!key) return "";
  try {
    const { getTranslations } = await import("next-intl/server");
    const t = await getTranslations({ locale: locale === "fr" || locale === "ht" ? locale : "en" });
    const resolved = text(t(key as any));
    return resolved && resolved !== key ? resolved : "";
  } catch {
    return "";
  }
}

function baseFacts(prompt: string) {
  const facts = new Set<string>();
  for (const match of prompt.matchAll(/`([^`]{1,80})`/g)) {
    const token = match[1]?.trim();
    if (!token) continue;
    for (const part of token.match(/[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?/g) ?? []) {
      if (part.length >= 2 || /^\d/.test(part)) facts.add(part);
    }
  }
  for (const match of prompt.matchAll(/["']([^"'\\]{1,80})["']/g)) {
    if (match[1]?.trim()) facts.add(match[1].trim());
  }
  for (const number of prompt.match(/\b\d+(?:\.\d+)?\b/g) ?? []) facts.add(number);
  return [...facts];
}

export async function resolvePublicChallengeCopyContext(args: {
  locale: string;
  option: PublishedChallengeExerciseOption;
}): Promise<PublicChallengeCopyContext> {
  const topicBundle = resolveTopicBundleManifest({
    subjectSlug: args.option.subjectSlug,
    topicSlugOrId: args.option.topicSlug,
  });
  if (!topicBundle) throw new Error(`Published topic "${args.option.topicSlug}" is unavailable.`);

  const exercise = resolveManifestExercise({
    topicBundle,
    exerciseKey: args.option.exerciseKey,
  }) as Record<string, unknown>;
  const bundle = topicBundle as unknown as Record<string, unknown>;
  const runtime = record(exercise.runtime);
  const workspace = record(exercise.workspace);
  const recipe = record(exercise.recipe);
  const runtimeDefaults = record(bundle.runtimeDefaults);

  const messageBase = text(exercise.messageBase);
  const titleRef = text(exercise.title) || text(exercise.titleKey) || (messageBase ? `@:${messageBase}.title` : "");
  const promptRef = text(exercise.prompt) || text(exercise.promptKey) || text(args.option.exercisePrompt) || (messageBase ? `@:${messageBase}.prompt` : "");
  const originalTitle = (await resolveTagged(titleRef, args.locale)) || args.option.exerciseTitle;
  const originalPrompt = (await resolveTagged(promptRef, args.locale)) || args.option.exercisePrompt || "";

  const starterRef = firstString([workspace, exercise], "starterCode");
  const solutionRef = firstString([recipe, exercise], "solutionCode");
  const starterCode = (await resolveTagged(starterRef, args.locale)) || starterRef || null;
  const solution = (await resolveTagged(solutionRef, args.locale)) || solutionRef || null;

  const context: PublicChallengeCopyContext = {
    locale: args.locale,
    language: firstString([workspace, exercise, runtimeDefaults], "language") || null,
    runtimeKind: firstString([runtime, exercise, runtimeDefaults], "kind") || null,
    coursePath: {
      catalog: `${args.option.catalogTitle} (${args.option.catalogSlug})`,
      subject: `${args.option.subjectTitle} (${args.option.subjectSlug})`,
      module: `${args.option.moduleTitle} (${args.option.moduleSlug})`,
      section: `${args.option.sectionTitle} (${args.option.sectionSlug})`,
      topic: `${args.option.topicTitle} (${args.option.topicSlug})`,
    },
    exercise: {
      key: args.option.exerciseKey,
      kind: args.option.exerciseKind,
      purpose: args.option.exercisePurpose,
      originalTitle: oneLine(originalTitle),
      originalPrompt: oneLine(originalPrompt),
    },
    starterCode: starterCode ? starterCode.slice(0, 2000) : null,
    privateSolutionContext: solution ? solution.slice(0, 4000) : null,
    validation: compact(firstValue([exercise, recipe], "validation")),
    semanticChecks: compact(firstValue([exercise, recipe], "semanticChecks")),
    tests: compact(firstValue([exercise, recipe], "tests")),
    manifestContext: {
      runtime: compact(runtime),
      workspace: compact(workspace),
      recipe: compact(recipe),
    },
    environment: {},
    resources: [],
    requiredFacts: baseFacts(oneLine(originalPrompt)),
    technicalFallbackLead: null,
    storyFrame: storyFrameFor(args.option),
  };

  return enrichPublicChallengeCopyContext({
    context,
    records: { exercise, runtime, workspace, recipe, runtimeDefaults },
  });
}
