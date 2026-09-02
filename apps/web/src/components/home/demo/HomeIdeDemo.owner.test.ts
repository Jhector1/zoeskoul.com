import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

function read(relativePath: string) {
  return readFileSync(
    resolve(process.cwd(), relativePath),
    "utf8",
  );
}

describe("HomeIdeDemo owner", () => {
  const owner = read(
    "src/components/home/demo/HomeIdeDemo.tsx",
  );

  const home = read(
    "src/components/home/onboarding/HomePageAvatarOnboardingClient.tsx",
  );

  it("stays a lightweight marketing DOM replica", () => {
    expect(owner).toContain("IntersectionObserver");
    expect(owner).toContain("visibilitychange");
    expect(owner).toContain("prefers-reduced-motion: reduce");
    expect(owner).toContain('data-testid="home-ide-demo"');

    expect(owner).not.toContain("CodeRunner");
    expect(owner).not.toContain("XtermTerminal");
    expect(owner.toLowerCase()).not.toContain("monaco");
    expect(owner).not.toContain("fetch(");
    expect(owner).not.toContain("axios");
  });

  it("models Python SQL and Terminal as distinct authentic scenes", () => {
    expect(owner).toContain('id: "python"');
    expect(owner).toContain('id: "sql"');
    expect(owner).toContain('id: "terminal"');

    expect(owner).toContain("Hello, Maya!");
    expect(owner).toContain("All tests passed");

    expect(owner).toContain("SELECT");
    expect(owner).toContain("ORDER BY");
    expect(owner).toContain("Query returned 3 rows");
    expect(owner).toContain("Results");

    expect(owner).toContain('const TERMINAL_COMMAND = "ls -la";');
    expect(owner).toContain("Command completed");
    expect(owner).toContain("drwxr-xr-x");
  });

  it("supports interactive scene selection and auto rotation", () => {
    expect(owner).toContain("SceneSelector");
    expect(owner).toContain("aria-pressed={active}");
    expect(owner).toContain("MANUAL_HOLD_MS");
    expect(owner).toContain("manualHold");
    expect(owner).toContain("(current + 1) %");
    expect(owner).toContain('phase === "transition"');
  });

  it("keeps product-native polish without fake window chrome", () => {
    expect(owner).toContain('"cursor"');
    expect(owner).toContain("HighlightedCode");
    expect(owner).toContain(
      "transition-[opacity,transform] duration-700",
    );
    expect(owner).toContain("AI Tutor");

    expect(owner).not.toContain("Lightweight product preview");
    expect(owner).not.toContain("ZoeSkoul Full IDE");
    expect(owner).not.toContain("bg-rose-400/80");
  });

  it("is composed before the home practice card", () => {
    expect(home).toContain(
      'import HomeIdeDemo from "@/components/home/demo/HomeIdeDemo";',
    );

    const demoIndex = home.indexOf("<HomeIdeDemo");
    const practiceIndex = home.indexOf(
      "<HomePracticeCard",
      demoIndex,
    );

    expect(demoIndex).toBeGreaterThan(0);
    expect(practiceIndex).toBeGreaterThan(demoIndex);
  });
});
