import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { prisma } from "@/lib/prisma";
import {
  learningAssignmentAudienceReplaceData,
  learningAssignmentScalarData,
  resolveLearningAssignmentWrite,
} from "@/lib/learningAssignments/assignmentAdminServer";
import {
  syncPendingLearningAssignmentInvites,
} from "@/lib/learningAssignments/assignmentInvites";
import {
  resolveSubjectDeliveryPresentations,
} from "@/lib/subjects/resolveSubjectDeliveryPresentation";
import {
  getTeachingUser,
  ownedTeachingRecordWhere,
} from "@/lib/teaching/teachingAccess";
import {
  LearningAssignmentInputSchema,
} from "@/lib/validators/learningDelivery";

type Context = {
  params: Promise<{
    id: string;
  }>;
};

const SUPPORTED_LOCALES =
  new Set(["en", "es", "fr", "ht"]);

const assignmentInclude = {
  users: {
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
  groups: {
    include: {
      group: {
        select: {
          id: true,
          name: true,
          slug: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  },
  invites: {
    orderBy: {
      email: "asc" as const,
    },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      sentAt: true,
      acceptedAt: true,
      revokedAt: true,
    },
  },
  subject: {
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      visibility: true,
    },
  },
};

function routeJson(
  request: Request,
  body: unknown,
  status = 200,
) {
  return appCorsJson(
    request,
    body,
    { status },
  );
}

function localeFromRequest(
  request: Request,
) {
  const locale =
    new URL(request.url)
      .searchParams
      .get("locale")
      ?.trim()
      .toLowerCase();

  return locale &&
    SUPPORTED_LOCALES.has(locale)
    ? locale
    : "en";
}

async function ownedAssignment(
  id: string,
) {
  const teachingUser =
    await getTeachingUser();

  if (!teachingUser) {
    return {
      teachingUser: null,
      assignment: null,
    };
  }

  const assignment =
    await prisma.learningAssignment.findFirst({
      where: {
        id,
        ...ownedTeachingRecordWhere(
          teachingUser,
        ),
      },
      include:
        assignmentInclude,
    });

  return {
    teachingUser,
    assignment,
  };
}

async function localizeAssignment<
  T extends {
    subject: {
      slug: string;
      title: string;
      description?: string | null;
    };
  },
>(
  assignment: T,
  locale: string,
) {
  const [subject] =
    await resolveSubjectDeliveryPresentations(
      [assignment.subject],
      locale,
    );

  return {
    ...assignment,
    subject,
  };
}

export async function GET(
  request: Request,
  context: Context,
) {
  if (!isAppOriginAllowed(request)) {
    return routeJson(
      request,
      { error: "Forbidden" },
      403,
    );
  }

  const { id } =
    await context.params;

  const {
    teachingUser,
    assignment,
  } = await ownedAssignment(id);

  if (!teachingUser) {
    return routeJson(
      request,
      { error: "Forbidden" },
      403,
    );
  }

  if (!assignment) {
    return routeJson(
      request,
      { error: "Not found" },
      404,
    );
  }

  return routeJson(
    request,
    {
      assignment:
        await localizeAssignment(
          assignment,
          localeFromRequest(
            request,
          ),
        ),
    },
  );
}

export async function PATCH(
  request: Request,
  context: Context,
) {
  if (
    !isAppMutationOriginAllowed(
      request,
    )
  ) {
    return routeJson(
      request,
      { error: "Forbidden" },
      403,
    );
  }

  const { id } =
    await context.params;

  const {
    teachingUser,
    assignment,
  } = await ownedAssignment(id);

  if (!teachingUser) {
    return routeJson(
      request,
      { error: "Forbidden" },
      403,
    );
  }

  if (!assignment) {
    return routeJson(
      request,
      { error: "Not found" },
      404,
    );
  }

  const parsed =
    LearningAssignmentInputSchema.safeParse(
      await request
        .json()
        .catch(() => null),
    );

  if (!parsed.success) {
    return routeJson(
      request,
      {
        error: "Invalid payload",
        details:
          parsed.error.flatten(),
      },
      400,
    );
  }

  const resolution =
    await resolveLearningAssignmentWrite(
      prisma,
      {
        teachingUser,
        input: parsed.data,
      },
    );

  if (!resolution.ok) {
    return routeJson(
      request,
      {
        error: resolution.error,
      },
      resolution.status,
    );
  }

  const updated =
    await prisma.$transaction(
      async (tx) => {
        await tx.learningAssignment.update({
          where: {
            id,
          },
          data: {
            ...learningAssignmentScalarData(
              parsed.data,
            ),
            ...learningAssignmentAudienceReplaceData(
              resolution,
            ),
          },
        });

        await syncPendingLearningAssignmentInvites(
          tx,
          {
            assignmentId: id,
            pendingEmails:
              resolution.pendingEmails,
          },
        );

        return tx.learningAssignment.findUniqueOrThrow({
          where: {
            id,
          },
          include:
            assignmentInclude,
        });
      },
    );

  return routeJson(
    request,
    {
      assignment: updated,
      pendingInvites:
        resolution.pendingEmails,
    },
  );
}

export async function DELETE(
  request: Request,
  context: Context,
) {
  if (
    !isAppMutationOriginAllowed(
      request,
    )
  ) {
    return routeJson(
      request,
      { error: "Forbidden" },
      403,
    );
  }

  const { id } =
    await context.params;

  const {
    teachingUser,
    assignment,
  } = await ownedAssignment(id);

  if (!teachingUser) {
    return routeJson(
      request,
      { error: "Forbidden" },
      403,
    );
  }

  if (!assignment) {
    return routeJson(
      request,
      { error: "Not found" },
      404,
    );
  }

  await prisma.learningAssignment.delete({
    where: {
      id,
    },
  });

  return routeJson(
    request,
    { ok: true },
  );
}

export function OPTIONS(
  request: Request,
) {
  return appCorsPreflight(request);
}
