import "server-only";

import {
  normalizeDraftQaExpectedForGrading,
  normalizeDraftQaOptionalMessageRefs,
  readDraftMessagePath,
} from "./practiceQaPure";

import type { Difficulty, Exercise } from "@/lib/practice/types";
import type {
  ManifestExercise,
  TopicBundleManifest,
} from "@/lib/subjects/_core/manifestTypes";
import { loadDraftTopic, type DraftRef } from "@/lib/dev/curriculumDrafts/fs";
import { buildExerciseFromManifest } from "@/lib/practice/generator/engines/json/buildExerciseFromManifest";
import { rngFromActor } from "@/lib/practice/catalog";

type JsonObject = Record<string, unknown>;

export const DRAFT_QA_PRACTICE_KEY_PREFIX = "draftqa.";

export type DraftQaPracticeKeyPayload = {
  v: 1;
  catalog: string;
  subject: string;
  module: string;
  topic: string;
  locale: string;
  exerciseKey: string;
  difficulty: Difficulty;
};

function asRecord(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMessageRef(value: string) {
  return value.startsWith("@:") ? value.slice(2) : value;
}

function createDraftMessageResolver(messagesJson: unknown | null) {
  return (rawKey: string, fallback = rawKey) => {
    const key = normalizeMessageRef(rawKey);
    const resolved = messagesJson ? readDraftMessagePath(messagesJson, key) : undefined;
    return typeof resolved === "string" ? resolved : fallback;
  };
}

function looksLikeDraftMessageRef(value: string) {
  const normalized = normalizeMessageRef(value);
  return (
    value.startsWith("@:") ||
    normalized.startsWith("topics.") ||
    normalized.startsWith("sketches.")
  );
}

function deepResolveTagged(
  value: unknown,
  resolveMessage: (key: string, fallback?: string) => string,
): unknown {
  if (typeof value === "string") {
    // buildExerciseFromManifest can emit two message-reference shapes:
    //
    //   @:topics....prompt
    //   topics....choices.0
    //
    // The second form is used by generated quiz option/choice lookups. Draft QA
    // previously resolved only the tagged form, so fill-blank choices leaked raw
    // message keys into the learner UI.
    //
    // It is safe to try every string: createDraftMessageResolver returns the
    // original value unchanged when the string is not a real path in messagesJson.
    return resolveMessage(value, value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepResolveTagged(item, resolveMessage));
  }

  const object = asRecord(value);
  if (!object) return value;

  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [
      key,
      deepResolveTagged(child, resolveMessage),
    ]),
  );
}

function assertNoUnresolvedDraftMessageRefs(
  value: unknown,
  label: string,
  path: string[] = [],
): void {
  if (typeof value === "string") {
    if (looksLikeDraftMessageRef(value)) {
      throw new Error(
        `Draft QA could not resolve ${label} message reference at ${[
          ...path,
        ].join(".") || "<root>"}: ${value}`,
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoUnresolvedDraftMessageRefs(item, label, [...path, String(index)]),
    );
    return;
  }

  const object = asRecord(value);
  if (!object) return;

  for (const [key, child] of Object.entries(object)) {
    assertNoUnresolvedDraftMessageRefs(child, label, [...path, key]);
  }
}

function normalizeDifficulty(value: unknown): Difficulty {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "medium" || raw === "hard") return raw as Difficulty;
  return "easy" as Difficulty;
}

function topicSlugOf(manifest: TopicBundleManifest) {
  const prefix = asString((manifest as any).prefix);
  const topicId = asString((manifest as any).topicId);
  return [prefix, topicId].filter(Boolean).join(".") || topicId || prefix;
}

function findExercise(
  manifest: TopicBundleManifest,
  requestedExerciseKey: string,
): ManifestExercise {
  const requested = requestedExerciseKey.trim();
  const exercises = Array.isArray(manifest.exercises) ? manifest.exercises : [];

  for (const exercise of exercises) {
    const record = asRecord(exercise);
    if (!record) continue;

    const candidates = [
      record.id,
      record.exerciseKey,
      record.exerciseId,
      record.stableExerciseId,
    ]
      .map(asString)
      .filter(Boolean);

    if (candidates.includes(requested)) {
      return exercise as ManifestExercise;
    }
  }

  throw new Error(
    `Draft exercise "${requested}" was not found in ${String(
      (manifest as any).topicId ?? "topic",
    )}.`,
  );
}

export function encodeDraftQaPracticeKey(
  payload: DraftQaPracticeKeyPayload,
): string {
  return (
    DRAFT_QA_PRACTICE_KEY_PREFIX +
    Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  );
}

export function decodeDraftQaPracticeKey(
  key: unknown,
): DraftQaPracticeKeyPayload | null {
  if (typeof key !== "string" || !key.startsWith(DRAFT_QA_PRACTICE_KEY_PREFIX)) {
    return null;
  }

  try {
    const raw = key.slice(DRAFT_QA_PRACTICE_KEY_PREFIX.length);
    const parsed = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    ) as DraftQaPracticeKeyPayload;

    if (
      parsed?.v !== 1 ||
      !parsed.catalog ||
      !parsed.subject ||
      !parsed.module ||
      !parsed.topic ||
      !parsed.exerciseKey
    ) {
      return null;
    }

    return {
      ...parsed,
      locale: parsed.locale || "en",
      difficulty: normalizeDifficulty(parsed.difficulty),
    };
  } catch {
    return null;
  }
}

