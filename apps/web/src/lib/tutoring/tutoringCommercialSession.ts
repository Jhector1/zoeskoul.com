import "server-only";

import type { Prisma } from "@/lib/prisma";
import { prisma } from "@/lib/prisma";
import type { TeachingUser } from "@/lib/teaching/teachingAccess";
import {
  createTutoringSession,
  type TutoringSessionCreateOptions,
} from "@/lib/tutoring/sessionAdminServer";
import type { TutoringSessionInput } from "@/lib/validators/tutoringSession";

type ExistingSession = {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  status: "draft" | "live" | "shared" | "archived";
};

export type TutoringCommercialSessionContext = {
  request: {
    id: string;
    learnerId: string;
    assignedTeacherId: string | null;
    tutoringSessionId: string | null;
    status: "requested" | "assigned" | "scheduled" | "completed" | "canceled";
    sourceSubjectSlug: string | null;
    sourceModuleSlug: string | null;
    note: string | null;
    tutoringSession: ExistingSession | null;
  };
  booking: {
    id: string;
    teacherId: string | null;
    tutoringSessionId: string | null;
    status: "scheduled" | "completed" | "canceled" | "no_show";
    tutoringSession: ExistingSession | null;
  } | null;
  subject: {
    id: string;
    slug: string;
    title: string;
  } | null;
};

export type MaterializedTutoringSession = {
  session: {
    id: string;
    slug: string;
    title: string;
    status: string;
  };
  resumed: boolean;
};

export class TutoringSessionMaterializationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutoringSessionMaterializationConflictError";
  }
}

export class TutoringSessionContextRequiredError extends Error {
  constructor() {
    super(
      "A course context is required before this paid tutoring session can be prepared.",
    );
    this.name = "TutoringSessionContextRequiredError";
  }
}

export class TutoringSessionMaterializationNotFoundError extends Error {
  constructor() {
    super("Tutoring request not found.");
    this.name = "TutoringSessionMaterializationNotFoundError";
  }
}

function safeSlugPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function commercialTutoringSessionSlug(bookingId: string): string {
  const part = safeSlugPart(bookingId);
  if (!part) {
    throw new TutoringSessionMaterializationConflictError(
      "Tutoring booking has an invalid identifier.",
    );
  }
  return `paid-tutoring-${part}`.slice(0, 80).replace(/-+$/g, "");
}

function linkedExistingSession(
  context: TutoringCommercialSessionContext,
  teacherId: string,
): ExistingSession | null {
  const requestSessionId = context.request.tutoringSessionId;
  const bookingSessionId = context.booking?.tutoringSessionId ?? null;

  if (!requestSessionId && !bookingSessionId) return null;

  if (
    !requestSessionId ||
    !bookingSessionId ||
    requestSessionId !== bookingSessionId
  ) {
    throw new TutoringSessionMaterializationConflictError(
      "Tutoring request and booking have inconsistent session links.",
    );
  }

  const session =
    context.request.tutoringSession ??
    context.booking?.tutoringSession ??
    null;

  if (!session || session.id !== requestSessionId) {
    throw new TutoringSessionMaterializationConflictError(
      "Linked tutoring session could not be verified.",
    );
  }

  if (session.ownerId !== teacherId) {
    throw new TutoringSessionMaterializationConflictError(
      "Linked tutoring session belongs to another teacher.",
    );
  }

  return session;
}

function assertScheduledOwnership(
  context: TutoringCommercialSessionContext,
  teacherId: string,
): asserts context is TutoringCommercialSessionContext & {
  booking: NonNullable<TutoringCommercialSessionContext["booking"]>;
} {
  if (context.request.status !== "scheduled") {
    throw new TutoringSessionMaterializationConflictError(
      "Only scheduled tutoring requests can be prepared.",
    );
  }

  if (!context.booking || context.booking.status !== "scheduled") {
    throw new TutoringSessionMaterializationConflictError(
      "A scheduled tutoring booking is required before preparing the session.",
    );
  }

  if (
    context.request.assignedTeacherId !== teacherId ||
    context.booking.teacherId !== teacherId
  ) {
    throw new TutoringSessionMaterializationConflictError(
      "Only the assigned tutoring teacher can prepare this session.",
    );
  }
}

function sessionInput(
  context: TutoringCommercialSessionContext & {
    booking: NonNullable<TutoringCommercialSessionContext["booking"]>;
  },
): TutoringSessionInput {
  if (!context.subject) {
    throw new TutoringSessionContextRequiredError();
  }

  return {
    slug: commercialTutoringSessionSlug(context.booking.id),
    title: `Tutoring — ${context.subject.title}`.slice(0, 160),
    description: context.request.note ?? null,
    subjectId: context.subject.id,
    selectionScope: context.request.sourceModuleSlug ? "module" : "course",
    sourceModuleSlug: context.request.sourceModuleSlug,
    sourceSectionSlug: null,
    sourceTopicId: null,
    status: "draft",
    allowStudentEditing: false,
    userEmails: [],
    groupIds: [],
    locale: "en",
  };
}

