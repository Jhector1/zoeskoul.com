
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  getLearningOrganizationAccess,
} from "@/lib/teaching/schoolAccess";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SchoolUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required.",
  );

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext,
) {
  if (!isAppOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const teachingUser = await getTeachingUser();

  if (!teachingUser) {
    return appCorsJson(request, { error: "Forbidden." }, { status: 403 });
  }

  const { id } = await context.params;
  const resolved = await getLearningOrganizationAccess({
    organizationId: id,
    teachingUser,
  });

  if (!resolved) {
    return appCorsJson(request, 
      { error: "School not found." },
      { status: 404 },
    );
  }

  return appCorsJson(request, {
    school: resolved.organization,
    access: resolved.access,
    membershipRole: resolved.membershipRole,
  });
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  if (!isAppMutationOriginAllowed(request)) {
    return appCorsJson(
      request,
      { error: "Forbidden." },
      { status: 403 },
    );
  }

  const teachingUser = await getTeachingUser();

  if (!teachingUser) {
    return appCorsJson(request, { error: "Forbidden." }, { status: 403 });
  }

  const { id } = await context.params;
  const resolved = await getLearningOrganizationAccess({
    organizationId: id,
    teachingUser,
  });

  if (!resolved) {
    return appCorsJson(request, 
      { error: "School not found." },
      { status: 404 },
    );
  }

  if (!resolved.access.canManageSchool) {
    return appCorsJson(request, { error: "Forbidden." }, { status: 403 });
  }

  const parsed = SchoolUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return appCorsJson(request, 
      {
        error: "Invalid school update.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const school = await prisma.learningOrganization.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined
        ? { name: parsed.data.name }
        : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
    },
    include: {
      _count: {
        select: {
          groups: true,
          memberships: true,
        },
      },
    },
  });

  return appCorsJson(request, { school });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
