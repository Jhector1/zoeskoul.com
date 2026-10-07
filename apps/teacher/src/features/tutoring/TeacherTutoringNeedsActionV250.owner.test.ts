import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const dashboard = fs.readFileSync(
  path.join(
    process.cwd(),
    "src/features/tutoring/TeacherTutoringDashboard.tsx",
  ),
  "utf8",
);

describe("Teacher tutoring Needs action V250 ownership", () => {
  it("separates future scheduled bookings from scheduled bookings whose start time passed", () => {
    expect(dashboard).toContain('| "needs-action"');
    expect(dashboard).toContain('booking.status !== "scheduled"');
    expect(dashboard).toContain(
      'return startsAt < now ? "needs-action" : "upcoming";',
    );
    expect(dashboard).toContain(
      'scheduledTimingBucket(request, now) === "upcoming"',
    );
    expect(dashboard).toContain(
      'scheduledTimingBucket(request, now) === "needs-action"',
    );
  });

  it("exposes Needs action as a first-class tutoring workspace tab", () => {
    expect(dashboard).toContain(
      '{ key: "needs-action", label: "Needs action", count: needsAction.length }',
    );
    expect(dashboard).toContain('tab === "needs-action"');
    expect(dashboard).toContain(
      'needsAction.map((request) => requestCard(request, "needs-action"))',
    );
    expect(dashboard).toContain(
      "These scheduled sessions have reached their start time.",
    );
  });

  it("re-buckets sessions while the page stays open without mutating lifecycle state", () => {
    expect(dashboard).toContain(
      "window.setInterval(() => setNow(Date.now()), 60_000)",
    );
    expect(dashboard).toContain("completeTeacherTutoringBooking");
    expect(dashboard).toContain("cancelTeacherTutoringBooking");
    expect(dashboard).not.toContain("autoComplete");
    expect(dashboard).not.toContain("autoCancel");
  });
});
