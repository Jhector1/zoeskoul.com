
import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  learningOrganizationWhereForTeachingUser,
} from "@/lib/teaching/schoolAccess";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SchoolCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(500).nullable().optional(),
});

export async function GET(request: Request) {
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

  const schools = await prisma.learningOrganization.findMany({
    where: learningOrganizationWhereForTeachingUser(teachingUser),
    orderBy: { updatedAt: "desc" },
    include: {
      _count: {
        select: {
          groups: true,
          memberships: true,
        },
      },
    },
  });

  return appCorsJson(request, { schools });
}

export async function POST(request: Request) {
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

  const parsed = SchoolCreateSchema.safeParse(
    await request.json().catch(() => null),
  );

  if (!parsed.success) {
    return appCorsJson(request, 
      {
        error: "Invalid school.",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const duplicate = await prisma.learningOrganization.findUnique({
    where: { slug: parsed.data.slug },
    select: { id: true },
  });

  if (duplicate) {
    return appCorsJson(request, 
      { error: "School slug is already in use." },
      { status: 409 },
    );
  }

  const school = await prisma.learningOrganization.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description ?? null,
      ownerId: teachingUser.id,
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

  return appCorsJson(request, { school }, { status: 201 });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
