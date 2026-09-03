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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function routeJson(request: Request, body: unknown, status = 200) {
  return appCorsJson(request, body, { status });
}

export async function GET(request: Request) {
  if (!isAppOriginAllowed(request)) return routeJson(request, { error: "Forbidden" }, 403);
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return routeJson(request, { error: "Forbidden" }, 403);

  const groups = await prisma.learningGroup.findMany({
    where: ownedTeachingRecordWhere(teachingUser),
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      organization: { select: { id: true, name: true, slug: true } },
      members: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      _count: { select: { assignments: true } },
    },
  });
  return routeJson(request, { groups });
}

export async function POST(request: Request) {
  if (!isAppMutationOriginAllowed(request)) return routeJson(request, { error: "Forbidden" }, 403);
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return routeJson(request, { error: "Forbidden" }, 403);

  const parsed = LearningGroupInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return routeJson(request, { error: "Invalid payload", details: parsed.error.flatten() }, 400);
  }

  const organizationAllowed = await canTeachingUserUseOrganizationForClass({
    organizationId: parsed.data.organizationId,
    teachingUser,
  });
  if (!organizationAllowed) return routeJson(request, { error: "Forbidden" }, 403);

  // A normal Teacher class add is an invitation, even for an existing account.
  const desiredEmails = normalizeEmails(parsed.data.memberEmails);

  const prepared = await prisma.$transaction(async (tx) => {
    const created = await tx.learningGroup.create({
      data: {
        slug: parsed.data.slug,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        organizationId: parsed.data.organizationId ?? null,
        ownerId: teachingUser.id,
      },
      select: { id: true },
    });

    const inviteSync = await syncPendingLearningGroupInvites(tx, {
      groupId: created.id,
      pendingEmails: desiredEmails,
    });

    return {
      groupId: created.id,
      autoDeliveryEmails: inviteSync.autoDeliveryEmails,
    };
  });

  const inviteDelivery = await autoDeliverLearningGroupInvites(prisma, {
    groupId: prepared.groupId,
    emails: prepared.autoDeliveryEmails,
    origin: new URL(request.url).origin,
    locale: resolveLearningGroupInviteLocaleFromRequest(request),
  });

  const group = await prisma.learningGroup.findUniqueOrThrow({
    where: { id: prepared.groupId },
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

  return routeJson(request, { group, inviteDelivery }, 201);
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
