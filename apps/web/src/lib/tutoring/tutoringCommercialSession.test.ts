import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tutoring/sessionAdminServer", () => ({
  createTutoringSession: vi.fn(),
}));

import {
  TutoringSessionContextRequiredError,
  TutoringSessionMaterializationConflictError,
  commercialTutoringSessionSlug,
  materializeTutoringSessionForRequest,
  type TutoringCommercialSessionContext,
  type TutoringCommercialSessionDeps,
} from "./tutoringCommercialSession";

const teachingUser = {
  id: "teacher-1",
  email: "teacher1@example.com",
  roles: ["teacher"],
  isAdmin: false,
};

function context(
  overrides: Partial<TutoringCommercialSessionContext> = {},
): TutoringCommercialSessionContext {
  return {
    request: {
      id: "request-1",
      learnerId: "learner-1",
      assignedTeacherId: "teacher-1",
      tutoringSessionId: null,
      status: "scheduled",
      sourceSubjectSlug: "python",
      sourceModuleSlug: "loops",
      note: "Need help tracing this loop.",
      tutoringSession: null,
    },
    booking: {
      id: "booking-1",
      teacherId: "teacher-1",
      tutoringSessionId: null,
      status: "scheduled",
      tutoringSession: null,
    },
    subject: {
      id: "subject-1",
      slug: "python",
      title: "Python",
    },
    ...overrides,
  };
}

function deps(
  value: TutoringCommercialSessionContext,
): TutoringCommercialSessionDeps {
  return {
    loadContext: vi.fn(async () => value),
    createSession: vi.fn(async (args) => ({
      ok: true as const,
      session: {
        id: "session-1",
        slug: args.input.slug,
        title: args.input.title,
        status: args.input.status,
      },
    })),
  };
}

describe("commercial tutoring session materialization", () => {
  it("creates a teacher-only draft from scheduled booking context", async () => {
    const d = deps(context());

    const result = await materializeTutoringSessionForRequest(
      {
        requestId: "request-1",
        teachingUser,
      },
      { deps: d },
    );

    expect(result.resumed).toBe(false);
    expect(d.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "request-1",
        bookingId: "booking-1",
        learnerId: "learner-1",
        input: {
          slug: "paid-tutoring-booking-1",
          title: "Tutoring — Python",
          description: "Need help tracing this loop.",
          subjectId: "subject-1",
          selectionScope: "module",
          sourceModuleSlug: "loops",
          sourceSectionSlug: null,
          sourceTopicId: null,
          status: "draft",
          allowStudentEditing: false,
          userEmails: [],
          groupIds: [],
          locale: "en",
        },
      }),
    );
  });

  it("resumes an existing consistently linked session", async () => {
    const existing = {
      id: "session-1",
      ownerId: "teacher-1",
      slug: "paid-tutoring-booking-1",
      title: "Tutoring — Python",
      status: "draft" as const,
    };
    const value = context({
      request: {
        ...context().request,
        tutoringSessionId: "session-1",
        tutoringSession: existing,
      },
      booking: {
        ...context().booking!,
        tutoringSessionId: "session-1",
        tutoringSession: existing,
      },
    });
    const d = deps(value);

    const result = await materializeTutoringSessionForRequest(
      {
        requestId: "request-1",
        teachingUser,
      },
      { deps: d },
    );

    expect(result).toEqual({
      session: existing,
      resumed: true,
    });
    expect(d.createSession).not.toHaveBeenCalled();
  });

  it("rejects missing course context instead of inventing a curriculum snapshot", async () => {
    const d = deps(
      context({
        subject: null,
      }),
    );

    await expect(
      materializeTutoringSessionForRequest(
        {
          requestId: "request-1",
          teachingUser,
        },
        { deps: d },
      ),
    ).rejects.toBeInstanceOf(
      TutoringSessionContextRequiredError,
    );
  });

  it("rejects teacher takeover and inconsistent partial links", async () => {
    const wrongTeacher = deps(
      context({
        booking: {
          ...context().booking!,
          teacherId: "teacher-2",
        },
      }),
    );

    await expect(
      materializeTutoringSessionForRequest(
        {
          requestId: "request-1",
          teachingUser,
        },
        { deps: wrongTeacher },
      ),
    ).rejects.toBeInstanceOf(
      TutoringSessionMaterializationConflictError,
    );

    const partial = deps(
      context({
        request: {
          ...context().request,
          tutoringSessionId: "session-1",
        },
      }),
    );

    await expect(
      materializeTutoringSessionForRequest(
        {
          requestId: "request-1",
          teachingUser,
        },
        { deps: partial },
      ),
    ).rejects.toThrow("inconsistent session links");
  });

  it("uses a deterministic validator-safe slug keyed by booking identity", () => {
    expect(
      commercialTutoringSessionSlug("Booking_ABC/123"),
    ).toBe("paid-tutoring-booking-abc-123");
  });
});
