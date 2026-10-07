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

describe("DailyResetCountdown shared ownership", () => {
  it("publishes the shared owner", () => {
    const pkg = JSON.parse(
      source(
        "packages/learner-workspace/package.json",
      ),
    ) as {
      exports?: Record<string, string>;
    };

    expect(
      pkg.exports?.[
        "./practice/completion/DailyResetCountdown"
      ],
    ).toBe(
      "./src/practice/completion/DailyResetCountdown.tsx",
    );
  });

  it("keeps app adapters limited to i18n wiring", () => {
    const web = source(
      "apps/web/src/components/practice/completion/"
        + "DailyResetCountdown.tsx",
    );

    const student = source(
      "apps/student/src/legacy-web/components/practice/"
        + "completion/DailyResetCountdown.tsx",
    );

    expect(web).toBe(student);

    expect(web).toContain(
      'from "next-intl"',
    );

    expect(web).toContain(
      "@zoeskoul/learner-workspace/practice/"
        + "completion/DailyResetCountdown",
    );

    expect(web).not.toContain(
      "window.setInterval",
    );

    expect(web).not.toContain(
      "countdownParts",
    );
  });

  it("keeps framework/i18n dependencies out of the shared owner", () => {
    const shared = source(
      "packages/learner-workspace/src/practice/"
        + "completion/DailyResetCountdown.tsx",
    );

    expect(shared).toContain(
      "window.setInterval",
    );

    expect(shared).toContain(
      'from "../experience/completion"',
    );

    expect(shared).not.toContain(
      "next-intl",
    );

    expect(shared).not.toContain(
      'from "@/',
    );
  });
});