export async function loadDraftQaPractice(args: {
  ref: DraftRef;
  exerciseKey: string;
  difficulty?: unknown;
}) {
  const difficulty = normalizeDifficulty(args.difficulty);
  const loaded = await loadDraftTopic(args.ref);
  const manifest = loaded.bundleJson as TopicBundleManifest;
  const manifestExercise = findExercise(manifest, args.exerciseKey);
  const topicSlug = topicSlugOf(manifest);
  const resolveMessage = createDraftMessageResolver(loaded.messagesJson);

  const built = buildExerciseFromManifest(
    manifestExercise,
    {
      rng: rngFromActor({
        userId: null,
        guestId: null,
        sessionId: null,
        salt: [
          "draft-qa",
          args.ref.catalog,
          args.ref.subject,
          args.ref.module,
          args.ref.topic,
          args.exerciseKey,
          difficulty,
        ].join("|"),
      }) as any,
      diff: difficulty,
      id: args.exerciseKey,
      topic: topicSlug as any,
      ctx: {
        topicSlug,
        exerciseKey: args.exerciseKey,
        subjectSlug: (manifest as any).subjectSlug,
        moduleSlug: (manifest as any).moduleSlug,
      } as any,
    },
    {
      serviceDefaults: (manifest as any).serviceDefaults ?? null,
      runtimeDefaults: (manifest as any).runtimeDefaults ?? null,
    },
  );

  const exercise = normalizeDraftQaOptionalMessageRefs(
    deepResolveTagged(
      {
        ...(built.exercise as any),
        topic: topicSlug,
        exerciseKey: args.exerciseKey,
      },
      resolveMessage,
    ),
  ) as Exercise;

  const expected = normalizeDraftQaExpectedForGrading(
    (exercise as any).kind,
    deepResolveTagged(
      built.expected,
      resolveMessage,
    ),
  );

  // Never let a missing Draft QA message lookup silently become visible UI.
  // Published/live practice already resolves through the normal message layer;
  // this guard protects the raw .curriculum-drafts adapter specifically.
  assertNoUnresolvedDraftMessageRefs(exercise, "exercise");
  assertNoUnresolvedDraftMessageRefs(expected, "expected");

  const keyPayload: DraftQaPracticeKeyPayload = {
    v: 1,
    catalog: args.ref.catalog,
    subject: args.ref.subject,
    module: args.ref.module,
    topic: args.ref.topic,
    locale: args.ref.locale ?? "en",
    exerciseKey: args.exerciseKey,
    difficulty,
  };

  return {
    loaded,
    manifest,
    manifestExercise,
    topicSlug,
    exercise,
    expected,
    key: encodeDraftQaPracticeKey(keyPayload),
    maxAttempts:
      typeof (manifestExercise as any).maxAttempts === "number"
        ? Number((manifestExercise as any).maxAttempts)
        : null,
  };
}

export async function loadDraftQaPracticeFromKey(key: unknown) {
  const payload = decodeDraftQaPracticeKey(key);
  if (!payload) {
    throw new Error("Invalid Draft QA practice key.");
  }

  return loadDraftQaPractice({
    ref: {
      catalog: payload.catalog,
      subject: payload.subject,
      module: payload.module,
      topic: payload.topic,
      locale: payload.locale,
    },
    exerciseKey: payload.exerciseKey,
    difficulty: payload.difficulty,
  });
}

export function buildDraftQaInstance(args: {
  exercise: Exercise;
  expected: unknown;
  topicSlug: string;
}) {
  return {
    id: "draft-qa",
    kind: (args.exercise as any).kind,
    title: String((args.exercise as any).title ?? ""),
    prompt: String((args.exercise as any).prompt ?? ""),
    publicPayload: args.exercise,
    secretPayload: {
      expected: args.expected,
    },
    topic: {
      slug: args.topicSlug,
    },
    session: null,
  } as any;
}

export function getDraftQaAuthoredHelpContent(
  publicPayload: any,
  stepKey: string,
): string | null {
  const help = publicPayload?.help ?? null;

  if (help && typeof help === "object" && typeof help[stepKey] === "string") {
    const text = String(help[stepKey]).trim();
    if (text) return text;
  }

  const helpSteps = Array.isArray(help?.steps) ? help.steps : [];
  const found = helpSteps.find(
    (step: any) => String(step?.key ?? "") === stepKey,
  );

  if (typeof found?.content === "string" && found.content.trim()) {
    return found.content;
  }

  if (
    (stepKey === "concept" || stepKey === "hint_1") &&
    typeof publicPayload?.hint === "string" &&
    publicPayload.hint.trim()
  ) {
    return publicPayload.hint.trim();
  }

  return null;
}
