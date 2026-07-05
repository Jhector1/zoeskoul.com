import { describe, expect, it } from "vitest";

import {
  collectStandaloneTryItExerciseKeys,
  resolvePublishedExerciseCapabilities,
  resolvePublishedPracticeSectionRole,
} from "./publishedExerciseMetadata";

describe("published exercise metadata", () => {
  it("finds only exercises explicitly exposed as standalone try-its", () => {
    const keys = collectStandaloneTryItExerciseKeys({
      cards: [
        {
          id: "sketch-1",
          kind: "sketch",
          tryIt: { exerciseKey: "ci-standalone" },
        },
        {
          id: "project",
          kind: "project",
          project: {
            steps: [{ exerciseKey: "ci-project-only" }],
          },
        },
      ],
    });

    expect([...keys]).toEqual(["ci-standalone"]);
  });

  it("keeps module projects and capstones out of lesson practice", () => {
    expect(resolvePublishedPracticeSectionRole(undefined)).toBe("lesson");
    expect(resolvePublishedPracticeSectionRole("module_project")).toBe(
      "module_project",
    );
    expect(resolvePublishedPracticeSectionRole("capstone")).toBe("capstone");
  });

  it("detects actual multi-file workspaces without confusing runtime capability with requirement", () => {
    expect(
      resolvePublishedExerciseCapabilities(
        {
          starterFiles: [{ path: "main.py" }, { path: "helpers.py" }],
        },
        { runtimeDefaults: { supportsMultiFile: false } },
      ).isMultiFile,
    ).toBe(true);

    expect(
      resolvePublishedExerciseCapabilities(
        { starterFiles: [{ path: "main.py" }] },
        { runtimeDefaults: { supportsMultiFile: true } },
      ).isMultiFile,
    ).toBe(false);
  });
});
