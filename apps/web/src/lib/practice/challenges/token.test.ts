import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  sharedChallengeFingerprint,
  signSharedChallenge,
  verifySharedChallenge,
} from "./token";

const target = {
  subjectSlug: "python",
  moduleSlug: "python-1",
  sectionSlug: "python-1-basics",
  topicSlug: "variables",
  exerciseKey: "quiz-variable-name",
  exercisePurpose: "project" as const,
};

describe("shared practice challenge tokens", () => {
  beforeEach(() => {
    process.env.CHALLENGE_LINK_SECRET = "challenge-test-secret";
  });

  afterEach(() => {
    delete process.env.CHALLENGE_LINK_SECRET;
  });

  it("round-trips a signed exact exercise target", () => {
    const token = signSharedChallenge(target, {
      expiresAt: new Date(Date.now() + 60_000),
    });

    expect(verifySharedChallenge(token)).toMatchObject(target);
    expect(sharedChallengeFingerprint(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a modified token", () => {
    const token = signSharedChallenge(target);
    const replacement = token.endsWith("a") ? "b" : "a";
    const modified = `${token.slice(0, -1)}${replacement}`;

    expect(verifySharedChallenge(modified)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signSharedChallenge(target, {
      expiresAt: new Date(Date.now() - 1_000),
    });

    expect(verifySharedChallenge(token)).toBeNull();
  });
});
