import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

const source = readFileSync(
  new URL(
    "./App.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("Teacher application composition", () => {
  it("uses shared access, i18n, and route-shell owners", () => {
    expect(source).toContain(
      "TeacherIntlProvider",
    );
    expect(source).toContain(
      "TeacherAccessGate",
    );
    expect(source).toContain(
      "TeacherAppShell",
    );
  });

  it("does not redefine raw roles or directly own tutoring routing", () => {
    expect(source).not.toContain(
      '"student" | "teacher" | "admin"',
    );
    expect(source).not.toContain(
      "TeacherTutoringDashboard",
    );
  });
});
