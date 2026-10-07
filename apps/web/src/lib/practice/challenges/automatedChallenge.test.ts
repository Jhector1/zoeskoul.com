import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  assertEligible: vi.fn(),
  assertAvailable: vi.fn(),
  createRecord: vi.fn(),
  expiresAt: vi.fn(),
  resolveTarget: vi.fn(),
  sign: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    practiceChallengeLink: {
      findFirst: mocks.findFirst,
    },
  },
}));

vi.mock("@/lib/practice/challenges/eligibility", () => ({
  assertEligiblePublicChallengeTarget: mocks.assertEligible,
}));

vi.mock("@/lib/practice/challenges/publishedAvailability", () => ({
  assertPublishedChallengeTargetAvailable: mocks.assertAvailable,
}));

vi.mock("@/lib/practice/challenges/shortLink", () => ({
  createPracticeChallengeLinkRecord: mocks.createRecord,
  practiceChallengeLinkExpiresAt: mocks.expiresAt,
}));

vi.mock("@/lib/practice/challenges/target", () => ({
  resolveSharedChallengeTarget: mocks.resolveTarget,
}));

vi.mock("@/lib/practice/challenges/token", () => ({
  signSharedChallenge: mocks.sign,
}));

vi.mock("@/lib/practice/challenges/presentation", () => ({
  DEFAULT_PUBLIC_CHALLENGE_DESCRIPTION:
    "Default challenge description",
}));

let createOrReuseAutomatedPracticeChallenge:
  typeof import("./automatedChallenge").createOrReuseAutomatedPracticeChallenge;

beforeAll(async () => {
  ({
    createOrReuseAutomatedPracticeChallenge,
  } = await import("./automatedChallenge"));
});

const option = {
  id: "python::m1::s1::t1::exercise-a",
  catalogSlug: "code",
  catalogTitle: "Code",
  subjectSlug: "python-v2",
  subjectTitle: "Python",
  moduleSlug: "m1",
  moduleTitle: "Module 1",
  sectionSlug: "s1",
  sectionTitle: "Section 1",
  sectionRole: "lesson",
  topicSlug: "t1",
  topicTitle: "Topic 1",
  exerciseKey: "exercise-a",
  exerciseTitle: "Exercise A",
  exercisePrompt: "Solve it",
  exerciseKind: "code_input",
  exercisePurpose: "practice",
  isMultiFile: false,
  requiresTerminal: false,
  isStandaloneTryIt: false,
  releaseStatus: "active",
} as const;

const target = {
  subjectSlug: "python-v2",
  moduleSlug: "m1",
  sectionSlug: "s1",
  topicSlug: "t1",
  exerciseKey: "exercise-a",
  exerciseTitle: "Exercise A",
  exerciseKind: "code_input",
  exercisePurpose: "practice",
  requiresAuthenticatedRunner: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveTarget.mockReturnValue(target);
  mocks.findFirst.mockResolvedValue(null);
  mocks.expiresAt.mockReturnValue(
    new Date("2027-10-07T15:00:00.000Z"),
  );
  mocks.sign.mockReturnValue("signed-token");
  mocks.createRecord.mockResolvedValue({
    id: "challenge-1",
    code: "Challenge1",
  });
});

describe("automated public challenge creation", () => {
  it("creates a signed challenge from an eligible published manifest exercise", async () => {
    const now = new Date("2026-10-07T15:00:00.000Z");

    await createOrReuseAutomatedPracticeChallenge({
      locale: "en",
      option,
      now,
    });

    expect(mocks.resolveTarget).toHaveBeenCalledWith({
      subjectSlug: option.subjectSlug,
      moduleSlug: option.moduleSlug,
      sectionSlug: option.sectionSlug,
      topicSlug: option.topicSlug,
      exerciseKey: option.exerciseKey,
      exercisePurpose: "practice",
    });
    expect(mocks.assertEligible).toHaveBeenCalledWith(target);
    expect(mocks.assertAvailable).toHaveBeenCalled();
    expect(mocks.expiresAt).toHaveBeenCalledWith(now);
    expect(mocks.sign).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        expiresAt: expect.any(Date),
      }),
    );
    expect(mocks.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        exerciseKey: target.exerciseKey,
        exercisePurpose: "practice",
        signedToken: "signed-token",
        shareTitle: target.exerciseTitle,
        ogImagePublicId: null,
        createdById: null,
      }),
    );
  });

  it("reuses the same active target after an interrupted image/provider attempt", async () => {
    const existing = {
      id: "existing",
      code: "Existing1",
    };
    mocks.findFirst.mockResolvedValue(existing);

    await expect(
      createOrReuseAutomatedPracticeChallenge({
        locale: "en",
        option,
      }),
    ).resolves.toBe(existing);

    expect(mocks.sign).not.toHaveBeenCalled();
    expect(mocks.createRecord).not.toHaveBeenCalled();
  });
});
