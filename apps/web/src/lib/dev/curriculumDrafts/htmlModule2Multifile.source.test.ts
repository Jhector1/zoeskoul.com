import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(process.cwd());

function readJson(relativePath: string) {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, relativePath), "utf8"),
  );
}

const sourceRoot =
  ".curriculum-drafts/web/subjects/html/courses/html-foundations/topics/html-module-2-links-images-paths";

const topicIds = [
  "links-and-anchors",
  "relative-and-absolute-paths",
  "images-and-alt-text",
  "module-2-profile-page-project"
];

describe("HTML Foundations Module 2 multi-file source", () => {
  it("uses the dedicated web files workspace only for Module 2", () => {
    const blueprint = readJson(
      "authoring/subjects/html/courses/html-foundations/course.blueprint.json",
    );

    const policy = blueprint.modulePolicies?.find(
      (candidate: any) => candidate?.moduleNumber === 2,
    );

    expect(policy?.workspaceProfileId).toBe("browser-web-files-runner");
  });

  it("gives every Module 2 code exercise a real multi-file workspace", () => {
    for (const topicId of topicIds) {
      const draft = readJson(`${sourceRoot}/${topicId}.json`);
      const codeInputs = draft.quizDraft.filter(
        (exercise: any) => exercise.kind === "code_input",
      );

      expect(codeInputs).toHaveLength(3);
      for (const exercise of codeInputs) {
        expect(exercise.starterFiles.length).toBeGreaterThanOrEqual(2);
        expect(exercise.solutionFiles.length).toBeGreaterThanOrEqual(2);
        expect(exercise.entryFilePath).toMatch(/\.html$/);
      }
    }
  });

  it("ships a real binary profile image for the image lesson and project", () => {
    for (const topicId of [
      "images-and-alt-text",
      "module-2-profile-page-project",
    ]) {
      const draft = readJson(`${sourceRoot}/${topicId}.json`);
      const files = draft.quizDraft
        .filter((exercise: any) => exercise.kind === "code_input")
        .flatMap((exercise: any) => exercise.starterFiles ?? []);

      const image = files.find(
        (file: any) => file.path === "images/profile.png",
      );

      expect(image?.encoding).toBe("base64");
      expect(image?.mimeType).toBe("image/png");
      expect(image?.sizeBytes).toBeGreaterThan(100);
      expect(image?.readOnly).toBe(true);
    }
  });

  it("makes the profile project progressively cumulative", () => {
    const draft = readJson(
      `${sourceRoot}/module-2-profile-page-project.json`,
    );
    const steps = draft.quizDraft.filter(
      (exercise: any) => exercise.kind === "code_input",
    );

    expect(steps[0].solutionFiles.map((file: any) => file.path)).toEqual(
      expect.arrayContaining(["index.html", "about.html"]),
    );
    expect(steps[1].solutionFiles.map((file: any) => file.path)).toEqual(
      expect.arrayContaining([
        "index.html",
        "about.html",
        "projects/robotics.html",
      ]),
    );
    expect(steps[2].solutionFiles.map((file: any) => file.path)).toEqual(
      expect.arrayContaining([
        "index.html",
        "about.html",
        "projects/robotics.html",
        "images/profile.png",
      ]),
    );
  });
});
