import { describe, expect, it } from "vitest";

import {
  uniqueAnnouncementRecipientUserIds,
} from "./announcementAudience";

describe("Learning Announcement audience snapshot", () => {
  it("deduplicates students who belong to multiple classes", () => {
    expect(
      uniqueAnnouncementRecipientUserIds([
        { userId: "student-b" },
        { userId: "student-a" },
        { userId: "student-b" },
      ]),
    ).toEqual(["student-a", "student-b"]);
  });

  it("ignores blank recipient ids", () => {
    expect(
      uniqueAnnouncementRecipientUserIds([
        { userId: " " },
        { userId: "student-a" },
      ]),
    ).toEqual(["student-a"]);
  });
});
