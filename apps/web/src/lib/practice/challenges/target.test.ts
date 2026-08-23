import { describe, expect, it, vi } from "vitest";

import { SUBJECT_GENERATOR_SOURCES } from "@zoeskoul/curriculum-registry/runtime";

vi.mock("server-only", () => ({}));

import {
  resolvePublishedPracticeTarget,
  resolveSharedChallengeTarget,
  type PublishedPracticePurpose,
} from "./target";

type TargetInput = {
  subjectSlug: string;
  moduleSlug: string;
  sectionSlug: string;
  topicSlug: string;
  exerciseKey: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function candidates(purpose: PublishedPracticePurpose): TargetInput[] {
  const result: TargetInput[] = [];

  for (const [subjectSlug, source] of Object.entries(
    SUBJECT_GENERATOR_SOURCES,
  )) {
    const topicManifests = source.topicManifests as Record<string, unknown>;

    for (const [topicSlug, topicValue] of Object.entries(topicManifests)) {
      const topic = asRecord(topicValue);
      if (!topic) continue;

      const moduleSlug = String(topic.moduleSlug ?? "").trim();
      const sectionSlug = String(topic.sectionSlug ?? "").trim();
      const exercises = Array.isArray(topic.exercises) ? topic.exercises : [];
      if (!moduleSlug || !sectionSlug) continue;

      for (const exerciseValue of exercises) {
        const exercise = asRecord(exerciseValue);
        if (exercise?.purpose !== purpose) continue;

        const exerciseKey = String(exercise.id ?? "").trim();
        if (!exerciseKey) continue;

        result.push({
          subjectSlug,
          moduleSlug,
          sectionSlug,
          topicSlug,
          exerciseKey,
        });
      }
    }
  }

  return result;
}

function firstPurpose(purpose: PublishedPracticePurpose): TargetInput {
  const target = candidates(purpose)[0];
  if (!target) {
    throw new Error(`Expected at least one published ${purpose} exercise.`);
  }
  return target;
}

function firstShareablePractice(): TargetInput {
  for (const target of candidates("practice")) {
    try {
      const resolved = resolveSharedChallengeTarget({
        ...target,
        exercisePurpose: "practice",
      });
      if (resolved.exerciseKind !== "code_input") continue;
      return target;
    } catch {
      // Keep scanning past terminal-backed Practice exercises.
    }
  }

  throw new Error(
    "Expected at least one non-terminal published practice exercise.",
  );
}

describe("published shared challenge targets", () => {
  it("keeps the broad published resolver available to authenticated Practice", () => {
    const target = firstPurpose("project");

    expect(resolvePublishedPracticeTarget(target)).toMatchObject({
      exerciseKey: target.exerciseKey,
      exercisePurpose: "project",
    });
  });

  it("accepts authored practice purpose for Public Challenge", () => {
    const target = firstShareablePractice();

    expect(
      resolveSharedChallengeTarget({
        ...target,
        exercisePurpose: "practice",
      }),
    ).toMatchObject({
      exerciseKey: target.exerciseKey,
      exercisePurpose: "practice",
    });
  });

  it.each(["project", "quiz", "try_it"] as const)(
    "rejects %s purpose from Public Challenge",
    (purpose) => {
      const target = firstPurpose(purpose);

      expect(() =>
        resolveSharedChallengeTarget(target),
      ).toThrow(/require an authored practice exercise/i);
    },
  );

  it("rejects a stale signed purpose instead of relabeling curriculum", () => {
    const target = firstShareablePractice();

    expect(() =>
      resolveSharedChallengeTarget({
        ...target,
        exercisePurpose: "project",
      } as any),
    ).toThrow(/expected a project exercise/i);
  });
});
