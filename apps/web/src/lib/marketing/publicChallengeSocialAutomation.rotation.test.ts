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
  dailyDispatchFindUnique: vi.fn(),
  dailyDispatchFindFirst: vi.fn(),
  dailyDispatchFindMany: vi.fn(),
  dailyDispatchUpsert: vi.fn(),
  listPublished: vi.fn(),
  createOrReuse: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@zoeskoul/app-config", () => ({
  getProductionAppOrigin: vi.fn(
    () => "https://zoeskoul.com",
  ),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicChallengeSocialPost: {
      findFirst: mocks.socialPostFindFirst,
      findMany: mocks.socialPostFindMany,
    },
    publicChallengeDailyDispatch: {
      findUnique: mocks.dailyDispatchFindUnique,
      findFirst: mocks.dailyDispatchFindFirst,
      findMany: mocks.dailyDispatchFindMany,
      upsert: mocks.dailyDispatchUpsert,
    },
  },
}));

vi.mock(
  "@/lib/practice/challenges/presentation",
  () => ({
    buildPublicChallengePresentation:
      vi.fn(),
  }),
);

vi.mock("@/lib/practice/challenges/shortLink", () => ({
  getActivePracticeChallengeLink: vi.fn(),
  practiceChallengePath: vi.fn(() => "/c/test"),
}));

vi.mock("@/lib/practice/challenges/publishedCatalog", () => ({
  listPublishedChallengeExerciseOptions:
    mocks.listPublished,
}));

vi.mock("@/lib/practice/challenges/automatedChallenge", () => ({
  createOrReuseAutomatedPracticeChallenge:
    mocks.createOrReuse,
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

vi.mock("@/lib/marketing/publicChallengeSocialCopy", () => ({
  resolvePublicChallengeSocialDescription: vi.fn(),
}));

vi.mock("@/lib/marketing/publicChallengeCampaign", () => ({
  getPublicChallengeAudienceList: vi.fn(),
  listPublicChallengeAudienceLists: vi.fn(),
  publicChallengeBrevoConfigured: vi.fn(() => true),
  sendPublicChallengeCampaignNow: vi.fn(),
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

const pythonA = {
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

const pythonB = {
  ...pythonA,
  id: "python::m1::s1::t1::b",
  exerciseKey: "exercise-b",
  exerciseTitle: "Exercise B",
  exercisePrompt: "Solve B",
} as const;

const sqlA = {
  ...pythonA,
  id: "sql::m1::s1::t1::a",
  subjectSlug: "sql-v2",
  subjectTitle: "SQL",
  exerciseKey: "exercise-sql-a",
  exerciseTitle: "SQL Exercise A",
  exercisePrompt: "Solve SQL A",
} as const;

function history(
  option: {
    subjectSlug: string;
    moduleSlug: string;
    sectionSlug: string;
    topicSlug: string;
    exerciseKey: string;
  },
  date: string,
) {
  return {
    dispatchDate: date,
    createdAt: new Date(`${date}T15:00:00.000Z`),
    challenge: {
      subjectSlug: option.subjectSlug,
      moduleSlug: option.moduleSlug,
      sectionSlug: option.sectionSlug,
      topicSlug: option.topicSlug,
      exerciseKey: option.exerciseKey,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.socialPostFindFirst.mockResolvedValue(null);
  mocks.socialPostFindMany.mockResolvedValue([]);
  mocks.dailyDispatchFindUnique.mockResolvedValue(null);
  mocks.dailyDispatchFindFirst.mockResolvedValue(null);
  mocks.dailyDispatchFindMany.mockResolvedValue([]);
  mocks.listPublished.mockResolvedValue([
    pythonA,
    pythonB,
    sqlA,
  ]);
});

describe("daily public challenge subject rotation", () => {
  it("moves to the next subject even when the previous subject still has unused exercises", async () => {
    mocks.dailyDispatchFindMany.mockResolvedValue([
      history(pythonA, "2026-10-06"),
    ]);
    const challenge = {
      id: "challenge-sql",
      code: "ChallengeSql",
      locale: "en",
    };
    mocks.createOrReuse.mockResolvedValue(challenge);

    await expect(
      getNextDailyPublicChallengeLink("en"),
    ).resolves.toBe(challenge);

    expect(mocks.createOrReuse).toHaveBeenCalledWith({
      locale: "en",
      option: sqlA,
    });
  });

  it("wraps to the first subject and chooses its next unused exercise", async () => {
    mocks.dailyDispatchFindMany.mockResolvedValue([
      history(pythonA, "2026-10-05"),
      history(sqlA, "2026-10-06"),
    ]);
    const challenge = {
      id: "challenge-python-b",
      code: "ChallengePythonB",
      locale: "en",
    };
    mocks.createOrReuse.mockResolvedValue(challenge);

    await expect(
      getNextDailyPublicChallengeLink("en"),
    ).resolves.toBe(challenge);

    expect(mocks.createOrReuse).toHaveBeenCalledWith({
      locale: "en",
      option: pythonB,
    });
  });

  it("reuses the channel-neutral challenge already claimed for the scheduled occurrence", async () => {
    const challenge = {
      id: "challenge-a",
      code: "ChallengeA",
      locale: "en",
    };
    mocks.dailyDispatchFindUnique.mockResolvedValue({
      challenge,
    });

    await expect(
      getDailyPublicChallengeForDispatch(
        "en",
        "2026-10-07",
        "2026-10-07@10:00@America/Chicago",
      ),
    ).resolves.toBe(challenge);

    expect(mocks.socialPostFindFirst).not.toHaveBeenCalled();
    expect(mocks.listPublished).not.toHaveBeenCalled();
    expect(mocks.dailyDispatchFindUnique).toHaveBeenCalledWith({
      where: { occurrenceKey: "2026-10-07@10:00@America/Chicago" },
      include: { challenge: true },
    });
    expect(mocks.dailyDispatchFindFirst).not.toHaveBeenCalled();
  });

  it("backfills a legacy social-owned daily claim into the channel-neutral owner", async () => {
    const challenge = {
      id: "challenge-legacy",
      code: "ChallengeLegacy",
      locale: "en",
      subjectSlug: "python-v2",
    };
    mocks.socialPostFindFirst.mockResolvedValue({
      challenge,
    });
    mocks.dailyDispatchUpsert.mockResolvedValue({
      challenge,
    });

    await expect(
      getDailyPublicChallengeForDispatch(
        "en",
        "2026-10-06",
      ),
    ).resolves.toBe(challenge);

    expect(mocks.dailyDispatchUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { occurrenceKey: "legacy:2026-10-06:social" },
        create: expect.objectContaining({
          occurrenceKey: "legacy:2026-10-06:social",
          challengeId: "challenge-legacy",
          subjectSlug: "python-v2",
        }),
      }),
    );
  });

  it("returns no candidate after every eligible exercise has already been dispatched", async () => {
    mocks.dailyDispatchFindMany.mockResolvedValue([
      history(pythonA, "2026-10-04"),
      history(pythonB, "2026-10-05"),
      history(sqlA, "2026-10-06"),
    ]);

    await expect(
      getNextDailyPublicChallengeLink("en"),
    ).resolves.toBeNull();

    expect(mocks.createOrReuse).not.toHaveBeenCalled();
  });
});
