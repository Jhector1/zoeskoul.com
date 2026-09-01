import fs from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

import {
  renderTutoringLifecycleEmail,
} from "./tutoringLifecycleEmail";

function source(relativePath: string) {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}

describe("tutoring lifecycle transactional email", () => {
  it("renders a clean escaped request alert without marketing infrastructure", () => {
    const email = renderTutoringLifecycleEmail({
      audience: "teacher",
      event: "request_submitted",
      actionUrl: "https://teacher.zoeskoul.com/",
      learnerName: "Alex <Student>",
      requestedMinutes: 45,
      sourceSubjectSlug: "python-data-functions",
      preferredStartsAt: new Date("2026-09-02T15:00:00.000Z"),
      note: "<script>alert('x')</script>",
    });

    expect(email.subject).toBe("New tutoring request");
    expect(email.textContent).toContain("45 minutes");
    expect(email.textContent).toContain("UTC");
    expect(email.htmlContent).toContain("ZoeSkoul Tutoring");
    expect(email.htmlContent).toContain("&lt;Student&gt;");
    expect(email.htmlContent).toContain("&lt;script&gt;");
    expect(email.htmlContent).not.toContain("<script>");
    expect(email.htmlContent).toContain(
      "https://teacher.zoeskoul.com/",
    );
  });

  it("renders student scheduling and cancellation as operational tutoring mail", () => {
    const scheduled = renderTutoringLifecycleEmail({
      audience: "student",
      event: "scheduled",
      actionUrl:
        "https://student.zoeskoul.com/en/tutoring-sessions",
      learnerName: "Alex",
      teacherName: "Morgan",
      requestedMinutes: 30,
      sourceSubjectSlug: "python",
      startsAt: new Date("2026-09-02T15:00:00.000Z"),
    });

    expect(scheduled.subject).toBe(
      "Your tutoring session is scheduled",
    );
    expect(scheduled.textContent).toContain("Morgan");
    expect(scheduled.textContent).toContain(
      "reserved until the session is completed or canceled",
    );

    const canceled = renderTutoringLifecycleEmail({
      audience: "student",
      event: "canceled",
      actionUrl:
        "https://student.zoeskoul.com/en/tutoring-sessions",
      learnerName: "Alex",
      requestedMinutes: 30,
      sourceSubjectSlug: "python",
      canceledBy: "teacher",
    });

    expect(canceled.subject).toBe(
      "Your tutoring request was canceled",
    );
    expect(canceled.textContent).toContain(
      "returned to your available tutoring balance",
    );
    expect(canceled.textContent).toContain(
      "transactional ZoeSkoul tutoring email",
    );
  });

  it("reuses the shared transactional sender and never imports marketing delivery", () => {
    const owner = source(
      "src/lib/tutoring/tutoringLifecycleEmail.ts",
    );

    expect(owner).toContain(
      'from "@/lib/email/transactionalEmail"',
    );
    expect(owner).toContain("sendTransactionalEmail");
    expect(owner).toContain("BREVO_TUTORING_FROM_EMAIL");
    expect(owner).toContain("BREVO_TUTORING_FROM_NAME");
    expect(owner).toContain('"tutoring@zoeskoul.com"');
    expect(owner).toContain('"ZoeSkoul Tutoring"');
    expect(owner).not.toContain("BREVO_FROM_EMAIL");
    expect(owner).not.toContain("BREVO_FROM_NAME");
    expect(owner).not.toContain("process.env.EMAIL_FROM");
    expect(owner).not.toContain("@/lib/marketing/");
    expect(owner).not.toContain("unsubscribe");
  });

  it("hooks only successful fresh lifecycle transitions", () => {
    const request = source(
      "src/app/api/tutoring/requests/route.ts",
    );
    const learnerCancel = source(
      "src/app/api/tutoring/requests/[id]/cancel/route.ts",
    );
    const schedule = source(
      "src/app/api/teacher/tutoring-requests/[id]/schedule/route.ts",
    );
    const teacherCancel = source(
      "src/app/api/teacher/tutoring-bookings/[id]/cancel/route.ts",
    );
    const completion = source(
      "src/app/api/teacher/tutoring-bookings/[id]/complete/route.ts",
    );

    expect(request).toContain("!result.resumed");
    expect(request).toContain(
      "notifyTutoringRequestSubmitted",
    );
    expect(schedule).toContain("notifyTutoringScheduled");

    expect(learnerCancel).toContain("result.transitioned");
    expect(learnerCancel).toContain(
      "notifyTutoringRequestCanceled",
    );

    expect(teacherCancel).toContain(
      "releaseTutoringBookingCreditsDetailed",
    );
    expect(teacherCancel).toContain("released.transitioned");
    expect(teacherCancel).toContain(
      "notifyTutoringBookingCanceled",
    );

    expect(completion).not.toContain("notifyTutoring");
  });
});
