import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildControlledEditorModelPath,
  normalizeControlledEditorLanguage,
} from "./model";

describe("controlled editor model identity", () => {
  it("normalizes learner languages for Monaco", () => {
    expect(
      normalizeControlledEditorLanguage(
        "python",
      ),
    ).toBe("python");
    expect(
      normalizeControlledEditorLanguage(
        "c++",
      ),
    ).toBe("cpp");
    expect(
      normalizeControlledEditorLanguage(
        "R",
      ),
    ).toBe("r");
    expect(
      normalizeControlledEditorLanguage(
        "unknown",
      ),
    ).toBe("plaintext");
  });

  it("builds one safe deterministic model path", () => {
    expect(
      buildControlledEditorModelPath({
        modelKey:
          "python/module/topic/try-1",
        language: "python",
        fileName: "main.py",
      }),
    ).toBe(
      "inmemory://zoeskoul-controlled-editor/" +
        "python/module/topic/try-1/main.py",
    );

    expect(
      buildControlledEditorModelPath({
        modelKey: "r/module/topic/try-1",
        language: "r",
      }),
    ).toBe(
      "inmemory://zoeskoul-controlled-editor/" +
        "r/module/topic/try-1/main.R",
    );

    expect(
      buildControlledEditorModelPath({
        modelKey: "../unsafe key",
        language: "python",
        fileName: "../main.py",
      }),
    ).not.toContain("..");
  });
});
