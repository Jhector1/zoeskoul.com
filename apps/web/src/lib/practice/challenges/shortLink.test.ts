import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

let createPracticeChallengeCode: typeof import("./shortLink").createPracticeChallengeCode;
let normalizePracticeChallengeCode: typeof import("./shortLink").normalizePracticeChallengeCode;
let practiceChallengePath: typeof import("./shortLink").practiceChallengePath;

beforeAll(async () => {
  ({
    createPracticeChallengeCode,
    normalizePracticeChallengeCode,
    practiceChallengePath,
  } = await import("./shortLink"));
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
});
