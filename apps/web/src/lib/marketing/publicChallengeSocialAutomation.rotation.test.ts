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
      findFirst: mocks.socialPostFindFirst,
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

let getDailyPublicChallengeForDispatch:
  typeof import("./publicChallengeSocialAutomation").getDailyPublicChallengeForDispatch;
let getNextDailyPublicChallengeLink:
  typeof import("./publicChallengeSocialAutomation").getNextDailyPublicChallengeLink;

beforeAll(async () => {
  ({
    getDailyPublicChallengeForDispatch,
    getNextDailyPublicChallengeLink,
  } = await import(
    "./publicChallengeSocialAutomation"
  ));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.socialPostFindFirst.mockResolvedValue(null);
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
      "reuses the challenge already claimed for the dispatch date when another provider retries",
      async () => {
        const challengeA = {
          id: "challenge-a",
          code: "ChallengeA",
          locale: "en",
        };

        mocks.socialPostFindFirst.mockResolvedValue({
          challenge: challengeA,
        });
        mocks.socialPostFindMany.mockResolvedValue([
          { challengeId: "challenge-a" },
        ]);
        mocks.getLatestActive.mockResolvedValue({
          id: "challenge-b",
          code: "ChallengeB",
          locale: "en",
        });

        await expect(
          getDailyPublicChallengeForDispatch(
            "en",
            "2026-10-05",
          ),
        ).resolves.toBe(challengeA);

        expect(
          mocks.socialPostFindFirst,
        ).toHaveBeenCalledWith({
          where: {
            source: "daily",
            dispatchDate: "2026-10-05",
          },
          orderBy: {
            createdAt: "asc",
          },
          include: {
            challenge: true,
          },
        });
        expect(
          mocks.socialPostFindMany,
        ).not.toHaveBeenCalled();
        expect(
          mocks.getLatestActive,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "selects a new challenge only when the date has no existing daily dispatch",
      async () => {
        const nextChallenge = {
          id: "challenge-b",
          code: "ChallengeB",
          locale: "en",
        };

        mocks.socialPostFindFirst.mockResolvedValue(null);
        mocks.socialPostFindMany.mockResolvedValue([
          { challengeId: "challenge-a" },
        ]);
        mocks.getLatestActive.mockResolvedValue(nextChallenge);

        await expect(
          getDailyPublicChallengeForDispatch(
            "en",
            "2026-10-06",
          ),
        ).resolves.toBe(nextChallenge);

        expect(
          mocks.getLatestActive,
        ).toHaveBeenCalledWith("en", {
          excludeIds: ["challenge-a"],
        });
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
