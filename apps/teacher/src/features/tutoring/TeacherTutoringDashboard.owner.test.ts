import fs from "node:fs";
import path from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

function source(
  relativePath: string,
) {
  return fs.readFileSync(
    path.join(
      process.cwd(),
      relativePath,
    ),
    "utf8",
  );
}

describe(
  "Teacher paid tutoring UI ownership",
  () => {
    it("uses commercial Teacher APIs and keeps schedule body server-owned", () => {
      const client =
        source(
          "src/features/tutoring/teacherTutoringClient.ts",
        );

      expect(
        client,
      ).toContain(
        "/api/teacher/tutoring-requests",
      );
      expect(
        client,
      ).toContain(
        "/api/teacher/tutoring-availability",
      );
      expect(
        client,
      ).toContain(
        "/api/teacher/tutoring-pool",
      );
      expect(
        client,
      ).toContain(
        'body: JSON.stringify({ startsAt: args.startsAt })',
      );
    });

    it("shows learner preferred time as a default while allowing adjustment", () => {
      const dashboard =
        source(
          "src/features/tutoring/TeacherTutoringDashboard.tsx",
        );

      expect(
        dashboard,
      ).toContain(
        "request.preferredStartsAt",
      );
      expect(
        dashboard,
      ).toContain(
        "Preferred:",
      );
      expect(
        dashboard,
      ).toContain(
        "Confirm or adjust start time",
      );
    });

    it("keeps canonical Web workspace and lifecycle controls", () => {
      const dashboard =
        source(
          "src/features/tutoring/TeacherTutoringDashboard.tsx",
        );
      const tree =
        fs.readdirSync(
          path.join(
            process.cwd(),
            "src",
          ),
          {
            recursive: true,
          },
        ).map(String);

      expect(
        dashboard,
      ).toContain(
        "/admin/tutoring-sessions/",
      );
      expect(
        dashboard,
      ).toContain(
        "booking.durationMinutes * 60_000",
      );
      expect(
        dashboard,
      ).toContain(
        "Complete session",
      );
      expect(
        dashboard,
      ).toContain(
        "Cancel booking",
      );
      expect(
        tree.some(
          (entry) =>
            entry.includes(
              "TutoringSessionPlayer",
            ),
        ),
      ).toBe(false);
      expect(
        tree.some(
          (entry) =>
            entry.includes(
              "FullIDE",
            ),
        ),
      ).toBe(false);
    });
  },
);
