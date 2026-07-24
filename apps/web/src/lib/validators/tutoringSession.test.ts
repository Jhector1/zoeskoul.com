import { describe, expect, it } from "vitest";

import {
  safeParseTutoringSessionUpdate,
  TutoringSessionInputSchema,
  TutoringSessionUpdateSchema,
} from "./tutoringSession";

describe("TutoringSessionUpdateSchema", () => {
  it("accepts a status-only update without clearing the existing audience", () => {
    expect(TutoringSessionUpdateSchema.parse({ status: "live" })).toEqual({
      status: "live",
    });
  });

  it("accepts the full edit form and strips frozen source fields", () => {
    const parsed = TutoringSessionUpdateSchema.parse({
      title: "Recurrence tutoring",
      description: "Review the call tree.",
      status: "shared",
      allowStudentEditing: false,
      userEmails: ["student@example.com"],
      groupIds: ["group-1"],
      subjectId: "must-not-change",
      selectionScope: "topic",
    });

    expect(parsed).toEqual({
      title: "Recurrence tutoring",
      description: "Review the call tree.",
      status: "shared",
      allowStudentEditing: false,
      userEmails: ["student@example.com"],
      groupIds: ["group-1"],
    });
  });

  it("rejects an empty update", () => {
    expect(TutoringSessionUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("exposes one stable parser for API routes", () => {
    expect(safeParseTutoringSessionUpdate({ status: "live" }).success).toBe(true);
    expect(safeParseTutoringSessionUpdate({}).success).toBe(false);
  });
});

describe("TutoringSessionInputSchema", () => {
  it("keeps empty audience defaults for a tutor-only draft", () => {
    const parsed = TutoringSessionInputSchema.parse({
      slug: "recurrence-review",
      title: "Recurrence review",
      subjectId: "subject-1",
      selectionScope: "course",
    });

    expect(parsed.userEmails).toEqual([]);
    expect(parsed.groupIds).toEqual([]);
    expect(parsed.status).toBe("draft");
    expect(parsed.allowStudentEditing).toBe(false);
  });
});
