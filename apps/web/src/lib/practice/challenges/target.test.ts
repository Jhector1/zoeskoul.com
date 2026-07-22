import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  resolvePublishedPracticeTarget,
  resolveSharedChallengeTarget,
} from "./target";

const base = {
  subjectSlug: "python-v2",
  moduleSlug: "python-v2-0",
  sectionSlug: "python-v2-python-v2-0-setup-and-first-programs",
  topicSlug: "what-python-is",
};

describe("published shared challenge targets", () => {
  it("accepts a published quiz exercise", () => {
    expect(
      resolveSharedChallengeTarget({
        ...base,
        exerciseKey: "sc-python-use-general",
      }),
    ).toMatchObject({
      ...base,
      exerciseKey: "sc-python-use-general",
      exercisePurpose: "quiz",
      exerciseKind: "single_choice",
    });
  });

  it("accepts a published non-PTY project exercise", () => {
    expect(
      resolveSharedChallengeTarget({
        ...base,
        exerciseKey: "ci-beginner-message",
      }),
    ).toMatchObject({
      ...base,
      exerciseKey: "ci-beginner-message",
      exercisePurpose: "project",
      exerciseKind: "code_input",
    });
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
    expect(() =>
      resolveSharedChallengeTarget({
        ...base,
        exerciseKey: "ci-beginner-message",
        exercisePurpose: "quiz",
      }),
    ).toThrow(/expected a quiz exercise/i);
  });
});
