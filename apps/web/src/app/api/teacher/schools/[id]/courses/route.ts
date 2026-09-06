import { z } from "zod";

import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  disableLearningOrganizationCourse,
  enableLearningOrganizationCourse,
  listLearningOrganizationCourses,
} from "@/lib/learningOrganizations/organizationCourseAccess";
import {
  getLearningOrganizationAccess,
} from "@/lib/teaching/schoolAccess";
import {
  getTeachingUser,
} from "@/lib/teaching/teachingAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CourseBody = z.object({
  subjectId: z.string().min(1),
});

const SUPPORTED_LOCALES =
  new Set(["en", "es", "fr", "ht"]);

type Context = {
  params: Promise<{ id: string }>;
};

function localeFromRequest(
  request: Request,
) {
  const locale =
    new URL(request.url).searchParams.get(
      "locale",
    );
  return locale &&
    SUPPORTED_LOCALES.has(locale)
    ? locale
    : "en";
}

async function resolveSchool(
  id: string,
) {
  const teachingUser =
    await getTeachingUser();

  if (!teachingUser) {
    return null;
  }

  const resolved =
    await getLearningOrganizationAccess({
      organizationId: id,
      teachingUser,
    });

  if (!resolved) {
    return null;
  }

  return {
    teachingUser,
    resolved,
  };
}

export async function GET(
  request: Request,
  context: Context,
) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const school =
    await resolveSchool(id);

  if (
    !school ||
    !school.resolved.access
      .canAccessSchool
  ) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const courses =
    await listLearningOrganizationCourses({
      organizationId: id,
      locale:
        localeFromRequest(request),
    });

  return appCorsJson(request, {
    courses,
    canManage:
      school.resolved.access
        .canManageSchool,
  });
}

export async function POST(
  request: Request,
  context: Context,
) {
  if (
    !isAppMutationOriginAllowed(
      request,
    )
  ) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const school =
    await resolveSchool(id);

  if (
    !school ||
    !school.resolved.access
      .canManageSchool
  ) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const parsed =
    CourseBody.safeParse(
      await request
        .json()
        .catch(() => null),
    );

  if (!parsed.success) {
    return appCorsJson(
      request,
      { error: "Invalid course." },
      { status: 400 },
    );
  }

  const result =
    await enableLearningOrganizationCourse(
      {
        organizationId: id,
        subjectId:
          parsed.data.subjectId,
      },
    );

  if (!result.ok) {
    return appCorsJson(
      request,
      { error: "Course unavailable." },
      { status: 404 },
    );
  }

  return appCorsJson(
    request,
    {
      ok: true,
      access: result.access,
    },
    { status: 201 },
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
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const school =
    await resolveSchool(id);

  if (
    !school ||
    !school.resolved.access
      .canManageSchool
  ) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const parsed =
    CourseBody.safeParse(
      await request
        .json()
        .catch(() => null),
    );

  if (!parsed.success) {
    return appCorsJson(
      request,
      { error: "Invalid course." },
      { status: 400 },
    );
  }

  const result =
    await disableLearningOrganizationCourse(
      {
        organizationId: id,
        subjectId:
          parsed.data.subjectId,
      },
    );

  if (
    !result.ok &&
    result.reason ===
      "course_in_use"
  ) {
    return appCorsJson(
      request,
      {
        error:
          "Course is still used by a school assignment.",
      },
      { status: 409 },
    );
  }

  return appCorsJson(request, {
    ok: true,
  });
}

export function OPTIONS(
  request: Request,
) {
  return appCorsPreflight(request);
}
