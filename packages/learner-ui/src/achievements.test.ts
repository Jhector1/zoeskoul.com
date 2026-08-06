import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildAchievementBuckets,
  clampAchievementPercentage,
  isCertificateUnlocked,
  isMoreComing,
  isRewardUnlocked,
  type AchievementItem,
} from "./achievements";

function achievement(
  slug: string,
  overrides: Partial<AchievementItem> = {},
): AchievementItem {
  return {
    subject: {
      id: slug,
      slug,
      title: slug,
      order: 0,
      imagePublicId: null,
      imageAlt: null,
    },
    enrollment: {
      status: "enrolled",
      startedAt: "2026-01-01T00:00:00.000Z",
      lastSeenAt: null,
      completedAt: null,
    },
    requireAssignment: false,
    eligible: false,
    completedAt: null,
    progress: {
      modulesTotal: 1,
      modulesDone: 0,
      assignmentsDone: 0,
      percent: 0,
    },
    modules: [],
    certificate: null,
    ...overrides,
  };
}

describe("achievement classification", () => {
  it("classifies reward-ready achievements as unlocked rewards", () => {
    const item = achievement("reward", {
      finishState: {
        status: "reward_ready",
        message: null,
        rewardEligible: false,
        certificateEligible: false,
        certificateIssued: false,
        curriculumComplete: true,
      },
    });

    expect(isRewardUnlocked(item)).toBe(true);
    expect(isCertificateUnlocked(item)).toBe(false);
  });

  it("classifies issued certificates as certificate unlocked", () => {
    const item = achievement("certificate", {
      certificate: {
        id: "cert-1",
        issuedAt: "2026-01-02T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:00.000Z",
      },
    });

    expect(isCertificateUnlocked(item)).toBe(true);
  });

  it("classifies only more-coming status as more coming", () => {
    const item = achievement("coming", {
      finishState: {
        status: "more_coming",
        message: "More content is coming.",
        rewardEligible: false,
        certificateEligible: false,
        certificateIssued: false,
        curriculumComplete: true,
      },
    });

    expect(isMoreComing(item)).toBe(true);
  });

  it("builds endpoint-independent buckets", () => {
    const reward = achievement("reward", {
      finishState: {
        status: "reward_ready",
        message: null,
        rewardEligible: true,
        certificateEligible: false,
        certificateIssued: false,
        curriculumComplete: true,
      },
    });
    const certificate = achievement("certificate", {
      finishState: {
        status: "certificate_ready",
        message: null,
        rewardEligible: true,
        certificateEligible: true,
        certificateIssued: false,
        curriculumComplete: true,
      },
    });
    const coming = achievement("coming", {
      finishState: {
        status: "more_coming",
        message: null,
        rewardEligible: false,
        certificateEligible: false,
        certificateIssued: false,
        curriculumComplete: true,
      },
    });
    const progress = achievement("progress");

    const buckets = buildAchievementBuckets([
      reward,
      certificate,
      coming,
      progress,
    ]);

    expect(buckets.rewards).toEqual([reward]);
    expect(buckets.certificates).toEqual([certificate]);
    expect(buckets.badges).toEqual([reward, certificate]);
    expect(buckets.moreComing).toEqual([coming]);
    expect(buckets.inProgress).toEqual([progress]);
  });

  it.each([
    [-10, 0],
    [0, 0],
    [46, 46],
    [100, 100],
    [140, 100],
  ])("clamps %s percent to %s", (input, expected) => {
    expect(clampAchievementPercentage(input)).toBe(expected);
  });
});

describe("achievement adapter contracts", () => {
  const readRepositoryFile = (relativePath: string) =>
    fs.readFileSync(
      fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)),
      "utf8",
    );

  it("keeps the Web adapter on Web endpoints and default-export compatible", () => {
    const source = readRepositoryFile(
      "apps/web/src/app/(public)/[locale]/(platform)/achievements/AchievementsClient.tsx",
    );

    expect(source).toContain('const WEB_ACHIEVEMENTS_ENDPOINT = "/api/achievements"');
    expect(source).toContain("/api/certificates/subject/pdf?subjectSlug=");
    expect(source).toContain("export default function AchievementsClient()");
    expect(source).not.toContain("apps/student");
  });

  it("keeps the Student adapter on Student facade endpoints and named-export compatible", () => {
    const source = readRepositoryFile(
      "apps/student/src/exact-old-ui/ExactAchievementsView.tsx",
    );

    expect(source).toContain(
      'const STUDENT_ACHIEVEMENTS_ENDPOINT = "/api/student-ui/achievements"',
    );
    expect(source).toContain("/api/student-ui/certificates/subject/pdf?subjectSlug=");
    expect(source).toContain("export function ExactAchievementsView()");
    expect(source).not.toContain("apps/web");
  });

  it("keeps the shared package framework-neutral and app-independent", () => {
    const component = readRepositoryFile(
      "packages/learner-ui/src/AchievementsView.tsx",
    );
    const logic = readRepositoryFile(
      "packages/learner-ui/src/achievements.ts",
    );
    const source = `${component}\n${logic}`;

    expect(source).not.toMatch(/from ["']next(?:\/|["'])/);
    expect(source).not.toContain("next-intl");
    expect(source).not.toMatch(/from ["']@\//);
    expect(source).not.toContain("apps/web");
    expect(source).not.toContain("apps/student");
    expect(source).not.toContain("server-only");
  });
});
