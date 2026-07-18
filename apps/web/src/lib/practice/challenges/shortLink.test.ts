import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    practiceChallengeLink: {
      findFirst: prismaMocks.findFirst,
    },
  },
}));

let createPracticeChallengeCode: typeof import("./shortLink").createPracticeChallengeCode;
let getLatestActivePracticeChallengeLink: typeof import("./shortLink").getLatestActivePracticeChallengeLink;
let normalizePracticeChallengeCode: typeof import("./shortLink").normalizePracticeChallengeCode;
let practiceChallengePath: typeof import("./shortLink").practiceChallengePath;

beforeAll(async () => {
  ({
    createPracticeChallengeCode,
    getLatestActivePracticeChallengeLink,
    normalizePracticeChallengeCode,
    practiceChallengePath,
  } = await import("./shortLink"));
});

beforeEach(() => {
  prismaMocks.findFirst.mockReset();
});

describe("practice challenge short links", () => {
  it("creates compact URL-safe codes", () => {
    const code = createPracticeChallengeCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{8,24}$/);
  });

  it("rejects malformed codes", () => {
    expect(normalizePracticeChallengeCode("../../secret")).toBeNull();
    expect(normalizePracticeChallengeCode("tiny")).toBeNull();
  });

  it("builds the compact route", () => {
    expect(practiceChallengePath("Abc_1234-Z")).toBe("/c/Abc_1234-Z");
  });

  it("prefers the newest active challenge in the requested locale", async () => {
    const localized = { id: "localized" };
    prismaMocks.findFirst.mockResolvedValueOnce(localized);

    await expect(getLatestActivePracticeChallengeLink("fr")).resolves.toBe(
      localized,
    );
    expect(prismaMocks.findFirst).toHaveBeenCalledTimes(1);
    expect(prismaMocks.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        locale: "fr",
        revokedAt: null,
        OR: expect.any(Array),
      }),
      orderBy: { createdAt: "desc" },
    });
  });

  it("falls back to the newest active challenge when the locale has none", async () => {
    const fallback = { id: "fallback" };
    prismaMocks.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(fallback);

    await expect(getLatestActivePracticeChallengeLink("ht")).resolves.toBe(
      fallback,
    );
    expect(prismaMocks.findFirst).toHaveBeenCalledTimes(2);
    expect(prismaMocks.findFirst.mock.calls[1]?.[0]).toEqual({
      where: expect.objectContaining({
        revokedAt: null,
        OR: expect.any(Array),
      }),
      orderBy: { createdAt: "desc" },
    });
  });
});
