import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

describe("studentEmbeddedTryItEligibility shared ownership", () => {
  it("publishes the canonical shared owner", () => {
    const pkg = JSON.parse(
      source("packages/learner-workspace/package.json"),
    ) as {
      exports?: Record<string, string>;
    };

    expect(
      pkg.exports?.[
        "./lib/learning/studentEmbeddedTryItEligibility"
      ],
    ).toBe(
      "./src/lib/learning/studentEmbeddedTryItEligibility.ts",
    );
  });

  it("leaves identical Web and Student re-export adapters", () => {
    const web = source(
      "apps/web/src/lib/learning/"
        + "studentEmbeddedTryItEligibility.ts",
    );

    const student = source(
      "apps/student/src/legacy-web/lib/learning/"
        + "studentEmbeddedTryItEligibility.ts",
    );

    expect(web).toBe(student);

    expect(web).toContain(
      "@zoeskoul/learner-workspace/lib/learning/"
        + "studentEmbeddedTryItEligibility",
    );

    expect(
      web.split("\n").filter(Boolean).length,
    ).toBeLessThanOrEqual(2);
  });

  it("keeps the already-shared descriptor dependency local to the shared package", () => {
    const shared = source(
      "packages/learner-workspace/src/lib/learning/"
        + "studentEmbeddedTryItEligibility.ts",
    );

    expect(shared).toContain(
      "./studentRuntimePracticeDescriptorShared",
    );

    expect(
      fs.existsSync(
        path.join(
          ROOT,
          "packages/learner-workspace/src/lib/learning/"
            + "studentRuntimePracticeDescriptorShared.ts",
        ),
      ),
    ).toBe(true);
  });

  it("keeps app/framework dependencies out of the shared owner", () => {
    const shared = source(
      "packages/learner-workspace/src/lib/learning/"
        + "studentEmbeddedTryItEligibility.ts",
    );

    expect(shared.length).toBeGreaterThan(10000);
    expect(shared).toContain(
      "@zoeskoul/learning-contracts",
    );

    expect(shared).not.toContain('from "@/');
    expect(shared).not.toContain("next/navigation");
    expect(shared).not.toContain("next-intl");
    expect(shared).not.toContain("apps/student");
    expect(shared).not.toContain("apps/web");
  });
});
