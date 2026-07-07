import { describe, expect, it } from "vitest";

import { buildPracticeAttemptId } from "./attempt.repo";

describe("practice validate attempt idempotency", () => {
  it("derives a stable attempt id for retries of one submission", () => {
    const first = buildPracticeAttemptId("instance-1", "4e8cbbcf-8bd8-4bb8-9898-c8a591c0402d");
    const retry = buildPracticeAttemptId("instance-1", "4e8cbbcf-8bd8-4bb8-9898-c8a591c0402d");

    expect(retry).toBe(first);
    expect(first).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  });

  it("does not collide when a submission id is reused on another instance", () => {
    const submissionId = "4e8cbbcf-8bd8-4bb8-9898-c8a591c0402d";

    expect(buildPracticeAttemptId("instance-1", submissionId)).not.toBe(
      buildPracticeAttemptId("instance-2", submissionId),
    );
  });
});
