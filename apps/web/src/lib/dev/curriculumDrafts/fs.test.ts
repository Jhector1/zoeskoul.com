import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeJoin, subjectWithoutDraftWrapper } from "./fs";

describe("curriculum draft fs helpers", () => {
  it("prevents path traversal outside the allowed root", () => {
    const root = path.resolve("/tmp/zoe-drafts");
    expect(safeJoin(root, "python", "subjects")).toBe(path.join(root, "python", "subjects"));
    expect(() => safeJoin(root, "..", "secret.txt")).toThrow(/Unsafe path/);
  });

  it("unwraps catalog draft subject names for course checks", () => {
    expect(subjectWithoutDraftWrapper("python", "python--applied-python-projects--draft")).toBe("applied-python-projects");
    expect(subjectWithoutDraftWrapper("sql", "sql-v2--draft")).toBe("sql-v2");
  });
});
