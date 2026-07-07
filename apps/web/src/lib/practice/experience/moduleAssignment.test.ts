import { describe, expect, it } from "vitest";

import {
  MODULE_ASSIGNMENT_STORAGE_MODE,
  isModuleAssignmentMeta,
  moduleAssignmentExperienceKey,
  readModuleAssignmentMeta,
} from "./moduleAssignment";

describe("module-assignment persistence", () => {
  it("uses standard storage because there is no Assignment row", () => {
    expect(MODULE_ASSIGNMENT_STORAGE_MODE).toBe("standard");
  });

  it("builds a stable per-user, per-module identity", () => {
    expect(moduleAssignmentExperienceKey("user-1", "module-1")).toBe(
      "module-assignment:user-1:module-1",
    );
  });

  it("recognizes only explicit module-assignment metadata", () => {
    const meta = {
      kind: "module_assignment",
      source: "review_module",
      moduleSlug: "python-v2-0",
      unrelated: true,
    };

    expect(isModuleAssignmentMeta(meta)).toBe(true);
    expect(readModuleAssignmentMeta(meta)).toEqual({
      kind: "module_assignment",
      source: "review_module",
      moduleSlug: "python-v2-0",
    });
    expect(isModuleAssignmentMeta({ kind: "assignment" })).toBe(false);
  });
});
