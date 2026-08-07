import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  fs.readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  );

const exists = (relativePath: string) =>
  fs.existsSync(fileURLToPath(new URL(relativePath, import.meta.url)));

describe("ThemeToggle shared ownership", () => {
  it("keeps theme behavior shared without app routing or auth dependencies", () => {
    const source = readSource("./ThemeToggle.tsx");

    expect(source).toContain('from "next-themes"');
    expect(source).toContain('from "@zoeskoul/preferences/react"');
    expect(source).toContain('export function ThemeToggle(');
    expect(source).toContain('aria-label="Toggle theme"');

    for (const forbidden of [
      "next-auth",
      "next/navigation",
      "next-intl",
      "useSession",
      "useStudentSession",
      "buildStudentAppHref",
      "buildStudentLogoutUrl",
      "buildWebLogoutUrl",
      "@/",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("is consumed by both Web and Student header adapters", () => {
    const web = readSource(
      "../../../apps/web/src/components/HeaderSlick.tsx",
    );
    const student = readSource(
      "../../../apps/student/src/components/chrome/StudentHeaderSlick.tsx",
    );

    expect(web).toContain(
      'import { HeaderChrome, ThemeToggle } from "@zoeskoul/learner-ui";',
    );
    expect(student).toContain(
      'import { HeaderChrome, ThemeToggle } from "@zoeskoul/learner-ui";',
    );

    expect(web).not.toContain('from "./ThemeToggle"');
    expect(student).not.toContain('from "@/components/ThemeToggle"');
  });

  it("removes both app-local duplicate implementations", () => {
    expect(
      exists("../../../apps/web/src/components/ThemeToggle.tsx"),
    ).toBe(false);
    expect(
      exists(
        "../../../apps/student/src/legacy-web/components/ThemeToggle.tsx",
      ),
    ).toBe(false);
  });
});
