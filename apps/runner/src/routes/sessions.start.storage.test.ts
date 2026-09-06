import { describe, expect, it } from "vitest";
import { statusForError } from "./sessions.start.js";

describe("runner start storage status", () => {
  it("reports host disk pressure as service unavailable", () => {
    expect(statusForError("Runner host disk is low: 2048 MB free.")).toBe(503);
    expect(statusForError("Runner workspace root is over quota: 2048 MB used.")).toBe(503);
  });
});
