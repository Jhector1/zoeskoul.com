import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cwd = resolve(process.cwd());
const repoRoot = cwd.endsWith("/apps/teacher") ? resolve(cwd, "../..") : cwd;

function messages(locale: string, file: string) {
  return JSON.parse(
    readFileSync(
      resolve(repoRoot, `apps/teacher/src/i18n/messages/${locale}/ui/teacher/${file}.json`),
      "utf8",
    ),
  );
}

describe("Teacher Course/Class terminology V242", () => {
  it("explains that courses are reusable curriculum", () => {
    const node = messages("en", "school-courses").Teacher.schoolCourses;
    expect(node.title).toBe("Available courses");
    expect(node.description).toContain("reusable curriculum");
    expect(node.description).toContain("not a class or student group");
  });

  it("explains that classes are learner delivery groups", () => {
    const node = messages("en", "classes").Teacher.classes;
    expect(node.title).toBe("Classes");
    expect(node.subtitle).toContain("groups of learners");
    expect(node.subtitle).toContain("classes are the people and delivery");
  });

  it("keeps the distinction explicit across supported locales", () => {
    const expected = {
      en: ["Available courses", "Classes"],
      fr: ["Cours disponibles", "Classes"],
      es: ["Cursos disponibles", "Clases"],
      ht: ["Kou ki disponib", "Klas"],
    } as const;

    for (const [locale, [courseTitle, classTitle]] of Object.entries(expected)) {
      expect(messages(locale, "school-courses").Teacher.schoolCourses.title).toBe(courseTitle);
      expect(messages(locale, "classes").Teacher.classes.title).toBe(classTitle);
    }
  });
});
