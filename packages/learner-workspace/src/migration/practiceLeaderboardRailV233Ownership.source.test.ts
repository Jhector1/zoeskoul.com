import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("V233 PracticeLeaderboardRail shared ownership", () => {
  it("moves the implementation into learner-workspace", () => {
    const shared = source("packages/learner-workspace/src/components/practice/leaderboard/PracticeLeaderboardRail.tsx");

    expect(shared).toContain("export default function PracticeLeaderboardRail");
    expect(shared).toContain("LinkComponent");
    expect(shared.match(/<LinkComponent/g)?.length).toBe(4);
    expect(shared.match(/<\/LinkComponent>/g)?.length).toBe(4);
  });

  it("keeps framework imports out of the shared owner", () => {
    const shared = source("packages/learner-workspace/src/components/practice/leaderboard/PracticeLeaderboardRail.tsx");

    expect(shared).not.toContain("next/link");
    expect(shared).not.toContain("next-intl");
    expect(shared).not.toContain("next/navigation");
    expect(shared).not.toContain('from "@/');
    expect(shared).not.toContain("@student/");
  });

  it("leaves Student and Web as thin Next Link adapters", () => {
    for (const relativePath of [
      "apps/student/src/legacy-web/components/practice/leaderboard/PracticeLeaderboardRail.tsx",
      "apps/web/src/components/practice/leaderboard/PracticeLeaderboardRail.tsx",
    ]) {
      const adapter = source(relativePath);

      expect(adapter).toContain('import Link from "next/link"');
      expect(adapter).toContain("SharedPracticeLeaderboardRail");
      expect(adapter).toContain("LinkComponent={Link}");
      expect(adapter.split("\n").length).toBeLessThan(25);
    }
  });

  it("exports the shared owner from learner-workspace", () => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as { exports?: Record<string, string> };

    expect(pkg.exports?.["./components/practice/leaderboard/PracticeLeaderboardRail"]).toBe(
      "./src/components/practice/leaderboard/PracticeLeaderboardRail.tsx",
    );
  });
});
