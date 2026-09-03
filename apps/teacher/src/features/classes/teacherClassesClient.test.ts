import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createTeacherClassesClient,
} from "./teacherClassesClient";

describe("Teacher Classes browser client", () => {
  it("uses the canonical list API and credentialed shared transport", async () => {
    const fetchImpl =
      vi.fn(async () =>
        Response.json({
          groups: [],
        }),
      );

    const client =
      createTeacherClassesClient({
        apiOrigin:
          "https://zoeskoul.com",
        fetchImpl,
      });

    await client.list();

    expect(
      fetchImpl,
    ).toHaveBeenCalledWith(
      new URL(
        "/api/teacher/learning-groups",
        "https://zoeskoul.com",
      ),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("loads accessible schools through the existing Teacher School API", async () => {
    const fetchImpl =
      vi.fn(async () =>
        Response.json({
          schools: [],
        }),
      );

    const client =
      createTeacherClassesClient({
        apiOrigin:
          "https://zoeskoul.com",
        fetchImpl,
      });

    await client.listSchools();

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(
        "/api/teacher/schools",
        "https://zoeskoul.com",
      ),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      }),
    );
  });

  it("keeps create and update on existing LearningGroup endpoints", async () => {
    const fetchImpl =
      vi.fn(async () =>
        Response.json({
          group: {
            id: "group-1",
            name: "Class",
            slug: "class",
            description: null,
            members: [],
          },
        }),
      );

    const client =
      createTeacherClassesClient({
        apiOrigin:
          "https://zoeskoul.com",
        fetchImpl,
      });

    const payload = {
      name: "Class",
      slug: "class",
      description: null,
      organizationId: null,
      memberEmails: [],
    };

    await client.create(payload);
    await client.update(
      "group-1",
      payload,
    );

    expect(
      fetchImpl,
    ).toHaveBeenNthCalledWith(
      1,
      new URL(
        "/api/teacher/learning-groups",
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
        "/api/teacher/learning-groups/group-1",
        "https://zoeskoul.com",
      ),
      expect.objectContaining({
        method: "PATCH",
        credentials: "include",
      }),
    );
  });
it("delivers class invitations through the LearningGroup invite endpoint", async () => {
  const fetchImpl = vi.fn(async () => Response.json({
    ok: true,
    inviteUrl: "https://zoeskoul.com/en/invitations/class/token",
    mailtoHref: "mailto:student@example.com",
    expiresAt: "2026-10-03T00:00:00.000Z",
    delivery: "link",
  }));
  const client = createTeacherClassesClient({ apiOrigin: "https://zoeskoul.com", fetchImpl });
  await client.deliverInvite("group-1", {
    email: "student@example.com",
    action: "link",
    locale: "en",
  });
  expect(fetchImpl).toHaveBeenCalledWith(
    new URL("/api/teacher/learning-groups/group-1/invites", "https://zoeskoul.com"),
    expect.objectContaining({ method: "POST", credentials: "include" }),
  );
});


  it("loads the class dashboard from the scoped LearningGroup projection endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        dashboard: {
          class: { id: "group-1", name: "Python 1" },
          summary: {
            students: 0,
            assignments: 0,
            averageProgressPct: 0,
            averageAccuracyPct: 0,
          },
          assignments: [],
          students: [],
        },
      }),
    );

    const client = createTeacherClassesClient({
      apiOrigin: "https://zoeskoul.com",
      fetchImpl,
    });

    await client.getDashboard("group-1");

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL(
        "/api/teacher/learning-groups/group-1/dashboard",
        "https://zoeskoul.com",
      ),
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }),
    );
  });

});
