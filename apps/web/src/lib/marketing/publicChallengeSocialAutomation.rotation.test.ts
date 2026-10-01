import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  socialPostFindMany: vi.fn(),
  getLatestActive: vi.fn(),
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
      findMany: mocks.socialPostFindMany,
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

vi.mock(
  "@/lib/practice/challenges/shortLink",
  () => ({
    getActivePracticeChallengeLink:
      vi.fn(),
    getLatestActivePracticeChallengeLink:
      mocks.getLatestActive,
    practiceChallengePath:
      vi.fn(() => "/c/test"),
  }),
);

vi.mock(
  "@/lib/marketing/publicChallengeSocial",
  () => ({
    PublicChallengeSocialProviderError:
      class PublicChallengeSocialProviderError
        extends Error {},
    publicChallengeSocialProviderStatuses:
      vi.fn(() => []),
    publicChallengeSocialSchedulerConfigured:
      vi.fn(() => true),
    publishPublicChallengeToProvider:
      vi.fn(),
  }),
);

vi.mock(
  "@/lib/practice/challenges/socialCard",
  () => ({
    ensurePublicChallengeSocialImage:
      vi.fn(),
  }),
);

let getNextDailyPublicChallengeLink:
  typeof import("./publicChallengeSocialAutomation").getNextDailyPublicChallengeLink;

beforeAll(async () => {
  ({
    getNextDailyPublicChallengeLink,
  } = await import(
    "./publicChallengeSocialAutomation"
  ));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe(
  "daily public challenge social rotation",
  () => {
    it(
      "asks for the newest active challenge excluding prior successful daily posts",
      async () => {
        const nextChallenge = {
          id: "challenge-b",
          code: "ChallengeB",
          locale: "en",
        };

        mocks.socialPostFindMany
          .mockResolvedValue([
            {
              challengeId:
                "challenge-a",
            },
          ]);

        mocks.getLatestActive
          .mockResolvedValue(
            nextChallenge,
          );

        await expect(
          getNextDailyPublicChallengeLink(
            "en",
          ),
        ).resolves.toBe(
          nextChallenge,
        );

        expect(
          mocks.socialPostFindMany,
        ).toHaveBeenCalledWith({
          where: {
            source: "daily",
            status: "published",
          },
          select: {
            challengeId: true,
          },
          distinct: [
            "challengeId",
          ],
        });

        expect(
          mocks.getLatestActive,
        ).toHaveBeenCalledWith(
          "en",
          {
            excludeIds: [
              "challenge-a",
            ],
          },
        );
      },
    );

    it(
      "returns no candidate instead of recycling an already published challenge",
      async () => {
        mocks.socialPostFindMany
          .mockResolvedValue([
            {
              challengeId:
                "challenge-a",
            },
          ]);

        mocks.getLatestActive
          .mockResolvedValue(null);

        await expect(
          getNextDailyPublicChallengeLink(
            "en",
          ),
        ).resolves.toBeNull();

        expect(
          mocks.getLatestActive,
        ).toHaveBeenCalledWith(
          "en",
          {
            excludeIds: [
              "challenge-a",
            ],
          },
        );
      },
    );
  },
);
