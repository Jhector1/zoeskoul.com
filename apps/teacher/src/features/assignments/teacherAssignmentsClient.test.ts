import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createTeacherAssignmentsClient,
} from "./teacherAssignmentsClient";

describe(
  "Teacher assignment browser client",
  () => {
    it(
      "loads localized assignments through the existing Teacher assignment API",
      async () => {
        const fetchImpl =
          vi.fn(async () =>
            Response.json({
              assignments: [],
            }),
          );

        const client =
          createTeacherAssignmentsClient({
            apiOrigin:
              "https://zoeskoul.com",
            fetchImpl,
          });

        await client.list("fr");

        expect(
          fetchImpl,
        ).toHaveBeenCalledWith(
          new URL(
            "/api/teacher/course-assignments?locale=fr",
            "https://zoeskoul.com",
          ),
          expect.objectContaining({
            method: "GET",
            credentials: "include",
          }),
        );
      },
    );

    it(
      "reuses the same assignment collection API for editor course data",
      async () => {
        const fetchImpl =
          vi.fn(async () =>
            Response.json({
              assignments: [],
              courses: [],
            }),
          );

        const client =
          createTeacherAssignmentsClient({
            apiOrigin:
              "https://zoeskoul.com",
            fetchImpl,
          });

        await client.editorBootstrap(
          "en",
        );

        expect(
          fetchImpl,
        ).toHaveBeenCalledWith(
          new URL(
            "/api/teacher/course-assignments?editor=1&locale=en",
            "https://zoeskoul.com",
          ),
          expect.objectContaining({
            method: "GET",
            credentials: "include",
          }),
        );
      },
    );

    it(
      "keeps create update delete and invite delivery on existing endpoints",
      async () => {
        const fetchImpl =
          vi.fn(async () =>
            Response.json({
              assignment: {
                id: "assignment-1",
              },
              pendingInvites: [],
              ok: true,
              inviteUrl:
                "https://zoeskoul.com/en/invitations/course/token",
              mailtoHref:
                "mailto:student@example.com",
              expiresAt:
                "2026-09-30T00:00:00.000Z",
              delivery: "link",
            }),
          );

        const client =
          createTeacherAssignmentsClient({
            apiOrigin:
              "https://zoeskoul.com",
            fetchImpl,
          });

        const payload = {
          slug: "python-homework",
          title: "Python homework",
          description: null,
          subjectId: "subject-1",
          status:
            "draft" as const,
          availableFrom: null,
          dueAt: null,
          solutionVisibility:
            "instructor_only" as const,
          userEmails: [],
          groupIds: [],
        };

        await client.create(payload);
        await client.update(
          "assignment-1",
          payload,
        );
        await client.remove(
          "assignment-1",
        );
        await client.deliverInvite(
          "assignment-1",
          {
            email:
              "student@example.com",
            action: "link",
            locale: "en",
          },
        );

        expect(
          fetchImpl,
        ).toHaveBeenNthCalledWith(
          1,
          new URL(
            "/api/teacher/course-assignments",
            "https://zoeskoul.com",
          ),
          expect.objectContaining({
            method: "POST",
            credentials: "include",
          }),
        );

        expect(
          fetchImpl,
        ).toHaveBeenNthCalledWith(
          2,
          new URL(
            "/api/teacher/course-assignments/assignment-1",
            "https://zoeskoul.com",
          ),
          expect.objectContaining({
            method: "PATCH",
            credentials: "include",
          }),
        );

        expect(
          fetchImpl,
        ).toHaveBeenNthCalledWith(
          3,
          new URL(
            "/api/teacher/course-assignments/assignment-1",
            "https://zoeskoul.com",
          ),
          expect.objectContaining({
            method: "DELETE",
            credentials: "include",
          }),
        );

        expect(
          fetchImpl,
        ).toHaveBeenNthCalledWith(
          4,
          new URL(
            "/api/teacher/course-assignments/assignment-1/invites",
            "https://zoeskoul.com",
          ),
          expect.objectContaining({
            method: "POST",
            credentials: "include",
          }),
        );
      },
    );
  },
);
