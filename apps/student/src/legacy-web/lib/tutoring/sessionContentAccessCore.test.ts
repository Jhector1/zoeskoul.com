import { describe, expect, it } from "vitest";
import type { TutoringSnapshot } from "./sessionSnapshot";
import { resolveTutoringSnapshotContentScope } from "./sessionContentAccessCore";

const snapshot = {
  version: 1,
  subjectSlug: "cs260",
  sourceUpdatedAt: "2026-07-25T00:00:00.000Z",
  modules: [
    {
      sourceModuleSlug: "written-assignment",
      sessionModuleSlug: "tutoring-session-1-written-assignment",
      module: {
        id: "tutoring-session-1-written-assignment",
        title: "Written assignment",
        topics: [],
      },
    },
  ],
} as unknown as TutoringSnapshot;

describe("resolveTutoringSnapshotContentScope", () => {
  it("accepts the authored source module slug used by practice APIs", () => {
    expect(
      resolveTutoringSnapshotContentScope({
        snapshot,
        subjectSlug: "cs260",
        moduleSlug: "written-assignment",
      }),
    ).toEqual({
      ok: true,
      sourceModuleSlug: "written-assignment",
      sessionModuleSlug: "tutoring-session-1-written-assignment",
    });
  });

  it("accepts the session-specific module slug used by tutoring navigation", () => {
    expect(
      resolveTutoringSnapshotContentScope({
        snapshot,
        subjectSlug: "cs260",
        moduleSlug: "tutoring-session-1-written-assignment",
      }).ok,
    ).toBe(true);
  });

  it("rejects content outside the frozen tutoring snapshot", () => {
    expect(
      resolveTutoringSnapshotContentScope({
        snapshot,
        subjectSlug: "cs260",
        moduleSlug: "another-private-module",
      }),
    ).toEqual({ ok: false, reason: "module_not_in_snapshot" });
  });

  it("rejects a subject mismatch", () => {
    expect(
      resolveTutoringSnapshotContentScope({
        snapshot,
        subjectSlug: "python",
        moduleSlug: "written-assignment",
      }),
    ).toEqual({ ok: false, reason: "subject_mismatch" });
  });
});
