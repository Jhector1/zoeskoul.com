import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
} from "@/lib/http/appCors";
import { prisma } from "@/lib/prisma";
import { getLearningOrganizationAccess } from "@/lib/teaching/schoolAccess";
import { getTeachingUser } from "@/lib/teaching/teachingAccess";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    groupId: z.string().min(1),
    userId: z.string().min(1),
  }),
  z.object({
    action: z.literal("remove"),
    groupId: z.string().min(1),
    userId: z.string().min(1),
  }),
]);

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
  if (!isAppMutationOriginAllowed(request)) {
    return appCorsJson(request, { error: "Forbidden." }, { status: 403 });
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
    return appCorsJson(request, { error: "School not found." }, { status: 404 });
  }

  if (!resolved.access.canManageStaff) {
    return appCorsJson(request, { error: "Forbidden." }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return appCorsJson(
      request,
      { error: "Invalid class instructor update.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const group = await prisma.learningGroup.findFirst({
    where: {
      id: parsed.data.groupId,
      organizationId: id,
    },
    select: { id: true },
  });

  if (!group) {
    return appCorsJson(request, { error: "Class not found." }, { status: 404 });
  }

  const staff = await prisma.learningOrganizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: id,
        userId: parsed.data.userId,
      },
    },
    select: { role: true },
  });

  if (!staff) {
    return appCorsJson(request, { error: "Staff member not found." }, { status: 404 });
  }

  if (staff.role !== "instructor") {
    return appCorsJson(
      request,
      { error: "Institution admins already have access to every class." },
      { status: 409 },
    );
  }

  const key = {
    groupId_userId: {
      groupId: group.id,
      userId: parsed.data.userId,
    },
  };

  if (parsed.data.action === "remove") {
    await prisma.learningGroupMember.deleteMany({
      where: {
        groupId: group.id,
        userId: parsed.data.userId,
        role: "instructor",
      },
    });
    return appCorsJson(request, { ok: true });
  }

  const existing = await prisma.learningGroupMember.findUnique({
    where: key,
    select: { role: true },
  });

  if (existing?.role === "student") {
    return appCorsJson(
      request,
      { error: "This account is already a student in this class." },
      { status: 409 },
    );
  }

  if (!existing) {
    await prisma.learningGroupMember.create({
      data: {
        groupId: group.id,
        userId: parsed.data.userId,
        role: "instructor",
      },
    });
  }

  return appCorsJson(request, { ok: true });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
