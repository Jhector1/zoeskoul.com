import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd(), "../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("Public Challenge canonical Practice continuation", () => {
  it("never returns an authenticated learner to a bare guarded Practice runtime URL", () => {
    const source = read(
      "apps/web/src/lib/practice/api/trial/services/trialStart.service.ts",
    );

    expect(source).toContain("buildSelfPacedPracticeContinuationEntryHref");
    expect(source).not.toContain(
      'return `/${encodeURIComponent(args.locale)}/subjects/${encodeURIComponent(args.subjectSlug)}/modules/${encodeURIComponent(args.moduleSlug)}/practice`;',
    );
  });

  it("keeps Practice more like this as navigation while the supported entry owns starting", () => {
    for (const file of [
      "apps/web/src/components/practice/shell/SummaryView.tsx",
      "apps/student/src/legacy-web/components/practice/shell/SummaryView.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain('"Practice more like this"');
      expect(source).toContain("onClick={() => props.onReturn?.()}");
      expect(source).not.toContain("/api/practice/start");
    }
  });

  it("lets the Daily entry resolve continuation by tier without adding another start API owner", () => {
    const page = read(
      "apps/web/src/app/(public)/[locale]/(learningZone)/practice/daily/page.tsx",
    );
    const bootstrap = read(
      "apps/web/src/app/api/student-ui/practice/daily/route.ts",
    );

    expect(page).toContain(
      'continueToPractice={query.continue === "practice"}',
    );
    expect(bootstrap).toContain(
      'url.searchParams.get("continue") === "practice"',
    );

    for (const file of [
      "apps/web/src/app/(public)/[locale]/(learningZone)/practice/daily/daily-five-practice-client.tsx",
      "apps/student/src/features/practice/DailyFivePracticeClient.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain('if (props.mode === "subscriber")');
      expect(source).toContain("startSubscriberPractice");
      expect(source).toContain("startFreePractice");
      expect(source).not.toContain('fetch("/api/practice/start"');
    }
  });

  it("preserves the guarded runtime: a run URL still requires URL run identity", () => {
    const exact = read("apps/student/src/exact-old-ui/ExactPracticeViews.tsx");
    expect(exact).toContain('title="Practice run unavailable"');
    expect(exact).toContain(
      'message="Start Practice from the Practice entry point."',
    );
    expect(exact).toContain("practiceRunId");
    expect(exact).toContain("practiceRunStartedAt");
  });

  it("keeps the canonical normal Practice start owner in learning-client", () => {
    const helper = read("packages/learning-client/src/selfPacedPractice.ts");
    expect(helper).toContain("export async function startSelfPacedPractice");
    expect(helper).toContain('fetchImpl("/api/practice/start"');
    expect(helper).toContain("learner progress is canonical DB");
  });
});
