import { describe, expect, it } from "vitest";
import {
  WORKSPACE_MODES,
  isWorkspaceMode,
  resolveWorkspaceMode,
} from "./index";

describe("workspace mode", () => {
  it("keeps product modes explicit and reusable", () => {
    expect(WORKSPACE_MODES).toEqual(["learn", "practice", "build"]);
  });

  it("fails unknown values back to the requested safe mode", () => {
    expect(resolveWorkspaceMode("build")).toBe("build");
    expect(resolveWorkspaceMode("unknown")).toBe("learn");
    expect(resolveWorkspaceMode("unknown", "practice")).toBe("practice");
  });

  it("does not accept arbitrary strings", () => {
    expect(isWorkspaceMode("learn")).toBe(true);
    expect(isWorkspaceMode("build")).toBe(true);
    expect(isWorkspaceMode("admin")).toBe(false);
  });
});
