import { describe, expect, it, vi } from "vitest";

import { SUBJECT_GENERATOR_SOURCES } from "@zoeskoul/curriculum-registry/runtime";

vi.mock("server-only", () => ({}));

import {
  resolvePublishedPracticeTarget,
  resolveSharedChallengeTarget,
} from "./target";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function findPublishedNonPtyProjectTarget() {
  for (const [subjectSlug, source] of Object.entries(SUBJECT_GENERATOR_SOURCES)) {
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
        if (
          exercise?.kind !== "code_input" ||
          exercise.purpose !== "project"
        ) {
          continue;
        }

        const exerciseKey = String(exercise.id ?? "").trim();
        if (!exerciseKey) continue;

        try {
          return resolveSharedChallengeTarget({
            subjectSlug,
            moduleSlug,
            sectionSlug,
            topicSlug,
            exerciseKey,
          });
        } catch {
          // Some published projects require the authenticated PTY runner. Keep
          // scanning for the anonymous non-PTY contract this test covers.
        }
      }
    }
  }

  throw new Error("Expected at least one published non-PTY project exercise.");
}

function findPublishedPracticeOnlyTarget() {
  for (const [subjectSlug, source] of Object.entries(SUBJECT_GENERATOR_SOURCES)) {
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
        if (exercise?.purpose !== "practice") continue;

        const exerciseKey = String(exercise.id ?? "").trim();
        if (!exerciseKey) continue;

        return resolvePublishedPracticeTarget({
          subjectSlug,
          moduleSlug,
          sectionSlug,
          topicSlug,
          exerciseKey,
          exercisePurpose: "practice",
        });
      }
    }
  }

  throw new Error("Expected at least one published practice-purpose exercise.");
}

function findPublishedQuizTarget() {
  for (const [subjectSlug, source] of Object.entries(SUBJECT_GENERATOR_SOURCES)) {
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
        if (exercise?.purpose !== "quiz") continue;

        const exerciseKey = String(exercise.id ?? "").trim();
        if (!exerciseKey) continue;

        try {
          return resolveSharedChallengeTarget({
            subjectSlug,
            moduleSlug,
            sectionSlug,
            topicSlug,
            exerciseKey,
          });
        } catch {
          // Keep scanning if this authored quiz is not anonymously shareable.
        }
      }
    }
  }

  throw new Error("Expected at least one published shareable quiz exercise.");
}

describe("published shared challenge targets", () => {
  it("accepts a published quiz exercise", () => {
    expect(findPublishedQuizTarget()).toMatchObject({
      exercisePurpose: "quiz",
    });
  });

  it("accepts a published non-PTY project exercise", () => {
    expect(findPublishedNonPtyProjectTarget()).toMatchObject({
      exercisePurpose: "project",
      exerciseKind: "code_input",
    });
  });


  it("accepts an authored practice-purpose exercise for authenticated practice", () => {
    expect(findPublishedPracticeOnlyTarget()).toMatchObject({
      exercisePurpose: "practice",
    });
  });

  it("keeps authored practice exercises out of anonymous shared challenges", () => {
    const target = findPublishedPracticeOnlyTarget();

    expect(() =>
      resolveSharedChallengeTarget({
        subjectSlug: target.subjectSlug,
        moduleSlug: target.moduleSlug,
        sectionSlug: target.sectionSlug,
        topicSlug: target.topicSlug,
        exerciseKey: target.exerciseKey,
        exercisePurpose: "practice",
      } as any),
    ).toThrow(/authored practice exercise/i);
  });

  it("accepts an authored try-it for authenticated practice", () => {
    expect(
      resolvePublishedPracticeTarget({
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
        sectionSlug: "python-v2-python-v2-1-variables-and-assignment",
        topicSlug: "input-and-type-conversion",
        exerciseKey: "code_echo_name",
      }),
    ).toMatchObject({
      exerciseKey: "code_echo_name",
      exercisePurpose: "try_it",
      exerciseKind: "code_input",
    });
  });

  it("keeps authenticated try-its out of anonymous shared challenges", () => {
    expect(() =>
      resolveSharedChallengeTarget({
        subjectSlug: "python-v2",
        moduleSlug: "python-v2-1",
        sectionSlug: "python-v2-python-v2-1-variables-and-assignment",
        topicSlug: "input-and-type-conversion",
        exerciseKey: "code_echo_name",
      }),
    ).toThrow(/authenticated lesson try-it/i);
  });

  it("rejects a stale signed purpose", () => {
    const target = findPublishedNonPtyProjectTarget();

    expect(() =>
      resolveSharedChallengeTarget({
        subjectSlug: target.subjectSlug,
        moduleSlug: target.moduleSlug,
        sectionSlug: target.sectionSlug,
        topicSlug: target.topicSlug,
        exerciseKey: target.exerciseKey,
        exercisePurpose: "quiz",
      }),
    ).toThrow(/expected a quiz exercise/i);
  });
});
