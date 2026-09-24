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

const repoRoot = resolve(__dirname, "../../../..");

function source(path: string) {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("Student preference first-paint race contract", () => {
  it("applies the canonical preference theme and locale synchronously", () => {
    const react = source("packages/preferences/src/react.tsx");

    expect(react).toContain(
      "document.documentElement.classList.toggle(",
    );
    expect(react).toContain(
      "document.documentElement.dataset.theme = concreteTheme;",
    );
    expect(react).toContain(
      "document.documentElement.style.colorScheme = concreteTheme;",
    );
    expect(react).toContain(
      "document.documentElement.lang = preferences.locale;",
    );
  });

  it("does not let next-themes boot from system and correct after paint", () => {
    const provider = source(
      "apps/student/src/platform/StudentThemeProvider.tsx",
    );

    expect(provider).toContain("forcedTheme={theme}");
    expect(provider).toContain("enableSystem={false}");
    expect(provider).toContain("disableTransitionOnChange");
    expect(provider).not.toContain('defaultTheme="system"');
    expect(provider).not.toContain("function ThemePreferenceSync()");
  });

  it("waits for preference hydration before locale convergence", () => {
    const app = source("apps/student/src/App.tsx");

    expect(app).toContain("const { preferences, status } =");
    expect(app).toContain('status === "loading"');
    expect(app.indexOf('status === "loading"')).toBeLessThan(
      app.indexOf("navigate("),
    );
    expect(app).not.toContain("Loading ZoeSkoul…");
    expect(app).toContain('className="student-state-spinner"');
  });

  it("does not paint hard-coded English session copy while auth is loading", () => {
    const gate = source(
      "apps/student/src/app/StudentAccessGate.tsx",
    );

    const loadingStart = gate.indexOf(
      'if (state.status === "loading")',
    );
    const errorStart = gate.indexOf(
      'if (state.status === "error")',
    );
    const loadingBranch = gate.slice(loadingStart, errorStart);

    expect(loadingBranch).not.toContain(
      "Opening your learning space",
    );
    expect(loadingBranch).not.toContain(
      "Checking your session and database permissions.",
    );
  });
});
