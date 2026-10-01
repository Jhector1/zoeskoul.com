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
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    practiceChallengeLink: {
      findFirst: mocks.findFirst,
    },
  },
}));

let getLatestActivePracticeChallengeLink:
  typeof import("./shortLink").getLatestActivePracticeChallengeLink;

beforeAll(async () => {
  ({
    getLatestActivePracticeChallengeLink,
  } = await import("./shortLink"));
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe(
  "social challenge rotation selection",
  () => {
    it(
      "excludes challenges already used by daily social automation",
      async () => {
        const candidate = {
          id: "challenge-b",
          locale: "en",
        };

        mocks.findFirst.mockResolvedValueOnce(
          candidate,
        );

        await expect(
          getLatestActivePracticeChallengeLink(
            "en",
            {
              excludeIds: [
                "challenge-a",
                "challenge-a",
              ],
            },
          ),
        ).resolves.toBe(candidate);

        expect(
          mocks.findFirst,
        ).toHaveBeenCalledTimes(1);

        expect(
          mocks.findFirst,
        ).toHaveBeenCalledWith({
          where: expect.objectContaining({
            locale: "en",
            revokedAt: null,
            id: {
              notIn: ["challenge-a"],
            },
          }),
          orderBy: {
            createdAt: "desc",
          },
        });
      },
    );

    it(
      "preserves exclusions on the locale fallback query",
      async () => {
        mocks.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: "challenge-b",
            locale: "fr",
          });

        await getLatestActivePracticeChallengeLink(
          "en",
          {
            excludeIds: ["challenge-a"],
          },
        );

        expect(
          mocks.findFirst,
        ).toHaveBeenCalledTimes(2);

        expect(
          mocks.findFirst.mock.calls[1]?.[0],
        ).toEqual({
          where: expect.objectContaining({
            revokedAt: null,
            id: {
              notIn: ["challenge-a"],
            },
          }),
          orderBy: {
            createdAt: "desc",
          },
        });
      },
    );
  },
);
