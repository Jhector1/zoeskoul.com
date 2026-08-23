import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "../..");

function read(relative: string) {
  return readFileSync(resolve(root, relative), "utf8");
}

function functionSlice(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}

describe("Public Challenge authored-Practice-only architecture", () => {
  it("composes the existing authored Practice owner with generic public safety", () => {
    const authored = read(
      "apps/web/src/lib/practice/experience/authoredPracticeQueue.ts",
    );
    const shared = read(
      "packages/practice-contracts/src/publicChallenges.ts",
    );
    const catalog = read(
      "apps/web/src/lib/practice/challenges/publishedCatalog.ts",
    );
    const challengeCatalog = functionSlice(
      catalog,
      "listPublishedChallengeExerciseOptions",
    );

    expect(authored).toContain('option.sectionRole === "lesson"');
    expect(authored).toContain('option.exercisePurpose === "practice"');

    expect(shared).toContain(
      'String(target.exerciseKind ?? "").trim() === "code_input"',
    );
    expect(shared).not.toContain(
      'String(target.exercisePurpose ?? "").trim() === "practice"',
    );
    expect(shared).not.toContain(
      'String(target.exercisePurpose ?? "").trim() === "project"',
    );

    expect(challengeCatalog).toContain(
      "isAuthoredLessonPracticeOption(option)",
    );
    expect(challengeCatalog).toContain(
      "isEligiblePublicChallengeTarget(option)",
    );
    expect(challengeCatalog).not.toContain(
      'option.exercisePurpose === "practice"',
    );
  });

  it("fails runtime identity closed to practice across target, session, token, and links", () => {
    const target = read(
      "apps/web/src/lib/practice/challenges/target.ts",
    );
    const session = read(
      "apps/web/src/lib/practice/challenges/session.ts",
    );
    const token = read(
      "apps/web/src/lib/practice/challenges/token.ts",
    );
    const shortLink = read(
      "apps/web/src/lib/practice/challenges/shortLink.ts",
    );

    expect(target).toContain(
      'export type SharedChallengePurpose = "practice";',
    );
    expect(target).toContain(
      'resolved.exercisePurpose !== "practice"',
    );
    expect(target).toContain("resolved.requiresAuthenticatedRunner");

    expect(session).toContain(
      'record.exercisePurpose === "practice" ? "practice" : null',
    );
    expect(session).toContain('purposePolicy: "strict"');

    expect(token).toContain('exercisePurpose: "practice";');
    expect(token).toContain(
      'claims.exercisePurpose !== "practice"',
    );

    expect(shortLink).toContain(
      'exercisePurpose: "practice"',
    );
  });

  it("persists the resolved Practice purpose and removes project-purpose Admin semantics", () => {
    const share = read(
      "apps/web/src/app/api/practice/trial/share/route.ts",
    );
    const adminApi = read(
      "apps/web/src/app/api/admin/public-challenges/route.ts",
    );
    const contracts = read(
      "packages/api-contracts/src/index.ts",
    );
    const page = read(
      "apps/admin/src/features/public-challenges/PublicChallengesPage.tsx",
    );
    const publisher = read(
      "apps/admin/src/features/public-challenges/PublicChallengePublisher.tsx",
    );

    expect(share).toContain(
      "exercisePurpose: input.exercisePurpose",
    );
    expect(share).toContain(
      "exercisePurpose: target.exercisePurpose",
    );
    expect(share).not.toContain(
      'exercisePurpose: "project"',
    );

    expect(adminApi).toContain("practice: options.length");

    expect(contracts).toContain(
      'export type PublicChallengeExercisePurpose = "practice";',
    );
    expect(contracts).toContain("practice: number;");

    expect(page).toContain("authored Practice exercise");
    expect(page).toContain("resource.data.counts.practice");
    expect(page).not.toContain("resource.data.counts.quiz");
    expect(page).not.toContain("resource.data.counts.project");

    expect(publisher).toContain('exercisePurpose: "practice";');
    expect(publisher).toContain("coding practice challenge");
    expect(publisher).not.toContain("coding project challenge");
  });
});
