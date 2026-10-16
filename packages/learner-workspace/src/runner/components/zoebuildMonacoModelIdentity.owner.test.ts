import { describe, expect, it } from "vitest";

import { buildModelPath } from "./EditorPane";

describe("ZoeBuild Monaco source-file model identity", () => {
  it("preserves a TSX workspace filename instead of synthesizing .ts", () => {
    const path = buildModelPath({
      instanceKey: "zoebuild",
      exerciseStateKey: "project:react-vite",
      modelKey: "src-app",
      lang: "typescript",
      fileName: "src/App.tsx",
    });

    expect(path).toBe(
      "inmemory://zoeskoul-runner/project-react-vite/src-app.tsx",
    );
    expect(path).not.toMatch(/\.ts$/);
  });

  it("preserves JSX and ordinary TS/JS extensions", () => {
    expect(
      buildModelPath({
        instanceKey: "zoebuild",
        modelKey: "component",
        lang: "javascript",
        fileName: "src/Card.jsx",
      }),
    ).toMatch(/\.jsx$/);

    expect(
      buildModelPath({
        instanceKey: "zoebuild",
        modelKey: "types",
        lang: "typescript",
        fileName: "src/types.ts",
      }),
    ).toMatch(/\.ts$/);

    expect(
      buildModelPath({
        instanceKey: "zoebuild",
        modelKey: "main",
        lang: "javascript",
        fileName: "src/main.js",
      }),
    ).toMatch(/\.js$/);
  });

  it("keeps language-based identity when there is no real filename", () => {
    expect(
      buildModelPath({
        instanceKey: "runner-r",
        exerciseStateKey: "review:r-mean",
        modelKey: "main",
        lang: "r",
      }),
    ).toBe("inmemory://zoeskoul-runner/review-r-mean/main.R");
  });
});
