import { describe, expect, it } from "vitest";

import {
  attachReviewProgressResetIntent,
  resolveReviewProgressResetIntent,
} from "./reviewProgressResetTransport";

describe("review progress reset transport", () => {
  it("creates module reset intent", () => {
    expect(resolveReviewProgressResetIntent({ reason: "reset-module", topicId: "ignored" }))
      .toEqual({ kind: "module" });
  });

  it("creates topic reset intent", () => {
    expect(resolveReviewProgressResetIntent({ reason: "reset-topic", topicId: "lists" }))
      .toEqual({ kind: "topic", topicId: "lists" });
  });

  it("maps card reset to the server topic destructive boundary", () => {
    expect(resolveReviewProgressResetIntent({ reason: "reset-card", topicId: "lists" }))
      .toEqual({ kind: "topic", topicId: "lists" });
  });

  it("preserves intent already attached before queue drain loses reason", () => {
    expect(resolveReviewProgressResetIntent({
      reason: null,
      topicId: "other",
      existing: { kind: "topic", topicId: "lists" },
    })).toEqual({ kind: "topic", topicId: "lists" });
  });

  it("does not invent reset metadata for normal autosave", () => {
    expect(resolveReviewProgressResetIntent({ reason: "runtime-store", topicId: "lists" }))
      .toBeNull();
  });

  it("attaches intent before a reset payload enters the generic save queue", () => {
    expect(attachReviewProgressResetIntent({
      payload: { state: { activeTopicId: "lists" } },
      reason: "reset-module",
      topicId: "lists",
    })).toEqual({
      state: { activeTopicId: "lists" },
      resetIntent: { kind: "module" },
    });
  });
});
