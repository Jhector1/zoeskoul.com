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
    resolve(
      process.cwd(),
      relativePath,
    ),
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
    expect(owner).toContain(
      "IntersectionObserver",
    );
    expect(owner).toContain(
      "visibilitychange",
    );
    expect(owner).toContain(
      "prefers-reduced-motion: reduce",
    );
    expect(owner).toContain(
      'data-testid="home-ide-demo"',
    );
    expect(owner).toContain(
      "All tests passed",
    );
    expect(owner).toContain(
      "AI Tutor",
    );

    expect(owner).not.toContain(
      "CodeRunner",
    );
    expect(owner).not.toContain(
      "XtermTerminal",
    );
    expect(
      owner.toLowerCase(),
    ).not.toContain(
      "monaco",
    );
    expect(owner).not.toContain(
      "fetch(",
    );
    expect(owner).not.toContain(
      "axios",
    );
  });

  it("keeps the product demo visually native instead of video/mock-window chrome", () => {
    expect(owner).toContain(
      '"cursor"',
    );
    expect(owner).toContain(
      "HighlightedCode",
    );
    expect(owner).toContain(
      "transition-[opacity,transform] duration-700",
    );

    expect(owner).not.toContain(
      "Lightweight product preview",
    );
    expect(owner).not.toContain(
      "ZoeSkoul Full IDE",
    );
    expect(owner).not.toContain(
      "bg-rose-400/80",
    );
  });

  it("is composed immediately before the home practice card", () => {
    expect(home).toContain(
      'import HomeIdeDemo from "@/components/home/demo/HomeIdeDemo";',
    );

    const demoIndex =
      home.indexOf("<HomeIdeDemo");
    const practiceIndex =
      home.indexOf(
        "<HomePracticeCard",
        demoIndex,
      );

    expect(demoIndex).toBeGreaterThan(
      0,
    );
    expect(practiceIndex).toBeGreaterThan(
      demoIndex,
    );
  });
});