export type TutoringCommercialSessionDeps = {
  loadContext(requestId: string): Promise<TutoringCommercialSessionContext | null>;
  createSession(args: {
    teachingUser: TeachingUser;
    input: TutoringSessionInput;
    requestId: string;
    bookingId: string;
    learnerId: string;
  }): Promise<
    | {
        ok: true;
        session: {
          id: string;
          slug: string;
          title: string;
          status: string;
        };
      }
    | {
        ok: false;
        status: number;
        error: string;
      }
  >;
};

async function defaultLoadContext(
  requestId: string,
): Promise<TutoringCommercialSessionContext | null> {
  const request = await prisma.tutoringRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      learnerId: true,
      assignedTeacherId: true,
      tutoringSessionId: true,
      status: true,
      sourceSubjectSlug: true,
      sourceModuleSlug: true,
      note: true,
      tutoringSession: {
        select: {
          id: true,
          ownerId: true,
          slug: true,
          title: true,
          status: true,
        },
      },
      bookings: {
        where: { status: "scheduled" },
        orderBy: { createdAt: "desc" },
        take: 2,
        select: {
          id: true,
          teacherId: true,
          tutoringSessionId: true,
          status: true,
          tutoringSession: {
            select: {
              id: true,
              ownerId: true,
              slug: true,
              title: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!request) return null;

  if (request.bookings.length > 1) {
    throw new TutoringSessionMaterializationConflictError(
      "Tutoring request has multiple scheduled bookings.",
    );
  }

  const subjectSlug = String(request.sourceSubjectSlug ?? "").trim();
  const subject = subjectSlug
    ? await prisma.practiceSubject.findFirst({
        where: {
          slug: subjectSlug,
          status: "active",
        },
        select: {
          id: true,
          slug: true,
          title: true,
        },
      })
    : null;

  const { bookings, ...requestWithoutBookings } = request;

  return {
    request: requestWithoutBookings,
    booking: bookings[0] ?? null,
    subject,
  };
}

async function defaultCreateSession(args: {
  teachingUser: TeachingUser;
  input: TutoringSessionInput;
  requestId: string;
  bookingId: string;
  learnerId: string;
}) {
  const options: TutoringSessionCreateOptions = {
    onCreated: async (tx: Prisma.TransactionClient, session) => {
      const bookingClaim = await tx.tutoringBooking.updateMany({
        where: {
          id: args.bookingId,
          requestId: args.requestId,
          teacherId: args.teachingUser.id,
          status: "scheduled",
          tutoringSessionId: null,
        },
        data: {
          tutoringSessionId: session.id,
        },
      });

      const requestClaim = await tx.tutoringRequest.updateMany({
        where: {
          id: args.requestId,
          learnerId: args.learnerId,
          assignedTeacherId: args.teachingUser.id,
          status: "scheduled",
          tutoringSessionId: null,
        },
        data: {
          tutoringSessionId: session.id,
        },
      });

      if (bookingClaim.count !== 1 || requestClaim.count !== 1) {
        throw new TutoringSessionMaterializationConflictError(
          "Tutoring session materialization lost its booking claim.",
        );
      }

      await tx.tutoringSessionUser.create({
        data: {
          sessionId: session.id,
          userId: args.learnerId,
          role: "learner",
        },
      });
    },
  };

  return createTutoringSession(
    prisma,
    {
      teachingUser: args.teachingUser,
      input: args.input,
    },
    options,
  );
}

function defaultDeps(): TutoringCommercialSessionDeps {
  return {
    loadContext: defaultLoadContext,
    createSession: defaultCreateSession,
  };
}

export async function materializeTutoringSessionForRequest(
  args: {
    requestId: string;
    teachingUser: TeachingUser;
  },
  options: {
    deps?: TutoringCommercialSessionDeps;
  } = {},
): Promise<MaterializedTutoringSession> {
  const deps = options.deps ?? defaultDeps();
  const context = await deps.loadContext(args.requestId);

  if (!context) {
    throw new TutoringSessionMaterializationNotFoundError();
  }

  assertScheduledOwnership(context, args.teachingUser.id);

  const existing = linkedExistingSession(
    context,
    args.teachingUser.id,
  );
  if (existing) {
    return {
      session: existing,
      resumed: true,
    };
  }

  const input = sessionInput(context);
  const result = await deps.createSession({
    teachingUser: args.teachingUser,
    input,
    requestId: context.request.id,
    bookingId: context.booking.id,
    learnerId: context.request.learnerId,
  });

  if (!result.ok) {
    throw new TutoringSessionMaterializationConflictError(
      result.error,
    );
  }

  return {
    session: result.session,
    resumed: false,
  };
}
