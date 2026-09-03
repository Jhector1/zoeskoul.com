import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { prisma } from "@/lib/prisma";
import {
  learningAssignmentAudienceCreateData,
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_LOCALES =
  new Set(["en", "es", "fr", "ht"]);

const assignmentInclude = {
  subject: {
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      visibility: true,
    },
  },
  owner: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
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

export async function GET(
  request: Request,
) {
  if (!isAppOriginAllowed(request)) {
    return routeJson(
      request,
      { error: "Forbidden" },
      403,
    );
  }

  const teachingUser =
    await getTeachingUser();

  if (!teachingUser) {
    return routeJson(
      request,
      { error: "Forbidden" },
      403,
    );
  }

  const url =
    new URL(request.url);
  const locale =
    localeFromRequest(request);
  const includeEditorData =
    url.searchParams.get("editor") ===
    "1";

  const [
    rawAssignments,
    rawCourses,
  ] = await Promise.all([
    prisma.learningAssignment.findMany({
      where:
        ownedTeachingRecordWhere(
          teachingUser,
        ),
      orderBy: {
        updatedAt: "desc",
      },
      include: assignmentInclude,
    }),
    includeEditorData
      ? prisma.practiceSubject.findMany({
          where: {
            status: "active",
            visibility: "private",
          },
          orderBy: [
            {
              visibility: "desc",
            },
            {
              order: "asc",
            },
          ],
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            visibility: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const resolvedAssignmentSubjects =
    await resolveSubjectDeliveryPresentations(
      rawAssignments.map(
        (assignment) =>
          assignment.subject,
      ),
      locale,
    );

  const assignments =
    rawAssignments.map(
      (assignment, index) => ({
        ...assignment,
        subject:
          resolvedAssignmentSubjects[
            index
          ],
      }),
    );

  if (!includeEditorData) {
    return routeJson(
      request,
      { assignments },
    );
  }

  const courses =
    await resolveSubjectDeliveryPresentations(
      rawCourses,
      locale,
    );

  return routeJson(
    request,
    {
      assignments,
      courses,
    },
  );
}

export async function POST(
  request: Request,
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

  const teachingUser =
    await getTeachingUser();

  if (!teachingUser) {
    return routeJson(
      request,
      { error: "Forbidden" },
      403,
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

  const assignment =
    await prisma.$transaction(
      async (tx) => {
        const created =
          await tx.learningAssignment.create({
            data: {
              ...learningAssignmentScalarData(
                parsed.data,
              ),
              ownerId:
                teachingUser.id,
              ...learningAssignmentAudienceCreateData(
                resolution,
              ),
            },
            select: {
              id: true,
            },
          });

        await syncPendingLearningAssignmentInvites(
          tx,
          {
            assignmentId:
              created.id,
            pendingEmails:
              resolution.pendingEmails,
          },
        );

        return tx.learningAssignment.findUniqueOrThrow({
          where: {
            id: created.id,
          },
          include:
            assignmentInclude,
        });
      },
    );

  return routeJson(
    request,
    {
      assignment,
      pendingInvites:
        resolution.pendingEmails,
    },
    201,
  );
}

export function OPTIONS(
  request: Request,
) {
  return appCorsPreflight(request);
}
