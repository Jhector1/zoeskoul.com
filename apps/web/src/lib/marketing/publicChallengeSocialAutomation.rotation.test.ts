import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  socialPostFindFirst: vi.fn(),
  socialPostFindMany: vi.fn(),
  listPublished: vi.fn(),
  createOrReuse: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@zoeskoul/app-config", () => ({
  getProductionAppOrigin: vi.fn(() => "https://zoeskoul.com"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicChallengeSocialPost: {
      findFirst: mocks.socialPostFindFirst,
      findMany: mocks.socialPostFindMany,
    },
  },
}));

vi.mock("@/lib/practice/challenges/presentation", () => ({
  buildPublicChallengePresentation: vi.fn(),
}));

vi.mock("@/lib/practice/challenges/shortLink", () => ({
  getActivePracticeChallengeLink: vi.fn(),
  practiceChallengePath: vi.fn(() => "/c/test"),
}));

vi.mock("@/lib/practice/challenges/publishedCatalog", () => ({
  listPublishedChallengeExerciseOptions: mocks.listPublished,
}));

vi.mock("@/lib/practice/challenges/automatedChallenge", () => ({
  createOrReuseAutomatedPracticeChallenge: mocks.createOrReuse,
  publicChallengeExerciseIdentity: (value: {
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    topicSlug: string;
    exerciseKey: string;
  }) =>
    [
      value.subjectSlug,
      value.moduleSlug,
      value.sectionSlug,
      value.topicSlug,
      value.exerciseKey,
    ].join("::"),
}));

vi.mock("@/lib/marketing/publicChallengeSocial", () => ({
  PublicChallengeSocialProviderError:
    class PublicChallengeSocialProviderError extends Error {},
  publicChallengeSocialProviderStatuses: vi.fn(() => []),
  publicChallengeSocialSchedulerConfigured: vi.fn(() => true),
  publishPublicChallengeToProvider: vi.fn(),
}));

vi.mock("@/lib/practice/challenges/socialCard", () => ({
  ensurePublicChallengeSocialImage: vi.fn(),
}));

let getDailyPublicChallengeForDispatch:
  typeof import("./publicChallengeSocialAutomation").getDailyPublicChallengeForDispatch;
let getNextDailyPublicChallengeLink:
  typeof import("./publicChallengeSocialAutomation").getNextDailyPublicChallengeLink;

beforeAll(async () => {
  ({
    getDailyPublicChallengeForDispatch,
    getNextDailyPublicChallengeLink,
  } = await import("./publicChallengeSocialAutomation"));
});

const optionA = {
  id: "python::m1::s1::t1::a",
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
  exercisePrompt: "Solve A",
  exerciseKind: "code_input",
  exercisePurpose: "practice",
  isMultiFile: false,
  requiresTerminal: false,
  isStandaloneTryIt: false,
  releaseStatus: "active",
} as const;

const optionB = {
  ...optionA,
  id: "python::m1::s1::t1::b",
  exerciseKey: "exercise-b",
  exerciseTitle: "Exercise B",
  exercisePrompt: "Solve B",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.socialPostFindFirst.mockResolvedValue(null);
  mocks.socialPostFindMany.mockResolvedValue([]);
  mocks.listPublished.mockResolvedValue([optionA, optionB]);
});

describe("daily public challenge manifest rotation", () => {
  it("chooses the first unused canonical published exercise", async () => {
    mocks.socialPostFindMany.mockResolvedValue([
      {
        challenge: {
          subjectSlug: optionA.subjectSlug,
          moduleSlug: optionA.moduleSlug,
          sectionSlug: optionA.sectionSlug,
          topicSlug: optionA.topicSlug,
          exerciseKey: optionA.exerciseKey,
        },
      },
    ]);

    const challengeB = {
      id: "challenge-b",
      code: "ChallengeB",
      locale: "en",
    };
    mocks.createOrReuse.mockResolvedValue(challengeB);

    await expect(
      getNextDailyPublicChallengeLink("en"),
    ).resolves.toBe(challengeB);

    expect(mocks.listPublished).toHaveBeenCalledTimes(1);
    expect(mocks.createOrReuse).toHaveBeenCalledWith({
      locale: "en",
      option: optionB,
    });
  });

  it("reuses the challenge already claimed for a dispatch date", async () => {
    const challengeA = {
      id: "challenge-a",
      code: "ChallengeA",
      locale: "en",
    };
    mocks.socialPostFindFirst.mockResolvedValue({
      challenge: challengeA,
    });

    await expect(
      getDailyPublicChallengeForDispatch("en", "2026-10-05"),
    ).resolves.toBe(challengeA);

    expect(mocks.socialPostFindMany).not.toHaveBeenCalled();
    expect(mocks.listPublished).not.toHaveBeenCalled();
    expect(mocks.createOrReuse).not.toHaveBeenCalled();
  });

  it("creates a manifest-driven challenge only for a new dispatch date", async () => {
    const challengeA = {
      id: "challenge-a",
      code: "ChallengeA",
      locale: "en",
    };
    mocks.createOrReuse.mockResolvedValue(challengeA);

    await expect(
      getDailyPublicChallengeForDispatch("en", "2026-10-06"),
    ).resolves.toBe(challengeA);

    expect(mocks.createOrReuse).toHaveBeenCalledWith({
      locale: "en",
      option: optionA,
    });
  });

  it("returns no candidate after every eligible manifest exercise has published", async () => {
    mocks.socialPostFindMany.mockResolvedValue([
      {
        challenge: {
          subjectSlug: optionA.subjectSlug,
          moduleSlug: optionA.moduleSlug,
          sectionSlug: optionA.sectionSlug,
          topicSlug: optionA.topicSlug,
          exerciseKey: optionA.exerciseKey,
        },
      },
      {
        challenge: {
          subjectSlug: optionB.subjectSlug,
          moduleSlug: optionB.moduleSlug,
          sectionSlug: optionB.sectionSlug,
          topicSlug: optionB.topicSlug,
          exerciseKey: optionB.exerciseKey,
        },
      },
    ]);

    await expect(
      getNextDailyPublicChallengeLink("en"),
    ).resolves.toBeNull();

    expect(mocks.createOrReuse).not.toHaveBeenCalled();
  });
});
