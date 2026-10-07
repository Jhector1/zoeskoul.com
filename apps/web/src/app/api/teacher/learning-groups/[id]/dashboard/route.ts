import { learningGroupWhereForTeachingUser } from "@/lib/teaching/classAccess";
import {
  appCorsJson,
  appCorsPreflight,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  getLearningGroupDashboard,
} from "@/lib/learningGroups/classDashboard";
import { prisma } from "@/lib/prisma";
import {
  getTeachingUser,
} from "@/lib/teaching/teachingAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_LOCALES =
  new Set(["en", "es", "fr", "ht"]);

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

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: Context,
) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return appCorsJson(
      request,
      { error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await context.params;
  const group = await prisma.learningGroup.findFirst({
    where: {
      id,
      ...learningGroupWhereForTeachingUser(teachingUser),
    },
    select: { id: true },
  });

  if (!group) {
    return appCorsJson(
      request,
      { error: "Not found" },
      { status: 404 },
    );
  }

  const dashboard =
    await getLearningGroupDashboard(
      group.id,
      localeFromRequest(request),
    );

  if (!dashboard) {
    return appCorsJson(
      request,
      { error: "Not found" },
      { status: 404 },
    );
  }

  return appCorsJson(request, { dashboard });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
