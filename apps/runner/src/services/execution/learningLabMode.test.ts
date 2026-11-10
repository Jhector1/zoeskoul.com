import { describe, expect, it } from "vitest";
import { inspectLearningLabRequest, sessionLearningLabMode } from "./learningLabMode.js";

describe("Learning admin lab launch boundary (stage 1)", () => {
  it("defaults to existing non-root mode", () => {
    expect(inspectLearningLabRequest({ kind: "shell" })).toEqual({ ok: true, mode: "standard" });
    expect(inspectLearningLabRequest({ labProfile: "standard" })).toEqual({ ok: true, mode: "standard" });
  });
  it("rejects admin when operator toggle OFF", () => {
    expect(inspectLearningLabRequest({ labProfile: "admin" }, false)).toMatchObject({ ok: false, status: 403 });
  });
  it("rejects admin even when operator toggle ON until an isolated runtime exists", () => {
    expect(inspectLearningLabRequest({ labProfile: "admin" }, true)).toMatchObject({ ok: false, status: 503 });
  });
  it("rejects aliases, unknown values, and mixed requests rather than silently stripping them", () => {
    for (const raw of [
      { labProfile: "root" }, { privilegeMode: "admin" },
      { adminLab: true }, { executionProfile: "admin" },
      { labProfile: "standard", adminLab: true },
      { labProfile: null }, { labProfile: 1 },
    ]) {
      expect(inspectLearningLabRequest(raw, true).ok).toBe(false);
    }
  });
  it("never reinterprets legacy sessions as administrator sessions", () => {
    expect(sessionLearningLabMode(undefined)).toBe("standard");
    expect(sessionLearningLabMode("standard")).toBe("standard");
    expect(sessionLearningLabMode("admin")).toBe("admin");
  });
});
