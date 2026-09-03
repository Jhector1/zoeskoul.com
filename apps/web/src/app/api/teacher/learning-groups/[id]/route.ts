import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
  isAppOriginAllowed,
} from "@/lib/http/appCors";
import {
  autoDeliverLearningGroupInvites,
  resolveLearningGroupInviteLocaleFromRequest,
} from "@/lib/learningGroups/groupInviteDelivery";
import { syncPendingLearningGroupInvites } from "@/lib/learningGroups/groupInvites";
import { prisma } from "@/lib/prisma";
import { normalizeEmails } from "@/lib/teaching/recipientResolution";
import { canTeachingUserUseOrganizationForClass } from "@/lib/teaching/schoolAccess";
import {
  getTeachingUser,
  ownedTeachingRecordWhere,
} from "@/lib/teaching/teachingAccess";
import { LearningGroupInputSchema } from "@/lib/validators/learningDelivery";

type Context = { params: Promise<{ id: string }> };

function routeJson(request: Request, body: unknown, status = 200) {
  return appCorsJson(request, body, { status });
}

async function ownedGroup(id: string) {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return { teachingUser: null, group: null };
  const group = await prisma.learningGroup.findFirst({
    where: { id, ...ownedTeachingRecordWhere(teachingUser) },
    include: {
      organization: {
        select: { id: true, name: true, slug: true },
      },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      invites: {
        orderBy: { email: "asc" },
        select: {
          id: true,
          email: true,
          expiresAt: true,
          sentAt: true,
          acceptedAt: true,
          acceptedByUserId: true,
          revokedAt: true,
        },
      },
      _count: { select: { assignments: true } },
    },
  });
  return { teachingUser, group };
}

export async function GET(request: Request, context: Context) {
  if (!isAppOriginAllowed(request)) return routeJson(request, { error: "Forbidden" }, 403);
  const { id } = await context.params;
  const { teachingUser, group } = await ownedGroup(id);
  if (!teachingUser) return routeJson(request, { error: "Forbidden" }, 403);
  if (!group) return routeJson(request, { error: "Not found" }, 404);
  return routeJson(request, { group });
}

export async function PATCH(request: Request, context: Context) {
  if (!isAppMutationOriginAllowed(request)) return routeJson(request, { error: "Forbidden" }, 403);
  const { id } = await context.params;
  const { teachingUser, group } = await ownedGroup(id);
  if (!teachingUser) return routeJson(request, { error: "Forbidden" }, 403);
  if (!group) return routeJson(request, { error: "Not found" }, 404);

  const parsed = LearningGroupInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return routeJson(request, { error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  if (parsed.data.organizationId !== undefined) {
    const allowed = await canTeachingUserUseOrganizationForClass({
      organizationId: parsed.data.organizationId,
      teachingUser,
    });
    if (!allowed) return routeJson(request, { error: "Forbidden" }, 403);
  }

  const desiredEmails = normalizeEmails(parsed.data.memberEmails);
  const desiredEmailSet = new Set(desiredEmails);
  const currentMemberEmails = new Set(
    group.members
      .map((row) => row.user.email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email)),
  );

  // Accepted members are preserved while listed. Emails not already represented
  // by a current member remain invitation intent until the learner accepts.
  const studentUserIdsToKeep = group.members
    .filter((row) => {
      if (row.role !== "student") return false;
      const email = row.user.email?.trim().toLowerCase();
      return !email || desiredEmailSet.has(email);
    })
    .map((row) => row.userId);

  const inviteEmails = desiredEmails.filter(
    (email) => !currentMemberEmails.has(email),
  );

  const prepared = await prisma.$transaction(async (tx) => {
    await tx.learningGroup.update({
      where: { id },
      data: {
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        ...(parsed.data.organizationId !== undefined
          ? { organizationId: parsed.data.organizationId }
          : {}),
        members: {
          deleteMany: {
            role: "student",
            ...(studentUserIdsToKeep.length
              ? { userId: { notIn: studentUserIdsToKeep } }
              : {}),
          },
        },
      },
    });

    const inviteSync = await syncPendingLearningGroupInvites(tx, {
      groupId: id,
      pendingEmails: inviteEmails,
    });

    return { autoDeliveryEmails: inviteSync.autoDeliveryEmails };
  });

  const inviteDelivery = await autoDeliverLearningGroupInvites(prisma, {
    groupId: id,
    emails: prepared.autoDeliveryEmails,
    origin: new URL(request.url).origin,
    locale: resolveLearningGroupInviteLocaleFromRequest(request),
  });

  const updated = await prisma.learningGroup.findUniqueOrThrow({
    where: { id },
    include: {
      organization: {
        select: { id: true, name: true, slug: true },
      },
      members: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      invites: {
        orderBy: { email: "asc" },
        select: {
          id: true,
          email: true,
          expiresAt: true,
          sentAt: true,
          acceptedAt: true,
          acceptedByUserId: true,
          revokedAt: true,
        },
      },
      _count: { select: { assignments: true } },
    },
  });

  return routeJson(request, { group: updated, inviteDelivery });
}

export async function DELETE(request: Request, context: Context) {
  if (!isAppMutationOriginAllowed(request)) return routeJson(request, { error: "Forbidden" }, 403);
  const { id } = await context.params;
  const { teachingUser, group } = await ownedGroup(id);
  if (!teachingUser) return routeJson(request, { error: "Forbidden" }, 403);
  if (!group) return routeJson(request, { error: "Not found" }, 404);
  await prisma.learningGroup.delete({ where: { id } });
  return routeJson(request, { ok: true });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
