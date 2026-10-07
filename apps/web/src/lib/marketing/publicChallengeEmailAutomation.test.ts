import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  dispatchUpsert: vi.fn(),
  dispatchUpdateMany: vi.fn(),
  dispatchUpdate: vi.fn(),
  ensureImage: vi.fn(),
  description: vi.fn(),
  presentation: vi.fn(),
  sendCampaign: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@zoeskoul/app-config", () => ({
  getProductionAppOrigin: vi.fn(
    () => "https://zoeskoul.com",
  ),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicChallengeEmailDispatch: {
      upsert: mocks.dispatchUpsert,
      updateMany: mocks.dispatchUpdateMany,
      update: mocks.dispatchUpdate,
    },
  },
}));

vi.mock(
  "@/lib/practice/challenges/presentation",
  () => ({
    buildPublicChallengePresentation:
      mocks.presentation,
  }),
);

vi.mock("@/lib/practice/challenges/shortLink", () => ({
  getActivePracticeChallengeLink: vi.fn(),
  practiceChallengePath: vi.fn(() => "/c/daily-test"),
}));

vi.mock("@/lib/practice/challenges/automatedChallenge", () => ({
  createOrReuseAutomatedPracticeChallenge: vi.fn(),
  publicChallengeExerciseIdentity: vi.fn(),
}));

vi.mock("@/lib/practice/challenges/publishedCatalog", () => ({
  listPublishedChallengeExerciseOptions: vi.fn(),
}));

vi.mock("@/lib/marketing/publicChallengeSocial", () => ({
  PublicChallengeSocialProviderError:
    class PublicChallengeSocialProviderError extends Error {},
  publicChallengeSocialProviderStatuses: vi.fn(() => []),
  publicChallengeSocialSchedulerConfigured: vi.fn(() => true),
  publishPublicChallengeToProvider: vi.fn(),
}));

vi.mock("@/lib/marketing/publicChallengeSocialCopy", () => ({
  resolvePublicChallengeSocialDescription:
    mocks.description,
}));

vi.mock("@/lib/marketing/publicChallengeCampaign", () => ({
  getPublicChallengeAudienceList: vi.fn(),
  listPublicChallengeAudienceLists: vi.fn(),
  publicChallengeBrevoConfigured: vi.fn(() => true),
  sendPublicChallengeCampaignNow:
    mocks.sendCampaign,
}));

vi.mock("@/lib/practice/challenges/socialCard", () => ({
  ensurePublicChallengeSocialImage:
    mocks.ensureImage,
}));

type ActiveChallenge = NonNullable<
  Awaited<
    ReturnType<
      typeof import("@/lib/practice/challenges/shortLink").getActivePracticeChallengeLink
    >
  >
>;

let publishDailyChallengeEmail:
  typeof import("./publicChallengeSocialAutomation").publishDailyChallengeEmail;

beforeAll(async () => {
  ({
    publishDailyChallengeEmail,
  } = await import("./publicChallengeSocialAutomation"));
});

const challenge = {
  id: "challenge-1",
  code: "DailyTest",
  locale: "en",
  subjectSlug: "python-v2",
  moduleSlug: "m1",
  sectionSlug: "s1",
  topicSlug: "t1",
  exerciseKey: "exercise-1",
  exercisePurpose: "practice",
  signedToken: "token",
  shareTitle: "Python challenge",
  shareDescription: "Solve this.",
  ogImagePublicId: null,
  ogImageAlt: null,
  createdById: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as ActiveChallenge;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dispatchUpsert.mockResolvedValue({
    id: "email-dispatch-1",
    status: "pending",
    campaignId: null,
    selectedCount: null,
  });
  mocks.dispatchUpdateMany.mockResolvedValue({ count: 1 });
  mocks.ensureImage.mockResolvedValue({
    ...challenge,
    ogImagePublicId: "daily/image",
  });
  mocks.description.mockResolvedValue("Solve this.");
  mocks.presentation.mockReturnValue({
    title: "Python challenge",
    description: "Solve this.",
    imageUrl: "https://images.example.com/daily.jpg",
    imageAlt: "Python challenge",
  });
  mocks.sendCampaign.mockResolvedValue({
    ok: true,
    action: "send",
    campaignId: 91,
    sourceListId: 42,
    exclusionListId: null,
    selectedCount: 12,
  });
});

describe("automatic daily challenge email", () => {
  it("sends the same generated challenge through the selected Brevo list", async () => {
    await expect(
      publishDailyChallengeEmail({
        challenge,
        dispatchDate: "2026-10-07",
        sourceListId: 42,
        now: new Date("2026-10-07T15:00:00.000Z"),
      }),
    ).resolves.toEqual({
      status: "sent",
      campaignId: 91,
      selectedCount: 12,
      error: null,
    });

    expect(mocks.sendCampaign).toHaveBeenCalledWith({
      sourceListId: 42,
      excludedEmails: [],
      challengeUrl: "https://zoeskoul.com/c/daily-test",
      imageUrl: "https://images.example.com/daily.jpg",
      title: "Python challenge",
      description: "Solve this.",
    });
  });

  it("does not send the campaign again after the daily email dispatch is already sent", async () => {
    mocks.dispatchUpsert.mockResolvedValue({
      id: "email-dispatch-1",
      status: "sent",
      campaignId: 91,
      selectedCount: 12,
    });

    await expect(
      publishDailyChallengeEmail({
        challenge,
        dispatchDate: "2026-10-07",
        sourceListId: 42,
      }),
    ).resolves.toEqual({
      status: "skipped",
      campaignId: 91,
      selectedCount: 12,
      error: null,
    });

    expect(mocks.sendCampaign).not.toHaveBeenCalled();
  });

  it("does not reclaim an in-progress email dispatch and risk a duplicate campaign", async () => {
    mocks.dispatchUpsert.mockResolvedValue({
      id: "email-dispatch-1",
      status: "sending",
      campaignId: null,
      selectedCount: null,
    });

    const result = await publishDailyChallengeEmail({
      challenge,
      dispatchDate: "2026-10-07",
      sourceListId: 42,
    });

    expect(result.status).toBe("skipped");
    expect(result.error).toContain("already in progress");
    expect(mocks.sendCampaign).not.toHaveBeenCalled();
  });
});
