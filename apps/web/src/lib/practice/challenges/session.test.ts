import { describe, expect, it } from "vitest";

import {
  applySharedChallengeParams,
  buildSharedChallengeMeta,
  readSharedChallengeMeta,
} from "./session";

const meta = buildSharedChallengeMeta({
  challengeId: "challenge-hash",
  subjectSlug: "python",
  moduleSlug: "python-1",
  sectionSlug: "python-1-basics",
  topicSlug: "variables",
  exerciseKey: "quiz-variable-name",
  exerciseTitle: "Variable names",
  exercisePurpose: "project",
  locale: "en",
});

describe("shared challenge session metadata", () => {
  it("stores the exact exercise with an unlimited-attempt policy", () => {
    expect(readSharedChallengeMeta(meta)).toEqual({
      kind: "shared_challenge",
      challengeId: "challenge-hash",
      subjectSlug: "python",
      moduleSlug: "python-1",
      sectionSlug: "python-1-basics",
      topicSlug: "variables",
      exerciseKey: "quiz-variable-name",
      exerciseTitle: "Variable names",
      exercisePurpose: "project",
      maxAttempts: null,
      locale: "en",
    });
  });

  it("overrides untrusted request filters with the signed session target", () => {
    expect(
      applySharedChallengeParams(
        {
          subject: "another-subject",
          module: "another-module",
          topic: "another-topic",
          exerciseKey: "another-exercise",
          allowReveal: "true",
        },
        meta,
      ),
    ).toMatchObject({
      subject: "python",
      module: "python-1",
      section: "python-1-basics",
      topic: "variables",
      exerciseKey: "quiz-variable-name",
      preferPurpose: "project",
      purposePolicy: "strict",
      seedPolicy: "global",
      salt: "challenge:challenge-hash",
      allowReveal: "true",
    });
  });
});
